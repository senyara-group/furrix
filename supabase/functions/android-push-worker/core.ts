/** FCM HTTP v1 : aucune donnée libre ni jeton dans les erreurs ou les journaux. */
export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};
export type Delivery = {
  token: string;
  alert_id: string | null;
  notification_id: string;
  kind: string;
};
export type SendResult = "sent" | "retry" | "invalid_token" | "permanent";
const encoder = new TextEncoder();
const base64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
export function validateServiceAccount(value: unknown): ServiceAccount {
  const c = value as Partial<ServiceAccount> | null;
  if (
    !c ||
    c.project_id !== "furrix-8dd6e" ||
    typeof c.client_email !== "string" ||
    !c.client_email.endsWith("@furrix-8dd6e.iam.gserviceaccount.com") ||
    !c.private_key?.startsWith("-----BEGIN PRIVATE KEY-----")
  )
    throw Error("Configuration Firebase invalide");
  return c as ServiceAccount;
}
export async function serviceAssertion(c: ServiceAccount, now = Date.now()) {
  const header = base64url(
      encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    ),
    iat = Math.floor(now / 1000);
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        iss: c.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat,
        exp: iat + 3600,
      }),
    ),
  );
  const data = header + "." + payload,
    pem = c.private_key.replace(/-----[^-]+-----|\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (v) => v.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return (
    data +
    "." +
    base64url(
      new Uint8Array(
        await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          key,
          encoder.encode(data),
        ),
      ),
    )
  );
}
export function fcmMessage(d: Delivery) {
  const body =
    d.kind === "lost_found"
      ? "Un animal de ton secteur a été retrouvé."
      : d.kind === "lost_sighting"
        ? "Une observation a été ajoutée à ton alerte."
        : d.kind === 'lost_local' ? "Une nouvelle alerte concerne ton secteur."
        : d.kind.includes('message') ? 'Tu as reçu un nouveau message.'
        : d.kind.startsWith('appointment_') ? 'Du nouveau pour un rendez-vous Services.'
        : d.kind.startsWith('sitting_') ? 'Du nouveau pour une garde.'
        : 'Du nouveau dans tes rencontres.';
  return {
    message: {
      token: d.token,
      notification: { title: "Furrix", body },
      data: d.alert_id ? { alert_id: d.alert_id, notification_id: d.notification_id } : { app_notification_id: d.notification_id },
      android: {
        priority: "high",
        ttl: "3600s",
        notification: {
          channel_id: "furrix-alertes",
          icon: "ic_stat_furrix",
          tag: "furrix-" + d.notification_id,
        },
      },
    },
  };
}
export function firebaseSender(
  c: ServiceAccount,
  request: typeof fetch = fetch,
) {
  let access: { value: string; until: number } | undefined;
  return async (d: Delivery): Promise<SendResult> => {
    try {
      if (!access || access.until < Date.now()) {
        const assertion = await serviceAssertion(c);
        const r = await request("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) return "retry";
        const token = (await r.json()) as {
          access_token?: string;
          expires_in?: number;
        };
        if (!token.access_token) return "retry";
        access = {
          value: token.access_token,
          until:
            Date.now() +
            Math.max(0, Math.min(token.expires_in ?? 3600, 3600) - 60) * 1000,
        };
      }
      const r = await request(
        "https://fcm.googleapis.com/v1/projects/" +
          c.project_id +
          "/messages:send",
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + access.value,
            "content-type": "application/json",
          },
          body: JSON.stringify(fcmMessage(d)),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (r.ok) return "sent";
      let e: { error?: { details?: Array<{ errorCode?: string }> } } = {};
      try {
        e = await r.json();
      } catch {
        /* Réponse brute non répercutée. */
      }
      if (e.error?.details?.some((x) => x.errorCode === "UNREGISTERED"))
        return "invalid_token";
      if (r.status === 401) {
        access = undefined;
        return "retry";
      }
      return r.status === 429 || r.status >= 500 || r.status === 403
        ? "retry"
        : "permanent";
    } catch {
      return "retry";
    }
  };
}
export async function sameSecret(a: string, b: string) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const left = new Uint8Array(x),
    right = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
  return diff === 0 && a.length >= 32 && b.length >= 32;
}
export type PushStore = {
  claim: () => Promise<Array<{ job_id: number; lease_id: string }>>;
  delivery: (id: number, claim: string) => Promise<Delivery | null>;
  finish: (
    id: number,
    claim: string,
    result: SendResult | "ineligible",
    token?: string,
  ) => Promise<void>;
};
/** Le minuteur serveur choisit les tâches ; la requête ne choisit jamais de destinataire. */
export function pushHandler(
  secret: string,
  store: PushStore,
  send: (d: Delivery) => Promise<SendResult>,
) {
  return async (req: Request) => {
    if (req.method !== "POST")
      return Response.json({ error: "method" }, { status: 405 });
    if (
      !secret ||
      !(await sameSecret(req.headers.get("x-furrix-worker-key") ?? "", secret))
    )
      return Response.json({ error: "unauthorized" }, { status: 401 });
    let sent = 0,
      retry = 0,
      skipped = 0;
    try {
      const jobs = await store.claim(),
        deadline = Date.now() + 110000;
      for (const job of jobs) {
        if (Date.now() > deadline) break;
        const d = await store.delivery(job.job_id, job.lease_id),
          result = d ? await send(d) : "ineligible";
        await store.finish(job.job_id, job.lease_id, result, d?.token);
        if (result === "sent") sent++;
        else if (result === "retry") retry++;
        else skipped++;
      }
      return Response.json({ sent, retry, skipped });
    } catch {
      return Response.json({ error: "delivery_unavailable" }, { status: 503 });
    }
  };
}
