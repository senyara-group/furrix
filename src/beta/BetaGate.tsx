import { useEffect, useState, type ReactNode } from 'react';
import type { FurrixClient } from '../services/supabaseClient';
import { acceptBetaNotice, getBetaStatus, type BetaStatus } from './access';
import './beta.css';

export default function BetaGate({ client, signOut, children }: { client: FurrixClient; signOut: () => Promise<boolean>; children: ReactNode }) {
  const [status, setStatus] = useState<BetaStatus | 'loading' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [adult, setAdult] = useState(false), [readNotice, setReadNotice] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true, running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try { const result = await getBetaStatus(client); if (active) setStatus(result); }
      catch { if (active) setStatus('error'); }
      finally { running = false; }
    };
    void check();
    const interval = window.setInterval(() => { void check(); }, 60_000);
    const focus = () => { void check(); };
    window.addEventListener('focus', focus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [client, attempt]);
  const leave = async () => {
    setBusy(true); setError('');
    try { if (!await signOut()) setError('Déconnexion impossible. Réessaie.'); }
    catch { setError('Déconnexion impossible. Réessaie.'); }
    finally { setBusy(false); }
  };
  if (status === 'active') return <div><div className="beta-ribbon" role="status">Bêta privée · Version de test</div>{children}</div>;
  return <main className="furrix-beta"><a href="#/" className="beta-brand">furrix<span>●</span></a><p className="beta-label">Bêta privée</p>
    <h1>{status === 'pending' ? 'Bienvenue parmi les premiers.' : status === 'denied' ? 'Un espace sur invitation.' : status === 'error' ? 'Accès impossible à vérifier.' : 'Vérification de ton accès…'}</h1>
    {status === 'loading' && <p role="status">Un instant, nous vérifions ton invitation.</p>}
    {status === 'denied' && <p>Ce compte n’a pas d’accès actif à la bêta privée. Contacte Guillaume pour vérifier ton invitation.</p>}
    {status === 'error' && <><p role="alert">Nous n’avons pas pu vérifier ton accès. Aucun accès aux données n’est ouvert.</p><button onClick={() => { setStatus('loading'); setAttempt((n) => n + 1); }}>Réessayer</button></>}
    {status === 'pending' && <><p>Furrix est en cours de construction. Cette phase est réservée aux testeurs autorisés.</p>
      <ul><li>Utilise des données de test, sans document personnel ou information sensible.</li><li>Les rencontres, gardes et services ne sont pas opérationnels : n’organise aucune prestation réelle.</li><li>Les données de test peuvent être réinitialisées ; ne t’en sers pas comme carnet ou sauvegarde.</li></ul>
      <p>Cette notice de test ne remplace pas les documents d’utilisation prévus avant l’ouverture publique.</p>
      <label><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />Je déclare avoir au moins 18 ans.</label>
      <label><input type="checkbox" checked={readNotice} onChange={(e) => setReadNotice(e.target.checked)} />J’ai lu la notice et souhaite participer aux tests.</label>
      <button disabled={busy} onClick={() => { void (async () => {
        setBusy(true); setError('');
        try { await acceptBetaNotice(client, adult, readNotice); setStatus('loading'); setAttempt((n) => n + 1); }
        catch { setError('Confirme les deux déclarations. Si le problème persiste, contacte Guillaume.'); }
        finally { setBusy(false); }
      })(); }}>Entrer dans la bêta</button></>}
    {error && <p role="alert">{error}</p>}
    <button className="beta-secondary" disabled={busy} onClick={() => { void leave(); }}>Déconnecter cet appareil</button>
  </main>;
}
