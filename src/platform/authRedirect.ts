/** Routes de retour exactes : aucun redirect/next fourni par un lien externe n'est suivi. */
export const NATIVE_AUTH_REDIRECT = 'fr.furrix.app://auth/callback';
export const NATIVE_PASSWORD_REDIRECT = 'fr.furrix.app://auth/reset';

/** Le retour de recuperation reste sur le formulaire, meme avec une session deja ouverte. */
export function getPasswordResetRedirect(native: boolean, origin: string): string {
  return native ? NATIVE_PASSWORD_REDIRECT : getAuthRedirect(false, origin).replace('/#/auth/callback', '/#/auth/reset');
}

export function getAuthRedirect(native: boolean, origin: string): string {
  if (native) return NATIVE_AUTH_REDIRECT;
  const url = new URL(origin);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Origine de confirmation non autorisée.');
  }
  return `${url.origin}/#/auth/callback`;
}

export type NativeAuthReturn = { code: string; flowId?: string; recovery?: true } | { error: true } | null;

export function parseNativeAuthReturn(raw: string): NativeAuthReturn {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'fr.furrix.app:' || url.host !== 'auth' || !['/callback', '/reset'].includes(url.pathname)
      || url.username || url.password || url.hash) return null;
  if (url.searchParams.has('error') || url.searchParams.has('error_code')) return { error: true };
  const codes = url.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096) return null;
  const flowIds = url.searchParams.getAll('sb_flow_id');
  if (flowIds.length > 1 || (flowIds.length === 1 && !/^[A-Za-z0-9_-]{1,128}$/.test(flowIds[0]!))) return null;
  return { code: codes[0], ...(url.pathname === '/reset' ? { recovery: true as const } : {}), ...(flowIds[0] ? { flowId: flowIds[0] } : {}) };
}
