import { describe, expect, it } from 'vitest';
import { validateCredentials } from './auth';
import { PET_LIMITS, firstError, validatePetForm } from './pet';

const valid = { name: '  Luna ', species: 'chien', breed: 'Golden', age: '', gender: '♀', city: 'Lille', bio: '  ', purpose: 'balade' };

describe('validatePetForm', () => {
  it('normalise les valeurs valides et ne renvoie que les colonnes écrivables', () => {
    const r = validatePetForm(valid);
    expect(r).toEqual({
      ok: true,
      value: { name: 'Luna', species: 'chien', breed: 'Golden', age: null, gender: '♀', city: 'Lille', bio: null, purpose: 'balade' },
    });
  });

  it('ignore les champs inattendus (verified, owner_id)', () => {
    const r = validatePetForm({ ...valid, verified: true, owner_id: 'x' } as typeof valid);
    expect(r.ok && Object.keys(r.value)).not.toContain('verified');
    expect(r.ok && Object.keys(r.value)).not.toContain('owner_id');
  });

  it('exige nom, race et ville', () => {
    const r = validatePetForm({ ...valid, name: ' ', breed: '', city: '\t' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['breed', 'city', 'name']);
      expect(firstError(r.errors)).toBe('Le nom est requis');
    }
  });

  it('applique les mêmes longueurs que la base', () => {
    const r = validatePetForm({
      ...valid,
      name: 'n'.repeat(PET_LIMITS.name + 1),
      breed: 'r'.repeat(PET_LIMITS.breed + 1),
      age: 'a'.repeat(PET_LIMITS.age + 1),
      city: 'c'.repeat(PET_LIMITS.city + 1),
      bio: 'b'.repeat(PET_LIMITS.bio + 1),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['age', 'bio', 'breed', 'city', 'name']);
    expect(validatePetForm({ ...valid, bio: 'b'.repeat(PET_LIMITS.bio) }).ok).toBe(true);
  });

  it('refuse espèce, sexe et objectif hors liste', () => {
    const r = validatePetForm({ ...valid, species: 'dragon', gender: 'x', purpose: 'vente' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['gender', 'purpose', 'species']);
  });
});

describe('validateCredentials', () => {
  it('normalise l’e-mail', () => {
    expect(validateCredentials({ email: ' Moi@Furrix.FR ', password: 'motdepasse' }, 'signup')).toEqual({
      ok: true,
      value: { email: 'moi@furrix.fr', password: 'motdepasse' },
    });
  });

  it('refuse un e-mail invalide et un mot de passe court à l’inscription seulement', () => {
    const r = validateCredentials({ email: 'pas-un-mail', password: 'court' }, 'signup');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual({ email: 'E-mail invalide', password: 'Au moins 8 caractères' });
    expect(validateCredentials({ email: 'a@b.fr', password: 'court' }, 'login').ok).toBe(true);
  });

  it('refuse un mot de passe au-delà de 72 octets', () => {
    const r = validateCredentials({ email: 'a@b.fr', password: 'é'.repeat(37) }, 'signup');
    expect(r.ok).toBe(false);
  });
});
