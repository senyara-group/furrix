import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '../test/fakeSupabase';
import type { PetRow } from '../types/database';
import { replacePetPhoto } from './petPhotoFlow';

const U = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const OLD = `${U}/${P}/00000000-0000-4000-8000-000000000000.jpg`;
const pet = (photos: string[] = [OLD]): PetRow => ({
  id: P, owner_id: U, name: 'Luna', species: 'chien', breed: 'Golden', age: null, gender: '♀',
  purpose: 'balade', city: 'Lille', bio: null, photos, verified: false, created_at: '',
});
const file = () => new File(['x'], 'luna.jpg', { type: 'image/jpeg' });
const lost = { data: null, error: { name: 'TypeError', message: 'Failed to fetch' } };

describe('replacePetPhoto — réconciliation avec l’état serveur', () => {
  it('nominal : chemin enregistré, ancienne photo supprimée', async () => {
    const fake = createFakeSupabase();
    fake.respond(() => ({ data: pet([fake.lastUploadedPath()!]), error: null }));
    const out = await replacePetPhoto(fake.client, { userId: U, pet: pet(), file: file() });
    expect(out).toMatchObject({ status: 'saved', reconciled: false });
    expect(fake.bucket.remove).toHaveBeenCalledTimes(1);
    expect(fake.bucket.remove).toHaveBeenCalledWith([OLD]);
  });

  it('écriture réussie, réponse perdue : relecture, succès, nouvel objet conservé', async () => {
    const fake = createFakeSupabase();
    fake.respond(lost); // update photos : la réponse ne revient pas…
    fake.respond(() => ({ data: pet([fake.lastUploadedPath()!]), error: null })); // …mais le serveur l'a appliquée
    const out = await replacePetPhoto(fake.client, { userId: U, pet: pet(), file: file() });

    const path = fake.lastUploadedPath()!;
    expect(out.status).toBe('saved');
    expect(out.status === 'saved' && out.reconciled).toBe(true);
    expect(out.pet.photos).toEqual([path]);
    expect(fake.calls.filter((c) => c.op === 'eq').map((c) => c.args)).toEqual([['id', P], ['id', P]]);
    // Seule l'ancienne photo, plus référencée côté serveur, est supprimée ; jamais la nouvelle.
    expect(fake.bucket.remove.mock.calls).toEqual([[[OLD]]]);
  });

  it('réponse perdue et chemin absent à la relecture : incertitude, objet conservé', async () => {
    const fake = createFakeSupabase();
    fake.respond(lost);
    fake.respond({ data: pet(), error: null }); // l'écriture peut encore être en vol
    const out = await replacePetPhoto(fake.client, { userId: U, pet: pet(), file: file() });
    expect(out).toMatchObject({ status: 'failed', orphan: 'kept', uploadedPath: fake.lastUploadedPath() });
    expect(out.status === 'failed' && out.error.code).toBe('network');
    expect(fake.bucket.remove).not.toHaveBeenCalled();
  });

  it('réponse perdue et relecture impossible : objet et ancienne photo conservés', async () => {
    const fake = createFakeSupabase();
    fake.respond(lost);
    fake.respond(lost);
    const out = await replacePetPhoto(fake.client, { userId: U, pet: pet(), file: file() });
    expect(out).toMatchObject({ status: 'failed', orphan: 'kept' });
    expect(out.pet.photos).toEqual([OLD]);
    expect(fake.bucket.remove).not.toHaveBeenCalled();
  });

  it('refus définitif confirmé par relecture : nouvel objet supprimé, ancienne photo intacte', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: null, error: { code: '23514' } });
    fake.respond({ data: pet(), error: null });
    const out = await replacePetPhoto(fake.client, { userId: U, pet: pet(), file: file() });
    expect(out).toMatchObject({ status: 'failed', orphan: 'removed' });
    expect(fake.bucket.remove.mock.calls).toEqual([[[fake.lastUploadedPath()]]]);
  });

  it('refus définitif mais relecture impossible : objet conservé', async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: null, error: { code: '42501' } });
    fake.respond(lost);
    const out = await replacePetPhoto(fake.client, { userId: U, pet: pet(), file: file() });
    expect(out).toMatchObject({ status: 'failed', orphan: 'kept' });
    expect(fake.bucket.remove).not.toHaveBeenCalled();
  });

  it('téléversement en échec : aucun chemin enregistré, rien supprimé', async () => {
    const fake = createFakeSupabase();
    fake.bucket.upload.mockResolvedValueOnce({ data: null as never, error: { statusCode: '413' } });
    const out = await replacePetPhoto(fake.client, { userId: U, pet: pet(), file: file() });
    expect(out).toMatchObject({ status: 'failed', orphan: 'none', uploadedPath: null });
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false);
    expect(fake.bucket.remove).not.toHaveBeenCalled();
  });
});
