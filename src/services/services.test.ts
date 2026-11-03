import { describe, expect, it } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import * as auth from './auth';
import { AppError, toAuthError, toDataError, toStorageError } from './errors';
import { PET_PHOTO_MAX_BYTES, buildPetPhotoPath, petPhotoUrl, uploadPetPhoto, validatePhotoFile } from './petPhotos';
import { createPet, fetchMyPet, updatePet } from './pets';
import { assertPublicKey, createFurrixClient, isPlaceholder } from './supabaseClient';

const U = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const F = '33333333-3333-4333-8333-333333333333';
const input = { name: 'Luna', species: 'chien', breed: 'Golden', age: null, gender: '♀', city: 'Lille', bio: null, purpose: 'balade' } as const;

const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.y`;

describe('client Supabase', () => {
  it('refuse toute clé serveur dans le client', () => {
    expect(() => assertPublicKey(jwt({ role: 'service_role' }))).toThrow(/service_role/);
    expect(() => assertPublicKey('sb_secret_abc')).toThrow(/secrète/);
    expect(() => assertPublicKey(jwt({ role: 'anon' }))).not.toThrow();
    expect(() => assertPublicKey('sb_publishable_abc')).not.toThrow();
  });

  it('reste en mode démonstration sans configuration réelle', () => {
    expect(isPlaceholder(undefined, 'k')).toBe(true);
    expect(isPlaceholder('https://xxxx.supabase.co', 'eyJhbGci...')).toBe(true);
    expect(createFurrixClient(undefined, undefined)).toBeNull();
    expect(() => createFurrixClient('https://abc.supabase.co', jwt({ role: 'service_role' }))).toThrow();
  });
});

describe('service auth', () => {
  it('signale la confirmation d’e-mail quand aucune session n’est ouverte', async () => {
    const fake = createFakeSupabase();
    const r = await auth.signUp(fake.client, { email: 'a@b.fr', password: 'motdepasse' });
    expect(r).toEqual({ session: null, needsEmailConfirmation: true });
    expect(fake.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.fr', password: 'motdepasse' }));
  });

  it('traduit les erreurs Auth en messages français', async () => {
    const fake = createFakeSupabase();
    fake.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'invalid_credentials', status: 400 } });
    await expect(auth.signIn(fake.client, { email: 'a@b.fr', password: 'x' })).rejects.toMatchObject({ code: 'invalid_credentials', message: 'E-mail ou mot de passe incorrect.' });
  });

  it('se désabonne de onAuthStateChange', () => {
    const fake = createFakeSupabase();
    const seen: unknown[] = [];
    const stop = auth.subscribeToAuthChanges(fake.client, (s, e) => seen.push([e, s?.user.id]));
    fake.emitAuth('SIGNED_IN', fakeSession(U));
    stop();
    expect(seen).toEqual([['SIGNED_IN', U]]);
    expect(fake.auth.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('service pets', () => {
  it('crée l’animal du compte avec une liste blanche de colonnes', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: { id: P }, error: null });
    await createPet(fake.client, U, { ...input, verified: true, owner_id: 'autre' } as never);
    const insert = fake.calls.find((c) => c.op === 'insert');
    expect(insert?.args[0]).toEqual({ owner_id: U, ...input });
  });

  it('édite par identifiant ; un animal d’autrui (0 ligne via RLS) donne not_found', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: null, error: { code: 'PGRST116' } });
    await expect(updatePet(fake.client, P, input)).rejects.toMatchObject({ code: 'not_found' });
    expect(fake.calls.find((c) => c.op === 'eq')?.args).toEqual(['id', P]);
    expect(fake.calls.find((c) => c.op === 'update')?.args[0]).not.toHaveProperty('verified');
  });

  it('charge le premier animal du compte et traduit les refus', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: null, error: null });
    expect(await fetchMyPet(fake.client, U)).toBeNull();
    expect(fake.calls.find((c) => c.op === 'eq')?.args).toEqual(['owner_id', U]);
    fake.respond({ data: null, error: { code: '42501' } });
    await expect(fetchMyPet(fake.client, U)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('service photos', () => {
  it('valide type et taille', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validatePhotoFile({ type: 'image/svg+xml', size: 1000 })).toMatch(/Format/);
    expect(validatePhotoFile({ type: 'image/png', size: PET_PHOTO_MAX_BYTES + 1 })).toMatch(/5 Mo/);
    expect(validatePhotoFile({ type: 'image/png', size: 0 })).toMatch(/vide/);
    expect(validatePhotoFile(null)).toMatch(/Aucune/);
  });

  it('construit un chemin dans le dossier de l’utilisateur, extension dérivée du MIME', () => {
    expect(buildPetPhotoPath(U, P, 'image/webp', F)).toBe(`${U}/${P}/${F}.webp`);
    expect(() => buildPetPhotoPath('../x', P, 'image/webp', F)).toThrow(AppError);
    expect(() => buildPetPhotoPath(U, P, 'text/html', F)).toThrow(/Format/);
  });

  it('téléverse sans écrasement avec le bon type de contenu', async () => {
    const fake = createFakeSupabase();
    const file = new File(['x'], 'photo.php.jpg', { type: 'image/jpeg' });
    const path = await uploadPetPhoto(fake.client, { userId: U, petId: P, file });
    expect(path).toMatch(new RegExp(`^${U}/${P}/[0-9a-f-]{36}\\.jpg$`));
    expect(fake.raw.storage.from).toHaveBeenCalledWith('pet-photos');
    expect(fake.bucket.upload).toHaveBeenCalledWith(path, file, expect.objectContaining({ contentType: 'image/jpeg', upsert: false }));
    expect(petPhotoUrl(fake.client, path)).toBe(`https://cdn.test/pet-photos/${path}`);
  });

  it('refuse avant l’envoi un fichier invalide et traduit les refus Storage', async () => {
    const fake = createFakeSupabase();
    await expect(uploadPetPhoto(fake.client, { userId: U, petId: P, file: new File(['x'], 'a.gif', { type: 'image/gif' }) }))
      .rejects.toMatchObject({ code: 'validation' });
    expect(fake.bucket.upload).not.toHaveBeenCalled();
    fake.bucket.upload.mockResolvedValueOnce({ data: null as never, error: { statusCode: '403', message: 'new row violates row-level security policy' } });
    await expect(uploadPetPhoto(fake.client, { userId: U, petId: P, file: new File(['x'], 'a.png', { type: 'image/png' }) }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('traduction des erreurs', () => {
  it('couvre les cas principaux', () => {
    expect(toAuthError({ code: 'user_already_exists' }).code).toBe('user_exists');
    expect(toAuthError({ status: 429 }).code).toBe('rate_limited');
    expect(toAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }).code).toBe('network');
    expect(toDataError({ code: '23514' }).code).toBe('invalid_data');
    expect(toStorageError({ statusCode: '413' }).message).toMatch(/5 Mo/);
    expect(toStorageError({ statusCode: '415' }).message).toMatch(/Format/);
  });
});
