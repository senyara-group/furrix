import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FurrixClient } from '../services/supabaseClient';

const native = vi.hoisted(() => ({ value: false }));
const browser = vi.hoisted(() => ({ open: vi.fn(), closed: null as null | (() => void) }));
vi.mock('@capacitor/core', async (original) => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => native.value, getPlatform: () => (native.value ? 'ios' : 'web') } };
});
vi.mock('../platform/secureBrowser', () => ({
  openSecureBrowser: vi.fn(async (url: string, onClosed: () => void) => { browser.open(url); browser.closed = onClosed; return () => {}; }),
}));

import { isStripeOnboardingUrl, PayoutError, payoutStatus, startPayout } from './payouts';
import { PayoutOnboarding } from './PayoutOnboarding';

const LINK = 'https://connect.stripe.com/setup/e/acct_test/abc';
type Reply = { data?: unknown; error?: unknown } | Error;
/** Client minimal : seules les fonctions Edge sont appelées par ce module. */
function fakeClient(...replies: Reply[]) {
  const invoke = vi.fn(async () => {
    const next = replies.length > 1 ? replies.shift()! : replies[0]!;
    if (next instanceof Error) throw next;
    return { data: next.data ?? null, error: next.error ?? null };
  });
  return { client: { functions: { invoke } } as unknown as FurrixClient, invoke };
}
const httpError = (status: number, body?: object) =>
  Object.assign(new Error('http'), { name: 'FunctionsHttpError', context: new Response(body ? JSON.stringify(body) : 'Not found', { status }) });
const fetchError = () => Object.assign(new Error('fetch'), { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') });

beforeEach(() => { native.value = false; browser.open.mockReset(); browser.closed = null; sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Inscription Stripe : appels au serveur', () => {
  it('n’envoie que l’action, sans compte ni URL de retour', async () => {
    const { client, invoke } = fakeClient({ data: { status: 'incomplete' } }, { data: { status: 'incomplete', url: LINK } });
    expect(await payoutStatus(client)).toBe('incomplete');
    expect(await startPayout(client)).toEqual({ status: 'incomplete', url: LINK });
    expect(invoke.mock.calls).toEqual([
      ['sitter-stripe-onboarding', { body: { action: 'status' } }],
      ['sitter-stripe-onboarding', { body: { action: 'start' } }],
    ]);
  });

  it('refuse un lien qui ne mène pas à l’inscription Stripe', async () => {
    for (const url of ['http://connect.stripe.com/x', 'https://evil.example/connect.stripe.com', 'https://user:pw@connect.stripe.com/x', 'https://connect.stripe.com:444/x', 'javascript:alert(1)', 42])
      expect(isStripeOnboardingUrl(url)).toBe(false);
    expect(isStripeOnboardingUrl('https://accounts.stripe.com/x')).toBe(true);
    const { client } = fakeClient({ data: { status: 'incomplete', url: 'https://evil.example/' } });
    await expect(startPayout(client)).rejects.toMatchObject({ problem: 'unavailable' });
  });

  it('ne demande aucun lien quand l’inscription est complète, et rejette un état inconnu', async () => {
    expect(await startPayout(fakeClient({ data: { status: 'ready' } }).client)).toEqual({ status: 'ready' });
    await expect(payoutStatus(fakeClient({ data: { status: 'done' } }).client)).rejects.toMatchObject({ problem: 'unavailable' });
  });

  it('distingue serveur désactivé, préparation en cours, rapprochement, refus et réseau', async () => {
    const cases: Array<[Reply, string]> = [
      [{ error: httpError(503, { status: 'unavailable' }) }, 'unavailable'],
      [{ error: httpError(404) }, 'unavailable'],
      [{ error: httpError(409, { status: 'busy' }) }, 'busy'],
      [{ error: httpError(409, { status: 'reconciliation_required' }) }, 'reconciliation_required'],
      [{ error: httpError(403, { status: 'forbidden' }) }, 'forbidden'],
      [{ error: httpError(401, { status: 'unauthorized' }) }, 'unauthorized'],
      [{ error: fetchError() }, 'network'],
      [new TypeError('Failed to fetch'), 'network'],
    ];
    for (const [reply, problem] of cases) {
      const error = await payoutStatus(fakeClient(reply).client).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PayoutError);
      expect((error as PayoutError).problem).toBe(problem);
    }
  });
});

describe('Inscription Stripe : profil gardien', () => {
  it('affiche l’état réel et une action explicite pour commencer', async () => {
    const { client, invoke } = fakeClient({ data: { status: 'not_started' } });
    render(<PayoutOnboarding client={client} />);
    expect(await screen.findByText('Pas commencée')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commencer l’inscription Stripe' })).toBeTruthy();
    expect(screen.getByText(/Le paiement des gardes n’est pas encore ouvert/)).toBeTruthy();
    // Aucune création automatique : seule la lecture de l'état a eu lieu.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(browser.open).not.toHaveBeenCalled();
  });

  it('web : bloque le départ tant que le profil a des modifications non enregistrées', async () => {
    const { client } = fakeClient({ data: { status: 'incomplete' } });
    render(<PayoutOnboarding client={client} unsaved />);
    const button = await screen.findByRole('button', { name: 'Reprendre l’inscription Stripe' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Enregistre d’abord tes modifications/)).toBeTruthy();
  });

  it('mobile : ouvre Stripe, puis relit l’état au retour sans le considérer terminé', async () => {
    native.value = true;
    const { client, invoke } = fakeClient(
      { data: { status: 'incomplete' } },
      { data: { status: 'incomplete', url: LINK } },
      { data: { status: 'pending' } },
    );
    render(<PayoutOnboarding client={client} unsaved />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre l’inscription Stripe' }));
    await waitFor(() => expect(browser.open).toHaveBeenCalledWith(LINK));
    expect(screen.queryByText('Inscription pas encore terminée')).toBeNull();
    browser.closed!();
    expect(await screen.findByText('Inscription pas encore terminée')).toBeTruthy();
    expect(screen.getByText('Vérification en cours')).toBeTruthy();
    expect(invoke).toHaveBeenLastCalledWith('sitter-stripe-onboarding', { body: { action: 'status' } });
    // Le lien temporaire n'est conservé nulle part.
    const stored = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage });
    expect(stored).not.toContain('stripe.com');
    expect(document.body.innerHTML).not.toContain('stripe.com');
  });

  it('mobile : fermer puis rouvrir Stripe laisse le bouton disponible et relit l’état à chaque retour', async () => {
    native.value = true;
    const { client, invoke } = fakeClient(
      { data: { status: 'incomplete' } },
      { data: { status: 'incomplete', url: LINK } },
      { data: { status: 'incomplete' } },
      { data: { status: 'incomplete', url: LINK } },
      { data: { status: 'incomplete' } },
    );
    render(<PayoutOnboarding client={client} />);
    for (let round = 1; round <= 2; round++) {
      const button = await screen.findByRole('button', { name: 'Reprendre l’inscription Stripe' });
      expect(button.getAttribute('aria-busy')).toBeNull();
      fireEvent.click(button);
      await waitFor(() => expect(browser.open).toHaveBeenCalledTimes(round));
      // Le navigateur est ouvert : le bouton n'est pas resté en attente.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Reprendre l’inscription Stripe' }).getAttribute('aria-busy')).toBeNull());
      browser.closed!();
      expect(await screen.findByText('Inscription pas encore terminée')).toBeTruthy();
    }
    const actions = invoke.mock.calls.map((c) => (c as unknown as [string, { body: { action: string } }])[1].body.action);
    expect(actions).toEqual(['status', 'start', 'status', 'start', 'status']);
  });

  it('confirme seulement quand Stripe a activé paiements et versements', async () => {
    native.value = true;
    const { client } = fakeClient({ data: { status: 'not_started' } }, { data: { status: 'incomplete', url: LINK } }, { data: { status: 'ready' } });
    render(<PayoutOnboarding client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Commencer l’inscription Stripe' }));
    await waitFor(() => expect(browser.closed).not.toBeNull());
    browser.closed!();
    expect(await screen.findByText('Inscription complète')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /inscription Stripe/ })).toBeNull();
  });

  it('explique les échecs et ne propose pas de relance quand un rapprochement est nécessaire', async () => {
    const busy = fakeClient({ data: { status: 'incomplete' } }, { error: httpError(409, { status: 'busy' }) });
    render(<PayoutOnboarding client={busy.client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre l’inscription Stripe' }));
    expect(await screen.findByText('Préparation déjà en cours')).toBeTruthy();
    cleanup();

    const blocked = fakeClient({ data: { status: 'incomplete' } }, { error: httpError(409, { status: 'reconciliation_required' }) });
    render(<PayoutOnboarding client={blocked.client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre l’inscription Stripe' }));
    expect(await screen.findByText('Vérification nécessaire par l’équipe Furrix')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reprendre l’inscription Stripe' })).toBeNull();
    expect(browser.open).not.toHaveBeenCalled();
    cleanup();

    const offline = fakeClient({ error: fetchError() }, { data: { status: 'not_started' } });
    render(<PayoutOnboarding client={offline.client} />);
    expect(await screen.findByText('Pas de connexion')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Pas commencée')).toBeTruthy();
    cleanup();

    render(<PayoutOnboarding client={fakeClient({ error: httpError(503, { status: 'unavailable' }) }).client} />);
    expect(await screen.findByText('Inscription aux versements pas encore disponible')).toBeTruthy();
  });
});
