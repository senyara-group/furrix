import type { Session } from '@supabase/supabase-js';
import type { Credentials } from '../validation/auth';
import { toAuthError } from './errors';
import type { FurrixClient } from './supabaseClient';
import { Capacitor } from '@capacitor/core';
import { getAuthRedirect } from '../platform/authRedirect';

export function authRedirect(): string {
  return getAuthRedirect(Capacitor.isNativePlatform(), window.location.origin);
}

export type SignUpResult = { session: Session | null; needsEmailConfirmation: boolean };

export async function signUp(client: FurrixClient, { email, password }: Credentials): Promise<SignUpResult> {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirect() },
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
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw toAuthError(error);
}

/** Même réponse UI pour un e-mail connu ou inconnu, afin de limiter l'énumération. */
export async function requestPasswordReset(client: FurrixClient, email: string): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: authRedirect() });
  if (error) throw toAuthError(error);
}

export async function resendConfirmation(client: FurrixClient, email: string): Promise<void> {
  const { error } = await client.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: authRedirect() } });
  if (error) throw toAuthError(error);
}

export async function updatePassword(client: FurrixClient, password: string): Promise<void> {
  const { error } = await client.auth.updateUser({ password });
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
