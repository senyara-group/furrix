// Contrats du profil animal côté interface.

export const PET_SPECIES = ['chien', 'chat', 'lapin', 'oiseau', 'reptile', 'rongeur', 'cheval', 'ferme'] as const;
export const PET_PURPOSES = ['reproduction', 'balade', 'social', 'show'] as const;
export const PET_GENDERS = ['♂', '♀'] as const;

export type PetSpecies = (typeof PET_SPECIES)[number];
export type PetPurpose = (typeof PET_PURPOSES)[number];
export type PetGender = (typeof PET_GENDERS)[number];

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
};

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type ValidationResult<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors<K> };
