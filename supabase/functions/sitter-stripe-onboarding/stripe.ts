import type { OnboardingProvider } from "./core.ts";
export const FURRIX_STRIPE_SANDBOX = "acct_1UfdgzLRlPFxqD3K";
const API_VERSION = "2026-11-18.endive";
const RETURN_URL = "https://furrix.fr/#/garde?vue=profil";
/**
 * Préfixe de la clé d'idempotence de création, toujours dérivée de la clé permanente en base.
 * À changer à chaque modification du corps de création : Stripe peut refuser (409) une même clé
 * avec d'autres paramètres. « v2 » : corps sans display_name (première version refusée en 400).
 */
export const CREATE_KEY_PREFIX = "furrix-sitter-v2-";
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
        // Plateforme française : display_name, contact_* et identity (sauf identity.country) exigent un
        // jeton de compte (account_token_required, recette DEV du 25/11/2026). Aucune de ces données
        // n'est envoyée : le gardien les saisit dans l'inscription hébergée par Stripe.
        // Décidé le 25/11/2026 : tableau de bord complet ; Stripe prélève ses frais au gardien
        // (fees_collector) et répond des soldes négatifs de son compte (losses_collector).
        // Stripe refuse « express » avec ces responsabilités ; ces choix sont définitifs pour un compte.
        dashboard: "full",
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
      }, CREATE_KEY_PREFIX + key);
      if (account.livemode !== false) throw Error("test_account_required");
      return accountId(account.id);
    },
    async status(account) {
      // Compte créé avec Accounts v2 : Stripe recommande de suivre l'inscription par le statut des
      // capacités v2. Les champs v1 (charges_enabled…) ne sont pas documentés pour ces comptes.
      const result = await call(
        "/v2/core/accounts/" + accountId(account) +
          "?include[0]=configuration.merchant",
      );
      if (result.id !== account) throw Error("wrong_account");
      if (result.livemode !== false) throw Error("test_account_required");
      const capabilities = result.configuration?.merchant?.capabilities ?? {};
      // Capacité absente (jamais demandée ou pas encore créée) : jamais considérée active.
      const card = capabilities.card_payments?.status;
      const payouts = capabilities.stripe_balance?.payouts?.status;
      return {
        charges: card === "active",
        payouts: payouts === "active",
        reviewing: card === "pending" || payouts === "pending",
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
