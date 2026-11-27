import { parseCommissionBasisPoints } from "../_shared/sitting-payment-quote.ts";
import type { SavedSittingCheckout } from "../_shared/sitting-checkout.ts";

export type CheckoutIdentity = { id: string; session: string };
export type CheckoutClaim = {
  saved: SavedSittingCheckout;
  claim: string;
  session: string | null;
};
export type CheckoutStore = {
  verify(token: string): Promise<string | null>;
  prepare(
    request: string,
    identity: CheckoutIdentity,
    commission: number,
    seconds: number,
  ): Promise<CheckoutClaim>;
  attach(attempt: string, session: string): Promise<void>;
  release(attempt: string, claim: string): Promise<void>;
};
export type CheckoutProvider = {
  verifyPlatform(): Promise<void>;
  status(account: string): Promise<{ charges: boolean; payouts: boolean }>;
  create(
    saved: SavedSittingCheckout,
    now: number,
  ): Promise<{ id: string; status: string; url: string | null }>;
};
export class CheckoutError extends Error {
  constructor(
    public readonly code: "forbidden" | "busy" | "request_unavailable",
  ) {
    super(code);
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: object) =>
  Response.json(body, { status, headers });

/** Extraction uniquement APRÈS getUser(token) : décoder un JWT ne vérifie pas sa signature. */
function verifiedIdentity(
  token: string,
  verifiedUser: string,
): CheckoutIdentity | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const value = JSON.parse(
      atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")),
    );
    if (
      value.sub !== verifiedUser || value.role !== "authenticated" ||
      typeof value.session_id !== "string" || !UUID.test(value.session_id) ||
      !UUID.test(verifiedUser)
    ) return null;
    return { id: verifiedUser, session: value.session_id };
  } catch {
    return null;
  }
}

/** Lecture bornée même si Content-Length est absent ou mensonger. */
async function requestId(req: Request): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let bytes = 0, raw = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        return null;
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    const body = JSON.parse(raw);
    return body && !Array.isArray(body) && Object.keys(body).length === 1 &&
        typeof body.request_id === "string" && UUID.test(body.request_id)
      ? body.request_id
      : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

/** Seul l'identifiant de demande vient du client ; montants, compte et commission restent côté serveur. */
export function checkoutHandler(
  store: CheckoutStore,
  provider: CheckoutProvider,
  options: {
    enabled: boolean;
    commission: string | undefined;
    windowSeconds: string | undefined;
    now?: () => number;
  },
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (req.method !== "POST") return reply(405, { status: "method" });
    if (!options.enabled) return reply(503, { status: "unavailable" });
    let claimed: { id: string; claim: string } | null = null;
    try {
      const commission = parseCommissionBasisPoints(options.commission);
      if (
        !options.windowSeconds || !/^[1-9]\d{3,4}$/.test(options.windowSeconds)
      ) throw Error("window_not_configured");
      const seconds = Number(options.windowSeconds);
      if (seconds < 1800 || seconds > 86400) {
        throw Error("window_not_configured");
      }
      const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)
        ?.[1];
      if (!token) return reply(401, { status: "unauthorized" });
      const user = await store.verify(token);
      const identity = user ? verifiedIdentity(token, user) : null;
      if (!identity) return reply(401, { status: "unauthorized" });
      const request = await requestId(req);
      if (!request) return reply(400, { status: "invalid" });
      // Une mauvaise plateforme ne doit même pas créer une tentative privée.
      await provider.verifyPlatform();
      const state = await store.prepare(request, identity, commission, seconds);
      if (UUID.test(state?.saved?.id ?? "") && UUID.test(state?.claim ?? "")) {
        claimed = { id: state.saved.id, claim: state.claim };
      }
      if (
        !claimed || state.saved.request.owner_id !== identity.id ||
        (state.session !== null &&
          !/^cs_test_[A-Za-z0-9]+$/.test(state.session))
      ) throw Error("invalid_claim");
      const capabilities = await provider.status(state.saved.stripe_account);
      if (!capabilities.charges || !capabilities.payouts) {
        return reply(409, { status: "onboarding_required" });
      }
      const result = await provider.create(
        state.saved,
        Math.floor((options.now ?? Date.now)() / 1000),
      );
      if (
        !/^cs_test_[A-Za-z0-9]+$/.test(result.id) ||
        (state.session && state.session !== result.id)
      ) throw Error("invalid_session");
      // Ne jamais remettre un lien au navigateur avant d'avoir enregistré son identifiant.
      await store.attach(state.saved.id, result.id);
      if (result.status === "complete" || result.status === "expired") {
        return reply(409, { status: "reconciliation_required" });
      }
      if (result.status !== "open" || !result.url) {
        throw Error("invalid_checkout");
      }
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" ||
        url.username || url.password || url.port
      ) throw Error("invalid_link");
      return reply(200, { status: "checkout_ready", url: url.href });
    } catch (error) {
      if (error instanceof CheckoutError) {
        return reply(error.code === "forbidden" ? 403 : 409, {
          status: error.code,
        });
      }
      return reply(503, { status: "unavailable" });
    } finally {
      if (claimed) {
        try {
          await store.release(claimed.id, claimed.claim);
        } catch {
          /* Le bail expirera. La tentative et sa clé restent conservées. */
        }
      }
    }
  };
}
