export type Identity = { id: string; email?: string; hasMfa?: boolean };
export type RequestStore = {
  identify(token: string): Promise<Identity | null>;
  verifyPassword(
    email: string,
    password: string,
    expected: string,
  ): Promise<boolean>;
  request(user: string): Promise<"accepted" | "blocked">;
};
export type DeletionStore = {
  claim(): Promise<{ user_id: string; claim: string } | null>;
  clean(user: string, claim: string): Promise<void>;
  files(
    user: string,
    claim: string,
  ): Promise<{ bucket: string; path: string }[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
  eraseIdentity(user: string): Promise<void>;
  finish(user: string, claim: string, success: boolean): Promise<void>;
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (status: number, code: string) =>
  Response.json({ status: code }, { status, headers: cors });
/** L'identifiant à supprimer provient du jeton vérifié, jamais du corps de la requête. */
export function deletionRequest(store: RequestStore) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply(405, "method");
    const token = req.headers
      .get("authorization")
      ?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return reply(401, "unauthorized");
    try {
      if (Number(req.headers.get("content-length") ?? 0) > 8192)
        return reply(413, "invalid");
      const raw = await req.text();
      if (raw.length > 8192) return reply(413, "invalid");
      let body: {
        password?: unknown;
        confirmation?: unknown;
        expected_user?: unknown;
      };
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, "invalid");
      }
      if (
        !body ||
        typeof body.password !== "string" ||
        !body.password ||
        body.password.length > 4096 ||
        body.confirmation !== "SUPPRIMER"
      )
        return reply(400, "invalid");
      const identity = await store.identify(token);
      if (!identity?.email) return reply(401, "unauthorized");
      if (body.expected_user !== identity.id)
        return reply(409, "account_changed");
      // Ne pas contourner un second facteur avec une simple vérification de mot de passe.
      if (identity.hasMfa) return reply(409, "mfa_support_required");
      if (
        !(await store.verifyPassword(
          identity.email,
          body.password,
          identity.id,
        ))
      )
        return reply(401, "reauthentication_failed");
      const status = await store.request(identity.id);
      return status === "blocked"
        ? reply(409, "activities_pending")
        : reply(202, "accepted");
    } catch {
      return reply(503, "unavailable");
    }
  };
}
/** Comparaison sans arrêt au premier caractère différent. */
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
/** Un compte par invocation, bail SQL et étapes idempotentes ; aucun identifiant externe accepté. */
export function deletionWorker(secret: string, store: DeletionStore) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return reply(405, "method");
    if (
      secret.length < 32 ||
      !equal(req.headers.get("x-furrix-worker-key") ?? "", secret)
    )
      return reply(401, "unauthorized");
    let job: Awaited<ReturnType<DeletionStore["claim"]>> = null;
    try {
      job = await store.claim();
      if (!job) return reply(200, "idle");
      await store.clean(job.user_id, job.claim);
      // Travail borné : la prochaine invocation reprend les fichiers restants si nécessaire.
      for (let batch = 0; batch < 5; batch++) {
        const files = await store.files(job.user_id, job.claim);
        if (!files.length) {
          await store.eraseIdentity(job.user_id);
          await store.finish(job.user_id, job.claim, true);
          return reply(200, "completed");
        }
        const groups = new Map<string, string[]>();
        for (const f of files)
          groups.set(f.bucket, [...(groups.get(f.bucket) ?? []), f.path]);
        for (const [bucket, paths] of groups) await store.remove(bucket, paths);
      }
      await store.finish(job.user_id, job.claim, false);
      return reply(202, "pending");
    } catch {
      if (job)
        await store.finish(job.user_id, job.claim, false).catch(() => {});
      return reply(503, "pending");
    }
  };
}
