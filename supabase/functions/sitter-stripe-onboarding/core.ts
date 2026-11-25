export type Claim = {
  user: string;
  account: string | null;
  key: string;
  claim: string;
};
export type OnboardingStore = {
  identify(token: string): Promise<string | null>;
  prepare(token: string, start: boolean): Promise<Partial<Claim>>;
  attach(user: string, key: string, account: string): Promise<void>;
  release(user: string, claim: string): Promise<void>;
};
export type OnboardingProvider = {
  verifyPlatform(): Promise<void>;
  create(key: string): Promise<string>;
  status(
    account: string,
  ): Promise<{ charges: boolean; payouts: boolean; submitted: boolean }>;
  link(account: string): Promise<string>;
};
export class OnboardingError extends Error {
  constructor(
    public readonly code: "forbidden" | "busy" | "reconciliation_required",
  ) {
    super(code);
  }
}
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: object) =>
  Response.json(body, { status, headers });
/** N'accepte ni identifiant de compte, ni URL de retour, ni donnée d'identité fournie par le navigateur. */
export function onboardingHandler(
  store: OnboardingStore,
  provider: OnboardingProvider,
  enabled: boolean,
) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (req.method !== "POST") return reply(405, { status: "method" });
    if (!enabled) return reply(503, { status: "unavailable" });
    const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)
      ?.[1];
    if (!token) return reply(401, { status: "unauthorized" });
    let claimed: Claim | null = null;
    try {
      const user = await store.identify(token);
      if (!user) return reply(401, { status: "unauthorized" });
      const raw = await req.text();
      if (raw.length > 1024) return reply(400, { status: "invalid" });
      let body: { action?: unknown };
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { status: "invalid" });
      }
      if (
        !body || Array.isArray(body) || Object.keys(body).some((k) =>
          k !== "action"
        ) || !["status", "start"].includes(String(body.action))
      ) return reply(400, { status: "invalid" });
      const existing = await store.prepare(token, false);
      if (body.action === "status" && !existing.account) {
        return reply(200, { status: "not_started" });
      }
      // Une mauvaise clé ou un autre environnement ne doit même pas réserver une création en base.
      await provider.verifyPlatform();
      const state = body.action === "start"
        ? await store.prepare(token, true)
        : existing;
      if (body.action === "start") {
        if (state.user !== user || !state.key || !state.claim) {
          throw Error("invalid_claim");
        }
        claimed = state as Claim;
      }
      let account = state.account;
      if (!account && claimed) {
        account = await provider.create(claimed.key);
        await store.attach(user, claimed.key, account);
      }
      if (!account) throw Error("missing_account");
      const status = await provider.status(account);
      // Un retour navigateur ne suffit jamais : seules les capacités lues chez Stripe déterminent cet état.
      const result = status.charges && status.payouts
        ? "ready"
        : status.submitted
        ? "pending"
        : "incomplete";
      if (body.action === "status" || result === "ready") {
        return reply(200, { status: result });
      }
      // L'accès bêta peut avoir été révoqué pendant l'appel Stripe.
      await store.prepare(token, false);
      const url = await provider.link(account);
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        !["connect.stripe.com", "accounts.stripe.com"].includes(
          parsed.hostname,
        ) || parsed.username || parsed.password || parsed.port
      ) throw Error("invalid_link");
      return reply(200, { status: result, url });
    } catch (error) {
      if (error instanceof OnboardingError) {
        return reply(error.code === "forbidden" ? 403 : 409, {
          status: error.code,
        });
      }
      return reply(503, { status: "unavailable" });
    } finally {
      if (claimed) {
        try {
          await store.release(claimed.user, claimed.claim);
        } catch {
          /* Le bail expirera ; aucune suppression de la clé de création. */
        }
      }
    }
  };
}
