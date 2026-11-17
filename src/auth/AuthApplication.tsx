import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '../hooks/useAuth';
import type { FurrixClient } from '../services/supabaseClient';
import { supabase } from '../services/supabaseClient';
import * as authService from '../services/auth';
import { toAuthError } from '../services/errors';
import { startNativeAuth } from '../platform/nativeAuth';
import { validateEmail, validateNewPassword } from '../validation/auth';
import { legalDocuments, validateRegistration, type LegalDocuments, type RegistrationForm } from './registration';
import { acceptDocuments, hasAcceptedDocuments } from './consentService';
import { Alert, Button, Checkbox, Field, FurrixScope, Input } from '../design-system';
import './auth.css';
import BetaGate from '../beta/BetaGate';
import BetaInvitation from '../beta/BetaInvitation';

type View = 'login' | 'signup' | 'confirmation' | 'forgot' | 'reset' | 'callback' | 'invite';
const blank: RegistrationForm = { email: '', password: '', confirmPassword: '', adult: false, terms: false, privacy: false };
const titles: Record<View, string> = { login: 'Heureux de te retrouver.', signup: 'Bienvenue chez Furrix.',
  confirmation: 'Consulte tes e-mails.', forgot: 'Retrouvons ton compte.', reset: 'Un nouveau départ.', callback: 'Vérification du lien…', invite: 'Ton invitation' };

function initialView(): View {
  if (window.location.hash.startsWith('#/auth/invite')) return 'invite';
  if (window.location.hash.startsWith('#/auth/reset')) return 'reset';
  return window.location.hash.startsWith('#/auth/callback') ? 'callback' : 'login';
}

function Declarations({ form, set, documents }: { form: RegistrationForm; set: (key: keyof RegistrationForm, value: boolean) => void; documents: LegalDocuments }) {
  return <div className="fa-checks">
    <Checkbox checked={form.adult} onChange={(e) => set('adult', e.target.checked)}>Je déclare avoir au moins 18 ans.</Checkbox>
    <Checkbox checked={form.terms} onChange={(e) => set('terms', e.target.checked)}>
      J’accepte les <a href={documents.termsUrl} target="_blank" rel="noopener noreferrer">conditions d’utilisation</a>.</Checkbox>
    <Checkbox checked={form.privacy} onChange={(e) => set('privacy', e.target.checked)}>
      J’ai pris connaissance de la <a href={documents.privacyUrl} target="_blank" rel="noopener noreferrer">politique de confidentialité</a>.</Checkbox>
  </div>;
}

/** Connexion, inscription et récupération ; contrôles du design system Plein air. */
export default function AuthApplication({ client = supabase, documents = legalDocuments(import.meta.env), renderAuthenticated,
  privateBeta = import.meta.env.VITE_PRIVATE_BETA === 'true' }: {
  client?: FurrixClient | null; documents?: LegalDocuments | null;
  renderAuthenticated?: (user: User, signOut: () => Promise<boolean>) => ReactNode;
  privateBeta?: boolean;
}) {
  const auth = useAuth(client);
  const [view, setView] = useState<View>(initialView);
  const [form, setForm] = useState<RegistrationForm>(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState<'loading' | 'required' | 'accepted' | 'error'>('loading');
  const [reloadConsent, setReloadConsent] = useState(0);
  const [callbackFailed, setCallbackFailed] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const set = (key: keyof RegistrationForm, value: string | boolean) => setForm((old) => ({ ...old, [key]: value }));
  const changeView = (next: View) => {
    window.history.replaceState(null, '', `${window.location.pathname}#/auth/${next}`);
    setView(next); setError(''); setMessage(''); auth.clearMessages();
    setForm((old) => ({ ...old, password: '', confirmPassword: '' }));
  };
  useEffect(() => { heading.current?.focus(); }, [view]);
  useEffect(() => {
    if (!client) return;
    let disposed = false, stop: (() => void) | undefined;
    void startNativeAuth(client, (text) => { setError(text); setCallbackFailed(true); }).then((cleanup) => {
      if (disposed) cleanup(); else stop = cleanup;
    });
    return () => { disposed = true; stop?.(); };
  }, [client]);
  useEffect(() => {
    if (auth.recovery) {
      window.history.replaceState(null, '', `${window.location.pathname}#/auth/reset`);
      setView('reset'); setError(''); setCallbackFailed(false);
    }
  }, [auth.recovery]);
  useEffect(() => {
    if (view !== 'callback' || auth.status === 'loading' || auth.recovery) return;
    const url = new URL(window.location.href);
    const badLink = url.searchParams.has('error') || url.searchParams.has('error_code')
      || url.hash.includes('error=') || url.hash.includes('error_code=');
    if (badLink || auth.status === 'signedOut') {
      setError('Ce lien est expiré ou invalide. Demande un nouveau lien depuis cet appareil.');
      setCallbackFailed(true);
    }
    // Les paramètres sensibles ne restent pas dans l'historique après initialisation du SDK.
    window.history.replaceState(null, '', `${url.pathname}#/auth/callback`);
  }, [view, auth.status, auth.recovery]);
  useEffect(() => {
    let active = true;
    if (privateBeta || !client || !auth.user || !documents) { setConsent('required'); return; }
    setConsent('loading');
    void hasAcceptedDocuments(client, auth.user.id, documents).then((accepted) => {
      if (active) setConsent(accepted ? 'accepted' : 'required');
    }).catch(() => {
      if (active) { setConsent('error'); setError('Impossible de vérifier les conditions du compte. Réessaie dans un instant.'); }
    });
    return () => { active = false; };
  }, [client, auth.user?.id, documents?.termsVersion, documents?.privacyVersion, reloadConsent, privateBeta]);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setError(''); auth.clearMessages();
    try { await action(); } catch (cause) { setError(toAuthError(cause).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!client) return;
    void run(async () => {
      if (view === 'signup') {
        const checked = validateRegistration(form, documents);
        if (!checked.credentials || Object.keys(checked.errors).length) {
          setError(Object.values(checked.errors).join(' ')); return;
        }
        await authService.signUp(client, checked.credentials, checked.consent);
        setForm((old) => ({ ...old, password: '', confirmPassword: '' }));
        setView('confirmation');
        setMessage('Si cette adresse peut être inscrite, un lien de confirmation lui a été envoyé. Ouvre-le sur cet appareil.');
      } else if (view === 'login') {
        await auth.submit('login', { email: form.email, password: form.password });
        setForm((old) => ({ ...old, password: '' }));
        setCallbackFailed(false);
      } else if (view === 'forgot') {
        const problem = validateEmail(form.email);
        if (problem) { setError(problem); return; }
        await authService.requestPasswordReset(client, form.email);
        setMessage('Si un compte correspond à cette adresse, un lien de récupération lui a été envoyé. Ouvre-le sur cet appareil.');
      } else if (view === 'reset') {
        const problem = validateNewPassword(form.password, form.confirmPassword);
        if (problem) { setError(problem); return; }
        if (auth.status !== 'signedIn') { setError('Demande un nouveau lien pour modifier ton mot de passe.'); return; }
        await authService.updatePassword(client, form.password);
        // La session de récupération ne devient pas silencieusement une session d'utilisation.
        await authService.signOut(client);
        auth.finishRecovery(); setView('login');
        window.history.replaceState(null, '', `${window.location.pathname}#/auth/login`);
        setForm((old) => ({ ...old, password: '', confirmPassword: '' }));
        setMessage('Mot de passe modifié. Connecte-toi avec ton nouveau mot de passe.');
      }
    });
  };
  const resend = () => {
    if (!client) return;
    void run(async () => {
      const problem = validateEmail(form.email);
      if (problem) { setError(problem); return; }
      await authService.resendConfirmation(client, form.email);
      setMessage('Si applicable, un nouveau lien de confirmation sera envoyé.');
    });
  };
  const logout = () => { void run(async () => {
    if (await auth.signOut()) { auth.finishRecovery(); setView('login'); setForm(blank); setCallbackFailed(false);
      window.history.replaceState(null, '', `${window.location.pathname}#/auth/login`); }
  }); };
  const working = busy || auth.pending;
  const notices = <>{(error || auth.error) && <Alert tone="err" title={error || auth.error} />}
    {(message || auth.notice) && <Alert tone="ok" title={message || auth.notice} />}</>;

  if (view === 'invite') return <BetaInvitation client={client} enabled={privateBeta}
    verified={() => { auth.startPasswordSetup(); setView('reset'); }} cancel={() => changeView('login')} />;

  if (privateBeta && client && auth.user && auth.status === 'signedIn'
      && !auth.recovery && view !== 'reset' && !callbackFailed) {
    const signOut = async () => {
      const ok = await auth.signOut();
      if (ok) { auth.finishRecovery(); setForm(blank); changeView('login'); }
      return ok;
    };
    return <BetaGate key={auth.user.id} client={client} signOut={signOut}>
      {renderAuthenticated ? renderAuthenticated(auth.user, signOut) : <p>Accès à la bêta confirmé.</p>}
    </BetaGate>;
  }

  if (renderAuthenticated && client && auth.user && auth.status === 'signedIn'
      && !auth.recovery && view !== 'reset' && !callbackFailed && documents && consent === 'accepted') {
    return <>{renderAuthenticated(auth.user, async () => {
      const ok = await auth.signOut();
      if (ok) { auth.finishRecovery(); setForm(blank); changeView('login'); }
      return ok;
    })}</>;
  }

  let content;
  if (!client) content = <><h1>Furrix arrive bientôt.</h1><p role="alert">Le service de connexion n’est pas disponible sur cet environnement. Réessaie plus tard.</p></>;
  else if (auth.status === 'loading') content = <p role="status">Nous retrouvons ta session…</p>;
  else if (callbackFailed && view === 'callback') content = <>{notices}<h1>Lien indisponible</h1><div className="fa-actions"><Button block onClick={() => changeView('forgot')}>Demander un nouveau lien</Button><Button block variant="out" onClick={() => changeView('login')}>Revenir à la connexion</Button></div></>;
  else if (auth.status === 'signedIn' && !auth.recovery && view !== 'reset') {
    content = <>{notices}{!documents ? <><h1>Compte connecté.</h1><p>L’ouverture du service est en préparation. Les documents d’utilisation seront disponibles avant de continuer.</p></>
      : consent === 'loading' ? <p role="status">Vérification du compte…</p>
      : consent === 'error' ? <><h1>Nous n’avons pas pu vérifier ton compte.</h1><Button onClick={() => setReloadConsent((n) => n + 1)}>Réessayer</Button></>
      : consent === 'required' ? <><h1>Avant de continuer.</h1><p>Merci de confirmer ces informations pour ton compte.</p>
        <Declarations form={form} set={set} documents={documents} />
        <Button block loading={busy} onClick={() => { void run(async () => {
          await acceptDocuments(client, documents, form.adult, form.terms, form.privacy);
          // Relire la trace serveur : pas d'accès à l'accueil sur un simple succès local.
          setReloadConsent((n) => n + 1);
        }); }}>Continuer</Button></>
      : <><p className="fa-eyebrow">Ton espace Furrix</p><h1>Bienvenue, à toi et tes animaux.</h1><p>Ton compte est prêt. L’accueil, les animaux et le menu « Plein air » arrivent au prochain lot.</p></>}
      <Button block variant="out" disabled={working} onClick={logout}>Déconnecter cet appareil</Button></>;
  } else content = <>
    <p className="fa-eyebrow">Rencontres · Garde · Services</p>
    {privateBeta && <p className="fa-hint">Bêta privée · Accès sur invitation</p>}
    <h1 ref={heading} tabIndex={-1}>{titles[view]}</h1>
    {notices}
    {view === 'reset' && auth.status !== 'signedIn' && <Alert tone="err" title="La session de récupération a expiré."
      actions={<Button size="sm" variant="ink" onClick={() => changeView('forgot')}>Demander un nouveau lien</Button>} />}
    {view === 'signup' && (privateBeta || !documents) ? <><p>{privateBeta ? 'La bêta privée est accessible sur invitation uniquement.' : 'Les inscriptions ne sont pas encore ouvertes.'}</p><Button block onClick={() => changeView('login')}>J’ai déjà un compte</Button></>
      : view === 'confirmation' ? <><p>Le lien confirme ton adresse. Ensuite, tu pourras retrouver ton espace.</p><div className="fa-actions"><Button block loading={busy} onClick={resend}>Renvoyer le lien</Button><Button block variant="out" onClick={() => changeView('login')}>Revenir à la connexion</Button></div></>
      : view === 'callback' ? <><p role="status">Nous vérifions ton lien…</p><Button block variant="out" onClick={() => changeView('login')}>Revenir à la connexion</Button></>
      : <form onSubmit={submit} className="fa-form">
        {view !== 'reset' && <Field label="Ton e-mail" error={auth.fieldErrors.email}><Input type="email" required autoComplete="username" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>}
        {view !== 'forgot' && <Field label={view === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'} error={auth.fieldErrors.password}
          hint={view === 'signup' || view === 'reset' ? 'Au moins 8 caractères. Utilise un mot de passe unique.' : undefined}>
          <Input type="password" required autoComplete={view === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>}
        {(view === 'signup' || view === 'reset') && <Field label="Confirmer le mot de passe"><Input type="password" required autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} /></Field>}
        {view === 'signup' && documents && <Declarations form={form} set={set} documents={documents} />}
        <Button type="submit" block loading={working} disabled={view === 'reset' && auth.status !== 'signedIn'}>
          {view === 'login' ? 'Se connecter' : view === 'signup' ? 'Créer mon compte' : view === 'forgot' ? 'Recevoir le lien' : 'Enregistrer le mot de passe'}
        </Button>
      </form>}
    {view === 'login' && <nav aria-label="Aide à la connexion" className="fa-links"><Button variant="quiet" size="sm" onClick={() => changeView('forgot')}>Mot de passe oublié ?</Button><Button variant="quiet" size="sm" onClick={() => changeView('signup')}>Créer un compte</Button><Button variant="quiet" size="sm" disabled={busy} onClick={resend}>Renvoyer l’e-mail de confirmation</Button></nav>}
    {(view === 'forgot' || view === 'reset') && <Button variant="quiet" size="sm" onClick={() => {
      if (view === 'reset') logout(); else changeView('login');
    }}>Revenir à la connexion</Button>}
    {documents && <footer><a href={documents.termsUrl} target="_blank" rel="noopener noreferrer">Conditions d’utilisation</a> · <a href={documents.privacyUrl} target="_blank" rel="noopener noreferrer">Confidentialité</a></footer>}
  </>;
  return <div className="furrix-auth"><aside><a className="fa-brand" href="#/">furrix<span>●</span></a><p className="fa-intro">Leur bonheur,<br />nos rencontres.</p><p>Un compagnon de balade, une garde attentionnée, les bons professionnels.</p><span className="fa-seal">Tout commence par une rencontre.</span></aside><main><FurrixScope className="fa-panel" aria-busy={working}>{content}</FurrixScope></main></div>;
}
