import type { FurrixClient } from '../services/supabaseClient';
import { AppError, toAuthError } from '../services/errors';

export function invitationToken(hash: string): string | null {
  const [route, query] = hash.split('?');
  if (route !== '#/auth/invite' || !query) return null;
  const params = new URLSearchParams(query);
  if (params.getAll('type').length !== 1 || params.get('type') !== 'invite') return null;
  const tokens = params.getAll('token_hash');
  return tokens.length === 1 && /^[A-Za-z0-9_-]{16,2048}$/.test(tokens[0]!) ? tokens[0]! : null;
}

export async function verifyInvitation(client: FurrixClient, token: string) {
  const { data, error } = await client.auth.verifyOtp({ token_hash: token, type: 'invite' });
  if (error) throw toAuthError(error);
  if (!data.session) throw new AppError('validation', 'Invitation invalide ou expirée.');
}
