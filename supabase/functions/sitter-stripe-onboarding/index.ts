import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { OnboardingError, onboardingHandler } from "./core.ts";
import { stripeOnboarding } from "./stripe.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  options,
);
const handler = onboardingHandler(
  {
    async identify(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    async prepare(token, start) {
      const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        ...options,
        global: { headers: { Authorization: "Bearer " + token } },
      });
      const { data, error } = await user.rpc(
        "prepare_sitter_stripe_onboarding",
        { p_start: start },
      );
      if (error) {
        if (error.code === "42501") throw new OnboardingError("forbidden");
        if (error.code === "55P03") throw new OnboardingError("busy");
        if (error.code === "55000") {
          throw new OnboardingError(
            "reconciliation_required",
          );
        }
        throw Error("prepare");
      }
      return data;
    },
    async attach(user, key, account) {
      const { error } = await admin.rpc("attach_sitter_stripe_account", {
        p_user: user,
        p_key: key,
        p_account: account,
      });
      if (error) throw Error("attach");
    },
    async release(user, claim) {
      const { error } = await admin.rpc("release_sitter_stripe_onboarding", {
        p_user: user,
        p_claim: claim,
      });
      if (error) throw Error("release");
    },
  },
  stripeOnboarding(
    Deno.env.get("STRIPE_FURRIX_TEST_SECRET_KEY") ?? "",
    fetch,
    (event) => console.error(JSON.stringify(event)),
  ),
  Deno.env.get("FURRIX_STRIPE_ONBOARDING_ENABLED") === "true",
);
Deno.serve(handler);
