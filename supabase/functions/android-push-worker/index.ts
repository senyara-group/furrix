import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  firebaseSender,
  pushHandler,
  validateServiceAccount,
  type PushStore,
} from "./core.ts";
const secret = Deno.env.get("FURRIX_PUSH_WORKER_SECRET") ?? "";
const client = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const store: PushStore = {
  async claim() {
    const { data, error } = await client.rpc("claim_android_push", {
      p_limit: 10,
    });
    if (error) throw Error("claim");
    return data ?? [];
  },
  async delivery(id, claim) {
    const { data, error } = await client.rpc("android_push_delivery", {
      p_job: id,
      p_claim: claim,
    });
    if (error) throw Error("delivery");
    return data?.[0] ?? null;
  },
  async finish(id, claim, result, token) {
    const { error } = await client.rpc("finish_android_push", {
      p_job: id,
      p_claim: claim,
      p_result: result,
      p_token: token ?? null,
    });
    if (error) throw Error("finish");
  },
};
let handler: ((req: Request) => Promise<Response>) | undefined;
try {
  const c = validateServiceAccount(
    JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "null"),
  );
  handler = pushHandler(secret, store, firebaseSender(c));
} catch {
  /* Échec fermé sans exposer la configuration. */
}
Deno.serve((req) =>
  handler
    ? handler(req)
    : Response.json({ error: "not_configured" }, { status: 503 }),
);
