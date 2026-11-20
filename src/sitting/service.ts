import type { FurrixClient } from '../services/supabaseClient';
import { AppError, toDataError, toStorageError } from '../services/errors';
import { PET_PHOTO_BUCKET, PET_PHOTO_TYPES, validatePhotoFile, type PetPhotoMime } from '../services/petPhotos';
import type {
  MySitting, SitterProfile, SitterProfileDraft, SitterResult, SitterSearch, SittingMessage, SittingReport, SittingReportCategory,
  SittingRequest, SittingService, SittingThread, SittingUpdate, ServicePrice,
} from './types';

/* Garde (parcours 2) : toutes les règles sont vérifiées par la base. Le paiement n'est pas branché. */

export async function searchSitters(client: FurrixClient, search: SitterSearch): Promise<SitterResult[]> {
  const { data, error } = await client.rpc('search_sitters', {
    p_lat: search.latitude, p_lng: search.longitude, p_radius: search.radius, p_service: search.service,
    p_starts: search.starts, p_ends: search.ends, ...(search.species ? { p_species: search.species } : {}),
  });
  if (error) throw toDataError(error); return data ?? [];
}
/** Fiche d'un gardien (lien direct) ; la distance n'est calculée que si une position est connue. */
export async function getSitter(client: FurrixClient, sitterId: string, near?: { latitude: number; longitude: number }, service?: SittingService): Promise<SitterResult | null> {
  const { data, error } = await client.rpc('search_sitters', {
    p_sitter: sitterId, ...(near ? { p_lat: near.latitude, p_lng: near.longitude, p_radius: 100 } : {}), ...(service ? { p_service: service } : {}),
  });
  if (error) throw toDataError(error); return data?.[0] ?? null;
}
export async function mySitterProfile(client: FurrixClient, userId: string): Promise<{ profile: SitterProfile; services: ServicePrice[] } | null> {
  const [profile, services] = await Promise.all([
    client.from('sitter_profiles').select('*').eq('user_id', userId).maybeSingle(),
    client.from('sitter_services').select('service,price_cents').eq('sitter_id', userId),
  ]);
  if (profile.error) throw toDataError(profile.error);
  if (services.error) throw toDataError(services.error);
  return profile.data ? { profile: profile.data, services: services.data ?? [] } : null;
}
export async function saveSitterProfile(client: FurrixClient, draft: SitterProfileDraft): Promise<SitterProfile> {
  const { data, error } = await client.rpc('save_sitter_profile', {
    p_kind: draft.kind, p_bio: draft.bio.trim(), p_city: draft.city.trim(), p_lat: Math.round(draft.latitude * 100) / 100, p_lng: Math.round(draft.longitude * 100) / 100,
    p_species: draft.species, p_max_weight: draft.max_weight_kg, p_outdoor: draft.outdoor, p_services: draft.services, p_active: draft.active,
  });
  if (error) throw toDataError(error); return data;
}
/** Limites anti-spam du serveur (« Trop de … ») : message affichable tel quel ; sinon l'erreur habituelle. */
const limitError = (error: { message?: string }) =>
  /^Trop de /.test(error.message ?? '') ? new AppError('rate_limited', error.message!, error) : toDataError(error);
export async function createSittingRequest(client: FurrixClient, input: { sitter: string; pet: string; service: SittingService; starts: string; ends: string; message: string }, requestId: string): Promise<SittingRequest> {
  const { data, error } = await client.rpc('create_sitting_request', {
    p_sitter: input.sitter, p_pet: input.pet, p_service: input.service, p_starts: input.starts, p_ends: input.ends, p_message: input.message.trim(), p_request: requestId,
  });
  if (error) throw limitError(error); return data;
}
export async function updateSittingRequest(client: FurrixClient, id: string, action: 'withdraw' | 'accept' | 'decline' | 'cancel', note?: string): Promise<SittingRequest> {
  const { data, error } = await client.rpc('update_sitting_request', { p_id: id, p_action: action, ...(note?.trim() ? { p_note: note.trim() } : {}) });
  if (error) throw toDataError(error); return data;
}
export async function listMySittings(client: FurrixClient, id?: string): Promise<MySitting[]> {
  const { data, error } = await client.rpc('list_my_sittings', id ? { p_id: id } : {});
  if (error) throw toDataError(error); return data ?? [];
}
export async function listSittingThreads(client: FurrixClient): Promise<SittingThread[]> {
  const { data, error } = await client.rpc('list_sitting_threads', {});
  if (error) throw toDataError(error); return data ?? [];
}
/** 50 derniers messages d'une conversation de garde ; avec `after`, seulement ceux arrivés depuis. */
export async function loadSittingMessages(client: FurrixClient, owner: string, sitter: string, after?: number): Promise<SittingMessage[]> {
  let query = client.from('sitting_messages').select('*').eq('owner_id', owner).eq('sitter_id', sitter);
  if (after !== undefined) query = query.gt('id', after);
  const { data, error } = await query.order('id', { ascending: false }).limit(50);
  if (error) throw toDataError(error); return (data ?? []).reverse();
}
export async function sendSittingMessage(client: FurrixClient, owner: string, sitter: string, text: string, requestId: string): Promise<SittingMessage> {
  if (!text.trim() || text.trim().length > 2000) throw new AppError('validation', 'Écris entre 1 et 2 000 caractères.');
  const { data, error } = await client.rpc('send_sitting_message', { p_owner: owner, p_sitter: sitter, p_text: text.trim(), p_request: requestId });
  if (error) throw limitError(error); return data;
}
export async function listSittingUpdates(client: FurrixClient, sittingId: string): Promise<SittingUpdate[]> {
  const { data, error } = await client.from('sitting_updates').select('*').eq('sitting_id', sittingId).order('id', { ascending: false }).limit(50);
  if (error) throw toDataError(error); return data ?? [];
}
export async function addSittingUpdate(client: FurrixClient, sittingId: string, text: string): Promise<SittingUpdate> {
  const { data, error } = await client.rpc('add_sitting_update', { p_sitting: sittingId, p_text: text.trim() });
  if (error) throw toDataError(error); return data;
}
export async function reportSitting(client: FurrixClient, sittingId: string, category: SittingReportCategory, details: string): Promise<SittingReport> {
  const { data, error } = await client.rpc('report_sitting', { p_sitting: sittingId, p_category: category, p_details: details.trim() });
  if (error) throw toDataError(error); return data;
}
export async function blockSittingContact(client: FurrixClient, other: string) {
  const { error } = await client.rpc('block_sitting_contact', { p_other: other });
  if (error) throw toDataError(error);
}

/** Photo de gardien : déposée dans son dossier privé (<utilisateur>/gardien/), puis enregistrée ; l'ancienne est retirée. */
export async function setSitterPhoto(client: FurrixClient, userId: string, file: File | Blob): Promise<string> {
  const problem = validatePhotoFile(file);
  if (problem) throw new AppError('validation', problem);
  const path = `${userId}/gardien/${crypto.randomUUID()}.${PET_PHOTO_TYPES[file.type as PetPhotoMime]}`;
  const upload = await client.storage.from(PET_PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (upload.error) throw toStorageError(upload.error);
  const { data: previous, error } = await client.rpc('set_sitter_photo', { p_path: path });
  if (error) {
    // Une réponse réseau perdue ne prouve pas que l’enregistrement a échoué.
    const check=await client.from('sitter_profiles').select('photo').eq('user_id',userId).maybeSingle();
    if(!check.error&&check.data?.photo===path)return path;
    if(!check.error&&check.data&&/^(22|23|42|P000)/.test(error.code??''))await client.storage.from(PET_PHOTO_BUCKET).remove([path]);
    throw toDataError(error);
  }
  if (previous) await client.storage.from(PET_PHOTO_BUCKET).remove([previous]);
  return path;
}
