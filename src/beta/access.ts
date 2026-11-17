import type { FurrixClient } from '../services/supabaseClient';
import { AppError, toDataError } from '../services/errors';

export type BetaStatus = 'active' | 'pending' | 'denied';
export async function getBetaStatus(client: FurrixClient): Promise<BetaStatus> {
  const { data, error } = await client.rpc('private_beta_status');
  if (error) throw toDataError(error);
  if (data !== 'active' && data !== 'pending' && data !== 'denied') throw new AppError('forbidden', 'Accès bêta non vérifiable.');
  return data;
}
export async function acceptBetaNotice(client: FurrixClient, adult: boolean, readNotice: boolean) {
  if (!adult || !readNotice) throw new AppError('validation', 'Confirme les deux déclarations pour participer.');
  const { error } = await client.rpc('accept_private_beta_notice', { p_adult: true, p_read_notice: true });
  if (error) throw toDataError(error);
}
