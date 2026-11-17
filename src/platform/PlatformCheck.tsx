import { useEffect, useState, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabaseClient';
import { requestPasswordReset, resendConfirmation } from '../services/auth';
import { toAuthError } from '../services/errors';
import { nativeSessionStorage } from './sessionStorage';
import { startNativeAuth } from './nativeAuth';
import { getAuthRedirect } from './authRedirect';

/** Banc d'essai technique isolé : aucun composant produit ni jeu de données fictif. */
export default function PlatformCheck() {
  const auth = useAuth(supabase);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const native = Capacitor.isNativePlatform();
  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void startNativeAuth(supabase, setMessage).then((cleanup) => {
      if (disposed) cleanup(); else stop = cleanup;
    });
    return () => { disposed = true; stop?.(); };
  }, []);
  useEffect(() => () => { if (photo?.startsWith('blob:')) URL.revokeObjectURL(photo); }, [photo]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(toAuthError(error).message); }
    finally { setBusy(false); }
  };
  const login = (event: FormEvent) => {
    event.preventDefault();
    void auth.submit('login', { email, password }).then((ok) => { if (ok) setPassword(''); });
  };
  const buttonStyle = { minHeight: 44, padding: '10px 16px', cursor: 'pointer' };
  return <main style={{ maxWidth: 680, margin: 'auto', padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))', fontFamily: 'system-ui', color: '#16213a' }}>
    <h1>Furrix · essai web et mobile</h1>
    <p>Outil de recette technique. L’interface « Plein air » sera intégrée séparément.</p>
    <p>Plateforme : <strong>{Capacitor.getPlatform()}</strong> · session : <strong>{auth.status}</strong></p>
    <p>Retour de confirmation : <code style={{ overflowWrap: 'anywhere' }}>{getAuthRedirect(native, window.location.origin)}</code></p>
    {!supabase && <p role="alert">Configuration Supabase absente. Aucun compte ni session ne sont simulés. Configure les variables publiques avant la recette.</p>}
    <p role="status">{message || auth.error || auth.notice}</p>
    {auth.status !== 'signedIn' ? <form onSubmit={login} style={{ display: 'grid', gap: 12 }}>
      <h2>Connexion avec un compte DEV existant</h2>
      <label>E-mail <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: 'block', boxSizing: 'border-box', width: '100%', minHeight: 44 }} /></label>
      <label>Mot de passe <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: 'block', boxSizing: 'border-box', width: '100%', minHeight: 44 }} /></label>
      {Object.values(auth.fieldErrors).map((text) => <p role="alert" key={text}>{text}</p>)}
      <button style={buttonStyle} disabled={!supabase || auth.pending || auth.status === 'loading'}>Se connecter</button>
    </form> : <section><h2>Session ouverte</h2><p>Ferme complètement puis relance l’application pour tester la restauration.</p><button style={buttonStyle} disabled={auth.pending} onClick={() => { void auth.signOut(); }}>Déconnecter cet appareil</button></section>}
    <section><h2>Liens d’authentification</h2><p>Ces boutons envoient un e-mail réel via le projet configuré. Ils ne créent pas de compte.</p>
      <button style={buttonStyle} disabled={!supabase || !email || busy} onClick={() => { void run(async () => { await resendConfirmation(supabase!, email); setMessage('Si applicable, un lien de confirmation sera envoyé.'); }); }}>Renvoyer la confirmation</button>{' '}
      <button style={buttonStyle} disabled={!supabase || !email || busy} onClick={() => { void run(async () => { await requestPasswordReset(supabase!, email); setMessage('Si un compte correspond, un lien de récupération sera envoyé. Le formulaire de changement sera livré dans le lot authentification.'); }); }}>Envoyer un lien de récupération</button>
    </section>
    {native && <section><h2>Stockage sécurisé</h2><button style={buttonStyle} disabled={busy} onClick={() => { void run(async () => {
      const key = 'furrix-platform-probe';
      const expected = crypto.randomUUID();
      try {
        await nativeSessionStorage.setItem(key, expected);
        if (await nativeSessionStorage.getItem(key) !== expected) throw new Error('Échec du stockage.');
      } finally { await nativeSessionStorage.removeItem(key); }
      setMessage('Écriture, relecture et suppression du témoin réussies. Aucune session affichée.');
    }); }}>Tester le coffre de cet appareil</button></section>}
    <section><h2>Photo locale</h2><p>Prévisualisation uniquement : aucune photo n’est téléversée.</p>
      {native ? <button style={buttonStyle} disabled={busy} onClick={() => { void run(async () => {
        const image = await Camera.getPhoto({ source: CameraSource.Photos, resultType: CameraResultType.Uri, quality: 80 });
        if (image.webPath) setPhoto(image.webPath);
      }); }}>Choisir une photo</button> : <label>Choisir une photo <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPhoto(URL.createObjectURL(file)); }} /></label>}
      {photo && <><img src={photo} alt="Photo choisie pour le test" style={{ display: 'block', maxWidth: '100%', maxHeight: 240 }} /><button style={buttonStyle} onClick={() => setPhoto(null)}>Retirer l’aperçu</button></>}
    </section>
  </main>;
}
