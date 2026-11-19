export type DiscoveryPet = {
  id: string; owner_id: string; name: string; species: string; breed: string | null;
  age: string | null; gender: string | null; purpose: string | null; city: string | null;
  bio: string | null; photos: string[]; owner_name: string | null; distance_km: number | null;
  /** Profil de rencontre déclaré par le propriétaire (migration meeting_profile). */
  size?: string | null; meeting_goals?: string[]; temperament?: string | null; good_with?: string | null;
  usual_outings?: string | null; behaviour_traits?: string[];
};
export type PetMatch = { match_id: string; pet_id: string; name: string; owner_name: string | null; created_at: string };
export type NewPetMatch = PetMatch & { photo: string | null };
export type MatchMessage = { id: number; match_id: string; sender_id: string; text: string; read: boolean; created_at: string; request_id: string | null };
export type DiscoveryFilters = { species: string; radius: string; goal?: string; size?: string };
/** Match vu par l'appelant, avec l'autre animal et le dernier état (page Messages). */
export type MyMatch = {
  match_id: string; matched_at: string; my_pet_id: string; my_pet_name: string; pet_id: string; name: string; species: string;
  breed: string | null; age: string | null; gender: string | null; photo: string | null; owner_name: string | null;
  last_text: string | null; last_at: string | null; proposal_status: ProposalStatus | null; proposal_slot: string | null;
};
export type ProposalStatus = 'pending' | 'withdrawn' | 'declined' | 'accepted' | 'cancelled';
export type MeetingProposal = {
  id: string; match_id: string; proposer_id: string; activity: 'balade' | 'jeu'; place: string; slots: string[]; message: string | null;
  status: ProposalStatus; chosen_slot: string | null; cancel_note: string | null; cancelled_by: string | null; request_id: string; created_at: string; updated_at: string;
};
export type ProposalDraft = { activity: 'balade' | 'jeu'; place: string; slots: string[]; message: string };
export type ReportReason = 'profil_trompeur' | 'message_deplace' | 'animal_danger' | 'autre';
