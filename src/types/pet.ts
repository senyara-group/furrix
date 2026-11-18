// Contrats du profil animal côté interface.

export const PET_SPECIES = ['chien', 'chat', 'lapin', 'oiseau', 'reptile', 'rongeur', 'cheval', 'ferme'] as const;
export const PET_PURPOSES = ['reproduction', 'balade', 'social', 'show'] as const;
export const PET_GENDERS = ['♂', '♀'] as const;
/** Profil de rencontre (migration meeting_profile) : « Cherche » et gabarit. */
export const PET_MEETING_GOALS = ['balade', 'jeu', 'socialisation'] as const;
export const PET_SIZES = ['petit', 'moyen', 'grand'] as const;

export type PetSpecies = (typeof PET_SPECIES)[number];
export type PetPurpose = (typeof PET_PURPOSES)[number];
export type PetGender = (typeof PET_GENDERS)[number];
export type PetMeetingGoal = (typeof PET_MEETING_GOALS)[number];
export type PetSize = (typeof PET_SIZES)[number];

/** Valeurs brutes du formulaire (chaînes saisies). */
export type PetFormValues = {
  name: string;
  species: string;
  breed: string;
  age: string;
  gender: string;
  city: string;
  bio: string;
  purpose: string;
  /** Profil de rencontre, facultatif. `goals` : valeurs séparées par des virgules. */
  goals?: string;
  size?: string;
  temperament?: string;
  good_with?: string;
  usual_outings?: string;
  trait1?: string;
  trait2?: string;
  trait3?: string;
};

/** Données validées et normalisées, prêtes pour l'écriture. Seules colonnes que le client peut écrire. */
export type PetInput = {
  name: string;
  species: PetSpecies;
  breed: string;
  age: string | null;
  gender: PetGender;
  city: string;
  bio: string | null;
  purpose: PetPurpose;
  meeting_goals: PetMeetingGoal[];
  size: PetSize | null;
  temperament: string | null;
  good_with: string | null;
  usual_outings: string | null;
  behaviour_traits: string[];
};

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type ValidationResult<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors<K> };
