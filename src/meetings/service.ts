import type { FurrixClient } from '../services/supabaseClient';
import { AppError, toDataError } from '../services/errors';
import type { DiscoveryFilters, MatchMessage, MeetingProposal, MyMatch, NewPetMatch, ProposalDraft, ReportReason } from './types';

export async function discoverPets(client: FurrixClient, petId: string, filters: DiscoveryFilters, after?: string) {
  const { data, error } = await client.rpc('discover_pets', { p_pet: petId, ...(filters.species ? { p_species: filters.species } : {}), ...(filters.radius ? { p_radius: Number(filters.radius) } : {}), ...(filters.goal ? { p_goal: filters.goal } : {}), ...(filters.size ? { p_size: filters.size } : {}), ...(after ? { p_after: after } : {}), p_limit: 20 });
  if (error) throw toDataError(error); return data ?? [];
}
export async function decide(client: FurrixClient, petId: string, target: string, direction: 'left' | 'right') {
  const { data, error } = await client.rpc('swipe_and_match', { p_pet: petId, p_target: target, p_dir: direction });
  if (error) throw toDataError(error); return data;
}
/** Matchs de cet animal qu'il n'a pas encore vus (l'autre a aimé en second). */
export async function listNewMatches(client: FurrixClient, petId: string): Promise<NewPetMatch[]> {
  const { data, error } = await client.rpc('list_new_pet_matches', { p_pet: petId });
  if (error) throw toDataError(error); return data ?? [];
}
export async function markMatchSeen(client: FurrixClient, matchId: string, petId: string) {
  const { error } = await client.rpc('mark_pet_match_seen', { p_match: matchId, p_pet: petId });
  if (error) throw toDataError(error);
}
export async function hasLocation(client: FurrixClient, petId: string) {
  const { data, error } = await client.from('pet_meeting_locations').select('pet_id').eq('pet_id', petId).maybeSingle();
  if (error) throw toDataError(error); return !!data;
}
export async function setLocation(client: FurrixClient, petId: string, location?: { latitude: number; longitude: number }) {
  const { error } = await client.rpc('set_pet_meeting_location', { p_pet: petId, ...(location ? { p_lat: Math.round(location.latitude * 100) / 100, p_lng: Math.round(location.longitude * 100) / 100 } : {}) });
  if (error) throw toDataError(error);
}
/** 50 derniers messages ; avec `after`, seulement ceux arrivés depuis (actualisation légère). */
export async function loadMessages(client: FurrixClient, matchId: string, after?: number): Promise<MatchMessage[]> {
  let query = client.from('messages').select('id,match_id,sender_id,text,read,created_at,request_id').eq('match_id', matchId);
  if (after !== undefined) query = query.gt('id', after);
  const { data, error } = await query.order('id', { ascending: after !== undefined }).limit(50);
  if (error) throw toDataError(error); return after === undefined ? (data ?? []).reverse() : data ?? [];
}
export async function loadOlderMessages(client: FurrixClient, matchId: string, before: number): Promise<MatchMessage[]> {
  const { data, error } = await client.from('messages').select('id,match_id,sender_id,text,read,created_at,request_id').eq('match_id', matchId).lt('id', before).order('id', { ascending: false }).limit(50);
  if (error) throw toDataError(error);
  return (data ?? []).reverse();
}
export async function sendMessage(client: FurrixClient, matchId: string, text: string, requestId: string) {
  if (!text.trim() || text.trim().length > 2000) throw new AppError('validation', 'Écris entre 1 et 2 000 caractères.');
  const { data, error } = await client.rpc('send_match_message', { p_match: matchId, p_text: text.trim(), p_request: requestId });
  if (error) throw toDataError(error); return data;
}

/* Après le match (planche 1b) : propositions, blocage, signalement. Toutes les règles sont vérifiées par la base. */
export async function listMyMatches(client: FurrixClient, matchId?: string): Promise<MyMatch[]> {
  const { data, error } = await client.rpc('list_my_matches', matchId ? { p_match: matchId } : {});
  if (error) throw toDataError(error); return data ?? [];
}
export async function latestProposal(client: FurrixClient, matchId: string): Promise<MeetingProposal | null> {
  const { data, error } = await client.from('meeting_proposals').select('*').eq('match_id', matchId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw toDataError(error); return data;
}
export async function createProposal(client: FurrixClient, matchId: string, draft: ProposalDraft, requestId: string): Promise<MeetingProposal> {
  const { data, error } = await client.rpc('create_meeting_proposal', {
    p_match: matchId, p_activity: draft.activity, p_place: draft.place.trim(), p_slots: draft.slots, p_message: draft.message.trim(), p_request: requestId,
  });
  if (error) throw toDataError(error); return data;
}
export async function updateProposal(client: FurrixClient, id: string, action: 'withdraw' | 'decline' | 'accept' | 'cancel', slot?: string, note?: string): Promise<MeetingProposal> {
  const { data, error } = await client.rpc('update_meeting_proposal', { p_id: id, p_action: action, ...(slot ? { p_slot: slot } : {}), ...(note?.trim() ? { p_note: note.trim() } : {}) });
  if (error) throw toDataError(error); return data;
}
export async function reportOrBlock(client: FurrixClient, matchId: string, report: boolean, reason?: ReportReason, details?: string) {
  const { error } = await client.rpc('report_or_block_match', { p_match: matchId, p_reason: reason ?? '', p_details: details?.trim() ?? '', p_report: report });
  if (error) throw toDataError(error);
}

/** Ferme ce match pour les deux participants ; un nouvel essai conserve le même résultat. */
export async function endMatch(client: FurrixClient, matchId: string) {
  const { error } = await client.rpc('end_pet_match', { p_match: matchId });
  if (error) throw toDataError(error);
}
