import type { FurrixClient } from '../services/supabaseClient';
import type { PetRow } from '../types/database';
import { PET_COLUMNS } from '../services/pets';
import { AppError, toDataError } from '../services/errors';

export type AccountOverview = { profile: { name: string | null; city: string | null }; pets: PetRow[] };

export async function fetchAccountOverview(client: FurrixClient, userId: string): Promise<AccountOverview> {
  const [profile, pets] = await Promise.all([
    client.from('profiles').select('name,city').eq('id', userId).maybeSingle(),
    client.from('pets').select(PET_COLUMNS).eq('owner_id', userId).order('created_at', { ascending: true }),
  ]);
  if (profile.error) throw toDataError(profile.error);
  if (pets.error) throw toDataError(pets.error);
  if (!profile.data) throw new AppError('not_found', 'Ton profil n’a pas pu être retrouvé.');
  return { profile: profile.data, pets: pets.data ?? [] };
}
