import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import type { FurrixClient } from '../services/supabaseClient';
import { parseNativeAuthReturn } from './authRedirect';

/** À monter une fois au niveau de l'application. Ne journalise jamais URL/code/session. */
export async function startNativeAuth(client: FurrixClient, onError: (message: string) => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handles: PluginListenerHandle[] = [];
  let active = true;
  // Évite le double traitement getLaunchUrl/appUrlOpen, y compris pendant l'échange réseau.
  const received = new Set<string>();
  const receive = async (raw: string) => {
    const result = parseNativeAuthReturn(raw);
    if (!active || !result) return;
    if ('error' in result) {
      onError('Lien expiré ou invalide. Demande un nouveau lien.');
      return;
    }
    if (received.has(result.code)) return;
    received.add(result.code);
    try {
      const { error } = result.flowId
        ? await client.auth.exchangeCodeForSession(result.code, { flowId: result.flowId })
        : await client.auth.exchangeCodeForSession(result.code);
      if (error && active) onError('Impossible de valider ce lien sur cet appareil. Demande un nouveau lien depuis cette application.');
    } catch {
      if (active) onError('Connexion interrompue. Demande un nouveau lien.');
    }
  };
  try {
    handles.push(await App.addListener('appUrlOpen', ({ url }) => { void receive(url); }));
    handles.push(await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    }));
    const state = await App.getState();
    if (state.isActive) client.auth.startAutoRefresh();
    const launch = await App.getLaunchUrl();
    if (launch?.url) await receive(launch.url);
  } catch {
    active = false;
    await Promise.all(handles.map((handle) => handle.remove()));
    client.auth.stopAutoRefresh();
    onError('Initialisation mobile impossible. Ferme puis relance l’application.');
  }
  return () => {
    active = false;
    received.clear();
    for (const handle of handles) void handle.remove();
    client.auth.stopAutoRefresh();
  };
}
