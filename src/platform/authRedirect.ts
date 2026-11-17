/** Routes de retour exactes : aucun redirect/next fourni par un lien externe n'est suivi. */
export const NATIVE_AUTH_REDIRECT = 'fr.furrix.app://auth/callback';

export function getAuthRedirect(native: boolean, origin: string): string {
  if (native) return NATIVE_AUTH_REDIRECT;
  const url = new URL(origin);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Origine de confirmation non autorisée.');
  }
  return `${url.origin}/#/auth/callback`;
}

export type NativeAuthReturn = { code: string } | { error: true } | null;

export function parseNativeAuthReturn(raw: string): NativeAuthReturn {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'fr.furrix.app:' || url.host !== 'auth' || url.pathname !== '/callback'
      || url.username || url.password || url.hash) return null;
  if (url.searchParams.has('error') || url.searchParams.has('error_code')) return { error: true };
  const codes = url.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096) return null;
  return { code: codes[0] };
}
