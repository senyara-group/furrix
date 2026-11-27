import {
  parseCommissionBasisPoints,
  type PaymentRequestSnapshot,
  sittingPaymentQuote,
} from "./sitting-payment-quote.ts";
import { FURRIX_STRIPE_SANDBOX } from "../sitter-stripe-onboarding/stripe.ts";

/** À lire dans une future réservation privée en base, jamais dans le corps envoyé par le client. */
export type SavedSittingCheckout = {
  id: string;
  stripe_account: string;
  request: PaymentRequestSnapshot;
  commission_basis_points: string | undefined;
  /** Secondes Unix, figées avec le montant et la clé avant le premier appel Stripe. */
  prepared_at: number;
  expires_at: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API_VERSION = "2026-11-18.endive";
const RETURN = "https://furrix.fr/#/garde?vue=mes-gardes";

/**
 * Adaptateur serveur de test, non raccordé à une route. Ne confirme aucune garde.
 * Le futur appelant doit authentifier, contrôler la bêta et verrouiller/persister la tentative.
 */
export function sittingCheckout(
  options: { enabled: boolean; secret: string; transport?: typeof fetch },
) {
  const send = options.transport ?? fetch;
  return {
    async create(saved: SavedSittingCheckout, now: number) {
      if (!options.enabled) throw Error("payments_unavailable");
      if (!/^sk_test_[A-Za-z0-9]+$/.test(options.secret)) {
        throw Error("test_key_required");
      }
      if (
        !UUID.test(saved.id) ||
        !/^acct_[A-Za-z0-9]+$/.test(saved.stripe_account) ||
        saved.stripe_account === FURRIX_STRIPE_SANDBOX
      ) throw Error("invalid_attempt");
      const rate = parseCommissionBasisPoints(saved.commission_basis_points);
      const { prepared_at: prepared, expires_at: expires } = saved;
      if (
        ![now, prepared, expires].every(Number.isSafeInteger) ||
        prepared > now || expires - prepared < 1800 ||
        expires - prepared > 86400 ||
        expires > Math.floor(Date.parse(saved.request.starts_at) / 1000)
      ) throw Error("invalid_deadline");
      if (now >= expires) throw Error("attempt_expired");
      // Stripe peut oublier une clé v1 après 24 h : pas de nouvelle création automatique après 23 h.
      if (now - prepared >= 23 * 3600) throw Error("reconciliation_required");
      const quote = sittingPaymentQuote(
        saved.request,
        saved.request.owner_id,
        rate,
        prepared * 1000,
      );
      const headers = {
        Authorization: "Bearer " + options.secret,
        "Stripe-Version": API_VERSION,
      };
      const read = async (
        response: Response,
      ): Promise<Record<string, unknown>> => {
        if (!response.ok) throw Error("stripe_unavailable");
        try {
          const value: unknown = await response.json();
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw Error();
          }
          return value as Record<string, unknown>;
        } catch {
          throw Error("stripe_unavailable");
        }
      };
      const call = async (url: string, init: RequestInit) => {
        try {
          return await read(await send(url, init));
        } catch {
          throw Error("stripe_unavailable");
        }
      };
      // Ne pas envoyer Stripe-Account ici : vérifier la plateforme qui possède la clé, pas le gardien.
      const platform = await call("https://api.stripe.com/v1/account", {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (platform.id !== FURRIX_STRIPE_SANDBOX) throw Error("wrong_sandbox");
      const body = new URLSearchParams({
        mode: "payment",
        locale: "fr",
        "payment_method_types[0]": "card",
        "line_items[0][price_data][currency]": quote.currency,
        "line_items[0][price_data][unit_amount]": String(quote.amount_cents),
        "line_items[0][price_data][product_data][name]":
          "Garde d’animal Furrix",
        "line_items[0][quantity]": "1",
        "payment_intent_data[application_fee_amount]": String(
          quote.application_fee_cents,
        ),
        client_reference_id: saved.id,
        "metadata[furrix_attempt]": saved.id,
        "payment_intent_data[metadata][furrix_attempt]": saved.id,
        expires_at: String(expires),
        "automatic_tax[enabled]": "false",
        "adaptive_pricing[enabled]": "false",
        allow_promotion_codes: "false",
        success_url: RETURN + "&paiement=retour",
        cancel_url: RETURN + "&paiement=interrompu",
      });
      const result = await call("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          ...headers,
          "Stripe-Account": saved.stripe_account,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": "furrix-sitting-checkout-v1-" + saved.id,
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
      });
      if (
        result.livemode !== false || typeof result.id !== "string" ||
        !/^cs_test_[A-Za-z0-9]+$/.test(result.id) ||
        result.mode !== "payment" || result.currency !== quote.currency ||
        result.amount_total !== quote.amount_cents ||
        result.client_reference_id !== saved.id || result.expires_at !== expires
      ) throw Error("invalid_checkout");
      // Un rejeu peut retrouver une session terminée. Il ne doit ni rouvrir un paiement, ni confirmer la garde.
      if (result.status === "complete" || result.status === "expired") {
        return { id: result.id, status: result.status, url: null };
      }
      if (result.status !== "open" || typeof result.url !== "string") {
        throw Error("invalid_checkout");
      }
      let url: URL;
      try {
        url = new URL(result.url);
      } catch {
        throw Error("invalid_checkout");
      }
      if (
        url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" ||
        url.username || url.password || url.port
      ) throw Error("invalid_checkout");
      return { id: result.id, status: "open" as const, url: url.href };
    },
  };
}
