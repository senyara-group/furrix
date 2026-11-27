import { expect, it, vi } from 'vitest';
import { sittingCheckout, type SavedSittingCheckout } from '../../supabase/functions/_shared/sitting-checkout';
import { FURRIX_STRIPE_SANDBOX } from '../../supabase/functions/sitter-stripe-onboarding/stripe';

const now = Date.parse('2026-11-27T12:00:00Z') / 1000;
// Commission et délai fictifs : aucune valeur commerciale par défaut.
const saved: SavedSittingCheckout = {
  id: '10000000-0000-4000-8000-000000000001', stripe_account: 'acct_sitter',
  request: { owner_id: 'owner', sitter_id: 'sitter', status: 'accepted', starts_at: '2026-12-01T12:00:00Z', units: 3, unit_price_cents: 1999 },
  commission_basis_points: '1250', prepared_at: now, expires_at: now + 3600,
};
const session = (extra: object = {}) => Response.json({
  id: 'cs_test_example', livemode: false, mode: 'payment', currency: 'eur', amount_total: 5997,
  client_reference_id: saved.id, expires_at: saved.expires_at, status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_test_example', ...extra,
});
function setup() {
  const send = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).endsWith('/v1/account') ? Response.json({ id: FURRIX_STRIPE_SANDBOX }) : session());
  return { send, create: sittingCheckout({ enabled: true, secret: 'sk_test_fake', transport: send }).create };
}

it('reste inactif sans ouverture explicite et refuse la production avant tout appel', async () => {
  const { send } = setup();
  await expect(sittingCheckout({ enabled: false, secret: 'sk_test_fake', transport: send }).create(saved, now)).rejects.toThrow('payments_unavailable');
  await expect(sittingCheckout({ enabled: true, secret: 'sk_live_fake', transport: send }).create(saved, now)).rejects.toThrow('test_key_required');
  expect(send).not.toHaveBeenCalled();
});

it('facture au compte connecté le montant serveur, commission incluse sans supplément propriétaire', async () => {
  const { send, create } = setup();
  await expect(create(saved, now)).resolves.toMatchObject({ id: 'cs_test_example', status: 'open' });
  expect(send.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Stripe-Account');
  expect(send.mock.calls[1]?.[1]?.headers).toMatchObject({ 'Stripe-Account': 'acct_sitter', 'Idempotency-Key': 'furrix-sitting-checkout-v1-' + saved.id });
  const body = new URLSearchParams(String(send.mock.calls[1]?.[1]?.body));
  expect(body.get('line_items[0][price_data][unit_amount]')).toBe('5997');
  expect(body.get('payment_intent_data[application_fee_amount]')).toBe('750');
  expect(body.get('payment_method_types[0]')).toBe('card');
  expect(body.get('expires_at')).toBe(String(saved.expires_at));
  expect(body.get('success_url')).toBe('https://furrix.fr/#/garde?vue=mes-gardes&paiement=retour');
  expect(body.get('cancel_url')).toBe('https://furrix.fr/#/garde?vue=mes-gardes&paiement=interrompu');
  expect(body.has('customer_email')).toBe(false);
  expect(body.has('payment_intent_data[transfer_data][destination]')).toBe(false);
});

it('reprend exactement la même clé et le même corps après une réponse perdue', async () => {
  const { send, create } = setup();
  send.mockResolvedValueOnce(Response.json({ id: FURRIX_STRIPE_SANDBOX })).mockRejectedValueOnce(Error('private response'));
  await expect(create(saved, now)).rejects.toThrow('stripe_unavailable');
  await create(saved, now + 2400); // Il ne reste que 20 minutes : ne pas recalculer l’expiration pour le rejeu.
  const posts = send.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[0]?.[1]?.body).toBe(posts[1]?.[1]?.body);
  expect(posts[0]?.[1]?.headers).toEqual(posts[1]?.[1]?.headers);
});

it.each([undefined, '', '10%', '10000'])('refuse une commission non configurée : %s', async (rate) => {
  const { send, create } = setup();
  await expect(create({ ...saved, commission_basis_points: rate }, now)).rejects.toThrow('commission_not_configured');
  expect(send).not.toHaveBeenCalled();
});

it.each([
  { id: 'invalid' }, { stripe_account: FURRIX_STRIPE_SANDBOX }, { stripe_account: 'acct_evil\r\nHeader' },
  { prepared_at: now + 1 }, { expires_at: now + 1799 }, { expires_at: now + 86401 },
  { expires_at: now + 3600, request: { ...saved.request, starts_at: new Date((now + 1800) * 1000).toISOString() } },
  { request: { ...saved.request, status: 'cancelled' } }, { request: { ...saved.request, unit_price_cents: -1 } },
])('refuse une tentative ou une réservation invalide : %j', async (extra) => {
  const { send, create } = setup();
  await expect(create({ ...saved, ...extra }, now)).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});

it('refuse une autre plateforme sans créer de session', async () => {
  const { send, create } = setup();
  send.mockResolvedValueOnce(Response.json({ id: 'acct_other' }));
  await expect(create(saved, now)).rejects.toThrow('wrong_sandbox');
  expect(send).toHaveBeenCalledTimes(1);
});

it.each([200, 503])('ne divulgue pas une réponse Stripe illisible (HTTP %s)', async (status) => {
  const { send, create } = setup();
  send.mockResolvedValueOnce(new Response('private response sk_test_fake', { status }));
  await expect(create(saved, now)).rejects.toThrow('stripe_unavailable');
  expect(send).toHaveBeenCalledTimes(1);
});

it('refuse une tentative expirée ou trop ancienne sans la recréer', async () => {
  const { send, create } = setup();
  await expect(create(saved, saved.expires_at)).rejects.toThrow('attempt_expired');
  await expect(create({ ...saved, expires_at: now + 86400 }, now + 23 * 3600)).rejects.toThrow('reconciliation_required');
  expect(send).not.toHaveBeenCalled();
});

it.each([
  { livemode: true }, { id: 'cs_live_example' }, { amount_total: 100 }, { currency: 'usd' }, { mode: 'subscription' },
  { client_reference_id: 'another' }, { expires_at: saved.expires_at + 1 }, { status: 'unknown' },
  { url: 'https://checkout.stripe.com.evil.test/pay' }, { url: 'https://user@checkout.stripe.com/pay' }, { url: 'http://checkout.stripe.com/pay' },
])('refuse une réponse Stripe incohérente : %j', async (extra) => {
  const { send, create } = setup();
  send.mockResolvedValueOnce(Response.json({ id: FURRIX_STRIPE_SANDBOX })).mockResolvedValueOnce(session(extra));
  await expect(create(saved, now)).rejects.toThrow('invalid_checkout');
});

it.each(['complete', 'expired'])('un rejeu retrouve une session %s sans lien ni confirmation de garde', async (status) => {
  const { send, create } = setup();
  send.mockResolvedValueOnce(Response.json({ id: FURRIX_STRIPE_SANDBOX })).mockResolvedValueOnce(session({ status, url: null }));
  expect(await create(saved, now)).toEqual({ id: 'cs_test_example', status, url: null });
});
