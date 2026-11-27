import { expect, it, vi } from 'vitest';
import { stripeOnboarding } from '../../supabase/functions/sitter-stripe-onboarding/stripe';
import { onboardingHandler } from '../../supabase/functions/sitter-stripe-onboarding/core';

it.each([
  ['platform', 'account_token_required'], ['create_account', 'invalid_fields'],
  ['read_account', 'accounts_v2_access_blocked'], ['create_link', 'invalid_fields'],
] as const)('diagnostique %s sans contenu libre ni identifiant de compte', async (operation, code) => {
  const report = vi.fn();
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: {
    code, message: 'email@example.test sk_test_private https://connect.stripe.com/setup/private',
    param: 'acct_private', request_log_url: 'https://dashboard.stripe.com/private',
  } }, { status: 400, headers: { 'Request-Id': 'req_v2Example123' } }));
  const stripe = stripeOnboarding('sk_test_private', send, report);
  const run = () => operation === 'platform' ? stripe.verifyPlatform()
    : operation === 'create_account' ? stripe.create('privatekey')
    : operation === 'read_account' ? stripe.status('acct_private') : stripe.link('acct_private');
  await expect(run()).rejects.toThrow('stripe_unavailable');
  expect(report.mock.calls).toEqual([[{
    event: 'stripe_onboarding_error', operation, http_status: 400, code, request_id: 'req_v2Example123',
  }]]);
});

it.each([null, {}, { error: { code: 'sk_test_private' } }, { error: { code: 'new_code_with_private_data', message: 'secret' } }])('élimine les champs non reconnus : %j', async (body) => {
  const report = vi.fn();
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status: 503, headers: { 'Request-Id': 'https://connect.stripe.com/private' } }));
  await expect(stripeOnboarding('sk_test_private', send, report).verifyPlatform()).rejects.toThrow('stripe_unavailable');
  expect(report).toHaveBeenCalledWith({ event: 'stripe_onboarding_error', operation: 'platform', http_status: 503, code: 'stripe_error', request_id: null });
});

it('diagnostique une coupure réseau sans journaliser son exception', async () => {
  const report = vi.fn();
  const send = vi.fn<typeof fetch>().mockRejectedValue(new Error('sk_test_private user@example.test'));
  await expect(stripeOnboarding('sk_test_private', send, report).create('privatekey')).rejects.toThrow('stripe_unavailable');
  expect(report).toHaveBeenCalledWith({ event: 'stripe_onboarding_error', operation: 'create_account', http_status: null, code: 'network_error', request_id: null });
});

it('ne journalise pas la réponse réussie contenant le lien', async () => {
  const report = vi.fn();
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ url: 'https://connect.stripe.com/setup/private' }));
  expect(await stripeOnboarding('sk_test_private', send, report).link('acct_private')).toBe('https://connect.stripe.com/setup/private');
  expect(report).not.toHaveBeenCalled();
});

it('une réponse non JSON et une clé invalide restent diagnostiquées sans contenu brut', async () => {
  const report = vi.fn();
  const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response('private html', { status: 200 }));
  await expect(stripeOnboarding('sk_test_private', send, report).verifyPlatform()).rejects.toThrow('stripe_unavailable');
  expect(report.mock.calls[0]?.[0].code).toBe('invalid_response');
  send.mockClear();
  await expect(stripeOnboarding('sk_live_private', send, report).verifyPlatform()).rejects.toThrow('test_key_required');
  expect(report.mock.calls[1]?.[0].code).toBe('test_key_required');
  expect(send).not.toHaveBeenCalled();
});

it('un journal défaillant ne change ni la réponse publique ni la libération du bail', async () => {
  const release = vi.fn(async () => {});
  const send = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'acct_1UfdgzLRlPFxqD3K' }))
    .mockResolvedValueOnce(Response.json({ error: { code: 'invalid_fields', message: 'secret' } }, { status: 400 }));
  const stripe = stripeOnboarding('sk_test_private', send, () => { throw Error('logger failed'); });
  const run = onboardingHandler({
    identify: async () => 'owner',
    prepare: async () => ({ user: 'owner', account: null, key: 'stable', claim: 'lease' }),
    attach: async () => {}, release,
  }, stripe, true);
  const response = await run(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer test' }, body: JSON.stringify({ action: 'start' }) }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'unavailable' });
  expect(release).toHaveBeenCalledWith('owner', 'lease');
});
