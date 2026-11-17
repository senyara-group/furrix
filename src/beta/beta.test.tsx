import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import ProductApp from '../app/ProductApp';
import { invitationToken } from './invitation';

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });
const connected = () => {
  const fake = createFakeSupabase();
  fake.auth.getSession.mockResolvedValueOnce({ data: { session: fakeSession() }, error: null });
  return fake;
};

describe('accès privé', () => {
  it('ne charge aucune donnée pour un compte non invité', async () => {
    const fake = connected(); fake.raw.rpc.mockResolvedValue({ data: 'denied', error: null });
    render(<ProductApp client={fake.client} documents={null} privateBeta />);
    await screen.findByRole('heading', { name: 'Un espace sur invitation.' });
    expect(fake.calls).toEqual([]);
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).toBeNull();
  });
  it('refuse l’accès si la vérification serveur échoue', async () => {
    const fake = connected(); fake.raw.rpc.mockResolvedValue({ data: null, error: { message: 'secret detail' } });
    render(<ProductApp client={fake.client} documents={null} privateBeta />);
    await screen.findByRole('heading', { name: 'Accès impossible à vérifier.' });
    expect(fake.calls).toEqual([]);
    expect(document.body.textContent).not.toMatch(/secret/);
  });
  it('ouvre l’accueil seulement après déclarations et relecture de la liste serveur', async () => {
    const fake = connected(); let accepted = false;
    fake.raw.rpc.mockImplementation(async (name) => {
      if (name === 'accept_private_beta_notice') accepted = true;
      return { data: name === 'private_beta_status' ? accepted ? 'active' : 'pending' : null, error: null };
    });
    fake.respond({ data: { name: 'Alexis', city: null }, error: null });
    fake.respond({ data: [], error: null });
    render(<ProductApp client={fake.client} documents={null} privateBeta />);
    await screen.findByRole('heading', { name: 'Bienvenue parmi les premiers.' });
    expect(fake.calls).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Entrer dans la bêta' }));
    await screen.findByRole('alert');
    expect(accepted).toBe(false);
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Entrer dans la bêta' }));
    await screen.findByText(/Salut Alexis/);
    expect(screen.getByText('Bêta privée · Version de test')).toBeTruthy();
  });
  it('masque l’espace après révocation détectée au retour sur la fenêtre', async () => {
    const fake = connected(); let status = 'active';
    fake.raw.rpc.mockImplementation(async () => ({ data: status, error: null }));
    fake.respond({ data: { name: 'Alexis', city: null }, error: null }); fake.respond({ data: [], error: null });
    render(<ProductApp client={fake.client} documents={null} privateBeta />);
    await screen.findByText(/Salut Alexis/);
    status = 'denied'; act(() => { fireEvent(window, new Event('focus')); });
    await screen.findByRole('heading', { name: 'Un espace sur invitation.' });
    expect(screen.queryByText(/Salut Alexis/)).toBeNull();
  });
  it('garde les inscriptions fermées en mode bêta', async () => {
    const fake = createFakeSupabase();
    render(<ProductApp client={fake.client} documents={null} privateBeta />);
    await screen.findByRole('button', { name: 'Créer un compte' });
    fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    expect(screen.getByText('La bêta privée est accessible sur invitation uniquement.')).toBeTruthy();
    expect(fake.auth.signUp).not.toHaveBeenCalled();
  });
});

describe('invitation', () => {
  it('ne traite que le retour d’invitation exact et un token unique', () => {
    expect(invitationToken('#/auth/invite?token_hash=abcdefghijklmnop&type=invite')).toBe('abcdefghijklmnop');
    for (const value of ['#/auth/reset?token_hash=abcdefghijklmnop&type=invite', '#/auth/invite?token_hash=abcdefghijklmnop&type=recovery',
      '#/auth/invite?token_hash=abcdefghijklmnop&token_hash=other&type=invite', '#/auth/invite?token_hash=short&type=invite']) {
      expect(invitationToken(value)).toBeNull();
    }
  });
  it('retire le token de l’URL, attend le clic puis propose le choix du mot de passe', async () => {
    window.history.replaceState(null, '', '/#/auth/invite?token_hash=abcdefghijklmnop&type=invite');
    const fake = createFakeSupabase();
    fake.auth.verifyOtp.mockImplementationOnce(async () => {
      fake.emitAuth('SIGNED_IN', fakeSession());
      return { data: { session: fakeSession(), user: null }, error: null };
    });
    render(<ProductApp client={fake.client} documents={null} privateBeta />);
    await screen.findByRole('button', { name: 'Accepter mon invitation' });
    expect(window.location.href).not.toContain('abcdefghijklmnop');
    expect(fake.auth.verifyOtp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accepter mon invitation' }));
    await screen.findByLabelText('Nouveau mot de passe');
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abcdefghijklmnop', type: 'invite' });
    expect(fake.calls).toEqual([]);
  });
  it('ne traite pas d’invitation si le mode privé n’est pas actif', async () => {
    window.history.replaceState(null, '', '/#/auth/invite?token_hash=abcdefghijklmnop&type=invite');
    const fake = createFakeSupabase();
    render(<ProductApp client={fake.client} documents={null} privateBeta={false} />);
    await screen.findByRole('alert');
    expect(fake.auth.verifyOtp).not.toHaveBeenCalled();
  });
});
