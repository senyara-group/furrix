import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '../test/fakeSupabase';
import ProfessionalsArea from '../professionals/ProfessionalsArea';
import * as service from '../professionals/service';
import * as location from '../meetings/location';
import type { Professional } from '../professionals/types';
import { ResultsMap } from './ResultsMap';

// Fausse bibliothèque Mapbox : compte les cartes créées et place les repères dans le conteneur.
const gl = vi.hoisted(() => {
  const state = { maps: [] as FakeMap[] };
  type Handler = (e: unknown) => void;
  class FakeMap {
    handlers = new Map<string, Handler[]>();
    sources = new Map<string, { setData: (d: unknown) => void; data?: unknown }>();
    fits: unknown[] = [];
    removed = false;
    touchZoomRotate = { disableRotation() {} };
    constructor(public options: { container: HTMLElement }) { state.maps.push(this); }
    get container() { return this.options.container; }
    addControl() { return this; }
    isStyleLoaded() { return true; }
    on(type: string, fn: Handler) { this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]); return this; }
    once(type: string, fn: Handler) { return this.on(type, fn); }
    off(type: string, fn: Handler) { this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== fn)); return this; }
    fire(type: string, e: unknown) { for (const h of this.handlers.get(type) ?? []) h(e); }
    getSource(id: string) { return this.sources.get(id); }
    addSource(id: string) { const s = { setData(d: unknown) { s.data = d; }, data: undefined as unknown }; this.sources.set(id, s); }
    addLayer() {}
    fitBounds(b: unknown) { this.fits.push(b); }
    easeTo() {}
    project([lng, lat]: [number, number]) { return { x: lng * 10000, y: lat * 10000 }; }
    getBounds() { return { contains: () => true }; }
    resize() {}
    remove() { this.removed = true; }
  }
  class Marker {
    element: HTMLElement;
    constructor({ element }: { element: HTMLElement }) { this.element = element; }
    setLngLat(ll: [number, number]) { this.element.dataset.lnglat = ll.join(','); return this; }
    addTo(map: FakeMap) { map.container.appendChild(this.element); return this; }
    remove() { this.element.remove(); }
  }
  class NavigationControl {}
  return { state, FakeMap, Marker, NavigationControl };
});
vi.mock('mapbox-gl', () => ({ default: { Map: gl.FakeMap, Marker: gl.Marker, NavigationControl: gl.NavigationControl } }));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

// Visibilité contrôlée : la carte n'est créée que lorsque son cadre apparaît.
const observers: { cb: IntersectionObserverCallback; el?: Element }[] = [];
class FakeObserver {
  entry: { cb: IntersectionObserverCallback; el?: Element };
  constructor(cb: IntersectionObserverCallback) { this.entry = { cb }; observers.push(this.entry); }
  observe(el: Element) { this.entry.el = el; }
  disconnect() { const i = observers.indexOf(this.entry); if (i >= 0) observers.splice(i, 1); }
}
const showMap = () => act(() => { for (const o of [...observers]) o.cb([{ isIntersecting: true, target: o.el! } as IntersectionObserverEntry], {} as IntersectionObserver); });

const owner = '11111111-1111-4111-8111-111111111111';
const pro = (id: string, name: string, km: number, latitude: number, longitude: number): Professional => ({
  professional_id: id, name, category: 'veterinaire', city: 'Lille', bio: 'Présentation.', species: ['chien'], hours: '', accessibility: '',
  phone: null, website: null, services: [{ name: 'Consultation', unit: 'consultation', price_cents: null }], distance_km: km, latitude, longitude,
});
// Deux activités dans la même commune (même position autorisée), une troisième ailleurs.
const a = pro('p1', 'Cabinet des Oyats', 0, 50.63, 3.06), b = pro('p2', 'Toilettage du Vieux-Lille', 0, 50.63, 3.06), c = pro('p3', 'Éducation canine de Roubaix', 11, 50.69, 3.18);
const map = () => screen.getByRole('region', { name: /Carte des activités/ });
const created = () => gl.state.maps.length;

async function searchLille() {
  fireEvent.change(screen.getByLabelText('Ville ou code postal'), { target: { value: 'Lille' } });
  fireEvent.click(screen.getByRole('button', { name: 'Trouver la ville' }));
  await screen.findByRole('region', { name: /Carte des activités/ });
  await waitFor(() => expect(screen.getAllByRole('link', { name: /Cabinet des Oyats/ }).length).toBeGreaterThan(0));
}
const open = () => render(<ProfessionalsArea client={createFakeSupabase().client} owner={owner} />);

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_TOKEN_WEB', 'pk.test');
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), media: query, addEventListener() {}, removeEventListener() {} }));
  window.history.replaceState(null, '', '/#/services');
  vi.spyOn(location, 'locateTown').mockResolvedValue({ latitude: 50.63, longitude: 3.06, label: 'Lille · 59000' });
  vi.spyOn(service, 'searchProfessionals').mockResolvedValue([a, b, c]);
  vi.spyOn(service, 'getProfessional').mockResolvedValue(a);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('carte Mapbox de l’annuaire', () => {
  it('rien n’est chargé tant que la carte n’est pas visible, puis une seule carte avec un repère par position', async () => {
    const before = created();
    open();
    await searchLille();
    expect(created()).toBe(before);
    showMap();
    await within(map()).findByRole('button', { name: /^2 résultats au même endroit/ });
    expect(created()).toBe(before + 1);
    expect(within(map()).getByRole('button', { name: /^Éducation canine de Roubaix, ≈ 11 km/ }).closest('[data-lnglat]')?.getAttribute('data-lnglat')).toBe('3.18,50.69');
    expect(within(map()).getAllByRole('button', { pressed: false })).toHaveLength(2);
    expect(screen.getByText(/placée au centre de sa commune/)).toBeTruthy();
  });

  it('activités de la même commune : un repère, puis précédente / suivante, synchronisées avec la liste', async () => {
    open();
    await searchLille();
    showMap();
    fireEvent.click(await within(map()).findByRole('button', { name: /^2 résultats au même endroit/ }));
    expect(screen.getByRole('link', { name: /Cabinet des Oyats/ }).getAttribute('aria-current')).toBe('true');
    expect(within(map()).getByRole('button', { name: /^Cabinet des Oyats, et 1 autre au même endroit/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(map()).getByText('1 / 2 au même endroit')).toBeTruthy();
    fireEvent.click(within(map()).getByRole('button', { name: 'Résultat suivant' }));
    expect(screen.getByRole('link', { name: /Toilettage du Vieux-Lille/ }).getAttribute('aria-current')).toBe('true');
    expect(within(map()).getByRole('button', { name: /Voir la fiche/ }).textContent).toContain('Toilettage du Vieux-Lille');
    // Survol d'une ligne de la liste : le repère de sa commune le montre.
    fireEvent.mouseEnter(screen.getByRole('link', { name: /Éducation canine/ }));
    expect(within(map()).getByRole('button', { name: /^Éducation canine de Roubaix, ≈/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('filtres et retour de fiche : même carte, repères mis à jour, cadrage seulement quand la recherche change', async () => {
    open();
    await searchLille();
    showMap();
    await within(map()).findByRole('button', { name: /^2 résultats/ });
    const count = created(), instance = gl.state.maps[gl.state.maps.length - 1]!;
    const fits = instance.fits.length;
    vi.mocked(service.searchProfessionals).mockResolvedValue([c]);
    fireEvent.click(screen.getByRole('button', { name: '25 km' }));
    await waitFor(() => expect(within(map()).queryByRole('button', { name: /^2 résultats/ })).toBeNull());
    await within(map()).findByRole('button', { name: /^Éducation canine de Roubaix, ≈/ });
    expect(created()).toBe(count);
    expect(instance.fits.length).toBe(fits + 1);
    // Fiche puis retour : la carte mise de côté est reprise, sans nouveau chargement ni recadrage.
    fireEvent.click(within(map()).getByRole('button', { name: /^Éducation canine de Roubaix, ≈/ }));
    fireEvent.click(within(map()).getByRole('button', { name: /Voir la fiche/ }));
    await act(async () => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await screen.findByRole('heading', { name: 'Cabinet des Oyats' });
    window.history.replaceState(null, '', '/#/services');
    await act(async () => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    showMap();
    await within(map()).findByRole('button', { name: /^Éducation canine de Roubaix, ≈/ });
    expect(created()).toBe(count);
    expect(instance.removed).toBe(false);
    expect(instance.fits.length).toBe(fits + 1);
  });

  it('jeton refusé par Mapbox : la carte schématique prend le relais', async () => {
    open();
    await searchLille();
    showMap();
    await within(map()).findByRole('button', { name: /^2 résultats/ });
    act(() => gl.state.maps[gl.state.maps.length - 1]!.fire('error', { error: Object.assign(new Error('Unauthorized'), { status: 401 }) }));
    expect(await within(map()).findByRole('button', { name: /^Cabinet des Oyats, ≈/ })).toBeTruthy();
    expect(within(map()).queryByRole('button', { name: /^2 résultats/ })).toBeNull();
    expect(screen.queryByText(/chaque activité est placée au centre de sa commune/)).toBeNull();
    expect(screen.getByText(/Carte schématique.*direction des repères est indicative/)).toBeTruthy();
  });

  it('serveur sans positions (migration pas encore appliquée) : vue schématique, sans Mapbox', async () => {
    const before = created();
    vi.mocked(service.searchProfessionals).mockResolvedValue([{ ...a, latitude: undefined as unknown as number, longitude: undefined as unknown as number }]);
    open();
    await searchLille();
    showMap();
    expect(within(map()).getByRole('button', { name: /^Cabinet des Oyats, ≈/ })).toBeTruthy();
    expect(created()).toBe(before);
    expect(screen.queryByText(/chaque activité est placée au centre de sa commune/)).toBeNull();
    expect(screen.getByText(/Carte schématique.*direction des repères est indicative/)).toBeTruthy();
  });
});

describe('explication du mode réellement affiché', () => {
  it.each([
    'Sur la carte, chaque activité est placée au centre de sa commune, pas à son adresse.',
    'Sur la carte, chaque gardien est placé dans son secteur (≈ 5 km), jamais à son adresse.',
    'Chaque profil est placé dans son secteur (≈ 5 km), jamais à sa zone exacte. Ta zone n’est montrée qu’à toi.',
  ])('remplace l’explication géographique après un refus : %s', async (positionNote) => {
    render(<ResultsMap label="Carte de test" points={[{ id: 'test', name: 'Résultat', distanceKm: 3, position: { latitude: 50.63, longitude: 3.06 } }]}
      radiusKm={10} status="ready" selected={null} onSelect={vi.fn()} onOpen={vi.fn()} emptyText="Aucun résultat" positionNote={positionNote} />);
    showMap();
    await within(screen.getByRole('region', { name: 'Carte de test' })).findByRole('button', { name: 'Résultat' });
    expect(screen.getByText(positionNote)).toBeTruthy();
    act(() => gl.state.maps[gl.state.maps.length - 1]!.fire('error', { error: Object.assign(new Error('Forbidden'), { status: 403 }) }));
    expect(screen.queryByText(positionNote)).toBeNull();
    expect(screen.getByText(/Carte schématique.*direction des repères est indicative/)).toBeTruthy();
  });
});

describe('regroupement des repères à l’écran', () => {
  it('réunit les repères qui se chevauchent et garde les autres séparés', async () => {
    const { clusterOnScreen } = await import('./mapbox');
    const g = (key: string, x: number, y: number) => ({ key, position: { latitude: y, longitude: x } });
    const clusters = clusterOnScreen([g('a', 0, 0), g('b', 100, 20), g('c', 400, 0)], (p) => ({ x: p.longitude, y: p.latitude }));
    expect(clusters.map((c) => c.key)).toEqual(['a|b', 'c']);
    expect(clusters[0]!.position).toEqual({ latitude: 10, longitude: 50 });
  });
});

// ───────── Garde et Rencontres : même carte, secteurs des particuliers ─────────
import { fakeSession } from '../test/fakeSupabase';
import { SearchView, type Criteria } from '../sitting/Search';
import * as sitting from '../sitting/service';
import type { SitterResult } from '../sitting/types';
import Rencontres from '../meetings/Rencontres';
import * as meetings from '../meetings/service';
import type { DiscoveryPet } from '../meetings/types';
import type { PetRow } from '../types/database';

describe('carte Mapbox de Garde', () => {
  const sitter = (id: string, name: string, latitude: number, longitude: number): SitterResult => ({
    sitter_id: id, name, kind: 'particulier', city: 'Lille', bio: 'Présentation.', distance_km: 3, species: ['chien'], max_weight_kg: null, outdoor: 'jardin',
    services: [{ service: 'chez_gardien', price_cents: 2000 }], price_cents: 2000, busy: false, photo: null, weekdays: [1, 2, 3, 4, 5, 6, 7], capacity: 1, latitude, longitude,
  } as SitterResult);
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const criteria: Criteria = { pet: 'p', service: 'chez_gardien', starts: `${day(3)}T18:00`, ends: `${day(5)}T18:00`, radius: 10, place: { label: 'Lille', latitude: 50.63, longitude: 3.06 } };

  it('gardiens du même secteur réunis, sélection synchronisée avec la liste, mini-fiche qui ouvre le gardien', async () => {
    vi.spyOn(sitting, 'searchSitters').mockResolvedValue([sitter('s1', 'Sam', 50.65, 3.05), sitter('s2', 'Inès', 50.65, 3.05)]);
    const onOpen = vi.fn();
    render(<SearchView client={createFakeSupabase().client} pets={[{ id: 'p', owner_id: owner, name: 'Luna', species: 'chien' } as PetRow]}
      criteria={criteria} setCriteria={vi.fn()} onOpen={onOpen} />);
    const region = await screen.findByRole('region', { name: 'Carte des gardiens près de Lille' });
    showMap();
    fireEvent.click(await within(region).findByRole('button', { name: /^2 résultats dans le même secteur/ }));
    expect(screen.getByText('1 / 2 dans le même secteur')).toBeTruthy();
    expect(document.querySelector('[data-id="s1"]')?.getAttribute('aria-current')).toBe('true');
    fireEvent.click(within(region).getByRole('button', { name: 'Résultat suivant' }));
    fireEvent.click(within(region).getByRole('button', { name: /Voir la fiche/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ sitter_id: 's2' }));
    expect(screen.getByText(/placé dans son secteur \(≈ 5 km\)/)).toBeTruthy();
  });
});

describe('carte Mapbox de Rencontres', () => {
  const me = fakeSession().user.id;
  const mine: PetRow = { id: 'pet-a', owner_id: me, name: 'Pépite', species: 'chien', breed: null, age: null, gender: '♀', purpose: 'balade', city: 'Lille', bio: null, photos: [], verified: false, created_at: '' };
  const pet = (id: string, name: string, latitude: number | null): DiscoveryPet => ({
    id, owner_id: 'o-' + id, name, species: 'chien', breed: 'Croisé', age: '3 ans', gender: '♀', purpose: 'balade', city: 'Lille', bio: 'Bio.', photos: [], owner_name: 'Camille',
    distance_km: latitude === null ? null : 4, meeting_goals: [], behaviour_traits: [], latitude, longitude: latitude === null ? null : 3.05,
  });
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(meetings, 'discoverPets').mockResolvedValue([pet('luna', 'Luna', 50.65), pet('rocky', 'Rocky', 50.7), pet('nuage', 'Nuage', null)]);
    vi.spyOn(meetings, 'hasLocation').mockResolvedValue(true);
    vi.spyOn(meetings, 'myLocation').mockResolvedValue({ latitude: 50.63, longitude: 3.06 });
    vi.spyOn(meetings, 'listNewMatches').mockResolvedValue([]);
    vi.spyOn(meetings, 'markMatchSeen').mockResolvedValue();
  });

  it('profils placés par secteur autour de sa zone, mini-fiche vers la fiche, profils sans zone signalés', async () => {
    render(<Rencontres client={createFakeSupabase().client} ownerId={me} pets={[mine]} />);
    await screen.findByRole('group', { name: 'Luna' });
    fireEvent.click(screen.getByRole('button', { name: 'Carte' }));
    const region = await screen.findByRole('region', { name: 'Carte des profils autour de toi' });
    showMap();
    const rocky = await within(region).findByRole('button', { name: /^Rocky, ≈ 4 km/ });
    expect(rocky.closest('[data-lnglat]')?.getAttribute('data-lnglat')).toBe('3.05,50.7');
    expect(meetings.myLocation).toHaveBeenCalled();
    expect(screen.getByText(/1 profil sans zone/)).toBeTruthy();
    expect(screen.getByText(/dans son secteur \(≈ 5 km\), jamais à sa zone exacte/)).toBeTruthy();
    fireEvent.click(rocky);
    fireEvent.click(within(region).getByRole('button', { name: /Voir la fiche/ }));
    expect(await screen.findByText('Le mot de Camille')).toBeTruthy();
  });
});
