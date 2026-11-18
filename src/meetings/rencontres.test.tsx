import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import type { PetRow } from '../types/database';
import type { DiscoveryPet } from './types';
import Rencontres from './Rencontres';
import * as service from './service';
import * as location from './location';

const owner = fakeSession().user.id;
const mine: PetRow = { id: 'pet-a', owner_id: owner, name: 'Pépite', species: 'chien', breed: 'Croisée', age: null, gender: '♀', purpose: 'balade', city: 'Lille', bio: null, photos: [], verified: false, created_at: '' };
const luna: DiscoveryPet = {
  id: 'luna', owner_id: 'camille', name: 'Luna', species: 'chien', breed: 'Berger australien', age: '3 ans', gender: '♀', purpose: 'balade', city: 'Lille',
  bio: 'Luna adore courir après les balles.', photos: [], owner_name: 'Camille', distance_km: 2,
  meeting_goals: ['balade', 'jeu'], size: 'moyen', temperament: 'Joueuse', good_with: 'Chiens moyens', usual_outings: 'Citadelle', behaviour_traits: ['Sociable avec les chiens de taille moyenne'],
};
const rocky: DiscoveryPet = { ...luna, id: 'rocky', name: 'Rocky', owner_name: 'Malik', gender: '♂', meeting_goals: [], behaviour_traits: [] };

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(service, 'discoverPets').mockResolvedValue([luna, rocky]);
  vi.spyOn(service, 'hasLocation').mockResolvedValue(false);
  vi.spyOn(service, 'listNewMatches').mockResolvedValue([]);
  vi.spyOn(service, 'markMatchSeen').mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const start = async () => {
  const fake = createFakeSupabase();
  render(<Rencontres client={fake.client} ownerId={owner} pets={[mine]} />);
  await screen.findByRole('group', { name: 'Luna' });
  return fake;
};
const likeButton = () => screen.getByRole('button', { name: 'J\'aime Luna' });

describe('rencontres : découvrir, aimer, matcher', () => {
  it('sans animal, invite à créer son profil sans rien charger', () => {
    render(<Rencontres client={createFakeSupabase().client} ownerId={owner} pets={[]} />);
    expect(screen.getByRole('link', { name: 'Créer son profil' }).getAttribute('href')).toBe('#/animaux');
    expect(service.discoverPets).not.toHaveBeenCalled();
  });

  it('montre la carte déclarée par le propriétaire, sans conversation avant match', async () => {
    await start();
    const card = screen.getByRole('group', { name: 'Luna' });
    expect(within(card).getByText('Chienne · Berger australien · 3 ans')).toBeTruthy();
    expect(within(card).getByText('Jeu au parc')).toBeTruthy();
    expect(within(card).getByText(/propriétaire de Luna · comportement déclaré, non vérifié/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Écrire/ })).toBeNull();
  });

  it('un j’aime seul n’ouvre rien : il est envoyé au nom de l’animal choisi', async () => {
    const fake = await start();
    vi.spyOn(service, 'decide').mockResolvedValue(null);
    fireEvent.click(likeButton());
    await screen.findByText('J’aime de Pépite envoyé à Luna');
    expect(service.decide).toHaveBeenCalledWith(fake.client, mine.id, luna.id, 'right');
    expect(screen.queryByText('C’est un match')).toBeNull();
    await screen.findByRole('group', { name: 'Rocky' });
  });

  it('un j’aime réciproque affiche le match, le marque vu et mène aux messages', async () => {
    const fake = await start();
    vi.spyOn(service, 'decide').mockResolvedValue('match-1');
    fireEvent.click(likeButton());
    await screen.findByText('C’est un match');
    expect(service.markMatchSeen).toHaveBeenCalledWith(fake.client, 'match-1', mine.id);
    expect(screen.getByRole('link', { name: 'Écrire à Camille' }).getAttribute('href')).toBe('#/messages?match=match-1');
    expect(screen.getByRole('link', { name: 'Proposer une rencontre' }).getAttribute('href')).toBe('#/messages?match=match-1&vue=proposer');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer à découvrir' }));
    await screen.findByRole('group', { name: 'Rocky' });
    expect(screen.queryByRole('group', { name: 'Luna' })).toBeNull();
  });

  it('annonce à l’arrivée le match créé quand l’autre a aimé en second', async () => {
    vi.mocked(service.listNewMatches).mockResolvedValue([{ match_id: 'match-2', pet_id: 'luna', name: 'Luna', owner_name: 'Camille', photo: null, created_at: '' }]);
    const fake = createFakeSupabase();
    render(<Rencontres client={fake.client} ownerId={owner} pets={[mine]} />);
    await screen.findByText('C’est un match');
    await waitFor(() => expect(service.markMatchSeen).toHaveBeenCalledWith(fake.client, 'match-2', mine.id));
  });

  it('garde la carte et prévient quand la décision n’est pas confirmée', async () => {
    await start();
    vi.spyOn(service, 'decide').mockRejectedValue(new Error('réseau'));
    fireEvent.click(likeButton());
    await screen.findByText('Ta décision n’a pas été confirmée. Réessaie le même geste.');
    expect(screen.getByRole('group', { name: 'Luna' })).toBeTruthy();
  });

  it('décide depuis la fiche puis revient aux cartes suivantes', async () => {
    const fake = await start();
    vi.spyOn(service, 'decide').mockResolvedValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Voir la fiche de Luna' }));
    expect(await screen.findByText('Le mot de Camille')).toBeTruthy();
    expect(screen.getByText('Chiens moyens')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }));
    await screen.findByRole('group', { name: 'Rocky' });
    expect(service.decide).toHaveBeenCalledWith(fake.client, mine.id, luna.id, 'left');
  });

  it('filtre par « Cherche » et affiche l’état sans résultat', async () => {
    const fake = await start();
    vi.mocked(service.discoverPets).mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Socialisation' }));
    await screen.findByText('Aucun profil avec ces filtres');
    expect(service.discoverPets).toHaveBeenLastCalledWith(fake.client, mine.id, expect.objectContaining({ goal: 'socialisation', species: 'chien' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer les filtres' }));
    await waitFor(() => expect(service.discoverPets).toHaveBeenLastCalledWith(fake.client, mine.id, expect.objectContaining({ goal: '', size: '', radius: '' })));
  });

  it('liste les mêmes profils et ouvre la fiche', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    fireEvent.click(await screen.findByRole('button', { name: /Rocky/ }));
    expect(await screen.findByText('Le mot de Malik')).toBeTruthy();
  });
});

describe('zone et vue Carte', () => {
  it('sans position de l’appareil, explique pourquoi et accepte la ville en secours', async () => {
    const fake = await start();
    vi.spyOn(location, 'approximateLocation').mockRejectedValue(new location.LocationError('unavailable'));
    const town = vi.spyOn(location, 'locateTown').mockResolvedValue({ latitude: 50.63, longitude: 3.06, label: 'Lille · 59000' });
    const save = vi.spyOn(service, 'setLocation').mockResolvedValue();
    fireEvent.click(screen.getByRole('button', { name: 'À moins de 5 km' }));
    expect(await screen.findByText(/ne trouve pas ta position/)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Ou indique ta ville') as HTMLInputElement).value).toBe('Lille');
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser cette ville' }));
    await screen.findByText(/Zone enregistrée : Lille · 59000/);
    expect(town).toHaveBeenCalledWith('Lille');
    expect(save).toHaveBeenCalledWith(fake.client, mine.id, { latitude: 50.63, longitude: 3.06 });
    await waitFor(() => expect(service.discoverPets).toHaveBeenLastCalledWith(fake.client, mine.id, expect.objectContaining({ radius: '5' })));
  });

  it('la carte demande une zone, puis place les profils avec leur distance et ouvre la fiche', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Carte' }));
    expect(await screen.findByText('Indique ta zone pour voir la carte')).toBeTruthy();
    cleanup();
    vi.mocked(service.hasLocation).mockResolvedValue(true);
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Carte' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rocky · ≈ 2 km' }));
    fireEvent.click(screen.getByRole('button', { name: /Voir la fiche/ }));
    expect(await screen.findByText('Le mot de Malik')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Carte' })).toBeTruthy();
  });
});
