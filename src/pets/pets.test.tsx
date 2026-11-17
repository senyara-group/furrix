import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import PetsWorkspace from './PetsWorkspace';
import { PetPhoto } from './PetPhoto';
import { downloadPrivatePetPhoto } from './privatePhotos';
import { createPet } from '../services/pets';
import type { PetRow } from '../types/database';
import type { PetInput } from '../types/pet';

const ownerId = fakeSession().user.id;
const id = '22222222-2222-4222-8222-222222222222';
const path = `${ownerId}/${id}/portrait.jpg`;
const pet: PetRow = { id, owner_id: ownerId, name: 'Luna', species: 'chien', breed: 'Croisée', age: '3 ans', gender: '♀', purpose: 'balade', city: 'Lille', bio: null, photos: [], verified: false, created_at: '' };
const input: PetInput = { name: pet.name, species: 'chien', breed: 'Croisée', age: pet.age, gender: '♀', purpose: 'balade', city: 'Lille', bio: null };
const fill = () => {
  for (const [label, value] of [['Son nom *', 'Luna'], ['Espèce *', 'chien'], ['Race ou type *', 'Croisée'], ['Sexe *', '♀'], ['Ville *', 'Lille'], ['Objectif *', 'balade']] as const) fireEvent.change(screen.getByLabelText((text) => text.startsWith(label)), { target: { value } });
};
beforeEach(() => { Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:portrait') }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Mes animaux', () => {
  it('valide le formulaire puis crée un profil sans colonnes protégées ni photos', async () => {
    const fake = createFakeSupabase(), saved = vi.fn(); fake.respond({ data: pet, error: null });
    render(<PetsWorkspace client={fake.client} ownerId={ownerId} pets={[]} onSaved={saved} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un animal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
    expect(await screen.findByText('Le nom est requis')).toBeTruthy(); expect(fake.calls).toHaveLength(0);
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(pet));
    const inserted = fake.calls.find((c) => c.op === 'insert')!.args[0];
    expect(inserted).toMatchObject({ name: 'Luna', owner_id: ownerId, species: 'chien' });
    expect(inserted).not.toHaveProperty('verified'); expect(inserted).not.toHaveProperty('premium'); expect(inserted).not.toHaveProperty('photos');
  });
  it('modifie seulement l’animal choisi et conserve le formulaire en cas de refus', async () => {
    const fake = createFakeSupabase(), saved = vi.fn(); fake.respond({ data: null, error: { code: '42501' } });
    render(<PetsWorkspace client={fake.client} ownerId={ownerId} pets={[pet]} onSaved={saved} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le profil de Luna' }));
    fireEvent.change(screen.getByLabelText('Son nom *'), { target: { value: 'Lune' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
    await screen.findByRole('alert'); expect(saved).not.toHaveBeenCalled(); expect((screen.getByLabelText('Son nom *') as HTMLInputElement).value).toBe('Lune');
    expect(fake.calls).toContainEqual({ table: 'pets', op: 'eq', args: ['id', id] });
    const payload = fake.calls.find((c) => c.op === 'update')!.args[0]; expect(payload).not.toHaveProperty('owner_id'); expect(payload).not.toHaveProperty('verified');
  });
  it('refuse HEIC sans téléversement et transmet une photo valide au flux existant', async () => {
    const fake = createFakeSupabase(), saved = vi.fn();
    render(<PetsWorkspace client={fake.client} ownerId={ownerId} pets={[pet]} onSaved={saved} reload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Photo de Luna'), { target: { files: [new File(['x'], 'photo.heic', { type: 'image/heic' })] } });
    expect(screen.getByText('Format non accepté (JPEG, PNG ou WebP)')).toBeTruthy(); expect(fake.bucket.upload).not.toHaveBeenCalled();
    fake.respond(() => ({ data: { ...pet, photos: [fake.lastUploadedPath()] }, error: null }));
    fireEvent.change(screen.getByLabelText('Photo de Luna'), { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
    await screen.findByText('Photo enregistrée.'); expect(saved).toHaveBeenCalled(); expect(fake.lastUploadedPath()).toContain(`${ownerId}/${id}/`);
  });
  it('ne publie pas une réponse tardive après démontage du formulaire', async () => {
    const fake = createFakeSupabase(), saved = vi.fn(); let finish!: (value: unknown) => void;
    const single = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(fake.client, 'from').mockReturnValue({ insert: () => ({ select: () => ({ single }) }) } as never);
    const view = render(<PetsWorkspace client={fake.client} ownerId={ownerId} pets={[]} onSaved={saved} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un animal' })); fill(); fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
    view.unmount(); await act(async () => finish({ data: pet, error: null })); expect(saved).not.toHaveBeenCalled();
  });
});

describe('photos privées et réponse perdue', () => {
  it('télécharge avec la session, sans URL publique et refuse les chemins étrangers', async () => {
    const fake = createFakeSupabase();
    await expect(downloadPrivatePetPhoto(fake.client, ownerId, id, `autre/${id}/portrait.jpg`)).rejects.toThrow();
    expect(fake.bucket.download).not.toHaveBeenCalled();
    await downloadPrivatePetPhoto(fake.client, ownerId, id, path);
    expect(fake.bucket.download).toHaveBeenCalledWith(path, {}, { signal: undefined, cache: 'no-store' }); expect(fake.bucket.getPublicUrl).not.toHaveBeenCalled();
  });
  it('libère l’image mémoire au démontage et ignore les téléchargements tardifs', async () => {
    const fake = createFakeSupabase();
    const first = render(<PetPhoto client={fake.client} pet={{ ...pet, photos: [path] }} />);
    await screen.findByRole('img', { name: 'Portrait de Luna' }); first.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:portrait');
    let finish!: (value: { data: Blob; error: null }) => void;
    fake.bucket.download.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const next = render(<PetPhoto client={fake.client} pet={{ ...pet, photos: [path] }} />); next.unmount();
    await act(async () => finish({ data: new Blob(['x'], { type: 'image/jpeg' }), error: null })); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
  it('réconcilie une création réussie dont la réponse a été perdue', async () => {
    const fake = createFakeSupabase(); fake.respond({ data: null, error: { name: 'TypeError', message: 'Failed to fetch' } }); fake.respond({ data: pet, error: null });
    expect(await createPet(fake.client, ownerId, input, id)).toEqual(pet);
    expect(fake.calls.find((c) => c.op === 'insert')!.args[0]).toMatchObject({ id, owner_id: ownerId });
  });
});
