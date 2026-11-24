import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import type { PetRow } from '../types/database';
import GardeArea from './Garde';
import * as service from './service';
import { AppError } from '../services/errors';
import { missingDays, phaseOf, weekdaysLabel } from './format';
import type { MySitting, SitterProfile, SitterResult, SittingRequest } from './types';

const me = fakeSession().user.id;
const pets = [{ id: 'pepite', owner_id: me, name: 'Pépite', species: 'chien', weight: '12' }] as PetRow[];
const local = (days: number, h: number) => { const d = new Date(Date.now() + days * 86400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`; };
const iso = (days: number, h: number) => new Date(local(days, h)).toISOString();
/** Jour de la semaine (1 = lundi … 7 = dimanche) dans `days` jours. */
const isoDay = (days: number) => ((new Date(local(days, 12)).getDay() + 6) % 7) + 1;
const ALL = [1, 2, 3, 4, 5, 6, 7];
const sam: SitterResult = {
  sitter_id: 's1', name: 'Sam', kind: 'particulier', city: 'Lambersart', bio: 'Maison avec jardin, balades matin et soir le long de la Deûle.', distance_km: 3,
  species: ['chien'], max_weight_kg: 15, outdoor: 'jardin_clos', services: [{ service: 'chez_gardien', price_cents: 2000 }], price_cents: 2000, busy: false, photo: null,
  weekdays: ALL, capacity: 2,
};
const sitting = (over: Partial<MySitting> = {}): MySitting => ({
  id: 'g1', role: 'owner', owner_id: me, sitter_id: 's1', other_name: 'Sam', sitter_kind: 'particulier', sitter_city: 'Lambersart', pet_id: 'pepite', pet_name: 'Pépite',
  pet_species: 'chien', pet_breed: null, pet_age: null, pet_weight: '12', pet_photo: null, service: 'chez_gardien', starts_at: iso(3, 18), ends_at: iso(5, 18),
  units: 2, unit_price_cents: 2000, message: null, status: 'pending', cancelled_by: null, cancel_note: null, responded_at: null, paid_at: null,
  created_at: '2026-11-19T10:00:00Z', updated_at: '2026-11-19T10:00:00Z', report_id: null, report_status: null, report_at: null, sitter_photo: null, ...over,
});
const open = (hash: string) => {
  window.history.replaceState(null, '', `/${hash}`);
  const fake = createFakeSupabase();
  render(<GardeArea client={fake.client} ownerId={me} pets={pets} />);
  return fake;
};
const criteria = (over: Record<string, unknown> = {}) => sessionStorage.setItem('furrix:garde-search', JSON.stringify({ pet: 'pepite', service: 'chez_gardien',
  starts: local(3, 18), ends: local(5, 18), radius: 10, place: { label: 'Lille · 59000', latitude: 50.63, longitude: 3.06 }, ...over }));

beforeEach(() => { sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('disponibilités : libellés et jours manquants', () => {
  it('résume les jours proposés', () => {
    expect(weekdaysLabel(ALL)).toBe('Tous les jours');
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe('Du lundi au vendredi');
    expect(weekdaysLabel([7, 6])).toBe('Le week-end');
    expect(weekdaysLabel([1, 3, 6])).toBe('Lun., mer., sam.');
  });
  it('liste les jours de la période que le gardien ne propose pas', () => {
    const missing = ALL.filter((d) => d !== isoDay(4));
    expect(missingDays(missing, iso(3, 18), iso(5, 18))).toHaveLength(1);
    expect(missingDays(ALL, iso(3, 18), iso(5, 18))).toEqual([]);
    // Une fin à minuit ne compte pas le jour qui commence.
    expect(missingDays(ALL.filter((d) => d !== isoDay(5)), iso(3, 18), new Date(local(5, 0)).toISOString())).toEqual([]);
  });
  it('une demande sans suite avant son début n’est plus active', () => {
    expect(phaseOf({ status: 'pending', starts_at: iso(-1, 9), ends_at: iso(1, 9) })).toBe('expired');
    expect(phaseOf({ status: 'accepted', starts_at: iso(-1, 9), ends_at: iso(1, 9) })).toBe('lapsed');
    expect(phaseOf({ status: 'pending', starts_at: iso(1, 9), ends_at: iso(2, 9) })).toBe('pending');
  });
});

describe('disponibilités : profil du gardien', () => {
  const profile: SitterProfile = { user_id: me, kind: 'particulier', bio: 'Maison avec jardin, balades matin et soir.', city: 'Lille', latitude: 50.63, longitude: 3.06,
    species: ['chien'], max_weight_kg: null, outdoor: 'jardin', active: true, photo: null, weekdays: ALL, capacity: 1, created_at: '', updated_at: '' };
  it('enregistre les jours, la capacité et les absences avec le profil', async () => {
    vi.spyOn(service, 'mySitterProfile').mockResolvedValue({ profile, services: [{ service: 'chez_gardien', price_cents: 2000 }],
      absences: [{ starts_on: '2020-01-01', ends_on: '2020-01-05' }] });
    const save = vi.spyOn(service, 'saveSitterOffer').mockResolvedValue(profile);
    open('#/garde?vue=profil');
    await screen.findByRole('heading', { name: 'Disponibilités' });
    expect(screen.getByText('Aucune période pour l’instant.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dimanche' }));
    fireEvent.change(screen.getByLabelText(/Capacité d’accueil/), { target: { value: '3a' } });
    expect((screen.getByLabelText(/Capacité d’accueil/) as HTMLInputElement).value).toBe('3');
    const from = local(10, 12).slice(0, 10), to = local(12, 12).slice(0, 10);
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: to } });
    fireEvent.change(screen.getByLabelText(/^Au/), { target: { value: from } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la période' }));
    expect(await screen.findByText('La fin de l’absence doit venir après son début.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: from } });
    fireEvent.change(screen.getByLabelText(/^Au/), { target: { value: to } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la période' }));
    expect(await screen.findByRole('button', { name: /Retirer la période/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Profil enregistré');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ city: 'Lille' }), { weekdays: [1, 2, 3, 4, 5, 6], capacity: 3, absences: [{ starts_on: from, ends_on: to }] });
  });
  it('si l’enregistrement échoue, rien n’est annoncé comme enregistré', async () => {
    vi.spyOn(service, 'mySitterProfile').mockResolvedValue({ profile, services: [{ service: 'chez_gardien', price_cents: 2000 }], absences: [] });
    const save = vi.spyOn(service, 'saveSitterOffer').mockRejectedValue(new Error('Disponibilités invalides'));
    open('#/garde?vue=profil');
    await screen.findByRole('heading', { name: 'Disponibilités' });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Ton profil n’a pas été enregistré')).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Profil enregistré')).toBeNull();
  });
  it('refuse une capacité hors limites et un profil sans jour', async () => {
    vi.spyOn(service, 'mySitterProfile').mockResolvedValue({ profile, services: [{ service: 'chez_gardien', price_cents: 2000 }], absences: [] });
    const saveProfile = vi.spyOn(service, 'saveSitterOffer').mockResolvedValue(profile);
    open('#/garde?vue=profil');
    await screen.findByRole('heading', { name: 'Disponibilités' });
    fireEvent.change(screen.getByLabelText(/Capacité d’accueil/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Indique une capacité d’accueil entre 1 et 10.')).toBeTruthy();
    expect(saveProfile).not.toHaveBeenCalled();
  });
  it('propose de réessayer si le profil ne se charge pas', async () => {
    const load = vi.spyOn(service, 'mySitterProfile').mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(null);
    open('#/garde?vue=profil');
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('heading', { name: 'Proposer des gardes' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('disponibilités : fiche et demande', () => {
  it('la fiche montre les jours, la capacité, et prévient si un jour n’est pas proposé', async () => {
    criteria();
    vi.spyOn(service, 'getSitter').mockResolvedValue({ ...sam, weekdays: ALL.filter((d) => d !== isoDay(4)) });
    open('#/garde?vue=fiche&gardien=s1');
    await screen.findByRole('button', { name: 'Demander une garde' });
    expect(screen.getByText('Jusqu’à 2 gardes en même temps')).toBeTruthy();
    expect(screen.getByText(/^Ne garde pas le /)).toBeTruthy();
  });
  it('la demande sur un jour non proposé est bloquée avant l’envoi', async () => {
    criteria();
    vi.spyOn(service, 'getSitter').mockResolvedValue({ ...sam, weekdays: ALL.filter((d) => d !== isoDay(4)) });
    const create = vi.spyOn(service, 'createSittingRequest');
    open('#/garde?vue=demander&gardien=s1');
    await screen.findByRole('heading', { name: 'Demander une garde à Sam' });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText(/^Sam ne garde pas le /)).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });
  it('le refus du serveur (complet, absent) est expliqué', async () => {
    criteria();
    vi.spyOn(service, 'getSitter').mockResolvedValue(sam);
    vi.spyOn(service, 'createSittingRequest').mockRejectedValue(new AppError('forbidden', service.UNAVAILABLE));
    open('#/garde?vue=demander&gardien=s1');
    await screen.findByRole('heading', { name: 'Demander une garde à Sam' });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText(/pas disponible à ces dates : jour non proposé, absence ou plus de place/)).toBeTruthy();
  });
});

describe('demandes : états et actions de chaque personne', () => {
  it('retirer une demande demande une confirmation', async () => {
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting()]);
    const update = vi.spyOn(service, 'updateSittingRequest').mockResolvedValue({ status: 'withdrawn' } as SittingRequest);
    open('#/garde?demande=g1');
    await screen.findByRole('heading', { name: 'Demande envoyée' });
    expect(screen.getByText('Envoyée · réponse attendue')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer ma demande' }));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Garder la demande' }));
    expect(screen.queryByText('Retirer ta demande ?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer ma demande' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Oui, retirer' }));
    await screen.findByRole('heading', { name: 'Demande retirée' });
    expect(update).toHaveBeenCalledWith(expect.anything(), 'g1', 'withdraw');
  });
  it('le gardien peut revenir sur son accord avant le paiement', async () => {
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting({ role: 'sitter', other_name: 'Alex', status: 'accepted', responded_at: '2026-11-19T11:00:00Z' })]);
    const update = vi.spyOn(service, 'updateSittingRequest').mockResolvedValue({ status: 'declined' } as SittingRequest);
    open('#/garde?demande=g1');
    await screen.findByRole('heading', { name: 'Demande acceptée' });
    fireEvent.click(screen.getByRole('button', { name: 'Je ne peux plus garder' }));
    expect(screen.getByText('Revenir sur ton accord ?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Oui, annuler mon accord' }));
    await screen.findByRole('heading', { name: 'Demande refusée' });
    expect(update).toHaveBeenCalledWith(expect.anything(), 'g1', 'decline');
  });
  it('une demande acceptée mais non payée avant le début est expirée, sans action de paiement', async () => {
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting({ status: 'accepted', starts_at: iso(-1, 9), ends_at: iso(1, 9) })]);
    open('#/garde?demande=g1');
    await screen.findByRole('heading', { name: 'Demande expirée' });
    expect(screen.getByText('Le paiement n’a pas été fait avant le début de la garde')).toBeTruthy();
    expect(screen.queryByLabelText('Numéro de carte')).toBeNull();
  });
  it('une garde payée s’affiche « Confirmée »', async () => {
    vi.spyOn(service, 'listMySittings').mockResolvedValue([sitting({ status: 'confirmed', paid_at: '2026-11-19T12:00:00Z' })]);
    open('#/garde?demande=g1');
    await screen.findByRole('heading', { name: 'Réservation confirmée' });
    expect(screen.getAllByText('Confirmée').length).toBeGreaterThan(0);
  });
});

describe('états des écrans', () => {
  it('des filtres trop stricts ne font pas croire qu’il n’y a personne', async () => {
    criteria();
    vi.spyOn(service, 'searchSitters').mockResolvedValue([sam]);
    open('#/garde');
    await screen.findByText('1 gardien disponible');
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    fireEvent.click(screen.getByRole('button', { name: 'Professionnel' }));
    expect(await screen.findByText('Aucun gardien avec ces filtres')).toBeTruthy();
    expect(screen.queryByText('Aucun gardien disponible à ces dates')).toBeNull();
  });
  it('des dates passées sont remplacées par des dates à venir, sans perdre le lieu', async () => {
    criteria({ starts: local(-3, 18), ends: local(-1, 18), radius: 25 });
    const search = vi.spyOn(service, 'searchSitters').mockResolvedValue([sam]);
    open('#/garde');
    await screen.findByText('1 gardien disponible');
    const query = search.mock.calls[0]![1];
    expect(query).toMatchObject({ latitude: 50.63, radius: 25 });
    expect(new Date(query.starts).getTime()).toBeGreaterThan(Date.now());
  });
  it('une conversation qui ne charge pas propose de réessayer', async () => {
    const list = vi.spyOn(service, 'listMySittings').mockRejectedValueOnce(new Error('réseau')).mockResolvedValue([sitting()]);
    vi.spyOn(service, 'listSittingThreads').mockResolvedValue([]);
    vi.spyOn(service, 'loadSittingMessages').mockResolvedValue([]);
    open('#/garde?vue=conversation&gardien=s1');
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('La conversation n’a pas pu être chargée.')).toBeNull();
  });
});
