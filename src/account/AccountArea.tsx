import {AndroidPushSettings} from '../push/PushProvider';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, FurrixScope, Input, Note, Stack } from '../design-system';
import type { FurrixClient } from '../services/supabaseClient';
import type { AccountOverview } from '../app/accountOverview';
import { toDataError } from '../services/errors';
import { SectorSettings } from '../lost-pets/LostPetsArea';
import { saveProfile, type SavedProfile } from './service';
import './account.css';

/** Profil partagé web/mobile et préférences d’alertes existantes, sans activation automatique. */
export default function AccountArea({ client, owner, email, profile, onSaved, onSignOut }: {
  client: FurrixClient; owner: string; email?: string; profile: AccountOverview['profile'];
  onSaved: (profile: SavedProfile) => void; onSignOut: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({ name: profile.name ?? '', city: profile.city ?? '' });
  const [saving, setSaving] = useState(false), [leaving, setLeaving] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [signOutError, setSignOutError] = useState('');
  const running = useRef(false), signingOut = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (running.current || signingOut.current) return;
    running.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const saved = await saveProfile(client, owner, draft);
      if (!alive.current) return;
      onSaved(saved); setDraft({ name: saved.name ?? '', city: saved.city ?? '' }); setNotice('Ton profil est enregistré.');
    } catch (cause) { if (alive.current) setError(toDataError(cause).message); }
    finally { running.current = false; if (alive.current) setSaving(false); }
  };
  const signOut = async () => {
    if (signingOut.current || running.current) return;
    signingOut.current = true; setLeaving(true); setSignOutError('');
    try { if (!await onSignOut() && alive.current) setSignOutError('La déconnexion n’a pas abouti. Réessaie.'); }
    catch { if (alive.current) setSignOutError('La déconnexion n’a pas abouti. Réessaie.'); }
    finally { signingOut.current = false; if (alive.current) setLeaving(false); }
  };
  return <FurrixScope><section className="app-page app-account">
    <p className="app-eyebrow">Ton espace personnel</p><h1>Mon compte</h1>
    <p>Ton profil est commun au web et à tes applications mobiles.</p>
    <Card><form onSubmit={event => { void submit(event); }} noValidate><Stack gap={4}>
      <h2>Ton profil</h2>
      <Field label="E-mail" hint="L’adresse de connexion à ton compte."><Input type="email" value={email ?? ''} readOnly /></Field>
      <Field label="Prénom" hint="Il apparaît auprès des autres propriétaires lors des rencontres."><Input autoComplete="given-name" value={draft.name} maxLength={80} required disabled={saving || leaving} onChange={event => { setDraft(d => ({ ...d, name: event.target.value })); setNotice(''); }} /></Field>
      <Field label="Ville" optional hint="Ce champ ne modifie ni la ville de tes animaux ni ta zone d’alertes."><Input autoComplete="address-level2" value={draft.city} maxLength={80} disabled={saving || leaving} onChange={event => { setDraft(d => ({ ...d, city: event.target.value })); setNotice(''); }} /></Field>
      {error && <Alert tone="err" title="Profil non enregistré">{error}</Alert>}
      {notice && <Alert tone="ok" title={notice} />}
      <Button type="submit" loading={saving} disabled={leaving}>Enregistrer mon profil</Button>
    </Stack></form></Card>
    <Card><SectorSettings client={client} owner={owner} activationVariant="out" /></Card>
    <Card><Stack gap={3}><h2>Mon activité</h2><p>Propose tes services avec ce compte, tout en conservant ton espace personnel.</p><a className="app-outline" href="#/services?vue=profil">Mon activité professionnelle</a><a className="app-outline" href="#/garde?vue=profil">Mon profil de gardien</a></Stack></Card>
    <AndroidPushSettings/><Card><Stack gap={3}><h2>Cet appareil</h2><Note>La déconnexion ferme ta session sur cet appareil. Tes autres appareils restent connectés.</Note>
      <Button variant="out" loading={leaving} disabled={saving} onClick={() => { void signOut(); }}>Déconnecter cet appareil</Button>
      {signOutError && <Alert tone="err" title={signOutError} />}
    </Stack></Card>
  </section></FurrixScope>;
}
