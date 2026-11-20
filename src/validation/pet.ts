import {
  PET_GENDERS,
  PET_MEETING_GOALS,
  PET_SIZES,
  PET_PURPOSES,
  PET_SPECIES,
  type FieldErrors,
  type PetFormValues,
  type PetGender,
  type PetMeetingGoal,
  type PetSize,
  type PetInput,
  type PetPurpose,
  type PetSpecies,
  type ValidationResult,
} from '../types/pet';
import { petAgeError, petNameError } from './text';
import { cityTextError } from '../places/cities';

/** Limites identiques aux contraintes serveur (migration 0005). */
export const PET_LIMITS = { name: 50, breed: 60, age: 30, city: 80, bio: 500 } as const;
/** Profil de rencontre : limites identiques à la migration meeting_profile. */
export const PET_MEETING_LIMITS = { temperament: 40, good_with: 40, usual_outings: 60, trait: 80 } as const;
/** Champs de l'onboarding de Furrix.jsx, pas encore branchés : mêmes limites que 0005. */
export const PET_EXTRA_LIMITS = { allerg: 120, food: 80, toy: 80, weight: 20 } as const;

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
  else if (petNameError(name)) errors.name = petNameError(name)!;

  if (!breed) errors.breed = 'La race est requise';
  else if (breed.length > PET_LIMITS.breed) errors.breed = `${PET_LIMITS.breed} caractères maximum`;

  if (age.length > PET_LIMITS.age) errors.age = `${PET_LIMITS.age} caractères maximum`;
  else if (petAgeError(age)) errors.age = petAgeError(age)!;

  if (!city) errors.city = 'La ville est requise';
  else if (city.length > PET_LIMITS.city) errors.city = `${PET_LIMITS.city} caractères maximum`;
  else if (cityTextError(city)) errors.city = cityTextError(city)!;

  if (bio.length > PET_LIMITS.bio) errors.bio = `${PET_LIMITS.bio} caractères maximum`;

  if (!includes(PET_SPECIES, values.species)) errors.species = 'Espèce inconnue';
  if (!includes(PET_GENDERS, values.gender)) errors.gender = 'Sexe invalide';
  if (!includes(PET_PURPOSES, values.purpose)) errors.purpose = 'Objectif invalide';

  const goals = [...new Set(clean(values.goals).split(',').map((g) => g.trim()).filter(Boolean))];
  if (goals.some((g) => !includes(PET_MEETING_GOALS, g))) errors.goals = 'Choix invalide';
  const size = clean(values.size);
  if (size && !includes(PET_SIZES, size)) errors.size = 'Gabarit invalide';
  const short = { temperament: clean(values.temperament), good_with: clean(values.good_with), usual_outings: clean(values.usual_outings) };
  for (const key of Object.keys(short) as Array<keyof typeof short>) {
    if (short[key].length > PET_MEETING_LIMITS[key]) errors[key] = `${PET_MEETING_LIMITS[key]} caractères maximum`;
  }
  const traits = (['trait1', 'trait2', 'trait3'] as const).map((key) => {
    const v = clean(values[key]);
    if (v.length > PET_MEETING_LIMITS.trait) errors[key] = `${PET_MEETING_LIMITS.trait} caractères maximum`;
    return v;
  }).filter(Boolean);

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
      meeting_goals: goals as PetMeetingGoal[],
      size: (size || null) as PetSize | null,
      temperament: short.temperament || null,
      good_with: short.good_with || null,
      usual_outings: short.usual_outings || null,
      behaviour_traits: traits,
    },
  };
}

/** Message unique pour les écrans qui affichent une seule alerte. */
export function firstError<K extends string>(errors: FieldErrors<K>): string | null {
  const first = Object.values(errors)[0];
  return typeof first === 'string' ? first : null;
}
