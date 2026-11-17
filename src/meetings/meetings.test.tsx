import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import type { PetRow } from '../types/database';
import type { DiscoveryPet, MatchMessage, PetMatch } from './types';
import MeetingsArea from './MeetingsArea';
import Conversation from './Conversation';
import { useActivePet } from './useActivePet';
import * as service from './service';
import * as location from './location';

const owner = fakeSession().user.id;
const pet: PetRow = { id: 'pet-a', owner_id: owner, name: 'Luna', species: 'chien', breed: 'Croisée', age: null, gender: '♀', purpose: 'balade', city: 'Lille', bio: null, photos: [], verified: false, created_at: '' };
const otherPet: PetRow = { ...pet, id: 'pet-b', name: 'Milo' };
const target: DiscoveryPet = { id: 'target', owner_id: 'other', name: 'Rocky', species: 'chien', breed: 'Croisé', age: null, gender: null, purpose: 'balade', city: 'Lille', bio: 'Prêt pour une balade', photos: [], owner_name: 'Camille', distance_km: null };
const match: PetMatch = { match_id: 'match-1', pet_id: 'target', name: 'Rocky', owner_name: 'Camille', created_at: '' };
const message: MatchMessage = { id: 1, match_id: match.match_id, sender_id: owner, text: 'Bonjour !', created_at: '2026-11-17T12:00:00Z', read: false, request_id: 'request' };
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setupDiscovery() {
  vi.spyOn(service, 'discoverPets').mockResolvedValue([target]);
  vi.spyOn(service, 'hasLocation').mockResolvedValue(false);
  vi.spyOn(service, 'listMatches').mockResolvedValue([match]);
}

describe('animal actif et découverte', () => {
  it('ne charge rien sans animal et invite à créer son profil', () => {
    const fake = createFakeSupabase(); const load = vi.spyOn(service, 'discoverPets');
    render(<MeetingsArea client={fake.client} ownerId={owner} pets={[]} />);
    expect(screen.getByRole('link', { name: 'Créer son profil' })).toBeTruthy(); expect(load).not.toHaveBeenCalled();
  });
  it('revalide la sélection par compte et par liste, sans accepter un animal étranger', () => {
    const { result, rerender } = renderHook(({ id, pets }) => useActivePet(id, pets), { initialProps: { id: owner, pets: [pet, otherPet] } });
    act(() => result.current.select(otherPet.id)); expect(result.current.active?.id).toBe(otherPet.id);
    rerender({ id: owner, pets: [pet] }); expect(result.current.active?.id).toBe(pet.id);
    rerender({ id: 'other', pets: [pet] }); expect(result.current.active).toBeUndefined();
  });
  it('sépare les filtres appliqués, affiche la distance inconnue et n’ouvre rien avant match', async () => {
    setupDiscovery(); const fake = createFakeSupabase();
    render(<MeetingsArea client={fake.client} ownerId={owner} pets={[pet]} />);
    await screen.findByRole('heading', { name: 'Rocky' });
    expect(screen.getByText(/Distance inconnue/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Écrire' })).toBeNull();
    expect((screen.getByLabelText('Rayon approximatif') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Espèce'), { target: { value: 'chat' } });
    expect(service.discoverPets).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }));
    await waitFor(() => expect(service.discoverPets).toHaveBeenLastCalledWith(fake.client, pet.id, { species: 'chat', purpose: '', radius: '' }));
  });
  it('lie le j’aime à l’animal actif et propose la conversation uniquement au match', async () => {
    setupDiscovery(); vi.spyOn(service, 'decide').mockResolvedValue(match.match_id); const fake = createFakeSupabase();
    render(<MeetingsArea client={fake.client} ownerId={owner} pets={[pet]} />);
    await screen.findByRole('heading', { name: 'Rocky' }); fireEvent.click(screen.getByRole('button', { name: 'J’aime' }));
    await screen.findByText(/C’est un match/); expect(service.decide).toHaveBeenCalledWith(fake.client, pet.id, target.id, 'right');
    fireEvent.click(screen.getByRole('button', { name: 'Voir mes matchs' })); await screen.findByRole('button', { name: 'Écrire' });
  });
  it('conserve le profil lorsque l’envoi du j’aime n’est pas confirmé', async () => {
    setupDiscovery(); vi.spyOn(service, 'decide').mockRejectedValue(new Error('réseau')); const fake = createFakeSupabase();
    render(<MeetingsArea client={fake.client} ownerId={owner} pets={[pet]} />);
    await screen.findByRole('heading', { name: 'Rocky' }); fireEvent.click(screen.getByRole('button', { name: 'J’aime' }));
    await screen.findByRole('alert'); expect(screen.getByRole('heading', { name: 'Rocky' })).toBeTruthy();
  });
  it('ignore la réponse tardive de l’ancien animal après sélection d’un autre', async () => {
    let finish!: (data: DiscoveryPet[]) => void;
    vi.spyOn(service, 'discoverPets').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce([{ ...target, name: 'Nala' }]);
    vi.spyOn(service, 'hasLocation').mockResolvedValue(false); const fake = createFakeSupabase();
    render(<MeetingsArea client={fake.client} ownerId={owner} pets={[pet, otherPet]} />);
    fireEvent.change(screen.getByLabelText('Je découvre et j’écris pour'), { target: { value: otherPet.id } });
    await screen.findByRole('heading', { name: 'Nala' }); await act(async () => finish([target]));
    expect(screen.queryByRole('heading', { name: 'Rocky' })).toBeNull();
  });
  it('ne demande la localisation que sur action et permet de continuer après refus', async () => {
    setupDiscovery(); const locate = vi.spyOn(location, 'approximateLocation').mockRejectedValue(new Error('refus')); const fake = createFakeSupabase();
    render(<MeetingsArea client={fake.client} ownerId={owner} pets={[pet]} />);
    await screen.findByRole('heading', { name: 'Rocky' }); expect(locate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ma zone approximative' }));
    await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'J’aime' })).toBeTruthy();
  });
});

describe('conversation et requêtes', () => {
  it('réutilise l’identifiant d’envoi après une réponse perdue et affiche un seul message', async () => {
    vi.spyOn(service, 'loadMessages').mockResolvedValue([]);
    const send = vi.spyOn(service, 'sendMessage').mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(message);
    const fake = createFakeSupabase();
    render(<Conversation client={fake.client} ownerId={owner} match={match} close={vi.fn()} />);
    await screen.findByText('Le premier bonjour est à toi.');
    fireEvent.change(screen.getByLabelText('Ton message'), { target: { value: 'Bonjour !' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' })); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' })); await screen.findByText('Bonjour !');
    expect(send.mock.calls[0]![3]).toBe(send.mock.calls[1]![3]); expect(screen.getAllByText('Bonjour !')).toHaveLength(1);
  });
  it('ne passe pas de colonnes arbitraires et borne les messages avant le serveur', async () => {
    const fake = createFakeSupabase();
    await expect(service.sendMessage(fake.client, match.match_id, ' ', 'id')).rejects.toThrow(); expect(fake.raw.rpc).not.toHaveBeenCalled();
    fake.raw.rpc.mockResolvedValueOnce({ data: message, error: null });
    await service.sendMessage(fake.client, match.match_id, ' Bonjour ! ', 'request');
    expect(fake.raw.rpc).toHaveBeenCalledWith('send_match_message', { p_match: match.match_id, p_text: 'Bonjour !', p_request: 'request' });
  });
});
