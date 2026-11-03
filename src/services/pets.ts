import type { PetRow, PetUpdate } from '../types/database';
import type { PetInput } from '../types/pet';
import { toDataError } from './errors';
import type { FurrixClient } from './supabaseClient';

export const PET_COLUMNS = 'id, owner_id, name, species, breed, age, gender, purpose, city, bio, photos, verified, created_at';

/** Liste blanche explicite : jamais d'étalement d'objet arbitraire vers la base (verified, owner_id…). */
function toWritable(input: PetInput): Required<Omit<PetUpdate, 'photos'>> {
  return {
    name: input.name,
    species: input.species,
    breed: input.breed,
    age: input.age,
    gender: input.gender,
    purpose: input.purpose,
    city: input.city,
    bio: input.bio,
  };
}

/** Premier animal du compte (le MVP gère un animal par compte). */
export async function fetchMyPet(client: FurrixClient, ownerId: string): Promise<PetRow | null> {
  const { data, error } = await client
    .from('pets')
    .select(PET_COLUMNS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw toDataError(error);
  return data as PetRow | null;
}

export async function createPet(client: FurrixClient, ownerId: string, input: PetInput): Promise<PetRow> {
  const { data, error } = await client
    .from('pets')
    .insert({ owner_id: ownerId, ...toWritable(input) })
    .select(PET_COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return data as PetRow;
}

/** RLS limite la mise à jour aux animaux du compte : un animal d'autrui donne « not_found ». */
export async function updatePet(client: FurrixClient, petId: string, input: PetInput): Promise<PetRow> {
  const { data, error } = await client
    .from('pets')
    .update(toWritable(input))
    .eq('id', petId)
    .select(PET_COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return data as PetRow;
}

export async function setPetPhotos(client: FurrixClient, petId: string, paths: string[]): Promise<PetRow> {
  const { data, error } = await client
    .from('pets')
    .update({ photos: paths })
    .eq('id', petId)
    .select(PET_COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return data as PetRow;
}
