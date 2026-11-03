import type { Session } from '@supabase/supabase-js';
import type { Credentials } from '../validation/auth';
import { toAuthError } from './errors';
import type { FurrixClient } from './supabaseClient';

export type SignUpResult = { session: Session | null; needsEmailConfirmation: boolean };

export async function signUp(client: FurrixClient, { email, password }: Credentials): Promise<SignUpResult> {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
  });
  if (error) throw toAuthError(error);
  // Avec confirmation d'e-mail activée, aucune session n'est ouverte avant le clic sur le lien.
  // Un e-mail déjà inscrit renvoie aussi un utilisateur sans identité (anti-énumération) : même message.
  return { session: data.session, needsEmailConfirmation: data.session === null };
}

export async function signIn(client: FurrixClient, { email, password }: Credentials): Promise<Session> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw toAuthError(error);
  return data.session;
}

export async function signOut(client: FurrixClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw toAuthError(error);
}

export async function getCurrentSession(client: FurrixClient): Promise<Session | null> {
  const { data, error } = await client.auth.getSession();
  if (error) throw toAuthError(error);
  return data.session;
}

/**
 * Abonnement aux changements de session (connexion, déconnexion, rafraîchissement du jeton,
 * session restaurée). Le rappel doit rester synchrone : pas d'appel Supabase attendu dedans.
 */
export function subscribeToAuthChanges(
  client: FurrixClient,
  onChange: (session: Session | null, event: string) => void,
): () => void {
  const { data } = client.auth.onAuthStateChange((event, session) => onChange(session, event));
  return () => data.subscription.unsubscribe();
}
