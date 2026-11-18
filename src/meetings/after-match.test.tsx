import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import type { MatchMessage, MeetingProposal, MyMatch } from './types';
import MessagesArea from './AfterMatch';
import * as service from './service';

const me = fakeSession().user.id;
const match: MyMatch = {
  match_id: 'm1', matched_at: '2026-11-10T17:40:00Z', my_pet_id: 'oscar', my_pet_name: 'Oscar', pet_id: 'luna', name: 'Luna', species: 'chien', breed: 'Berger australien',
  age: '3 ans', gender: '♀', photo: null, owner_name: 'Camille', last_text: null, last_at: null, proposal_status: null, proposal_slot: null,
};
const inDays = (d: number, h = 10) => { const x = new Date(Date.now() + d * 86400_000); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const proposal = (over: Partial<MeetingProposal> = {}): MeetingProposal => ({
  id: 'p1', match_id: 'm1', proposer_id: 'camille', activity: 'balade', place: 'Parc de la Citadelle', slots: [inDays(3), inDays(3, 15)], message: 'Une balade samedi ?',
  status: 'pending', chosen_slot: null, cancel_note: null, cancelled_by: null, request_id: 'r', created_at: '', updated_at: '', ...over,
});
const open = (hash: string, current: MeetingProposal | null = null) => {
  window.history.replaceState(null, '', `/${hash}`);
  vi.spyOn(service, 'listMyMatches').mockResolvedValue([match]);
  vi.spyOn(service, 'latestProposal').mockResolvedValue(current);
  vi.spyOn(service, 'loadMessages').mockResolvedValue([]);
  const fake = createFakeSupabase();
  render(<MessagesArea client={fake.client} ownerId={me} />);
  return fake;
};

beforeEach(() => { sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('après le match', () => {
  it('liste les matchs vers leur conversation, ou invite à découvrir', async () => {
    open('#/messages');
    const row = await screen.findByRole('link', { name: /Luna et Camille/ });
    expect(row.getAttribute('href')).toBe('#/messages?match=m1');
    cleanup(); vi.restoreAllMocks(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(service, 'listMyMatches').mockResolvedValue([]);
    render(<MessagesArea client={createFakeSupabase().client} ownerId={me} />);
    expect((await screen.findByRole('link', { name: 'Découvrir des compagnons' })).getAttribute('href')).toBe('#/rencontres');
  });

  it('conversation : renvoie le même identifiant après une réponse perdue, sans doublon', async () => {
    const saved: MatchMessage = { id: 1, match_id: 'm1', sender_id: me, text: 'Bonjour !', read: false, created_at: '2026-11-18T10:00:00Z', request_id: 'x' };
    const send = vi.spyOn(service, 'sendMessage').mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(saved);
    open('#/messages?match=m1');
    await screen.findByText('Le premier bonjour est à toi.');
    expect(screen.getAllByRole('link', { name: /Proposer/ })[0]!.getAttribute('href')).toBe('#/messages?match=m1&vue=proposer');
    fireEvent.change(screen.getByLabelText('Ton message'), { target: { value: 'Bonjour !' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText(/Envoi non confirmé/);
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('Bonjour !');
    expect(send.mock.calls[0]![3]).toBe(send.mock.calls[1]![3]);
  });

  it('proposition : contrôle avant envoi, garde le brouillon et le même identifiant après un échec', async () => {
    const create = vi.spyOn(service, 'createProposal').mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(proposal({ proposer_id: me }));
    open('#/messages?match=m1&vue=proposer');
    await screen.findByRole('heading', { name: 'Proposer une rencontre à Camille et Luna' });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la proposition' }));
    expect(await screen.findByText('Indique le lieu du rendez-vous.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Jeu au parc' }));
    fireEvent.change(screen.getByLabelText('Lieu'), { target: { value: 'Parc de la Citadelle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la proposition' }));
    await screen.findByText('La proposition n’est pas partie');
    expect((screen.getByLabelText('Lieu') as HTMLInputElement).value).toBe('Parc de la Citadelle');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer l’envoi' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0]![2]).toMatchObject({ activity: 'jeu', place: 'Parc de la Citadelle' });
    expect(create.mock.calls[0]![3]).toBe(create.mock.calls[1]![3]);
    await screen.findByRole('heading', { name: 'Proposition envoyée' });
  });

  it('proposition : le champ de créneau ouvre le choix du jour, puis celui de l’heure', async () => {
    const create = vi.spyOn(service, 'createProposal').mockResolvedValue(proposal({ proposer_id: me }));
    open('#/messages?match=m1&vue=proposer');
    await screen.findByRole('heading', { name: 'Proposer une rencontre à Camille et Luna' });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un créneau' }));
    const field = screen.getByRole('button', { name: 'Créneau 2' });
    expect(field.textContent).toContain('Choisir un jour et une heure');
    fireEvent.click(field);
    const days = screen.getByRole('dialog', { name: 'Créneau 2 : jour' });
    expect(within(days).queryByRole('group', { name: 'Heure' })).toBeNull();
    fireEvent.click(within(days).getByRole('button', { name: 'Mois suivant' }));
    fireEvent.click(within(within(days).getByRole('group', { name: 'Jour' })).getAllByRole('button')[13]!);
    const hours = screen.getByRole('dialog', { name: 'Créneau 2 : heure' });
    expect(within(hours).queryByRole('group', { name: 'Jour' })).toBeNull();
    fireEvent.click(within(hours).getByRole('button', { name: 'Changer de jour' }));
    fireEvent.click(within(within(screen.getByRole('dialog', { name: 'Créneau 2 : jour' })).getByRole('group', { name: 'Jour' })).getAllByRole('button')[13]!);
    fireEvent.click(within(within(screen.getByRole('dialog', { name: 'Créneau 2 : heure' })).getByRole('group', { name: 'Heure' })).getByRole('button', { name: '15:00' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Créneau 2' }).textContent).toMatch(/14 .*15:00/);
    fireEvent.change(screen.getByLabelText('Lieu'), { target: { value: 'Parc de la Citadelle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la proposition' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    const slots = create.mock.calls[0]![2].slots;
    expect(slots).toHaveLength(2);
    expect(new Date(slots[1]!).getHours()).toBe(15);
  });

  it('proposition reçue : choisir un créneau et accepter confirme la rencontre', async () => {
    const current = proposal();
    const update = vi.spyOn(service, 'updateProposal').mockResolvedValue({ ...current, status: 'accepted', chosen_slot: current.slots[1]! });
    open('#/messages?match=m1&vue=rencontre', current);
    await screen.findByText('À toi de répondre');
    expect(screen.getByText('« Une balade samedi ? »')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { pressed: false }).find((b) => b.textContent?.includes('15:00'))!);
    fireEvent.click(screen.getByRole('button', { name: /^Accepter/ }));
    await screen.findByRole('heading', { name: 'Rencontre confirmée' });
    expect(update).toHaveBeenCalledWith(expect.anything(), 'p1', 'accept', current.slots[1]);
    expect(screen.getByText(/Tu as accepté./)).toBeTruthy();
  });

  it('proposition envoyée : l’auteur peut la retirer', async () => {
    const current = proposal({ proposer_id: me });
    vi.spyOn(service, 'updateProposal').mockResolvedValue({ ...current, status: 'withdrawn' });
    open('#/messages?match=m1&vue=rencontre', current);
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer ma proposition' }));
    await screen.findByText('Camille ne la voit plus dans ses demandes.');
  });

  it('rencontre confirmée : annulation avec un mot facultatif', async () => {
    const current = proposal({ status: 'accepted', chosen_slot: inDays(3) });
    const update = vi.spyOn(service, 'updateProposal').mockResolvedValue({ ...current, status: 'cancelled', cancelled_by: me });
    open('#/messages?match=m1&vue=annuler', current);
    fireEvent.change(await screen.findByLabelText(/Un mot pour Camille/), { target: { value: 'Un imprévu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’annulation' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.anything(), 'p1', 'cancel', undefined, 'Un imprévu'));
    await screen.findByText('Nous avons prévenu Camille.');
  });

  it('signaler demande un motif ; bloquer sans signaler est possible', async () => {
    const call = vi.spyOn(service, 'reportOrBlock').mockResolvedValue();
    open('#/messages?match=m1&vue=signaler');
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le signalement' }));
    expect(await screen.findByText('Choisis ce que tu veux signaler.')).toBeTruthy();
    expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Message déplacé' }));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    await screen.findByText('Merci, c’est transmis');
    expect(call).toHaveBeenCalledWith(expect.anything(), 'm1', true, 'message_deplace', '');
  });
});
