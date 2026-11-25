import type { OnboardingProvider } from "./core.ts";
export const FURRIX_STRIPE_SANDBOX = "acct_1UfdgzLRlPFxqD3K";
const API_VERSION = "2026-11-18.endive";
const RETURN_URL = "https://furrix.fr/#/garde?vue=profil";
/** Adaptateur de test exclusivement : aucun secret ni réponse Stripe n'est journalisé. */
export function stripeOnboarding(
  secret: string,
  transport: typeof fetch = fetch,
): OnboardingProvider {
  const call = async (path: string, body?: object, key?: string) => {
    if (!/^sk_test_[A-Za-z0-9]+$/.test(secret)) {
      throw Error("test_key_required");
    }
    const response = await transport("https://api.stripe.com" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + secret,
        "Stripe-Version": API_VERSION,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("stripe_unavailable");
    return await response.json();
  };
  const accountId = (id: unknown) => {
    if (typeof id !== "string" || !/^acct_[A-Za-z0-9]+$/.test(id)) {
      throw Error("invalid_account");
    }
    return id;
  };
  return {
    async verifyPlatform() {
      const account = await call("/v1/account");
      if (account.id !== FURRIX_STRIPE_SANDBOX) throw Error("wrong_sandbox");
    },
    async create(key) {
      const account = await call("/v2/core/accounts", {
        display_name: "Gardien Furrix",
        dashboard: "express",
        identity: { country: "fr" },
        configuration: {
          merchant: { capabilities: { card_payments: { requested: true } } },
        },
        defaults: {
          currency: "eur",
          locales: ["fr-FR"],
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
      }, "furrix-sitter-" + key);
      if (account.livemode !== false) throw Error("test_account_required");
      return accountId(account.id);
    },
    async status(account) {
      const result = await call("/v1/accounts/" + accountId(account));
      if (result.id !== account) throw Error("wrong_account");
      return {
        charges: result.charges_enabled === true,
        payouts: result.payouts_enabled === true,
        submitted: result.details_submitted === true,
      };
    },
    async link(account) {
      const link = await call("/v2/core/account_links", {
        account: accountId(account),
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant"],
            collection_options: { fields: "eventually_due" },
            return_url: RETURN_URL,
            refresh_url: RETURN_URL,
          },
        },
      });
      if (typeof link.url !== "string") throw Error("missing_link");
      return link.url;
    },
  };
}
