import type { Credentials } from '../validation/auth';
import { validateCredentials } from '../validation/auth';
import { AppError } from '../services/errors';

export type LegalDocuments = { termsUrl: string; privacyUrl: string; termsVersion: string; privacyVersion: string };
export type RegistrationConsent = {
  declared_adult: true; accepted_terms: true; privacy_acknowledged: true;
  terms_version: string; privacy_version: string;
};
export type RegistrationForm = Credentials & { adult: boolean; terms: boolean; privacy: boolean; confirmPassword: string };

export function legalDocuments(env: Record<string, string | undefined>): LegalDocuments | null {
  const termsUrl = env.VITE_TERMS_URL, privacyUrl = env.VITE_PRIVACY_URL;
  const termsVersion = env.VITE_TERMS_VERSION, privacyVersion = env.VITE_PRIVACY_VERSION;
  if (env.VITE_REGISTRATION_ENABLED !== 'true' || !termsUrl || !privacyUrl || !termsVersion || !privacyVersion) return null;
  try {
    for (const raw of [termsUrl, privacyUrl]) {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
    }
    if ([termsVersion, privacyVersion].some((value) => !value.trim() || value.length > 80)) return null;
    return { termsUrl, privacyUrl, termsVersion: termsVersion.trim(), privacyVersion: privacyVersion.trim() };
  } catch { return null; }
}

export function validateRegistration(input: RegistrationForm, documents: LegalDocuments | null) {
  const result = validateCredentials(input, 'signup');
  const errors: Partial<Record<keyof RegistrationForm, string>> = result.ok ? {} : { ...result.errors };
  if (!input.adult) errors.adult = 'Tu dois déclarer avoir au moins 18 ans.';
  if (!input.terms) errors.terms = 'Accepte les conditions d’utilisation pour continuer.';
  if (!input.privacy) errors.privacy = 'Confirme avoir pris connaissance de la politique de confidentialité.';
  if (input.password !== input.confirmPassword) errors.confirmPassword = 'Les mots de passe ne correspondent pas.';
  if (!documents) throw new AppError('signup_disabled', 'Les inscriptions ne sont pas encore ouvertes.');
  return { credentials: result.ok ? result.value : null, errors,
    consent: { declared_adult: true, accepted_terms: true, privacy_acknowledged: true,
      terms_version: documents.termsVersion, privacy_version: documents.privacyVersion } as RegistrationConsent };
}
