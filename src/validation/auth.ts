import type { FieldErrors, ValidationResult } from '../types/pet';

export type AuthMode = 'signup' | 'login';
export type Credentials = { email: string; password: string };

export const PASSWORD_MIN = 8;
/** Au-delà de 72 octets, bcrypt (GoTrue) tronque silencieusement. */
export const PASSWORD_MAX = 72;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(
  input: Credentials,
  mode: AuthMode,
): ValidationResult<Credentials, keyof Credentials> {
  const errors: FieldErrors<keyof Credentials> = {};
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';

  if (!email) errors.email = "L'e-mail est requis";
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'E-mail invalide';

  if (!password) errors.password = 'Le mot de passe est requis';
  else if (new TextEncoder().encode(password).length > PASSWORD_MAX) errors.password = 'Mot de passe trop long';
  else if (mode === 'signup' && password.length < PASSWORD_MIN)
    errors.password = `Au moins ${PASSWORD_MIN} caractères`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { email, password } };
}
