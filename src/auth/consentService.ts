import type { FurrixClient } from '../services/supabaseClient';
import { AppError, toDataError } from '../services/errors';
import type { LegalDocuments } from './registration';

export async function hasAcceptedDocuments(client: FurrixClient, userId: string, documents: LegalDocuments): Promise<boolean> {
  const { data, error } = await client.from('registration_consents').select('user_id')
    .eq('user_id', userId).eq('terms_version', documents.termsVersion).eq('privacy_version', documents.privacyVersion).maybeSingle();
  if (error) throw toDataError(error);
  return data !== null;
}

export async function acceptDocuments(client: FurrixClient, documents: LegalDocuments, adult: boolean, terms: boolean, privacy: boolean) {
  if (!adult || !terms || !privacy) throw new AppError('validation', 'Confirme les trois déclarations pour continuer.');
  const { error } = await client.rpc('accept_registration_terms', {
    p_terms: documents.termsVersion, p_privacy: documents.privacyVersion, p_adult: true,
  });
  if (error) throw toDataError(error);
}
