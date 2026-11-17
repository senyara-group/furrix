import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { FurrixClient } from '../services/supabaseClient';
import { supabase } from '../services/supabaseClient';
import * as authService from '../services/auth';
import { toAuthError } from '../services/errors';
import { startNativeAuth } from '../platform/nativeAuth';
import { validateEmail, validateNewPassword } from '../validation/auth';
import { legalDocuments, validateRegistration, type LegalDocuments, type RegistrationForm } from './registration';
import { acceptDocuments, hasAcceptedDocuments } from './consentService';
import './auth.css';

type View = 'login' | 'signup' | 'confirmation' | 'forgot' | 'reset' | 'callback';
const blank: RegistrationForm = { email: '', password: '', confirmPassword: '', adult: false, terms: false, privacy: false };
const titles: Record<View, string> = { login: 'Heureux de te retrouver.', signup: 'Bienvenue chez Furrix.',
  confirmation: 'Consulte tes e-mails.', forgot: 'Retrouvons ton compte.', reset: 'Un nouveau départ.', callback: 'Vérification du lien…' };

function initialView(): View {
  if (window.location.hash.startsWith('#/auth/reset')) return 'reset';
  return window.location.hash.startsWith('#/auth/callback') ? 'callback' : 'login';
}

function Declarations({ form, set, documents }: { form: RegistrationForm; set: (key: keyof RegistrationForm, value: boolean) => void; documents: LegalDocuments }) {
  return <div className="fa-checks">
    <label><input type="checkbox" checked={form.adult} onChange={(e) => set('adult', e.target.checked)} />Je déclare avoir au moins 18 ans.</label>
    <label><input type="checkbox" checked={form.terms} onChange={(e) => set('terms', e.target.checked)} />
      <span>J’accepte les <a href={documents.termsUrl} target="_blank" rel="noopener noreferrer">conditions d’utilisation</a>.</span></label>
    <label><input type="checkbox" checked={form.privacy} onChange={(e) => set('privacy', e.target.checked)} />
      <span>J’ai pris connaissance de la <a href={documents.privacyUrl} target="_blank" rel="noopener noreferrer">politique de confidentialité</a>.</span></label>
  </div>;
}

/** Première intégration auth ; les contrôles HTML seront remplaçables par les composants d'Alexis. */
export default function AuthApplication({ client = supabase, documents = legalDocuments(import.meta.env) }: {
  client?: FurrixClient | null; documents?: LegalDocuments | null;
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
    if (!client || !auth.user || !documents) { setConsent('required'); return; }
    setConsent('loading');
    void hasAcceptedDocuments(client, auth.user.id, documents).then((accepted) => {
      if (active) setConsent(accepted ? 'accepted' : 'required');
    }).catch(() => {
      if (active) { setConsent('error'); setError('Impossible de vérifier les conditions du compte. Réessaie dans un instant.'); }
    });
    return () => { active = false; };
  }, [client, auth.user?.id, documents?.termsVersion, documents?.privacyVersion, reloadConsent]);

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
  const notices = <>{(error || auth.error) && <p className="fa-error" role="alert">{error || auth.error}</p>}
    {(message || auth.notice) && <p className="fa-notice" role="status">{message || auth.notice}</p>}</>;

  let content;
  if (!client) content = <><h1>Furrix arrive bientôt.</h1><p role="alert">Le service de connexion n’est pas disponible sur cet environnement. Réessaie plus tard.</p></>;
  else if (auth.status === 'loading') content = <p role="status">Nous retrouvons ta session…</p>;
  else if (callbackFailed && view === 'callback') content = <>{notices}<h1>Lien indisponible</h1><button onClick={() => changeView('forgot')}>Demander un nouveau lien</button><button className="fa-secondary" onClick={() => changeView('login')}>Revenir à la connexion</button></>;
  else if (auth.status === 'signedIn' && !auth.recovery && view !== 'reset') {
    content = <>{notices}{!documents ? <><h1>Compte connecté.</h1><p>L’ouverture du service est en préparation. Les documents d’utilisation seront disponibles avant de continuer.</p></>
      : consent === 'loading' ? <p role="status">Vérification du compte…</p>
      : consent === 'error' ? <><h1>Nous n’avons pas pu vérifier ton compte.</h1><button onClick={() => setReloadConsent((n) => n + 1)}>Réessayer</button></>
      : consent === 'required' ? <><h1>Avant de continuer.</h1><p>Merci de confirmer ces informations pour ton compte.</p>
        <Declarations form={form} set={set} documents={documents} />
        <button disabled={busy} onClick={() => { void run(async () => {
          await acceptDocuments(client, documents, form.adult, form.terms, form.privacy);
          // Relire la trace serveur : pas d'accès à l'accueil sur un simple succès local.
          setReloadConsent((n) => n + 1);
        }); }}>Continuer</button></>
      : <><p className="fa-eyebrow">Ton espace Furrix</p><h1>Bienvenue, à toi et tes animaux.</h1><p>Ton compte est prêt. L’accueil, les animaux et le menu « Plein air » arrivent au prochain lot.</p></>}
      <button className="fa-secondary" disabled={busy || auth.pending} onClick={logout}>Déconnecter cet appareil</button></>;
  } else content = <>
    <p className="fa-eyebrow">Rencontres · Garde · Services</p>
    <h1 ref={heading} tabIndex={-1}>{titles[view]}</h1>
    {notices}
    {view === 'reset' && auth.status !== 'signedIn' && <p role="alert">La session de récupération a expiré. <button className="fa-link" onClick={() => changeView('forgot')}>Demander un nouveau lien</button></p>}
    {view === 'signup' && !documents ? <><p>Les inscriptions ne sont pas encore ouvertes.</p><button onClick={() => changeView('login')}>J’ai déjà un compte</button></>
      : view === 'confirmation' ? <><p>Le lien confirme ton adresse. Ensuite, tu pourras retrouver ton espace.</p><button disabled={busy} onClick={resend}>Renvoyer le lien</button><button className="fa-secondary" onClick={() => changeView('login')}>Revenir à la connexion</button></>
      : view === 'callback' ? <><p role="status">Nous vérifions ton lien…</p><button className="fa-secondary" onClick={() => changeView('login')}>Revenir à la connexion</button></>
      : <form onSubmit={submit}>
        {view !== 'reset' && <label>Ton e-mail<input type="email" required autoComplete="username" value={form.email} onChange={(e) => set('email', e.target.value)} /></label>}
        {view !== 'forgot' && <label>{view === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}<input type="password" required autoComplete={view === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => set('password', e.target.value)} /></label>}
        {(view === 'signup' || view === 'reset') && <><p className="fa-hint">Au moins 8 caractères. Utilise un mot de passe unique.</p><label>Confirmer le mot de passe<input type="password" required autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} /></label></>}
        {view === 'signup' && documents && <Declarations form={form} set={set} documents={documents} />}
        {Object.values(auth.fieldErrors).map((text) => <p role="alert" key={text}>{text}</p>)}
        <button disabled={busy || auth.pending || (view === 'reset' && auth.status !== 'signedIn')}>
          {busy || auth.pending ? 'Un instant…' : view === 'login' ? 'Se connecter' : view === 'signup' ? 'Créer mon compte' : view === 'forgot' ? 'Recevoir le lien' : 'Enregistrer le mot de passe'}
        </button>
      </form>}
    {view === 'login' && <nav aria-label="Aide à la connexion"><button className="fa-link" onClick={() => changeView('forgot')}>Mot de passe oublié ?</button><button className="fa-link" onClick={() => changeView('signup')}>Créer un compte</button><button className="fa-link" disabled={busy} onClick={resend}>Renvoyer l’e-mail de confirmation</button></nav>}
    {(view === 'forgot' || view === 'reset') && <button className="fa-link" onClick={() => {
      if (view === 'reset') logout(); else changeView('login');
    }}>Revenir à la connexion</button>}
    {documents && <footer><a href={documents.termsUrl} target="_blank" rel="noopener noreferrer">Conditions d’utilisation</a> · <a href={documents.privacyUrl} target="_blank" rel="noopener noreferrer">Confidentialité</a></footer>}
  </>;
  return <div className="furrix-auth"><aside><a className="fa-brand" href="#/">furrix<span>●</span></a><p className="fa-intro">Leur bonheur,<br />nos rencontres.</p><p>Un compagnon de balade, une garde attentionnée, les bons professionnels.</p><span className="fa-seal">Tout commence par une rencontre.</span></aside><main><div className="fa-panel" aria-busy={busy || auth.pending}>{content}</div></main></div>;
}
