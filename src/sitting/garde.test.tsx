import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import type { PetRow } from '../types/database';
import GardeArea from './Garde';
import MessagesArea from '../meetings/AfterMatch';
import * as service from './service';
import { AppError } from '../services/errors';
import * as meetings from '../meetings/service';
import * as location from '../meetings/location';
import { countUnits, phaseOf } from './format';
import type { MySitting, SitterResult, SittingRequest } from './types';

const me = fakeSession().user.id;
const pets = [{ id: 'pepite', owner_id: me, name: 'Pépite', species: 'chien', weight: '12' }, { id: 'mimi', owner_id: me, name: 'Mimi', species: 'chat' },
  { id: 'rex', owner_id: me, name: 'Rex', species: 'chien', weight: '32 kg' }] as PetRow[];
const local = (days: number, h: number) => { const d = new Date(Date.now() + days * 86400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`; };
const iso = (days: number, h: number) => new Date(local(days, h)).toISOString();
const sam: SitterResult = {
  sitter_id: 's1', name: 'Sam', kind: 'particulier', city: 'Lambersart', bio: 'Maison avec jardin, balades matin et soir le long de la Deûle.', distance_km: 3,
  species: ['chien'], max_weight_kg: 15, outdoor: 'jardin_clos', services: [{ service: 'chez_gardien', price_cents: 2000 }, { service: 'visite', price_cents: 1200 }], price_cents: 2000, busy: false, photo: null,
  weekdays: [1, 2, 3, 4, 5, 6, 7], capacity: 1,
};
const sitting = (over: Partial<MySitting> = {}): MySitting => ({
  id: 'g1', role: 'owner', owner_id: me, sitter_id: 's1', other_name: 'Sam', sitter_kind: 'particulier', sitter_city: 'Lambersart', pet_id: 'pepite', pet_name: 'Pépite',
  pet_species: 'chien', pet_breed: 'Croisée', pet_age: '4 ans', pet_weight: '12', pet_photo: null, service: 'chez_gardien', starts_at: iso(3, 18), ends_at: iso(5, 18),
  units: 2, unit_price_cents: 2000, message: 'Elle tire un peu en laisse.', status: 'pending', cancelled_by: null, cancel_note: null, responded_at: null, paid_at: null,
  created_at: '2026-11-19T10:00:00Z', updated_at: '2026-11-19T10:00:00Z', report_id: null, report_status: null, report_at: null, sitter_photo: null, ...over,
});
const open = (hash: string) => {
  window.history.replaceState(null, '', `/${hash}`);
  const fake = createFakeSupabase();
  render(<GardeArea client={fake.client} ownerId={me} pets={pets} />);
  return fake;
};
const withPlace = () => sessionStorage.setItem('furrix:garde-search', JSON.stringify({ pet: 'pepite', service: 'chez_gardien', starts: local(3, 18), ends: local(5, 18), radius: 10,
  place: { label: 'Lille · 59000', latitude: 50.63, longitude: 3.06 } }));

beforeEach(() => { sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('garde', () => {
  it('GPS coupé puis activé : indique la position dans le champ et cherche autour', async () => {
    vi.spyOn(location, 'approximateLocation').mockRejectedValueOnce(new location.LocationError('unavailable')).mockResolvedValueOnce({ latitude: 50.63, longitude: 3.06 });
    const search = vi.spyOn(service, 'searchSitters').mockResolvedValue([]);
    open('#/garde');
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser ma position' }));
    await screen.findByText(location.locationMessage.unavailable);
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ma position' }));
    await waitFor(() => expect((screen.getByLabelText('Ville ou code postal') as HTMLInputElement).value).toBe('Autour de ma position'));
    expect(screen.queryByText(location.locationMessage.unavailable)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les gardiens' }));
    await waitFor(() => expect(search).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ latitude: 50.63, longitude: 3.06 })));
  });

  it('compte les nuits ou les jours comme la base, et lit la phase dans les dates', () => {
    expect(countUnits('chez_gardien', iso(3, 18), iso(5, 18))).toBe(2);
    expect(countUnits('chez_gardien', iso(3, 9), iso(3, 20))).toBe(1);
    expect(countUnits('visite', iso(3, 9), iso(5, 9))).toBe(3);
    expect(phaseOf({ status: 'confirmed', starts_at: iso(-1, 9), ends_at: iso(1, 9) })).toBe('ongoing');
    expect(phaseOf({ status: 'confirmed', starts_at: iso(-3, 9), ends_at: iso(-1, 9) })).toBe('done');
    expect(phaseOf({ status: 'accepted', starts_at: iso(3, 9), ends_at: iso(5, 9) })).toBe('accepted');
  });

  it('demande d’abord un lieu, puis cherche avec l’espèce de l’animal et les dates en ISO', async () => {
    const search = vi.spyOn(service, 'searchSitters').mockResolvedValue([sam]);
    open('#/garde');
    expect(await screen.findByRole('button', { name: 'Voir les gardiens' })).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
    cleanup(); withPlace();
    open('#/garde');
    const row = await screen.findByRole('button', { name: /Sam.*Particulier/ });
    expect(screen.getByText('1 gardien disponible')).toBeTruthy();
    expect(row.textContent).toMatch(/20\s€/);
    const query = search.mock.calls[search.mock.calls.length - 1]![1];
    expect(query).toMatchObject({ species: 'chien', service: 'chez_gardien', radius: 10, starts: iso(3, 18), ends: iso(5, 18) });
    fireEvent.click(screen.getByRole('button', { name: 'Visites' }));
    await waitFor(() => expect(search.mock.calls[search.mock.calls.length - 1]![1].service).toBe('visite'));
    fireEvent.click(await screen.findByRole('button', { name: /Sam.*Particulier/ }));
    expect(window.location.hash).toBe('#/garde?vue=fiche&gardien=s1');
    expect(await screen.findByRole('button', { name: 'Demander une garde' })).toBeTruthy();
  });

  it('filtres : type de gardien, prix maximum et tri, sans nouvelle recherche', async () => {
    withPlace();
    const pro: SitterResult = { ...sam, sitter_id: 's2', name: 'Pension des Oyats', kind: 'professionnel', price_cents: 2800, distance_km: 9, outdoor: 'jardin' };
    const cheap: SitterResult = { ...sam, sitter_id: 's3', name: 'Inès', price_cents: 1200, distance_km: 2, outdoor: 'sans_jardin' };
    const search = vi.spyOn(service, 'searchSitters').mockResolvedValue([cheap, sam, pro]);
    open('#/garde');
    await screen.findByText('3 gardiens disponibles');
    expect(screen.queryByText(/Des voisins et des professionnels/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Proposer des gardes/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    fireEvent.click(screen.getByRole('button', { name: 'Professionnel' }));
    await screen.findByText('1 gardien disponible');
    expect(screen.getByRole('button', { name: /Pension des Oyats.*Professionnel/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Type de gardien' })).getByRole('button', { name: 'Tous' }));
    fireEvent.click(screen.getByRole('button', { name: '20 €' }));
    await screen.findByText('2 gardiens disponibles');
    fireEvent.click(screen.getByRole('button', { name: 'Les moins chers' }));
    const rows = screen.getAllByRole('button', { name: /Particulier.*Chez le gardien/ });
    expect(rows[0]!.textContent).toContain('Inès');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('demande : aucun paiement, brouillon gardé et même identifiant après un échec', async () => {
    withPlace();
    vi.spyOn(service, 'getSitter').mockResolvedValue(sam);
    const saved = { id: 'g1' } as SittingRequest;
    const create = vi.spyOn(service, 'createSittingRequest').mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(saved);
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting()]);
    open('#/garde?vue=demander&gardien=s1');
    await screen.findByRole('heading', { name: 'Demander une garde à Sam' });
    expect(screen.getByText('Aucun paiement maintenant')).toBeTruthy();
    const animal = screen.getByLabelText('Animal') as HTMLSelectElement;
    expect([...animal.options].map((o) => o.text)).toEqual(['Pépite']);
    expect([...(screen.getByLabelText('Formule') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['chez_gardien', 'visite']);
    expect(screen.getByText('Début de la garde')).toBeTruthy();
    expect(screen.getByText('Fin de la garde')).toBeTruthy();
    expect(screen.getAllByText(/^40,00\s€$/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Message à Sam/), { target: { value: 'Elle mange deux fois par jour.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await screen.findByText('Envoi de la demande non confirmé');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer l’envoi' }));
    await waitFor(() => expect(window.location.hash).toBe('#/garde?vue=suivi&demande=g1'));
    expect(create.mock.calls[0]![2]).toBe(create.mock.calls[1]![2]);
    expect(create.mock.calls[1]![1]).toMatchObject({ sitter: 's1', pet: 'pepite', service: 'chez_gardien', message: 'Elle mange deux fois par jour.' });
  });

  it('demande : la limite du serveur est expliquée telle quelle', async () => {
    withPlace();
    vi.spyOn(service, 'getSitter').mockResolvedValue(sam);
    vi.spyOn(service, 'createSittingRequest').mockRejectedValue(new AppError('rate_limited', 'Trop de demandes aujourd’hui'));
    open('#/garde?vue=demander&gardien=s1');
    await screen.findByRole('heading', { name: 'Demander une garde à Sam' });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await screen.findByText(/Trop de demandes aujourd’hui\. Réessaie demain/);
  });

  it('gardien : voit l’animal, ce qu’il recevra, et accepte', async () => {
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting({ role: 'sitter', other_name: 'Alex' })]);
    const update = vi.spyOn(service, 'updateSittingRequest').mockResolvedValue({ status: 'accepted', responded_at: '2026-11-19T11:00:00Z' } as SittingRequest);
    open('#/garde?demande=g1');
    await screen.findByRole('heading', { name: 'Demande de garde reçue' });
    expect(screen.getByText('Pépite et Alex')).toBeTruthy();
    expect(screen.getByText('Ce que tu recevras')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accepter' }));
    await screen.findByRole('heading', { name: 'Demande acceptée' });
    expect(update).toHaveBeenCalledWith(expect.anything(), 'g1', 'accept');
  });

  it('demande acceptée : le paiement hébergé est annoncé sans saisie de carte', async () => {
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting({ status: 'accepted', responded_at: '2026-11-19T11:00:00Z' })]);
    open('#/garde?demande=g1');
    await screen.findByRole('heading', { name: 'Sam a accepté ta demande' });
    expect(screen.queryByLabelText('Numéro de carte')).toBeNull();
    expect((screen.getByRole('button', { name: 'Paiement bientôt disponible' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('paiement : design seul, aucun champ de carte saisissable et rien n’est envoyé', async () => {
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting({ status: 'accepted', responded_at: '2026-11-19T11:00:00Z' })]);
    const fake = open('#/garde?vue=paiement&demande=g1');
    await screen.findByRole('heading', { name: 'Payer pour confirmer' });
    expect((screen.getByRole('button', { name: 'Paiement bientôt disponible' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Numéro de carte')).toBeNull();
    expect(screen.getByText(/page sécurisée Stripe/)).toBeTruthy();
    expect(screen.queryByText(/\+ frais/)).toBeNull();
    expect(fake.raw.rpc).not.toHaveBeenCalled();
  });

  it('signalement : catégorie et description requises, puis litige ouvert', async () => {
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting({ status: 'confirmed', paid_at: '2026-11-19T12:00:00Z', starts_at: iso(-1, 18), ends_at: iso(1, 18) })]);
    const report = vi.spyOn(service, 'reportSitting').mockResolvedValue({ id: 87, sitting_id: 'g1', reporter_id: me, category: 'sante', details: 'Elle boite depuis hier soir.', status: 'open', created_at: '2026-11-19T12:30:00Z' });
    open('#/garde?vue=probleme&demande=g1');
    await screen.findByRole('heading', { name: 'Signaler un problème' });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    expect(await screen.findByText('Choisis de quoi il s’agit.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Santé ou blessure' }));
    fireEvent.change(screen.getByLabelText('Décris ce qui s’est passé'), { target: { value: 'Elle boite depuis hier soir.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    await screen.findByRole('heading', { name: 'Litige ouvert' });
    expect(report).toHaveBeenCalledWith(expect.anything(), 'g1', 'sante', 'Elle boite depuis hier soir.');
  });

  it('la page Messages liste aussi les conversations de garde', async () => {
    window.history.replaceState(null, '', '/#/messages');
    vi.spyOn(meetings, 'listMyMatches').mockResolvedValue([]);
    vi.spyOn(service, 'listSittingThreads').mockResolvedValue([{ owner_id: me, sitter_id: 's1', role: 'owner', other_name: 'Sam', last_text: 'À vendredi !', last_at: null,
      sitting_id: 'g1', sitting_status: 'accepted', starts_at: null, ends_at: null }]);
    render(<MessagesArea client={createFakeSupabase().client} ownerId={me} />);
    const row = await screen.findByRole('link', { name: /Sam/ });
    expect(row.getAttribute('href')).toBe(`#/garde?vue=conversation&gardien=s1&proprio=${me}&depuis=messages`);
  });
});
