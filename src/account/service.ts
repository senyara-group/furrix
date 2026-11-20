import type { FurrixClient } from '../services/supabaseClient';
import { AppError, toDataError } from '../services/errors';
import type { AccountOverview } from '../app/accountOverview';
import { personNameError } from '../validation/text';
import { cityTextError } from '../places/cities';
export type SavedProfile = AccountOverview['profile'] & { id: string };
export type ProfileDraft = { name: string; city: string };

/** Champs publics éditables uniquement ; aucune propagation à la ville des animaux ou au secteur. */
export function profileValues(draft: ProfileDraft) {
  const name = draft.name.trim(), city = draft.city.trim();
  const nameProblem = personNameError(name);
  if (nameProblem) throw new AppError('validation', nameProblem);
  const cityProblem = cityTextError(city);
  if (cityProblem) throw new AppError('validation', cityProblem);
  return { name, city: city || null };
}

export async function saveProfile(client: FurrixClient, owner: string, draft: ProfileDraft): Promise<SavedProfile> {
  const { data, error } = await client.from('profiles').update(profileValues(draft)).eq('id', owner).select('id,name,city').single();
  if (error) throw toDataError(error);
  if (!data || data.id !== owner) throw new AppError('not_found', 'Ton profil n’a pas pu être enregistré. Réessaie.');
  return data;
}
