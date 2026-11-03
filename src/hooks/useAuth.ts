import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as authService from '../services/auth';
import { AppError, toAuthError } from '../services/errors';
import type { FurrixClient } from '../services/supabaseClient';
import { validateCredentials, type AuthMode, type Credentials } from '../validation/auth';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export type UseAuth = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  pending: boolean;
  error: string | null;
  fieldErrors: Partial<Record<keyof Credentials, string>>;
  notice: string | null;
  submit: (mode: AuthMode, credentials: Credentials) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  clearMessages: () => void;
};

/**
 * Session Supabase : restauration au démarrage (getSession), puis suivi par onAuthStateChange
 * (connexion, déconnexion, jeton rafraîchi, session expirée, autre onglet).
 * Avec client null (mode démonstration), l'état reste « signedOut ».
 */
export function useAuth(client: FurrixClient | null): UseAuth {
  const [status, setStatus] = useState<AuthStatus>(client ? 'loading' : 'signedOut');
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<UseAuth['fieldErrors']>({});
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  const apply = useCallback((next: Session | null) => {
    if (!mounted.current) return;
    setSession(next);
    setStatus(next ? 'signedIn' : 'signedOut');
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!client) {
      setStatus('signedOut');
      return () => { mounted.current = false; };
    }
    // L'abonnement est posé avant la lecture : aucun événement n'est perdu entre les deux.
    const unsubscribe = authService.subscribeToAuthChanges(client, (next) => apply(next));
    authService
      .getCurrentSession(client)
      .then(apply)
      .catch((e: unknown) => {
        if (!mounted.current) return;
        setError(toAuthError(e).message);
        setStatus('signedOut');
      });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [client, apply]);

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
    setFieldErrors({});
  }, []);

  const submit = useCallback(
    async (mode: AuthMode, credentials: Credentials): Promise<boolean> => {
      clearMessages();
      const checked = validateCredentials(credentials, mode);
      if (!checked.ok) {
        setFieldErrors(checked.errors);
        return false;
      }
      if (!client) {
        setError(new AppError('not_configured', 'Supabase non configuré.').message);
        return false;
      }
      setPending(true);
      try {
        if (mode === 'signup') {
          const result = await authService.signUp(client, checked.value);
          if (result.needsEmailConfirmation) {
            setNotice('Compte créé : confirme ton e-mail via le lien reçu, puis connecte-toi.');
          } else {
            apply(result.session);
          }
        } else {
          apply(await authService.signIn(client, checked.value));
        }
        return true;
      } catch (e) {
        if (mounted.current) setError(toAuthError(e).message);
        return false;
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [client, apply, clearMessages],
  );

  const signOut = useCallback(async (): Promise<boolean> => {
    if (!client) return true;
    setPending(true);
    try {
      await authService.signOut(client);
      apply(null);
      return true;
    } catch (e) {
      if (mounted.current) setError(toAuthError(e).message);
      return false;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, [client, apply]);

  return {
    status,
    session,
    user: session?.user ?? null,
    pending,
    error,
    fieldErrors,
    notice,
    submit,
    signOut,
    clearMessages,
  };
}
