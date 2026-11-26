import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '../test/fakeSupabase';
import ProfessionalsArea from '../professionals/ProfessionalsArea';
import * as service from '../professionals/service';
import * as location from '../meetings/location';
import type { Professional } from '../professionals/types';

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
    await within(map()).findByRole('button', { name: /^2 activités au même endroit/ });
    expect(created()).toBe(before + 1);
    expect(within(map()).getByRole('button', { name: /^Éducation canine de Roubaix, ≈ 11 km/ }).closest('[data-lnglat]')?.getAttribute('data-lnglat')).toBe('3.18,50.69');
    expect(within(map()).getAllByRole('button', { pressed: false })).toHaveLength(2);
    expect(screen.getByText(/placée au centre de sa commune/)).toBeTruthy();
  });

  it('activités de la même commune : un repère, puis précédente / suivante, synchronisées avec la liste', async () => {
    open();
    await searchLille();
    showMap();
    fireEvent.click(await within(map()).findByRole('button', { name: /^2 activités au même endroit/ }));
    expect(screen.getByRole('link', { name: /Cabinet des Oyats/ }).getAttribute('aria-current')).toBe('true');
    expect(within(map()).getByRole('button', { name: /^Cabinet des Oyats, et 1 autre au même endroit/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(map()).getByText('1 / 2 au même endroit')).toBeTruthy();
    fireEvent.click(within(map()).getByRole('button', { name: 'Activité suivante' }));
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
    await within(map()).findByRole('button', { name: /^2 activités/ });
    const count = created(), instance = gl.state.maps[gl.state.maps.length - 1]!;
    const fits = instance.fits.length;
    vi.mocked(service.searchProfessionals).mockResolvedValue([c]);
    fireEvent.click(screen.getByRole('button', { name: '25 km' }));
    await waitFor(() => expect(within(map()).queryByRole('button', { name: /^2 activités/ })).toBeNull());
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
    await within(map()).findByRole('button', { name: /^2 activités/ });
    act(() => gl.state.maps[gl.state.maps.length - 1]!.fire('error', { error: Object.assign(new Error('Unauthorized'), { status: 401 }) }));
    expect(await within(map()).findByRole('button', { name: /^Cabinet des Oyats, ≈/ })).toBeTruthy();
    expect(within(map()).queryByRole('button', { name: /^2 activités/ })).toBeNull();
  });

  it('serveur sans positions (migration pas encore appliquée) : vue schématique, sans Mapbox', async () => {
    const before = created();
    vi.mocked(service.searchProfessionals).mockResolvedValue([{ ...a, latitude: undefined as unknown as number, longitude: undefined as unknown as number }]);
    open();
    await searchLille();
    showMap();
    expect(within(map()).getByRole('button', { name: /^Cabinet des Oyats, ≈/ })).toBeTruthy();
    expect(created()).toBe(before);
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
