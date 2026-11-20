import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { deletionRequest } from "./core.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  options,
);
const handler = deletionRequest({
  async identify(token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      hasMfa: data.user.factors?.some((f) => f.status === "verified"),
    };
  },
  async verifyPassword(email, password, expected) {
    // Client isolé : la session de contrôle ne remplace jamais celle de l'application ni le client admin.
    const client = createClient(
      url,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      options,
    );
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    const valid = !error && data.user?.id === expected && !!data.session;
    if (data.session) await client.auth.signOut({ scope: "local" });
    return valid;
  },
  async request(user) {
    const { error } = await admin.rpc("request_account_deletion", {
      p_user: user,
    });
    if (error?.code === "23503") return "blocked";
    if (error) throw Error("request");
    return "accepted";
  },
});
// Activation seulement après déploiement et contrôle du worker et de son minuteur.
Deno.serve((req) =>
  Deno.env.get("FURRIX_ACCOUNT_DELETION_ENABLED") === "true"
    ? handler(req)
    : Response.json(
        { status: "unavailable" },
        {
          status: 503,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        },
      ),
);
