import type { FurrixClient } from '../services/supabaseClient';
import { AppError, toDataError } from '../services/errors';
import type { DiscoveryFilters, MatchMessage } from './types';

export async function discoverPets(client: FurrixClient, petId: string, filters: DiscoveryFilters, after?: string) {
  const { data, error } = await client.rpc('discover_pets', { p_pet: petId, ...(filters.species ? { p_species: filters.species } : {}), ...(filters.purpose ? { p_purpose: filters.purpose } : {}), ...(filters.radius ? { p_radius: Number(filters.radius) } : {}), ...(after ? { p_after: after } : {}), p_limit: 20 });
  if (error) throw toDataError(error); return data ?? [];
}
export async function decide(client: FurrixClient, petId: string, target: string, direction: 'left' | 'right') {
  const { data, error } = await client.rpc('swipe_and_match', { p_pet: petId, p_target: target, p_dir: direction });
  if (error) throw toDataError(error); return data;
}
export async function listMatches(client: FurrixClient, petId: string) {
  const { data, error } = await client.rpc('list_pet_matches', { p_pet: petId });
  if (error) throw toDataError(error); return data ?? [];
}
export async function hasLocation(client: FurrixClient, petId: string) {
  const { data, error } = await client.from('pet_meeting_locations').select('pet_id').eq('pet_id', petId).maybeSingle();
  if (error) throw toDataError(error); return !!data;
}
export async function setLocation(client: FurrixClient, petId: string, location?: { latitude: number; longitude: number }) {
  const { error } = await client.rpc('set_pet_meeting_location', { p_pet: petId, ...(location ? { p_lat: Math.round(location.latitude * 100) / 100, p_lng: Math.round(location.longitude * 100) / 100 } : {}) });
  if (error) throw toDataError(error);
}
export async function loadMessages(client: FurrixClient, matchId: string, before?: number): Promise<MatchMessage[]> {
  let query = client.from('messages').select('id,match_id,sender_id,text,read,created_at,request_id').eq('match_id', matchId);
  if (before !== undefined) query = query.lt('id', before);
  const { data, error } = await query.order('id', { ascending: false }).limit(50);
  if (error) throw toDataError(error); return (data ?? []).reverse();
}
export async function sendMessage(client: FurrixClient, matchId: string, text: string, requestId: string) {
  if (!text.trim() || text.trim().length > 2000) throw new AppError('validation', 'Écris entre 1 et 2 000 caractères.');
  const { data, error } = await client.rpc('send_match_message', { p_match: matchId, p_text: text.trim(), p_request: requestId });
  if (error) throw toDataError(error); return data;
}
