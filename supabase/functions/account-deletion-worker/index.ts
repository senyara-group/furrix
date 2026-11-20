import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { deletionWorker } from "../account-deletion/core.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function rpc(name: string, args = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw Error("database");
  return data;
}
Deno.serve(
  deletionWorker(Deno.env.get("FURRIX_ACCOUNT_DELETION_WORKER_SECRET") ?? "", {
    async claim() {
      return (await rpc("claim_account_deletion"))?.[0] ?? null;
    },
    async clean(user, claim) {
      await rpc("clean_account_data", { p_user: user, p_claim: claim });
    },
    async files(user, claim) {
      return (
        (await rpc("account_deletion_files", {
          p_user: user,
          p_claim: claim,
        })) ?? []
      );
    },
    async remove(bucket, paths) {
      const { error } = await client.storage.from(bucket).remove(paths);
      if (error) throw Error("storage");
    },
    async eraseIdentity(user) {
      // Soft-delete Auth irréversible : conserve les FK des historiques, neutralise l'identité et révoque les sessions.
      const { error } = await client.auth.admin.deleteUser(user, true);
      if (error) throw Error("auth");
    },
    async finish(user, claim, success) {
      await rpc("finish_account_deletion", {
        p_user: user,
        p_claim: claim,
        p_success: success,
      });
    },
  }),
);
