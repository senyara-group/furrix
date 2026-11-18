import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import { AppShellView } from './AppShell';
import ProductApp from './ProductApp';
import * as service from './accountOverview';
import { useAccountOverview } from './useAccountOverview';
import * as lostService from '../lost-pets/service';
import type { PetRow } from '../types/database';

const documents = { termsUrl: 'https://furrix.example/terms', privacyUrl: 'https://furrix.example/privacy', termsVersion: 'v1', privacyVersion: 'v1' };
const empty = { status: 'ready', data: { profile: { name: null, city: null }, pets: [] } } as const;
const pet: PetRow = { id: 'pet-a', owner_id: fakeSession().user.id, name: 'Luna', species: 'chien', breed: null, age: null, gender: null, purpose: null, city: null, bio: null, photos: [], verified: false, created_at: '' };
const navigate = (route: string) => act(() => { window.history.replaceState(null, '', `/#/${route}`); fireEvent(window, new HashChangeEvent('hashchange')); });

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.spyOn(lostService, 'listNotifications').mockResolvedValue([]); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

describe('accueil et navigation', () => {
  it('ouvre les trois destinations en signalant les services non disponibles', async () => {
    render(<AppShellView overview={{ ...empty, data: { ...empty.data, pets: [] } }} retry={vi.fn()} preview />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Bienvenue chez toi');
    for (const route of ['rencontres', 'garde', 'services', 'messages']) {
      navigate(route);
      expect(screen.getByText('En préparation')).toBeTruthy();
      expect(screen.getByRole('link', { name: /Revenir à l’accueil/ })).toBeTruthy();
    }
    navigate('unknown-path');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Bienvenue chez toi');
  });
  it('ouvre le menu du compte et explique l’absence d’animaux sans profil fictif', () => {
    render(<AppShellView overview={{ ...empty, data: { ...empty.data, pets: [] } }} retry={vi.fn()} preview />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    expect(screen.getByRole('navigation', { name: 'Menu du compte' })).toBeTruthy();
    navigate('animaux');
    expect(screen.queryByRole('navigation', { name: 'Menu du compte' })).toBeNull();
    expect(screen.getByText(/Aucun animal n’est encore associé/)).toBeTruthy();
    expect(screen.queryByText('Luna')).toBeNull();
  });
  it('permet une nouvelle tentative après erreur et garde la déconnexion disponible', async () => {
    window.history.replaceState(null, '', '/#/compte');
    const retry = vi.fn(), signOut = vi.fn().mockResolvedValue(false);
    render(<AppShellView overview={{ status: 'error', data: null }} retry={retry} onSignOut={signOut} />);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter cet appareil' }));
    await screen.findByText('La déconnexion n’a pas abouti. Réessaie.');
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('session et données du compte', () => {
  it('ne charge aucun profil sans session même en ouvrant directement la route accueil', async () => {
    window.history.replaceState(null, '', '/#/accueil');
    const fake = createFakeSupabase();
    render(<ProductApp client={fake.client} documents={documents} />);
    await screen.findByRole('button', { name: 'Se connecter' });
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).toBeNull();
    expect(fake.calls).toEqual([]);
  });
  it('charge uniquement le profil et les animaux du compte connecté après vérification des conditions', async () => {
    const fake = createFakeSupabase();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: fakeSession() }, error: null });
    fake.respond({ data: { user_id: fakeSession().user.id }, error: null });
    fake.respond({ data: { name: 'Alice', city: 'Lille' }, error: null });
    fake.respond({ data: [pet], error: null });
    render(<ProductApp client={fake.client} documents={documents} />);
    await screen.findByText(/Salut Alice/);
    navigate('animaux');
    await screen.findByRole('heading', { name: 'Luna' });
    expect(fake.calls).toContainEqual({ table: 'profiles', op: 'eq', args: ['id', fakeSession().user.id] });
    expect(fake.calls).toContainEqual({ table: 'pets', op: 'eq', args: ['owner_id', fakeSession().user.id] });
  });
  it('ne laisse pas les réponses de l’ancien compte revenir après un changement de session', async () => {
    let finish!: (data: service.AccountOverview) => void;
    vi.spyOn(service, 'fetchAccountOverview')
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce({ profile: { name: 'Bob', city: null }, pets: [] });
    const fake = createFakeSupabase();
    const { result, rerender } = renderHook(({ id }) => useAccountOverview(fake.client, id), { initialProps: { id: 'account-a' } });
    rerender({ id: 'account-b' });
    await waitFor(() => expect(result.current.data?.profile.name).toBe('Bob'));
    await act(async () => finish({ profile: { name: 'Alice', city: null }, pets: [pet] }));
    expect(result.current.data?.profile.name).toBe('Bob');
    expect(result.current.data?.pets).toEqual([]);
  });
});
