import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import { AppError } from '../services/errors';
import MessagesArea, { inboxDate } from './AfterMatch';
import { MessageDraftProvider } from './messageDrafts';
import * as meetings from './service';
import * as sitting from '../sitting/service';
import * as pro from '../professionals/appointments/service';
import { SittingChat } from '../sitting/Chat';
import type { MyMatch } from './types';
import type { SittingThread } from '../sitting/types';
import type { ProThread } from '../professionals/appointments/types';

const me = fakeSession().user.id;
const match: MyMatch = { match_id: 'm1', matched_at: '2026-11-10T17:40:00Z', my_pet_id: 'oscar', my_pet_name: 'Oscar', pet_id: 'luna', name: 'Luna', species: 'chien', breed: null, age: null, gender: null, photo: null, owner_name: 'Élodie', last_text: 'À demain', last_at: '2026-11-20T18:00:00Z', proposal_status: null, proposal_slot: null };
const guard: SittingThread = { owner_id: me, sitter_id: 's1', role: 'owner', other_name: 'Sam', last_text: 'Je passe vendredi', last_at: '2026-11-22T09:00:00Z', sitting_id: null, sitting_status: null, starts_at: null, ends_at: null };
const vet: ProThread = { appointment_id: 'a1', role: 'owner', other_name: 'Cabinet des Oyats', service_name: 'Consultation', status: 'confirmed', starts_at: '2026-12-02T09:00:00Z', last_text: 'À mardi', last_at: '2026-11-21T09:00:00Z', last_sender: 'pro' };
const navigate = (hash: string) => { window.history.replaceState(null, '', '/' + hash); fireEvent(window, new Event('hashchange')); };
const open = () => render(<MessageDraftProvider><MessagesArea client={createFakeSupabase().client} ownerId={me} /></MessageDraftProvider>);
const names = () => screen.getAllByRole('link').map((l) => l.querySelector('.fx-res__name')?.textContent).filter(Boolean);
const chip = (name: string) => within(screen.getByRole('group', { name: 'Catégorie de conversations' })).getByRole('button', { name });

beforeEach(() => {
  navigate('#/messages');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(meetings, 'listMyMatches').mockResolvedValue([match]);
  vi.spyOn(meetings, 'latestProposal').mockResolvedValue(null);
  vi.spyOn(meetings, 'loadMessages').mockResolvedValue([]);
  vi.spyOn(sitting, 'listSittingThreads').mockResolvedValue([guard]);
  vi.spyOn(pro, 'listProfessionalThreads').mockResolvedValue([vet]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); navigate(''); });

describe('boîte Messages', () => {
  it('« Toutes » mélange les catégories du plus récent au plus ancien, avec contexte et date', async () => {
    open();
    await screen.findByRole('link', { name: /^Sam/ });
    expect(names()).toEqual(['Sam', 'Cabinet des Oyats', 'Luna et Élodie']);
    const vetRow = screen.getByRole('link', { name: /Cabinet des Oyats/ });
    expect(vetRow.textContent).toContain('Services · Consultation');
    expect(vetRow.textContent).toContain('« À mardi »');
    expect(vetRow.textContent).toContain('Rendez-vous confirmé');
    expect(vetRow.querySelector('time')?.getAttribute('dateTime')).toBe(vet.last_at);
    expect(screen.getByRole('link', { name: /Luna et Élodie/ }).textContent).toContain('Rencontre · avec Oscar');
    expect(screen.getByRole('link', { name: /^Sam/ }).textContent).toContain('Garde · ton gardien');
    expect(chip('Toutes').getAttribute('aria-pressed')).toBe('true');
  });

  it('filtre par catégorie et propose une action adaptée à une catégorie vide', async () => {
    vi.mocked(sitting.listSittingThreads).mockResolvedValue([]);
    open();
    await screen.findByRole('link', { name: /Luna et Élodie/ });
    fireEvent.click(chip('Services'));
    expect(names()).toEqual(['Cabinet des Oyats']);
    fireEvent.click(chip('Rencontres'));
    expect(names()).toEqual(['Luna et Élodie']);
    fireEvent.click(chip('Garde'));
    expect(screen.getByText('Pas encore de conversation de garde')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Trouver un gardien' }).getAttribute('href')).toBe('#/garde');
  });

  it('recherche dans les trois catégories, puis seulement dans le filtre choisi', async () => {
    open();
    await screen.findByRole('link', { name: /^Sam/ });
    const search = screen.getByLabelText('Rechercher une conversation');
    fireEvent.change(search, { target: { value: 'sam' } });
    expect(names()).toEqual(['Sam']);
    fireEvent.change(search, { target: { value: 'consultation' } });
    expect(names()).toEqual(['Cabinet des Oyats']);
    fireEvent.change(search, { target: { value: 'oscar' } });
    expect(names()).toEqual(['Luna et Élodie']);
    fireEvent.click(chip('Garde'));
    expect(screen.getByText('Aucune conversation trouvée')).toBeTruthy();
    expect(screen.getByText(/prénom du gardien/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(names()).toEqual(['Sam']);
  });

  it('retrouve le filtre et la recherche au retour d’une conversation', async () => {
    open();
    await screen.findByRole('link', { name: /Luna et Élodie/ });
    fireEvent.click(chip('Rencontres'));
    fireEvent.change(screen.getByLabelText('Rechercher une conversation'), { target: { value: 'luna' } });
    navigate('#/messages?match=m1');
    await screen.findByText('Le premier bonjour est à toi.');
    navigate('#/messages');
    await screen.findByRole('link', { name: /Luna et Élodie/ });
    expect(chip('Rencontres').getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Rechercher une conversation') as HTMLInputElement).value).toBe('luna');
  });

  it('les conversations Garde et Services ouvertes depuis Messages y ramènent', async () => {
    open();
    expect((await screen.findByRole('link', { name: /^Sam/ })).getAttribute('href')).toContain('depuis=messages');
    expect(screen.getByRole('link', { name: /Cabinet des Oyats/ }).getAttribute('href')).toContain('depuis=messages');
    cleanup();
    vi.spyOn(sitting, 'listMySittings').mockResolvedValue([]);
    vi.spyOn(sitting, 'getSitter').mockResolvedValue(null);
    vi.spyOn(sitting, 'loadSittingMessages').mockResolvedValue([]);
    render(<MessageDraftProvider><SittingChat client={createFakeSupabase().client} me={me} owner={me} sitter="s1" fromMessages /></MessageDraftProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /Messages/ }));
    expect(window.location.hash).toBe('#/messages');
  });

  it('une catégorie indisponible n’efface pas les autres et n’affiche pas un faux « vide »', async () => {
    vi.mocked(sitting.listSittingThreads).mockRejectedValue(new AppError('forbidden', 'Refusé'));
    open();
    await screen.findByRole('link', { name: /Luna et Élodie/ });
    expect(screen.getByRole('link', { name: /Cabinet des Oyats/ })).toBeTruthy();
    expect(screen.getByText(/Les conversations de garde n’ont pas pu être actualisées\. Les autres catégories restent à jour/)).toBeTruthy();
    fireEvent.click(chip('Services'));
    expect(screen.queryByText(/conversations de garde/)).toBeNull();
    fireEvent.click(chip('Garde'));
    expect(screen.getByText('Tes conversations n’ont pas pu être chargées.')).toBeTruthy();
    expect(screen.queryByText('Pas encore de conversation de garde')).toBeNull();
  });

  it('un texte très long reste tronqué dans la liste', async () => {
    vi.mocked(pro.listProfessionalThreads).mockResolvedValue([{ ...vet, last_text: 'x'.repeat(500) }]);
    open();
    const row = await screen.findByRole('link', { name: /Cabinet des Oyats/ });
    expect(row.querySelector('.am-inbox__last')?.textContent).toBe(`« ${'x'.repeat(80)}… »`);
  });

  it('formate la date du dernier échange', () => {
    const now = new Date(2026, 10, 25, 15, 0);
    expect(inboxDate(new Date(2026, 10, 25, 9, 5).toISOString(), now)).toBe('09:05');
    expect(inboxDate(new Date(2026, 10, 24, 22, 0).toISOString(), now)).toBe('Hier');
    expect(inboxDate(new Date(2026, 10, 21, 10, 0).toISOString(), now)).toBe('Sam.');
    expect(inboxDate(new Date(2026, 10, 12, 10, 0).toISOString(), now)).toBe('12 nov.');
    expect(inboxDate(new Date(2025, 10, 12, 10, 0).toISOString(), now)).toBe('12 nov. 2025');
  });
});
