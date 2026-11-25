import { describe, expect, it } from 'vitest';
import { parseCommissionBasisPoints, sittingPaymentQuote } from '../../supabase/functions/_shared/sitting-payment-quote';

const now = Date.parse('2026-11-25T12:00:00Z');
const request = { owner_id: 'owner', sitter_id: 'sitter', status: 'accepted', starts_at: '2026-12-01T12:00:00Z', units: 3, unit_price_cents: 1999 };

describe('Préparation du montant de garde côté serveur', () => {
  it('refuse une commission absente ou mal formée, sans valeur implicite', () => {
    for (const value of [undefined, '', ' ', '10%', '1.5', '-1', '10000', '01', 'NaN']) {
      expect(() => parseCommissionBasisPoints(value)).toThrow('commission_not_configured');
    }
    expect(parseCommissionBasisPoints('0')).toBe(0);
    expect(parseCommissionBasisPoints('1250')).toBe(1250);
  });
  it('retient la commission sur le tarif du gardien sans supplément propriétaire', () => {
    // Taux fictif uniquement pour le test, sans valeur commerciale par défaut.
    expect(sittingPaymentQuote(request, 'owner', 1250, now)).toEqual({
      currency: 'eur', amount_cents: 5997, application_fee_cents: 750, sitter_before_stripe_fees_cents: 5247,
    });
    expect(sittingPaymentQuote(request, 'owner', 0, now).application_fee_cents).toBe(0);
  });
  it('arrondit la commission au centime sans calcul flottant', () => {
    expect(sittingPaymentQuote({ ...request, units: 1, unit_price_cents: 1005 }, 'owner', 1000, now).application_fee_cents).toBe(101);
  });
  it('refuse un tiers et une garde dont le propriétaire est aussi gardien', () => {
    expect(() => sittingPaymentQuote(request, 'other', 1000, now)).toThrow('forbidden');
    expect(() => sittingPaymentQuote({ ...request, sitter_id: 'owner' }, 'owner', 1000, now)).toThrow('forbidden');
  });
  it('refuse une demande retirée, payée, expirée ou déjà commencée', () => {
    for (const status of ['pending', 'withdrawn', 'declined', 'confirmed', 'cancelled', 'expired']) {
      expect(() => sittingPaymentQuote({ ...request, status }, 'owner', 1000, now)).toThrow('request_not_payable');
    }
    for (const starts_at of ['invalid', new Date(now).toISOString()]) {
      expect(() => sittingPaymentQuote({ ...request, starts_at }, 'owner', 1000, now)).toThrow('request_not_payable');
    }
  });
  it('refuse les montants non entiers, négatifs, excessifs et les commissions invalides', () => {
    for (const units of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(() => sittingPaymentQuote({ ...request, units }, 'owner', 1000, now)).toThrow('invalid_amount');
    }
    for (const unit_price_cents of [0, -1, 1.1, 100000000]) {
      expect(() => sittingPaymentQuote({ ...request, unit_price_cents }, 'owner', 1000, now)).toThrow('invalid_amount');
    }
    for (const rate of [NaN, -1, 1.1, 10000]) {
      expect(() => sittingPaymentQuote(request, 'owner', rate, now)).toThrow('commission_not_configured');
    }
    expect(() => sittingPaymentQuote({ ...request, units: 1, unit_price_cents: 1 }, 'owner', 9999, now)).toThrow('invalid_commission');
  });
});
