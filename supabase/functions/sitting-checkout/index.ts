// Import autonome et version figée, comme les fonctions Supabase déjà déployées.
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { sittingCheckout } from "../_shared/sitting-checkout.ts";
import { stripeOnboarding } from "../sitter-stripe-onboarding/stripe.ts";
import { CheckoutError, checkoutHandler } from "./core.ts";
import { checkoutEnabled } from "./readiness.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("STRIPE_FURRIX_TEST_SECRET_KEY") ?? "";
const enabled = checkoutEnabled(
  Deno.env.get("FURRIX_STRIPE_CHECKOUT_ENABLED"),
  url,
  key,
);
const admin = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const stripe = stripeOnboarding(key);
const checkout = sittingCheckout({ enabled, secret: key });
const handler = checkoutHandler({
  async verify(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  async prepare(request, identity, commission, seconds) {
    const { data, error } = await admin.rpc("prepare_sitting_checkout", {
      p_sitting: request,
      p_owner: identity.id,
      p_session: identity.session,
      p_commission: commission,
      p_window_seconds: seconds,
    });
    if (error) {
      if (error.code === "42501") throw new CheckoutError("forbidden");
      if (error.code === "55P03") throw new CheckoutError("busy");
      if (error.code === "55000") {
        throw new CheckoutError("request_unavailable");
      }
      throw Error("prepare");
    }
    return data;
  },
  async attach(attempt, session) {
    const { error } = await admin.rpc("attach_sitting_checkout", {
      p_attempt: attempt,
      p_session: session,
    });
    if (error) throw Error("attach");
  },
  async release(attempt, claim) {
    const { error } = await admin.rpc("release_sitting_checkout", {
      p_attempt: attempt,
      p_claim: claim,
    });
    if (error) throw Error("release");
  },
}, {
  verifyPlatform: stripe.verifyPlatform,
  status: stripe.status,
  create: checkout.create,
}, {
  enabled,
  commission: Deno.env.get("FURRIX_SITTING_COMMISSION_BPS"),
  windowSeconds: Deno.env.get("FURRIX_SITTING_PAYMENT_WINDOW_SECONDS"),
});
Deno.serve(handler);
