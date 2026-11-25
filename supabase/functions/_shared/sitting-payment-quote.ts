/** Socle serveur uniquement. Ne crée aucune session Stripe et ne confirme aucune garde. */
export type PaymentRequestSnapshot = {
  owner_id: string;
  sitter_id: string;
  status: string;
  starts_at: string;
  units: number;
  unit_price_cents: number;
};

/** Un point de base = 0,01 %. La commission n'a volontairement aucune valeur par défaut. */
export function parseCommissionBasisPoints(value: string | undefined): number {
  if (value === undefined || !/^(0|[1-9]\d{0,3})$/.test(value)) {
    throw new Error('commission_not_configured');
  }
  return Number(value);
}

/** À appeler après authentification et lecture autorisée en base, jamais avec un prix fourni par le client. */
export function sittingPaymentQuote(
  request: PaymentRequestSnapshot,
  authenticatedOwner: string,
  commissionBasisPoints: number,
  now: number,
) {
  if (!authenticatedOwner || request.owner_id !== authenticatedOwner ||
    !request.sitter_id || request.sitter_id === authenticatedOwner) throw new Error('forbidden');
  if (request.status !== 'accepted' || !Number.isFinite(now) ||
    !Number.isFinite(Date.parse(request.starts_at)) || Date.parse(request.starts_at) <= now) {
    throw new Error('request_not_payable');
  }
  if (!Number.isInteger(commissionBasisPoints) || commissionBasisPoints < 0 || commissionBasisPoints >= 10000) {
    throw new Error('commission_not_configured');
  }
  if (!Number.isSafeInteger(request.units) || request.units <= 0 ||
    !Number.isSafeInteger(request.unit_price_cents) || request.unit_price_cents <= 0) {
    throw new Error('invalid_amount');
  }
  const total = BigInt(request.units) * BigInt(request.unit_price_cents);
  // Limite technique Stripe : huit chiffres pour un montant en centimes. Ce n'est pas un plafond commercial.
  if (total > 99999999n) throw new Error('invalid_amount');
  const commission = (total * BigInt(commissionBasisPoints) + 5000n) / 10000n;
  if (commission >= total) throw new Error('invalid_commission');
  return {
    currency: 'eur' as const,
    amount_cents: Number(total),
    application_fee_cents: Number(commission),
    // Les frais Stripe ne sont pas estimés ici ; ce montant n'est pas le net versé au gardien.
    sitter_before_stripe_fees_cents: Number(total - commission),
  };
}
