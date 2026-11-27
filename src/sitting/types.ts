/** Formules de garde (migration pet_sitting). */
export type SittingService = 'chez_gardien' | 'domicile' | 'visite' | 'promenade';
export type SitterKind = 'particulier' | 'professionnel';
export type SitterOutdoor = 'jardin_clos' | 'jardin' | 'sans_jardin';
type SittingStatus = 'pending' | 'withdrawn' | 'declined' | 'expired' | 'accepted' | 'confirmed' | 'cancelled';
export type SittingReportCategory = 'sante' | 'non_conforme' | 'comportement' | 'paiement';
export type ServicePrice = { service: SittingService; price_cents: number };

/** Gardien trouvé par la recherche (ou fiche) : jamais de position exacte : distance arrondie et secteur (≈ 5 km). */
export type SitterResult = {
  sitter_id: string; name: string | null; kind: SitterKind; city: string; bio: string; distance_km: number | null;
  species: string[]; max_weight_kg: number | null; outdoor: SitterOutdoor; services: ServicePrice[]; price_cents: number | null; busy: boolean;
  /** Jours proposés (1 = lundi … 7 = dimanche) et gardes acceptées en même temps. */
  weekdays: number[]; capacity: number;
  /** Photo choisie par le gardien (stockage privé, lue avec la session). */
  photo: string | null;
  /** Secteur de la carte : zone du gardien arrondie à 0,05° (≈ 5 km), jamais son adresse. */
  latitude?: number | null; longitude?: number | null;
};
/** Mon profil de gardien, tel qu'enregistré. */
export type SitterProfile = {
  user_id: string; kind: SitterKind; bio: string; city: string; latitude: number; longitude: number; species: string[];
  max_weight_kg: number | null; outdoor: SitterOutdoor; active: boolean; photo: string | null; weekdays: number[]; capacity: number; created_at: string; updated_at: string;
};
/** Période où le gardien ne reçoit pas de demande (dates incluses, AAAA-MM-JJ). Visible de lui seul. */
export type SitterAbsence = { starts_on: string; ends_on: string };
export type SitterAvailability = { weekdays: number[]; capacity: number; absences: SitterAbsence[] };
export type SitterProfileDraft = {
  kind: SitterKind; bio: string; city: string; latitude: number; longitude: number; species: string[];
  max_weight_kg: number | null; outdoor: SitterOutdoor; services: ServicePrice[]; active: boolean;
};
export type SittingRequest = {
  id: string; owner_id: string; sitter_id: string; pet_id: string; service: SittingService; starts_at: string; ends_at: string;
  units: number; unit_price_cents: number; message: string | null; status: SittingStatus; cancelled_by: string | null; cancel_note: string | null;
  responded_at: string | null; paid_at: string | null; request_id: string; created_at: string; updated_at: string;
};
/** Une demande vue par l'appelant, côté propriétaire (`owner`) ou gardien (`sitter`). */
export type MySitting = {
  id: string; role: 'owner' | 'sitter'; owner_id: string; sitter_id: string; other_name: string | null; sitter_kind: SitterKind | null; sitter_city: string | null;
  pet_id: string; pet_name: string; pet_species: string; pet_breed: string | null; pet_age: string | null; pet_weight: string | null; pet_photo: string | null;
  service: SittingService; starts_at: string; ends_at: string; units: number; unit_price_cents: number; message: string | null; status: SittingStatus;
  cancelled_by: string | null; cancel_note: string | null; responded_at: string | null; paid_at: string | null; created_at: string; updated_at: string;
  report_id: number | null; report_status: 'open' | 'reviewing' | 'closed' | null; report_at: string | null; sitter_photo: string | null;
};
export type SittingThread = {
  owner_id: string; sitter_id: string; role: 'owner' | 'sitter'; other_name: string | null; last_text: string | null; last_at: string | null;
  sitting_id: string | null; sitting_status: SittingStatus | null; starts_at: string | null; ends_at: string | null;
};
export type SittingMessage = { id: number; owner_id: string; sitter_id: string; sender_id: string; text: string; request_id: string; created_at: string };
export type SittingUpdate = { id: number; sitting_id: string; author_id: string; text: string; created_at: string };
export type SittingReport = { id: number; sitting_id: string; reporter_id: string; category: SittingReportCategory; details: string; status: 'open' | 'reviewing' | 'closed'; created_at: string };
export type SitterSearch = { latitude: number; longitude: number; radius: number; service: SittingService; starts: string; ends: string; species?: string };
