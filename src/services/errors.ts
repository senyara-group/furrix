// Erreurs applicatives : un code stable pour la logique, un message français pour l'interface.
// Les messages ne révèlent jamais de détail technique du serveur.

export type AppErrorCode =
  | 'not_configured'
  | 'validation'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'user_exists'
  | 'weak_password'
  | 'signup_disabled'
  | 'rate_limited'
  | 'network'
  | 'forbidden'
  | 'not_found'
  | 'invalid_data'
  | 'storage'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause?: unknown;
  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

type RawError = { code?: string; status?: number; message?: string; name?: string; statusCode?: string | number };

const isRaw = (e: unknown): e is RawError => typeof e === 'object' && e !== null;

const NETWORK = new AppError('network', 'Connexion impossible. Vérifie ton réseau et réessaie.');

function looksLikeNetwork(e: RawError): boolean {
  return e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || /fetch|network/i.test(e.message ?? '');
}

export function toAuthError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (!isRaw(error)) return new AppError('unknown', 'Une erreur est survenue. Réessaie.', error);
  switch (error.code) {
    case 'invalid_credentials':
      return new AppError('invalid_credentials', 'E-mail ou mot de passe incorrect.', error);
    case 'email_not_confirmed':
      return new AppError('email_not_confirmed', 'Confirme ton e-mail avant de te connecter.', error);
    case 'user_already_exists':
    case 'email_exists':
      return new AppError('user_exists', 'Un compte existe déjà avec cet e-mail.', error);
    case 'weak_password':
      return new AppError('weak_password', 'Mot de passe trop faible.', error);
    case 'signup_disabled':
    case 'email_provider_disabled':
      return new AppError('signup_disabled', 'Les inscriptions sont fermées pour le moment.', error);
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new AppError('rate_limited', 'Trop de tentatives. Patiente quelques minutes.', error);
  }
  if (error.status === 429) return new AppError('rate_limited', 'Trop de tentatives. Patiente quelques minutes.', error);
  if (looksLikeNetwork(error)) return new AppError('network', NETWORK.message, error);
  return new AppError('unknown', 'Une erreur est survenue. Réessaie.', error);
}

export function toDataError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (!isRaw(error)) return new AppError('unknown', 'Une erreur est survenue. Réessaie.', error);
  switch (error.code) {
    case '42501':
      return new AppError('forbidden', "Tu n'as pas le droit d'effectuer cette action.", error);
    case 'PGRST116':
      return new AppError('not_found', 'Profil introuvable ou non modifiable.', error);
    case '23514':
    case '23502':
    case '22001':
    case '22P02':
      return new AppError('invalid_data', 'Certaines informations sont invalides.', error);
  }
  if (error.status === 401 || error.status === 403) {
    return new AppError('forbidden', "Tu n'as pas le droit d'effectuer cette action.", error);
  }
  if (looksLikeNetwork(error)) return new AppError('network', NETWORK.message, error);
  return new AppError('unknown', 'Une erreur est survenue. Réessaie.', error);
}

export function toStorageError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const raw = isRaw(error) ? error : {};
  const status = Number(raw.statusCode ?? raw.status);
  if (status === 413 || /size|too large/i.test(raw.message ?? '')) {
    return new AppError('storage', 'Photo trop lourde (5 Mo maximum).', error);
  }
  if (status === 415 || /mime|type/i.test(raw.message ?? '')) {
    return new AppError('storage', 'Format non accepté (JPEG, PNG ou WebP).', error);
  }
  if (status === 401 || status === 403 || /row-level security|unauthorized/i.test(raw.message ?? '')) {
    return new AppError('forbidden', "La photo n'a pas pu être enregistrée (accès refusé).", error);
  }
  if (looksLikeNetwork(raw)) return new AppError('network', NETWORK.message, error);
  return new AppError('storage', "La photo n'a pas pu être enregistrée.", error);
}
