import { useEffect, useState } from 'react';
import type { FurrixClient } from '../services/supabaseClient';
import { invitationToken, verifyInvitation } from './invitation';
import { Alert, Button, FurrixScope } from '../design-system';
import './beta.css';

export default function BetaInvitation({ client, enabled, verified, cancel }: {
  client: FurrixClient | null; enabled: boolean; verified: () => void; cancel: () => void;
}) {
  const [token, setToken] = useState(() => invitationToken(window.location.hash));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { window.history.replaceState(null, '', `${window.location.pathname}#/auth/invite`); }, []);
  return <FurrixScope className="furrix-beta"><main><a className="beta-brand" href="#/">furrix<span>●</span></a><p className="beta-label">Invitation privée</p><h1>Fais tes premiers pas avec nous.</h1>
    {!enabled || !client || !token ? <Alert tone="err" title="Cette invitation n’est pas disponible.">Demande un nouveau lien à Guillaume.</Alert>
      : <><p>Confirme ton invitation pour choisir ton mot de passe. Ton accès aux données sera ensuite vérifié séparément.</p>
        <Button loading={busy} onClick={() => { void (async () => {
          setBusy(true); setError('');
          try { await verifyInvitation(client, token); setToken(null); verified(); }
          catch { setError('Invitation expirée ou impossible à confirmer. Demande un nouveau lien à Guillaume.'); }
          finally { setBusy(false); }
        })(); }}>Accepter mon invitation</Button></>}
    {error && <Alert tone="err" title={error} />}<div className="beta-leave"><Button variant="out" disabled={busy} onClick={cancel}>Revenir à la connexion</Button></div>
  </main></FurrixScope>;
}
