import {
  PET_GENDERS,
  PET_PURPOSES,
  PET_SPECIES,
  type FieldErrors,
  type PetFormValues,
  type PetGender,
  type PetInput,
  type PetPurpose,
  type PetSpecies,
  type ValidationResult,
} from '../types/pet';

/** Limites identiques aux contraintes serveur (migration 0005). */
export const PET_LIMITS = { name: 50, breed: 60, age: 30, city: 80, bio: 500 } as const;

const includes = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function validatePetForm(values: PetFormValues): ValidationResult<PetInput, keyof PetFormValues> {
  const errors: FieldErrors<keyof PetFormValues> = {};
  const name = clean(values.name);
  const breed = clean(values.breed);
  const age = clean(values.age);
  const city = clean(values.city);
  const bio = typeof values.bio === 'string' ? values.bio.trim() : '';

  if (!name) errors.name = 'Le nom est requis';
  else if (name.length > PET_LIMITS.name) errors.name = `${PET_LIMITS.name} caractères maximum`;

  if (!breed) errors.breed = 'La race est requise';
  else if (breed.length > PET_LIMITS.breed) errors.breed = `${PET_LIMITS.breed} caractères maximum`;

  if (age.length > PET_LIMITS.age) errors.age = `${PET_LIMITS.age} caractères maximum`;

  if (!city) errors.city = 'La ville est requise';
  else if (city.length > PET_LIMITS.city) errors.city = `${PET_LIMITS.city} caractères maximum`;

  if (bio.length > PET_LIMITS.bio) errors.bio = `${PET_LIMITS.bio} caractères maximum`;

  if (!includes(PET_SPECIES, values.species)) errors.species = 'Espèce inconnue';
  if (!includes(PET_GENDERS, values.gender)) errors.gender = 'Sexe invalide';
  if (!includes(PET_PURPOSES, values.purpose)) errors.purpose = 'Objectif invalide';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      species: values.species as PetSpecies,
      breed,
      age: age || null,
      gender: values.gender as PetGender,
      city,
      bio: bio || null,
      purpose: values.purpose as PetPurpose,
    },
  };
}

/** Message unique pour les écrans qui affichent une seule alerte. */
export function firstError<K extends string>(errors: FieldErrors<K>): string | null {
  const first = Object.values(errors)[0];
  return typeof first === 'string' ? first : null;
}
