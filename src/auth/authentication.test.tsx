import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AuthApplication from './AuthApplication';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import { legalDocuments, validateRegistration } from './registration';

const documents = { termsUrl: 'https://furrix.example/terms', privacyUrl: 'https://furrix.example/privacy', termsVersion: 'v1', privacyVersion: 'v1' };
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

describe('activation de l’inscription', () => {
  it('reste fermée si les textes, versions ou l’activation explicite manquent', () => {
    expect(legalDocuments({})).toBeNull();
    expect(legalDocuments({ VITE_REGISTRATION_ENABLED: 'true', VITE_TERMS_URL: 'javascript:alert(1)' })).toBeNull();
    expect(() => validateRegistration({ email: 'a@b.fr', password: 'password', confirmPassword: 'password', adult: true, terms: true, privacy: true }, null)).toThrow();
  });
  it('refuse un formulaire dont la déclaration est incomplète', () => {
    const out = validateRegistration({ email: 'a@b.fr', password: 'password', confirmPassword: 'different', adult: false, terms: false, privacy: false }, documents);
    expect(Object.keys(out.errors).sort()).toEqual(['adult', 'confirmPassword', 'privacy', 'terms']);
  });
});

describe('parcours d’authentification', () => {
  it('ne bascule jamais en démonstration si le client est absent', () => {
    render(<AuthApplication client={null} documents={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/pas disponible/);
    expect(screen.queryByRole('button', { name: 'Se connecter' })).toBeNull();
  });
  it('inscrit uniquement après validation, transmet les versions et demande la confirmation', async () => {
    const fake = createFakeSupabase();
    render(<AuthApplication client={fake.client} documents={documents} />);
    await waitFor(() => expect(screen.queryByText('Nous retrouvons ta session…')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    fill('Ton e-mail', 'A@B.fr'); fill('Mot de passe', 'motdepasse'); fill('Confirmer le mot de passe', 'motdepasse');
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    await screen.findByRole('alert');
    expect(fake.auth.signUp).not.toHaveBeenCalled();
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    await screen.findByRole('heading', { name: 'Consulte tes e-mails.' });
    expect(fake.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.fr', options: expect.objectContaining({
      data: { registration_consent: { declared_adult: true, accepted_terms: true, privacy_acknowledged: true, terms_version: 'v1', privacy_version: 'v1' } },
    }) }));
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();
  });
  it('envoie une récupération avec un retour explicite et un message non révélateur', async () => {
    const fake = createFakeSupabase();
    render(<AuthApplication client={fake.client} documents={null} />);
    await screen.findByRole('button', { name: 'Mot de passe oublié ?' });
    fireEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    fill('Ton e-mail', 'A@B.fr');
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le lien' }));
    await waitFor(() => expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.fr', expect.objectContaining({ redirectTo: expect.stringContaining('/#/auth/callback') })));
    expect(screen.getByRole('status').textContent).toMatch(/Si un compte correspond/);
  });
  it('affiche la même confirmation si le serveur signale une adresse déjà utilisée', async () => {
    const fake = createFakeSupabase();
    fake.auth.signUp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'user_already_exists' } });
    render(<AuthApplication client={fake.client} documents={documents} />);
    await screen.findByRole('button', { name: 'Créer un compte' });
    fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    fill('Ton e-mail', 'a@b.fr'); fill('Mot de passe', 'motdepasse'); fill('Confirmer le mot de passe', 'motdepasse');
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    await screen.findByRole('heading', { name: 'Consulte tes e-mails.' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('reçoit PASSWORD_RECOVERY, refuse les mots de passe différents et déconnecte après succès', async () => {
    const fake = createFakeSupabase();
    render(<AuthApplication client={fake.client} documents={null} />);
    await screen.findByRole('button', { name: 'Mot de passe oublié ?' });
    act(() => fake.emitAuth('PASSWORD_RECOVERY', fakeSession()));
    await screen.findByLabelText('Nouveau mot de passe');
    expect(window.location.hash).toBe('#/auth/reset');
    fill('Nouveau mot de passe', 'nouveauMot'); fill('Confirmer le mot de passe', 'different');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
    await screen.findByRole('alert');
    expect(fake.auth.updateUser).not.toHaveBeenCalled();
    fill('Confirmer le mot de passe', 'nouveauMot');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
    await waitFor(() => expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'nouveauMot' }));
    await waitFor(() => expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    act(() => fake.emitAuth('SIGNED_OUT', null));
    await screen.findByRole('button', { name: 'Se connecter' });
  });
  it('retrouve le formulaire de récupération au rechargement et explique une session expirée', async () => {
    window.history.replaceState(null, '', '/#/auth/reset');
    const fake = createFakeSupabase();
    render(<AuthApplication client={fake.client} documents={null} />);
    await screen.findByText(/La session de récupération a expiré/);
    expect((screen.getByRole('button', { name: 'Enregistrer le mot de passe' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('ne montre pas l’espace connecté si la vérification serveur des conditions échoue', async () => {
    const fake = createFakeSupabase();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: fakeSession() }, error: null });
    fake.respond({ data: null, error: { code: 'PGRST205' } });
    render(<AuthApplication client={fake.client} documents={documents} />);
    await screen.findByRole('button', { name: 'Réessayer' });
    expect(screen.queryByText('Bienvenue, à toi et tes animaux.')).toBeNull();
  });
  it('recueille les déclarations d’un ancien compte et relit le serveur avant d’ouvrir son espace', async () => {
    const fake = createFakeSupabase();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: fakeSession() }, error: null });
    fake.respond({ data: null, error: null });
    render(<AuthApplication client={fake.client} documents={documents} />);
    await screen.findByRole('heading', { name: 'Avant de continuer.' });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByRole('alert');
    expect(fake.raw.rpc).not.toHaveBeenCalled();
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    fake.respond({ data: { user_id: fakeSession().user.id }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByRole('heading', { name: 'Bienvenue, à toi et tes animaux.' });
    expect(fake.raw.rpc).toHaveBeenCalledWith('accept_registration_terms', { p_terms: 'v1', p_privacy: 'v1', p_adult: true });
  });
  it('n’affiche jamais le détail serveur ou le code d’un lien expiré', async () => {
    window.history.replaceState(null, '', '/?error=secret-server-message&code=secret-code#/auth/callback');
    const fake = createFakeSupabase();
    render(<AuthApplication client={fake.client} documents={null} />);
    await screen.findByRole('heading', { name: 'Lien indisponible' });
    expect(document.body.textContent).not.toMatch(/secret/);
    expect(window.location.href).not.toMatch(/secret/);
  });
});
