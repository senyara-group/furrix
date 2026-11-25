import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

/**
 * Ouvre une page externe sensible (inscription Stripe) hors de la WebView de l'application.
 *
 * - iOS : SFSafariViewController ; Android : Chrome Custom Tabs (plugin `@capacitor/browser`).
 *   Stripe n'accepte pas son inscription hébergée dans une WebView embarquée.
 * - Web : même onglet ; le retour Stripe ramène sur le profil gardien, qui relit l'état au chargement.
 *
 * `onClosed` est appelé quand le navigateur sécurisé est fermé (mobile). L'URL n'est ni journalisée
 * ni conservée. Renvoie de quoi retirer l'écoute.
 */
export async function openSecureBrowser(url: string, onClosed: () => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) {
    window.location.assign(url);
    return () => {};
  }
  let handle: PluginListenerHandle | null = null;
  const remove = () => { const h = handle; handle = null; void h?.remove(); };
  handle = await Browser.addListener('browserFinished', () => { remove(); onClosed(); });
  try {
    await Browser.open({ url, presentationStyle: 'fullscreen' });
  } catch (error) {
    remove();
    throw error;
  }
  return remove;
}
