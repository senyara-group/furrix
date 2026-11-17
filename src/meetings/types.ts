export type DiscoveryPet = {
  id: string; owner_id: string; name: string; species: string; breed: string | null;
  age: string | null; gender: string | null; purpose: string | null; city: string | null;
  bio: string | null; photos: string[]; owner_name: string | null; distance_km: number | null;
};
export type PetMatch = { match_id: string; pet_id: string; name: string; owner_name: string | null; created_at: string };
export type MatchMessage = { id: number; match_id: string; sender_id: string; text: string; read: boolean; created_at: string; request_id: string | null };
export type DiscoveryFilters = { species: string; purpose: string; radius: string };
