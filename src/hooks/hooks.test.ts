import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import { useAuth } from './useAuth';
import { useMyPet } from './useMyPet';

const U = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const form = { name: 'Luna', species: 'chien', breed: 'Golden', age: '2 ans', gender: '♀', city: 'Lille', bio: '', purpose: 'balade' };
const row = (extra = {}) => ({ id: P, owner_id: U, name: 'Luna', species: 'chien', breed: 'Golden', age: '2 ans', gender: '♀', purpose: 'balade', city: 'Lille', bio: null, photos: [], verified: false, created_at: '', ...extra });

describe('useAuth', () => {
  it('sans client : mode démonstration, déconnecté', () => {
    const { result } = renderHook(() => useAuth(null));
    expect(result.current.status).toBe('signedOut');
  });

  it('restaure la session existante puis suit onAuthStateChange', async () => {
    const fake = createFakeSupabase();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: fakeSession(U) }, error: null });
    const { result, unmount } = renderHook(() => useAuth(fake.client));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user?.id).toBe(U);

    act(() => fake.emitAuth('SIGNED_OUT', null));
    expect(result.current.status).toBe('signedOut');
    unmount();
    expect(fake.auth.unsubscribe).toHaveBeenCalledOnce();
  });

  it('inscription avec confirmation d’e-mail : message, pas de session', async () => {
    const fake = createFakeSupabase();
    const { result } = renderHook(() => useAuth(fake.client));
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(() => result.current.submit('signup', { email: 'A@b.fr', password: 'motdepasse' }));
    expect(fake.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.fr' }));
    expect(result.current.notice).toMatch(/confirme ton e-mail/);
    expect(result.current.status).toBe('signedOut');
    expect(result.current.pending).toBe(false);
  });

  it('validation locale : aucun appel réseau', async () => {
    const fake = createFakeSupabase();
    const { result } = renderHook(() => useAuth(fake.client));
    await act(() => result.current.submit('signup', { email: 'x', password: '1' }));
    expect(fake.auth.signUp).not.toHaveBeenCalled();
    expect(result.current.fieldErrors.email).toBe('E-mail invalide');
  });

  it('connexion réussie puis échouée, déconnexion', async () => {
    const fake = createFakeSupabase();
    const { result } = renderHook(() => useAuth(fake.client));
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(() => result.current.submit('login', { email: 'a@b.fr', password: 'x' }));
    expect(result.current.status).toBe('signedIn');

    await act(() => result.current.signOut());
    expect(fake.auth.signOut).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('signedOut');

    fake.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'email_not_confirmed' } });
    await act(() => result.current.submit('login', { email: 'a@b.fr', password: 'x' }));
    expect(result.current.error).toBe('Confirme ton e-mail avant de te connecter.');
    expect(result.current.status).toBe('signedOut');
  });
});

describe('useMyPet', () => {
  it('charge l’animal existant', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: row({ photos: [`${U}/${P}/a.jpg`] }), error: null });
    const { result } = renderHook(() => useMyPet(fake.client, U));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.pet?.id).toBe(P);
    expect(result.current.photoUrl).toBe(`https://cdn.test/pet-photos/${U}/${P}/a.jpg`);
  });

  it('erreur de chargement : état error et nouvelle tentative', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: null, error: { message: 'Failed to fetch', name: 'TypeError' } });
    const { result } = renderHook(() => useMyPet(fake.client, U));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/Connexion impossible/);
    fake.respond({ data: null, error: null });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.pet).toBeNull();
  });

  it('crée l’animal puis enregistre la photo dans le dossier du compte', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: null, error: null }); // chargement : aucun animal
    const { result } = renderHook(() => useMyPet(fake.client, U));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fake.respond({ data: row(), error: null }); // insert
    fake.respond({ data: row({ photos: ['p'] }), error: null }); // photos
    const photo = new File(['x'], 'luna.png', { type: 'image/png' });
    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => { out = await result.current.save(form, photo); });

    expect(out).toMatchObject({ ok: true, warning: null });
    expect(fake.calls.find((c) => c.op === 'insert')?.args[0]).toMatchObject({ owner_id: U, name: 'Luna', bio: null });
    const [path] = fake.bucket.upload.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^${U}/${P}/[0-9a-f-]{36}\\.png$`));
    expect(fake.calls.filter((c) => c.op === 'update')[0]?.args[0]).toEqual({ photos: [path] });
    expect(result.current.saving).toBe(false);
  });

  it('photo refusée : profil conservé, avertissement et objet orphelin retiré', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: row(), error: null }); // chargement : animal existant → édition
    const { result } = renderHook(() => useMyPet(fake.client, U));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fake.respond({ data: row({ city: 'Roubaix' }), error: null }); // update
    fake.respond({ data: null, error: { code: '23514' } }); // enregistrement du chemin refusé
    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => { out = await result.current.save({ ...form, city: 'Roubaix' }, new File(['x'], 'a.jpg', { type: 'image/jpeg' })); });

    expect(out?.ok).toBe(true);
    expect(out?.warning).toMatch(/^Profil enregistré\./);
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
    expect(result.current.pet?.city).toBe('Roubaix');
    const uploaded = fake.bucket.upload.mock.calls[0]![0];
    expect(fake.bucket.remove).toHaveBeenCalledWith([uploaded]);
  });

  it('validation : aucune écriture, erreurs par champ', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: null, error: null });
    const { result } = renderHook(() => useMyPet(fake.client, U));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => { await result.current.save({ ...form, name: '', city: '' }); });
    expect(result.current.fieldErrors).toEqual({ name: 'Le nom est requis', city: 'La ville est requise' });
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('refus serveur : message d’erreur, pas d’animal', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: null, error: null });
    const { result } = renderHook(() => useMyPet(fake.client, U));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    fake.respond({ data: null, error: { code: '42501' } });
    await act(async () => { await result.current.save(form); });
    expect(result.current.error).toBe("Tu n'as pas le droit d'effectuer cette action.");
    expect(result.current.pet).toBeNull();
  });
});
