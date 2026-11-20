import {gardeHref} from './links';
import { useEffect, useState } from 'react';
import {
  ActionBar, Alert, Button, Card, DetailLayout, Facts, Field, Icon, Note, PageHeader, Recap, RecapRow, Select, Separator,
  Stack, StatusBadge, Text, Textarea, Who,
} from '../design-system';
import type { PetRow } from '../types/database';
import { AppError } from '../services/errors';
import type { FurrixClient } from '../services/supabaseClient';
import { SlotField } from '../meetings/SlotField';
import { usePetPhotoUrl } from '../meetings/usePetPhotoUrl';
import { createSittingRequest } from './service';
import { countUnits, kindLabel, money, nameOf, outdoorLabel, period, price, serviceLabel, serviceShort, speciesPlural, unitLabel, units } from './format';
import { isoOf, type Criteria } from './Search';
import type { SitterResult, SittingRequest, SittingService } from './types';

const sitterSubtitle = (s: Pick<SitterResult, 'kind' | 'distance_km' | 'city'>, service?: SittingService) =>
  [kindLabel[s.kind], service ? serviceShort[service] : null, s.distance_km !== null ? `≈ ${s.distance_km} km` : s.city].filter(Boolean).join(' · ');

/** Carte latérale : le gardien, les dates, l'animal et le montant (frais encore à définir). */
export function SummaryCard({ client, photo, name, subtitle, service, starts, ends, petName, unitPrice, count, paid }: {
  client: FurrixClient; photo?: string | null; name: string; subtitle: string; service: SittingService; starts?: string; ends?: string; petName?: string; unitPrice?: number; count?: number; paid?: boolean;
}) {
  const url = usePetPhotoUrl(client, photo);
  return <Card calm><Stack gap={3}>
    <Who photo={url ? { src: url, alt: '' } : undefined} initials={url ? undefined : name.charAt(0).toUpperCase()} name={name} subtitle={subtitle} />
    {starts && ends ? <><Separator />
      <p className="gd-ln"><Icon name="calendar" size={20} /><b className="fx-num">{period(starts, ends)}</b></p>
      <p className="fx-t-body-sm">{[count ? units(service, count) : null, serviceLabel[service].toLowerCase(), petName].filter(Boolean).join(' · ')}</p></> : null}
    {unitPrice && count ? <><Separator /><Recap>
      <RecapRow label={`${serviceLabel[service]} · ${units(service, count)} × ${price(unitPrice)}`} value={money(unitPrice * count)} />
      <RecapRow label="Frais de service Furrix" value="à définir" open />
      <RecapRow label={paid ? 'Payé' : 'Total'} value={`${money(unitPrice * count)} + frais`} total />
    </Recap></> : null}
  </Stack></Card>;
}

/** Fiche d'un gardien (planche « Fiche du gardien »). */
export function SitterFiche({ client, sitter, service, onBack, onAsk, onWrite }: { client: FurrixClient; sitter: SitterResult; service: SittingService; onBack: () => void; onAsk: () => void; onWrite: () => void }) {
  const name = nameOf(sitter.name);
  const url = usePetPhotoUrl(client, sitter.photo);
  const offered = sitter.services.find((s) => s.service === service) ?? sitter.services[0];
  const accepts = sitter.species.map((s) => speciesPlural[s] ?? s).join(', ');
  return <section aria-label="Fiche du gardien">
    <PageHeader back={{ label: 'Résultats', onClick: onBack }} title={name} subtitle={sitterSubtitle(sitter, offered?.service)} showTitleOnPhone />
    <DetailLayout
      aside={<Card calm><Stack gap={3}>
        <Text variant="kicker">Tarif fixé par {name}</Text>
        {offered ? <p className="gd-price fx-num"><span className="gd-price__v">{price(offered.price_cents)}</span> <span className="fx-t-body-sm">/ {unitLabel[offered.service][0]}, hors frais de service</span></p> : null}
        {sitter.services.length > 1 ? <><Separator /><ul className="gd-prices">
          {sitter.services.map((s) => <li key={s.service}><span>{serviceLabel[s.service]}</span><b className="fx-num">{price(s.price_cents)} / {unitLabel[s.service][0]}</b></li>)}
        </ul></> : null}
        <Separator />
        <p className="fx-t-body-sm">{sitter.busy ? 'Déjà pris sur une partie de tes dates.' : 'Disponible à tes dates, sous réserve de son accord.'}</p>
      </Stack></Card>}
      actions={<ActionBar>
        <Button icon="homeDoor" onClick={onAsk}>Demander une garde</Button>
        <Button variant="out" icon="message" onClick={onWrite}>Écrire à {name}</Button>
      </ActionBar>}>
      {url ? <img className="gd-photo" src={url} alt={`Photo choisie par ${name}`} />
        : <div className="gd-photo gd-photo--empty" role="img" aria-label={sitter.photo ? 'Photo en cours de chargement' : `${name} n’a pas encore ajouté de photo`}><Icon name="paw" size={40} /></div>}
      <Facts items={[
        { label: 'Formules', value: sitter.services.map((s) => serviceLabel[s.service]).join(', ') },
        { label: 'Accueille', value: sitter.max_weight_kg ? `${accepts} ≤ ${sitter.max_weight_kg} kg` : accepts },
        { label: 'Extérieur', value: outdoorLabel[sitter.outdoor] },
      ]} />
      <Stack gap={2}><Text variant="h2">Présentation</Text><Text variant="body">« {sitter.bio} »</Text><Text variant="body-sm">Texte rédigé par {name}.</Text></Stack>
      <Stack gap={2}><Text variant="h2">Ce qui est vérifié</Text>
        <Note>Les informations de cette fiche sont déclarées par {name} et ne sont pas vérifiées par Furrix. La vérification d’identité arrivera avec le paiement.</Note></Stack>
      <Stack gap={2}><Text variant="h2">Avis</Text><Text variant="body">Pas encore d’avis.</Text></Stack>
    </DetailLayout>
  </section>;
}

/** Poids minimal probable selon le gabarit, quand le poids n'est pas renseigné. */
const sizeMinKg: Record<string, number> = { petit: 0, moyen: 10, grand: 25 };
/** Animaux acceptés par le gardien : espèce, puis poids maximum s'il en a fixé un (poids, ou à défaut gabarit). */
function fits(pet: PetRow, sitter: Pick<SitterResult, 'species' | 'max_weight_kg'>) {
  if (!sitter.species.includes(pet.species)) return false;
  if (!sitter.max_weight_kg) return true;
  const kg = pet.weight ? Number.parseFloat(pet.weight.replace(',', '.')) : NaN;
  if (!Number.isNaN(kg)) return kg <= sitter.max_weight_kg;
  return (sizeMinKg[pet.size ?? ''] ?? 0) <= sitter.max_weight_kg;
}
const acceptsLabel = (s: SitterResult) => {
  const list = s.species.map((x) => (speciesPlural[x] ?? x).toLowerCase()).join(', ');
  return s.max_weight_kg ? `${list} de ${s.max_weight_kg} kg au plus` : list;
};

type Draft = { pet: string | null; service: SittingService; starts: string; ends: string; message: string; request: string };

/** Demande de garde (planches « Demande » et « Envoi impossible »). Aucun paiement à cette étape. */
export function RequestForm({ client, sitter, pets, criteria, onBack, onSent }: {
  client: FurrixClient; sitter: SitterResult; pets: PetRow[]; criteria: Criteria; onBack: () => void; onSent: (r: SittingRequest) => void;
}) {
  const name = nameOf(sitter.name);
  const storage = `furrix:garde-draft:${pets[0]?.owner_id??'sans-animal'}:${sitter.sitter_id}`;
  const offered = (s: SittingService) => sitter.services.find((x) => x.service === s);
  const [draft, setDraft] = useState<Draft>(() => {
    try { const saved = sessionStorage.getItem(storage); if (saved) {const parsed=JSON.parse(saved) as Draft;if(pets.some(p=>p.id===parsed.pet))return parsed;} } catch { /* sans stockage local */ }
    const service = offered(criteria.service) ? criteria.service : sitter.services[0]?.service ?? 'chez_gardien';
    const pet = pets.find((p) => p.id === criteria.pet && fits(p, sitter)) ?? pets.find((p) => fits(p, sitter));
    return { pet: pet?.id ?? null, service, starts: criteria.starts, ends: criteria.ends, message: '', request: crypto.randomUUID() };
  });
  const [errors, setErrors] = useState<{ pet?: string; dates?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<false | true | string>(false);
  useEffect(() => { try { sessionStorage.setItem(storage, JSON.stringify(draft)); } catch { /* sans stockage local */ } }, [draft, storage]);
  const set = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next,request:crypto.randomUUID() }));
  const accepted = pets.filter((p) => fits(p, sitter));
  const pet = accepted.find((p) => p.id === draft.pet);
  const unit = offered(draft.service)?.price_cents;
  const datesOk = !!draft.starts && !!draft.ends && new Date(draft.ends) > new Date(draft.starts);
  const count = datesOk ? countUnits(draft.service, isoOf(draft.starts), isoOf(draft.ends)) : undefined;
  const send = async () => {
    const problems: typeof errors = {};
    if (!pet) problems.pet = 'Choisis l’animal à faire garder.';
    if (!datesOk || new Date(draft.starts).getTime() <= Date.now()) problems.dates = 'Choisis un début de garde à venir et une fin après lui.';
    else if (new Date(draft.ends).getTime() - new Date(draft.starts).getTime() > 60 * 86400_000) problems.dates = 'Une garde dure 60 jours au plus.';
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true); setFailed(false);
    try {
      const saved = await createSittingRequest(client, { sitter: sitter.sitter_id, pet: pet!.id, service: draft.service, starts: isoOf(draft.starts), ends: isoOf(draft.ends), message: draft.message }, draft.request);
      try { sessionStorage.removeItem(storage); } catch { /* sans stockage local */ }
      onSent(saved);
    } catch (e) { setFailed(e instanceof AppError && e.code === 'rate_limited' ? e.message : true); } finally { setBusy(false); }
  };
  return <section aria-label="Demande">
    <PageHeader back={{ label: `Fiche de ${name}`, onClick: onBack }} title={`Demander une garde à ${name}`}
      status={failed ? <StatusBadge status="alert">Non envoyée</StatusBadge> : <StatusBadge status="draft">Brouillon</StatusBadge>} />
    <DetailLayout
      aside={<SummaryCard client={client} photo={sitter.photo} name={name} subtitle={sitterSubtitle(sitter, draft.service)} service={draft.service} petName={pet?.name}
        starts={datesOk ? isoOf(draft.starts) : undefined} ends={datesOk ? isoOf(draft.ends) : undefined} unitPrice={unit} count={count} />}
      actions={<ActionBar><Button variant="ink" icon={failed ? 'retry' : 'send'} loading={busy} disabled={!accepted.length} onClick={() => { void send(); }}>{failed ? 'Réessayer l’envoi' : 'Envoyer la demande'}</Button></ActionBar>}>
      {typeof failed === 'string' ? <Alert tone="err" title="La demande n’est pas partie">{failed}. Réessaie demain ; rien n’a été envoyé ni facturé.</Alert> : failed ? <Alert tone="err" title="Envoi de la demande non confirmé">Une réponse peut s’être perdue, ou une demande est déjà en cours avec {name}. Vérifie <a href={gardeHref({vue:'mes-gardes'})}>Mes gardes</a> avant de modifier les informations. Un nouvel essai identique conserve la même demande. Aucun paiement n’est effectué.</Alert> : null}
      <Stack gap={5}>
        {accepted.length ? <Field label="Animal" error={errors.pet}
          hint={accepted.length < pets.length ? `Seuls les animaux que ${name} accepte sont proposés (${acceptsLabel(sitter)}).` : undefined}>
          <Select value={pet?.id ?? ''} onChange={(e) => set({ pet: e.target.value || null })}>
            {!pet ? <option value="">Choisir un animal</option> : null}
            {accepted.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field> : <Alert tone="warn" title={`Aucun de tes animaux ne correspond à ${name}`}>{name} accepte : {acceptsLabel(sitter)}.</Alert>}
        <div className="gd-dates">
          <Stack gap={2}><Text variant="label" as="p">Début de la garde</Text>
            <SlotField label="Début de la garde" value={draft.starts} onChange={(starts) => set({ starts, ends: draft.ends && new Date(draft.ends) > new Date(starts) ? draft.ends : '' })} /></Stack>
          <Stack gap={2}><Text variant="label" as="p">Fin de la garde</Text>
            <SlotField label="Fin de la garde" value={draft.ends} min={draft.starts} placeholder="Choisir la fin" onChange={(ends) => set({ ends })} /></Stack>
        </div>
        {errors.dates ? <p className="fx-field__error" role="alert"><Icon name="warning" size={16} />{errors.dates}</p> : null}
        <Field label="Formule">
          <Select value={draft.service} onChange={(e) => set({ service: e.target.value as SittingService })}>
            {sitter.services.map((x) => <option key={x.service} value={x.service}>{serviceLabel[x.service]} · {price(x.price_cents)} / {unitLabel[x.service][0]}</option>)}
          </Select>
        </Field>
        <Field label={`Message à ${name}`} optional hint={`${name} voit le profil de ${pet?.name ?? 'ton animal'} et ce message avant de répondre.`}>
          <Textarea value={draft.message} maxLength={1000} rows={4} placeholder={`Habitudes, alimentation, ce qu’il faut savoir sur ${pet?.name ?? 'ton animal'}…`} onChange={(e) => set({ message: e.target.value })} />
        </Field>
      </Stack>
      <Alert tone="info" title="Aucun paiement maintenant">Tu paieras seulement si {name} accepte. La garde sera réservée une fois le paiement effectué.</Alert>
    </DetailLayout>
  </section>;
}
