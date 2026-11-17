import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@capacitor/app';
import { startNativeAuth } from './nativeAuth';
import type { FurrixClient } from '../services/supabaseClient';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), getLaunchUrl: vi.fn(), getState: vi.fn() } }));

describe('cycle de vie natif et liens PKCE', () => {
  const callbacks = new Map<string, (event: any) => void>();
  const remove = vi.fn().mockResolvedValue(undefined);
  const auth = { exchangeCodeForSession: vi.fn(), startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn() };
  const client = { auth } as unknown as FurrixClient;
  beforeEach(() => {
    callbacks.clear(); vi.clearAllMocks();
    vi.mocked(App.addListener).mockImplementation(async (name: string, callback: any) => {
      callbacks.set(name, callback); return { remove };
    });
    vi.mocked(App.getState).mockResolvedValue({ isActive: true });
    vi.mocked(App.getLaunchUrl).mockResolvedValue(undefined);
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
  });
  it('traite le lancement à froid une seule fois et libère les abonnements', async () => {
    const url = 'fr.furrix.app://auth/callback?code=test-code';
    vi.mocked(App.getLaunchUrl).mockResolvedValue({ url });
    const stop = await startNativeAuth(client, vi.fn());
    callbacks.get('appUrlOpen')!({ url });
    callbacks.get('appUrlOpen')!({ url: 'https://evil.test/?code=other' });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code');
    callbacks.get('appStateChange')!({ isActive: false });
    expect(auth.stopAutoRefresh).toHaveBeenCalled();
    callbacks.get('appStateChange')!({ isActive: true });
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);
    stop();
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('présente une erreur générique sans exposer le code ni le message serveur', async () => {
    const onError = vi.fn();
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: 'secret server detail' } });
    const stop = await startNativeAuth(client, onError);
    callbacks.get('appUrlOpen')!({ url: 'fr.furrix.app://auth/callback?code=secret-code' });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls.flat().join(' ')).not.toMatch(/secret/);
    stop();
  });
  it('transmet l’identifiant du flux PKCE au SDK pour le bon vérificateur local', async () => {
    const stop = await startNativeAuth(client, vi.fn());
    callbacks.get('appUrlOpen')!({ url: 'fr.furrix.app://auth/callback?code=test-code&sb_flow_id=0123456789abcdef0123456789abcdef' });
    await vi.waitFor(() => expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code', { flowId: '0123456789abcdef0123456789abcdef' }));
    stop();
  });
});
