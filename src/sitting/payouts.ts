import type { FurrixClient } from '../services/supabaseClient';

/**
 * Inscription Stripe du gardien, côté client.
 *
 * Seul appel autorisé : la fonction serveur `sitter-stripe-onboarding` (actions `status` et `start`).
 * Le client n'envoie ni compte Stripe, ni URL de retour, ni donnée d'identité. Le lien temporaire
 * renvoyé par `start` n'est jamais conservé : il est remis directement au navigateur sécurisé.
 */
export const ONBOARDING_FUNCTION = 'sitter-stripe-onboarding';

/** État lu chez Stripe par le serveur. `ready` exige paiements et versements actifs. */
export type PayoutStatus = 'not_started' | 'incomplete' | 'pending' | 'ready';
/** Ce qui empêche de lire ou de préparer l'inscription. */
export type PayoutProblem = 'unavailable' | 'busy' | 'reconciliation_required' | 'forbidden' | 'unauthorized' | 'network';

export class PayoutError extends Error {
  constructor(public readonly problem: PayoutProblem) {
    super(problem);
    this.name = 'PayoutError';
  }
}

const statuses: readonly PayoutStatus[] = ['not_started', 'incomplete', 'pending', 'ready'];
const problems: readonly PayoutProblem[] = ['unavailable', 'busy', 'reconciliation_required', 'forbidden', 'unauthorized'];
/** Mêmes hôtes que le serveur : rien d'autre n'est ouvert, même si la réponse était altérée. */
const STRIPE_HOSTS = ['connect.stripe.com', 'accounts.stripe.com'];

/** Vrai seulement pour un lien HTTPS vers un hôte Stripe d'inscription, sans identifiants ni port. */
export function isStripeOnboardingUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && STRIPE_HOSTS.includes(u.hostname) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

async function problemOf(error: { name?: string; context?: unknown }): Promise<PayoutProblem> {
  // Requête jamais arrivée (hors ligne, DNS, coupure) : à distinguer d'un refus du serveur.
  if (error.name === 'FunctionsFetchError') return 'network';
  if (error.name !== 'FunctionsHttpError') return 'unavailable';
  const response = error.context as Response | undefined;
  let code = '';
  try { code = String((await response?.json())?.status ?? ''); } catch { /* corps absent ou illisible */ }
  if ((problems as readonly string[]).includes(code)) return code as PayoutProblem;
  if (response?.status === 401) return 'unauthorized';
  if (response?.status === 403) return 'forbidden';
  // Fonction non déployée (404), désactivée (503) ou réponse inattendue.
  return 'unavailable';
}

async function call(client: FurrixClient, action: 'status' | 'start'): Promise<{ status: PayoutStatus; url?: string }> {
  let result: { data: unknown; error: unknown };
  try {
    result = await client.functions.invoke(ONBOARDING_FUNCTION, { body: { action } });
  } catch {
    throw new PayoutError('network');
  }
  if (result.error) throw new PayoutError(await problemOf(result.error as { name?: string; context?: unknown }));
  const data = result.data as { status?: unknown; url?: unknown } | null;
  const status = data?.status;
  if (typeof status !== 'string' || !(statuses as readonly string[]).includes(status)) throw new PayoutError('unavailable');
  if (action === 'start' && status !== 'ready') {
    if (!isStripeOnboardingUrl(data?.url)) throw new PayoutError('unavailable');
    return { status: status as PayoutStatus, url: data!.url as string };
  }
  return { status: status as PayoutStatus };
}

/** Lit l'état réel chez Stripe. Ne crée ni compte ni lien. */
export async function payoutStatus(client: FurrixClient): Promise<PayoutStatus> {
  return (await call(client, 'status')).status;
}

/**
 * Prépare l'inscription (création du compte au premier appel, reprise ensuite) et renvoie un lien
 * à usage unique. Si l'inscription est déjà complète, aucun lien n'est renvoyé.
 */
export async function startPayout(client: FurrixClient): Promise<{ status: PayoutStatus; url?: string }> {
  return call(client, 'start');
}
