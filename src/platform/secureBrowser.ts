import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

/** Écoute de fermeture en cours : une seule à la fois, quelle que soit la page qui a ouvert. */
let active: { handle: PluginListenerHandle | null; done: boolean } | null = null;

function release(entry: { handle: PluginListenerHandle | null; done: boolean }) {
  if (entry.done) return;
  entry.done = true;
  void entry.handle?.remove();
  if (active === entry) active = null;
}

/**
 * Ouvre une page externe sensible (inscription Stripe) hors de la WebView de l'application.
 *
 * - iOS : SFSafariViewController ; Android : Chrome Custom Tabs (plugin `@capacitor/browser`).
 *   Stripe n'accepte pas son inscription hébergée dans une WebView embarquée.
 * - Web : même onglet ; le retour Stripe ramène sur le profil gardien, qui relit l'état au chargement.
 *
 * `onClosed` est appelé une seule fois, quand le navigateur sécurisé est fermé (mobile). Une nouvelle
 * ouverture retire l'écoute précédente : jamais deux relectures pour une fermeture. L'URL n'est ni
 * journalisée ni conservée. Renvoie de quoi retirer l'écoute.
 */
export async function openSecureBrowser(url: string, onClosed: () => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) {
    window.location.assign(url);
    return () => {};
  }
  if (active) release(active);
  const entry: { handle: PluginListenerHandle | null; done: boolean } = { handle: null, done: false };
  active = entry;
  const handle = await Browser.addListener('browserFinished', () => {
    if (entry.done) return;
    release(entry);
    onClosed();
  });
  // Retirée pendant l'attente (nouvelle ouverture, écran quitté) : ne pas laisser l'écoute en place.
  if (entry.done) { void handle.remove(); return () => {}; }
  entry.handle = handle;
  try {
    await Browser.open({ url, presentationStyle: 'fullscreen' });
  } catch (error) {
    release(entry);
    throw error;
  }
  return () => release(entry);
}

/** Pour les tests : nombre d'écoutes de fermeture actives (0 ou 1). */
export const activeBrowserListeners = () => (active ? 1 : 0);
