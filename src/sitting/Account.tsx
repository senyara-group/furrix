import { useEffect, useRef, useState } from 'react';
import {
  ActionBar, Alert, Button, Card, DetailLayout, EmptyState, Field, Icon, Input, ListHeader, Loading, Note, OptionGroup, PageHeader, ResultList, ResultRow,
  Row, Segmented, Stack, StatusBadge, Text, Textarea,
} from '../design-system';
import type { FurrixClient } from '../services/supabaseClient';
import { approximateLocation, locateTown, LocationError, locationMessage } from '../meetings/location';
import { CityInput } from '../places/CityInput';
import { cityLabel } from '../places/cities';
import { decimalInput, digitsOnly, euroCents } from '../validation/numbers';
import { listMySittings, listSittingThreads, mySitterProfile, saveSitterOffer, setSitterPhoto } from './service';
import { usePetPhotoUrl } from '../meetings/usePetPhotoUrl';
import { capacityLabel, dayLong, kindLabel, nameOf, outdoorLabel, phaseOf, SERVICES, serviceLabel, shortPeriod, speciesPlural, statusOf, unitLabel, WEEKDAYS } from './format';
import { chatHref, gardeHref } from './links';
import type { MySitting, ServicePrice, SitterAbsence, SitterKind, SitterOutdoor, SittingService, SittingThread } from './types';

function SittingRow({ s }: { s: MySitting }) {
  const name = nameOf(s.other_name, s.role === 'owner' ? 'Le gardien' : 'Le propriétaire');
  const badge = statusOf(phaseOf(s), s.role, name, s.cancelled_by === (s.role === 'owner' ? s.owner_id : s.sitter_id));
  return <li><ResultRow as="a" href={gardeHref({ vue: 'suivi', demande: s.id })} initials={(s.role === 'owner' ? name : s.pet_name).charAt(0).toUpperCase()}
    name={s.role === 'owner' ? `${s.pet_name} chez ${name}` : `${s.pet_name} et ${name}`}
    tag={<StatusBadge status={badge.status}>{badge.label}</StatusBadge>}
    meta={`${shortPeriod(s.starts_at, s.ends_at)} · ${serviceLabel[s.service]}`} /></li>;
}

/** Mes gardes : celles que je demande et celles que l'on me confie, puis les conversations sans demande. */
export function MySittings({ client }: { client: FurrixClient }) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; sittings: MySitting[]; threads: SittingThread[] }>({ status: 'loading', sittings: [], threads: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true; setState((s) => ({ ...s, status: 'loading' }));
    void Promise.all([listMySittings(client), listSittingThreads(client)]).then(([sittings, threads]) => { if (current) setState({ status: 'ready', sittings, threads }); })
      .catch(() => { if (current) setState({ status: 'error', sittings: [], threads: [] }); });
    return () => { current = false; };
  }, [client, attempt]);
  const asOwner = state.sittings.filter((s) => s.role === 'owner');
  const asSitter = state.sittings.filter((s) => s.role === 'sitter');
  const loose = state.threads.filter((t) => !t.sitting_id);
  return <section aria-label="Mes gardes">
    <PageHeader back={{ label: 'Faire garder', onClick: () => { window.location.hash = gardeHref(); } }} title="Mes gardes" subtitle="Tes demandes de garde, et celles que l’on te confie si tu es gardien." showTitleOnPhone />
    <Row className="gd-shortcuts"><Button as="a" href={gardeHref({ vue: 'profil' })} variant="quiet" size="sm" icon="homeDoor">Mon profil de gardien</Button></Row>
    {state.status === 'loading' ? <Loading label="Chargement de tes gardes…" />
      : state.status === 'error' ? <Alert tone="err" title="Tes gardes n’ont pas pu être chargées." actions={<Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((a) => a + 1)}>Réessayer</Button>} />
      : !state.sittings.length && !loose.length ? <EmptyState icon="homeDoor" title="Pas encore de garde" action={<Button as="a" href={gardeHref()} variant="out" size="sm">Trouver un gardien</Button>}>
          Tes demandes et leurs réponses s’afficheront ici.
        </EmptyState>
      : <Stack gap={8}>
          {asSitter.length ? <Stack gap={2}><ListHeader title="On te confie" /><ResultList>{asSitter.map((s) => <SittingRow key={s.id} s={s} />)}</ResultList></Stack> : null}
          {asOwner.length ? <Stack gap={2}><ListHeader title="Tes demandes" /><ResultList>{asOwner.map((s) => <SittingRow key={s.id} s={s} />)}</ResultList></Stack> : null}
          {loose.length ? <Stack gap={2}><ListHeader title="Conversations" /><ResultList>{loose.map((t) => <li key={t.owner_id + t.sitter_id}>
            <ResultRow as="a" href={chatHref(t.owner_id, t.sitter_id)} initials={nameOf(t.other_name).charAt(0).toUpperCase()} name={nameOf(t.other_name, t.role === 'owner' ? 'Le gardien' : 'Le propriétaire')}
              meta={t.last_text ? `« ${t.last_text.length > 80 ? `${t.last_text.slice(0, 80)}…` : t.last_text} »` : 'Pas encore de message'} /></li>)}</ResultList></Stack> : null}
        </Stack>}
  </section>;
}

type Form = { kind: SitterKind; bio: string; city: string; place: { latitude: number; longitude: number; label: string } | null; species: string[];
  maxWeight: string; outdoor: SitterOutdoor; prices: Partial<Record<SittingService, string>>; active: boolean;
  weekdays: number[]; capacity: string; absences: SitterAbsence[] };
/** Aujourd'hui, en date locale AAAA-MM-JJ (comme les champs de date). */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
/** « sam. 20 déc. 2026 → dim. 28 déc. 2026 » ; un seul jour : « sam. 20 déc. 2026 ». */
const absenceLabel = (a: SitterAbsence) => { const from = dayFmt.format(new Date(`${a.starts_on}T12:00:00`)); return a.starts_on === a.ends_on ? from : `${from} → ${dayFmt.format(new Date(`${a.ends_on}T12:00:00`))}`; };
const MAX_ABSENCES = 30;

/** Jours proposés, capacité et absences : ce qui fait apparaître (ou non) le gardien pour des dates. */
function AvailabilityFields({ form, set, error }: { form: Form; set: (next: Partial<Form>) => void; error?: string }) {
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [problem, setProblem] = useState('');
  const add = () => {
    const from = draft.from, to = draft.to || draft.from;
    if (!from) { setProblem('Choisis le premier jour de ton absence.'); return; }
    if (to < from) { setProblem('La fin de l’absence doit venir après son début.'); return; }
    if (to < today()) { setProblem('Cette période est déjà passée.'); return; }
    if (to > addDays(from, 366)) { setProblem('Une absence dure un an au plus.'); return; }
    if (form.absences.length >= MAX_ABSENCES) { setProblem(`${MAX_ABSENCES} périodes au plus : retire une période passée ou inutile.`); return; }
    setProblem(''); setDraft({ from: '', to: '' });
    set({ absences: [...form.absences, { starts_on: from, ends_on: to }].sort((a, b) => a.starts_on.localeCompare(b.starts_on)) });
  };
  return <Stack gap={4}>
    <Text variant="h2">Disponibilités</Text>
    <Stack gap={2}><Text variant="label" as="p">Jours proposés</Text>
      <OptionGroup multiple aria-label="Jours proposés" value={form.weekdays.map(String)} onChange={(list) => set({ weekdays: (list as string[]).map(Number).sort((a, b) => a - b) })}
        options={WEEKDAYS.map((d) => ({ value: String(d), label: dayLong[d - 1]!.charAt(0).toUpperCase() + dayLong[d - 1]!.slice(1) }))} />
      <Text variant="body-sm">Une demande doit tomber entièrement sur ces jours : pour une garde de plusieurs nuits, coche tous les jours où l’animal sera chez toi.</Text>
    </Stack>
    <Field label="Capacité d’accueil" hint={`Nombre de gardes acceptées que tu peux assurer en même temps. ${capacityLabel(Number(form.capacity) || 1)}.`} error={error}>
      <Input value={form.capacity} inputMode="numeric" maxLength={2} className="fx-num" placeholder="1" onChange={(e) => set({ capacity: digitsOnly(e.target.value, 2) })} />
    </Field>
    <Stack gap={2}><Text variant="label" as="p">Périodes indisponibles</Text>
      <Text variant="body-sm">Vacances, déplacements : tu n’apparais pas dans la recherche sur ces dates. Tu es la seule personne à les voir.</Text>
      {form.absences.length ? <ul className="gd-absences">{form.absences.map((a, i) => <li key={`${a.starts_on}-${a.ends_on}-${i}`}>
        <span className="fx-num">{absenceLabel(a)}</span>
        <Button variant="quiet" size="sm" icon="close" aria-label={`Retirer la période ${absenceLabel(a)}`} onClick={() => set({ absences: form.absences.filter((_, j) => j !== i) })}>Retirer</Button>
      </li>)}</ul> : <Text variant="body-sm">Aucune période pour l’instant.</Text>}
      <div className="gd-absence-add">
        <Field label="Du"><Input type="date" value={draft.from} min={today()} onChange={(e) => { setProblem(''); setDraft((d) => ({ from: e.target.value, to: d.to && d.to < e.target.value ? '' : d.to })); }} /></Field>
        <Field label="Au" optional><Input type="date" value={draft.to} min={draft.from || today()} onChange={(e) => { setProblem(''); setDraft((d) => ({ ...d, to: e.target.value })); }} /></Field>
        <Button variant="out" size="sm" icon="calendar" onClick={add}>Ajouter la période</Button>
      </div>
      {problem ? <p className="fx-field__error" role="alert"><Icon name="warning" size={16} />{problem}</p> : null}
    </Stack>
  </Stack>;
}
const cents = (v: string) => euroCents(v) ?? Number.NaN;
const euros = (c: number) => (c / 100).toFixed(c % 100 ? 2 : 0).replace('.', ',');

/** Proposer des gardes : présentation, zone, animaux accueillis, formules et tarifs. Informations déclarées, non vérifiées. */
export function SitterProfileForm({ client, userId }: { client: FurrixClient; userId: string }) {
  const [form, setForm] = useState<Form | null>(null);
  const [exists, setExists] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [errors, setErrors] = useState<{ bio?: string; place?: string; species?: string; prices?: string; weight?: string; availability?: string }>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'saved' | 'failed' | null>(null);
  const [locating, setLocating] = useState<'town' | 'device' | null>(null);
  const locationVersion=useRef(0);
  useEffect(()=>()=>{locationVersion.current++;},[]);
  const [locError, setLocError] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const photoUrl = usePetPhotoUrl(client, photo);
  useEffect(() => {
    let current = true; setLoadError(false);
    void mySitterProfile(client, userId).then((data) => {
      if (!current) return;
      setExists(!!data);
      setPhoto(data?.profile.photo ?? null);
      setForm(data ? {
        kind: data.profile.kind, bio: data.profile.bio, city: data.profile.city, species: data.profile.species, outdoor: data.profile.outdoor, active: data.profile.active,
        place: { latitude: data.profile.latitude, longitude: data.profile.longitude, label: data.profile.city }, maxWeight: data.profile.max_weight_kg ? String(data.profile.max_weight_kg) : '',
        prices: Object.fromEntries(data.services.map((s) => [s.service, euros(s.price_cents)])),
        weekdays: data.profile.weekdays?.length ? data.profile.weekdays : [...WEEKDAYS], capacity: String(data.profile.capacity ?? 1),
        absences: data.absences.filter((a) => a.ends_on >= today()),
      } : { kind: 'particulier', bio: '', city: '', place: null, species: ['chien'], maxWeight: '', outdoor: 'sans_jardin', prices: { chez_gardien: '' }, active: true,
        weekdays: [...WEEKDAYS], capacity: '1', absences: [] });
    }).catch(() => { if (current) setLoadError(true); });
    return () => { current = false; };
  }, [client, userId, loadAttempt]);
  if (loadError) return <Alert tone="err" title="Ton profil de gardien n’a pas pu être chargé." actions={<Button variant="out" size="sm" icon="retry" onClick={() => setLoadAttempt((a) => a + 1)}>Réessayer</Button>}>
    Vérifie ta connexion. Rien n’a été modifié.</Alert>;
  if (!form) return <Loading label="Chargement de ton profil de gardien…" />;
  const set = (next: Partial<Form>) => { setForm(current=>current?{...current,...next}:current); setResult(null); };
  const locate = async (how: 'town' | 'device') => {
    const version=++locationVersion.current;setLocating(how); setLocError('');
    try {
      const found = how === 'town' ? await locateTown(form.city,AbortSignal.timeout(15000)) : { ...(await approximateLocation()), label: form.city || 'Ma position' };
      if(version===locationVersion.current)set({ place: { latitude: found.latitude, longitude: found.longitude, label: found.label }, city: form.city || found.label.split(' · ')[0] });
    } catch (e) { if(version===locationVersion.current)setLocError(e instanceof LocationError ? locationMessage[e.reason] : 'La zone n’a pas pu être trouvée. Réessaie.'); }
    finally { if(version===locationVersion.current)setLocating(null); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true); setPhotoMessage(null);
    try { setPhoto(await setSitterPhoto(client, userId, file)); setPhotoMessage({ ok: true, text: 'Photo enregistrée : elle s’affiche sur ta fiche.' }); }
    catch (e) { setPhotoMessage({ ok: false, text: e instanceof Error && e.message ? e.message : 'La photo n’a pas été enregistrée. Réessaie.' }); }
    finally { setPhotoBusy(false); }
  };
  const save = async () => {
    const problems: typeof errors = {};
    const services: ServicePrice[] = [];
    if (form.bio.trim().length < 20) problems.bio = 'Présente-toi en quelques phrases (20 caractères au moins).';
    if (!form.place || form.city.trim().length < 2) problems.place = 'Indique ta ville, puis trouve-la pour situer ta zone.';
    if (!form.species.length) problems.species = 'Choisis au moins un animal accueilli.';
    for (const s of SERVICES) {
      const v = form.prices[s]; if (v === undefined) continue;
      const c = cents(v);
      if (!Number.isFinite(c) || c < 100 || c > 100000) { problems.prices = 'Chaque tarif va de 1 € à 1 000 €.'; break; }
      services.push({ service: s, price_cents: c });
    }
    if (!services.length && !problems.prices) problems.prices = 'Propose au moins une formule avec son tarif.';
    const weight = form.maxWeight.trim() ? Number(form.maxWeight) : null;
    if (weight !== null && (!Number.isInteger(weight) || weight < 1 || weight > 120)) problems.weight = 'Indique un poids entre 1 et 120 kg, ou laisse vide.';
    const capacity = Number(form.capacity);
    if (!form.weekdays.length) problems.availability = 'Choisis au moins un jour proposé.';
    else if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10) problems.availability = 'Indique une capacité d’accueil entre 1 et 10.';
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true); setResult(null);
    try {
      await saveSitterOffer(client, { kind: form.kind, bio: form.bio, city: form.city, latitude: form.place!.latitude, longitude: form.place!.longitude,
        species: form.species, max_weight_kg: weight, outdoor: form.outdoor, services, active: form.active },
        { weekdays: form.weekdays, capacity, absences: form.absences.filter((a) => a.ends_on >= today()) });
      setExists(true); setResult('saved');
    } catch { setResult('failed'); } finally { setBusy(false); }
  };
  const error = (text?: string) => text ? <p className="fx-field__error" role="alert"><Icon name="warning" size={16} />{text}</p> : null;
  return <section aria-label="Mon profil de gardien">
    <PageHeader back={{ label: 'Faire garder', onClick: () => { window.location.hash = gardeHref(); } }} title={exists ? 'Mon profil de gardien' : 'Proposer des gardes'}
      status={exists ? <StatusBadge status={form.active ? 'ok' : 'stop'}>{form.active ? 'Visible' : 'En pause'}</StatusBadge> : undefined}
      subtitle="Les propriétaires voient ton prénom, ta ville, une distance arrondie, ta présentation et tes tarifs. Jamais ton adresse." showTitleOnPhone />
    <DetailLayout
      aside={<Card calm><Stack gap={3}><Text variant="kicker">Bon à savoir</Text>
        <Text variant="body-sm">Tu restes libre d’accepter ou de refuser chaque demande, sans justification.</Text>
        <Text variant="body-sm">Une demande acceptée n’est réservée qu’après le paiement du propriétaire. La commission Furrix et le moment du versement sont encore à définir.</Text>
        <Text variant="body-sm">Tes jours, ta capacité et tes absences décident des dates où tu apparais. Une demande déjà reçue reste à toi d’accepter ou non.</Text>
        <Text variant="body-sm">Assurance et déclaration d’activité : ces conditions seront précisées avant l’ouverture des paiements.</Text>
      </Stack></Card>}
      actions={<ActionBar><Button icon="check" loading={busy} onClick={() => { void save(); }}>{exists ? 'Enregistrer' : 'Publier mon profil'}</Button></ActionBar>}>
      {result === 'saved' ? <Alert tone="ok" title={form.active ? 'Profil enregistré' : 'Profil en pause'}>{form.active ? 'Les propriétaires proches peuvent te trouver dans la recherche.' : 'Tu n’apparais plus dans la recherche. Tes gardes en cours ne changent pas.'}</Alert> : null}
      {result === 'failed' ? <Alert tone="err" title="Ton profil n’a pas été enregistré">Vérifie les informations et réessaie.</Alert> : null}
      {exists ? <Stack gap={2}><Text variant="label" as="p">Visibilité</Text>
        <Segmented aria-label="Visibilité" value={form.active ? 'on' : 'off'} onChange={(v) => set({ active: v === 'on' })} options={[{ value: 'on', label: 'Je reçois des demandes' }, { value: 'off', label: 'En pause' }]} /></Stack> : null}
      <Stack gap={5}>
        <Stack gap={2}><Text variant="label" as="p">Photo de ta fiche</Text>
          {exists ? <div className="gd-photoedit">
            {photoUrl ? <img className="gd-photo" src={photoUrl} alt="Ta photo de gardien" /> : <div className="gd-photo gd-photo--empty" role="img" aria-label="Pas encore de photo"><Icon name="paw" size={40} /></div>}
            <label className="gd-upload fx-btn fx-btn--out fx-btn--sm" aria-busy={photoBusy || undefined}>{photoBusy ? 'Envoi…' : photo ? 'Changer la photo' : 'Ajouter une photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Photo de ta fiche de gardien" disabled={photoBusy}
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void upload(file); }} /></label>
            <Text variant="body-sm">Toi, ton jardin, un animal que tu gardes… JPEG, PNG ou WebP, 5 Mo maximum. Visible seulement des membres connectés.</Text>
            {photoMessage ? <p role="status" className={photoMessage.ok ? 'fx-hint' : 'fx-field__error'}>{photoMessage.text}</p> : null}
          </div> : <Text variant="body-sm">Tu pourras ajouter ta photo juste après avoir publié ton profil.</Text>}
        </Stack>
        <Stack gap={2}><Text variant="label" as="p">Tu es</Text>
          <OptionGroup aria-label="Statut" value={form.kind} onChange={(kind) => set({ kind })} options={(['particulier', 'professionnel'] as const).map((k) => ({ value: k, label: kindLabel[k] }))} />
          <Text variant="body-sm">« Professionnel » signifie déclaré comme tel : Furrix ne le vérifie pas encore.</Text></Stack>
        <Field label="Présentation" hint="Ton logement, ton rythme, tes balades : ce qui rassure un propriétaire." error={errors.bio}>
          <Textarea value={form.bio} maxLength={1000} rows={5} placeholder="J’habite une maison avec jardin. Je télétravaille, donc je suis là la journée…" onChange={(e) => set({ bio: e.target.value })} />
        </Field>
        <Stack gap={2}>
          <Field label="Ville" hint={form.place ? `Zone enregistrée autour de : ${form.place.label} (environ 1 km).` : 'Seule une zone d’environ 1 km est enregistrée, pour calculer les distances.'}>
            <CityInput value={form.city} placeholder="Ex. Lambersart" onChange={(v) => {locationVersion.current++;setLocating(null);set({ city: v, place: null });}}
              onPick={(c) => { locationVersion.current++; setLocating(null); setLocError(''); set({ city: c.name, place: { latitude: c.latitude, longitude: c.longitude, label: cityLabel(c) } }); }} />
          </Field>
          <Row className="gd-locate">
            <Button variant="out" size="sm" icon="search" loading={locating === 'town'} disabled={!!locating || form.city.trim().length < 2} onClick={() => { void locate('town'); }}>Trouver la ville</Button>
            <Button variant="quiet" size="sm" icon="pin" loading={locating === 'device'} disabled={!!locating} onClick={() => { void locate('device'); }}>Utiliser ma position</Button>
          </Row>
          {error(locError || errors.place)}
        </Stack>
        <Stack gap={2}><Text variant="label" as="p">Animaux accueillis</Text>
          <OptionGroup multiple aria-label="Animaux accueillis" value={form.species} onChange={(species) => set({ species })}
            options={['chien', 'chat', 'lapin', 'rongeur', 'oiseau', 'reptile'].map((s) => ({ value: s, label: speciesPlural[s] }))} />
          {error(errors.species)}</Stack>
        <Field label="Poids maximum (kg)" optional hint="Pour les chiens, par exemple 15." error={errors.weight}>
          <Input value={form.maxWeight} inputMode="numeric" maxLength={3} placeholder="15" onChange={(e) => set({ maxWeight: digitsOnly(e.target.value, 3) })} />
        </Field>
        <Stack gap={2}><Text variant="label" as="p">Extérieur</Text>
          <OptionGroup aria-label="Extérieur" value={form.outdoor} onChange={(outdoor) => set({ outdoor })} options={(['jardin_clos', 'jardin', 'sans_jardin'] as const).map((o) => ({ value: o, label: outdoorLabel[o] }))} /></Stack>
        <Stack gap={3}><Text variant="label" as="p">Formules et tarifs</Text>
          <OptionGroup multiple aria-label="Formules proposées" value={SERVICES.filter((s) => form.prices[s] !== undefined)}
            onChange={(list) => set({ prices: Object.fromEntries((list as SittingService[]).map((s) => [s, form.prices[s] ?? ''])) })} options={SERVICES.map((s) => ({ value: s, label: serviceLabel[s] }))} />
          {SERVICES.filter((s) => form.prices[s] !== undefined).map((s) => <Field key={s} label={`${serviceLabel[s]} : tarif par ${unitLabel[s][0]} (€)`}>
            <Input value={form.prices[s]} inputMode="decimal" maxLength={7} placeholder="20" className="fx-num" onChange={(e) => set({ prices: { ...form.prices, [s]: decimalInput(e.target.value, { integers: 4 }) } })} />
          </Field>)}
          {error(errors.prices)}
          <Note>Tes tarifs sont affichés hors frais de service Furrix, encore à définir.</Note>
        </Stack>
        <AvailabilityFields form={form} set={set} error={errors.availability} />
      </Stack>
    </DetailLayout>
  </section>;
}
