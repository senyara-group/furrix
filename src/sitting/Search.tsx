import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, ChipGroup, EmptyState, Field, Input, ListHeader, Loading, MapFrame, MapMarker, MapMe, MapNote, Note, OptionGroup,
  PageHeader, ResultList, ResultRow, Row, SearchLayout, Stack, Tag, Text, WhenBar,
} from '../design-system';
import type { PetRow } from '../types/database';
import type { FurrixClient } from '../services/supabaseClient';
import { approximateLocation, locateTown, LocationError, locationMessage } from '../meetings/location';
import { dayKey, SlotField } from '../meetings/SlotField';
import { searchSitters } from './service';
import { usePetPhotoUrl } from '../meetings/usePetPhotoUrl';
import { countUnits, initial, kindLabel, nameOf, price, SERVICES, serviceLabel, shortPeriod, unitLabel, units } from './format';
import { gardeHref } from './links';
import type { SitterKind, SitterResult, SittingService } from './types';

/** Critères de recherche, gardés dans l'onglet (jamais envoyés ailleurs qu'à la recherche). */
export type Criteria = { pet: string | null; service: SittingService; starts: string; ends: string; radius: number; place: { label: string; latitude: number; longitude: number } | null };
const KEY = 'furrix:garde-search';
const at = (days: number, hour: number) => `${dayKey(new Date(Date.now() + days * 86400_000))}T${String(hour).padStart(2, '0')}:00`;
const fresh = (pet: string | null): Criteria => ({ pet, service: 'chez_gardien', starts: at(2, 18), ends: at(4, 18), radius: 10, place: null });
const future = (local: string) => !!local && new Date(local).getTime() > Date.now();

export function useCriteria(pets: PetRow[]) {
  const [criteria, setCriteria] = useState<Criteria>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Criteria | null;
      if (saved && future(saved.starts) && new Date(saved.ends) > new Date(saved.starts)) return { ...saved, pet: pets.some((p) => p.id === saved.pet) ? saved.pet : pets[0]?.id ?? null };
    } catch { /* Sans stockage local : critères par défaut. */ }
    return fresh(pets[0]?.id ?? null);
  });
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(criteria)); } catch { /* Sans stockage local. */ } }, [criteria]);
  return [criteria, setCriteria] as const;
}
export const isoOf = (local: string) => new Date(local).toISOString();

/** Repères de la carte illustrative : distance réelle (arrondie), direction arbitraire mais stable. */
function spot(id: string, km: number | null, radius: number) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const angle = (h % 360) * Math.PI / 180;
  const r = Math.min(1, (km ?? radius / 2) / radius) * 36 + 6;
  const clamp = (v: number) => Math.max(12, Math.min(84, v));
  return { x: clamp(50 + r * Math.cos(angle)), y: clamp(48 + r * Math.sin(angle) * 0.8) };
}

function SitterRow({ client, sitter, service, onOpen }: { client: FurrixClient; sitter: SitterResult; service: SittingService; onOpen: () => void }) {
  const cents = sitter.price_cents ?? sitter.services.find((s) => s.service === service)?.price_cents;
  const url = usePetPhotoUrl(client, sitter.photo);
  return <li><ResultRow onClick={onOpen} photo={url ? { src: url, alt: '' } : undefined} initials={url ? undefined : initial(sitter.name)} name={nameOf(sitter.name)}
    tag={<Tag kind={sitter.kind === 'professionnel' ? 'pro' : undefined}>{kindLabel[sitter.kind]}</Tag>}
    meta={[serviceLabel[service], sitter.city, sitter.distance_km !== null ? `≈ ${sitter.distance_km} km` : null].filter(Boolean).join(' · ')}
    price={cents ? { value: price(cents), unit: `/ ${unitLabel[service][0]}` } : undefined} /></li>;
}

function CriteriaPanel({ pets, criteria, onApply, onClose }: { pets: PetRow[]; criteria: Criteria; onApply: (c: Criteria) => void; onClose?: () => void }) {
  const [draft, setDraft] = useState(criteria);
  const [town, setTown] = useState(criteria.place?.label.split(' · ')[0] ?? '');
  const [locating, setLocating] = useState<'town' | 'device' | null>(null);
  const [error, setError] = useState('');
  const [dateError, setDateError] = useState('');
  const locationVersion=useRef(0);
  useEffect(()=>()=>{locationVersion.current++;},[]);
  const set = (next: Partial<Criteria>) => setDraft((d) => ({ ...d, ...next }));
  const locate = async (how: 'town' | 'device') => {
    const version=++locationVersion.current;setLocating(how); setError('');
    try {
      const found = how === 'town' ? await locateTown(town,AbortSignal.timeout(15000)) : { ...(await approximateLocation()), label: 'Autour de ma position' };
      if(version===locationVersion.current)set({ place: { label: found.label, latitude: found.latitude, longitude: found.longitude } });
    } catch (e) { if(version===locationVersion.current)setError(e instanceof LocationError ? locationMessage[e.reason] : 'Le lieu n’a pas pu être trouvé. Réessaie.'); }
    finally { if(version===locationVersion.current)setLocating(null); }
  };
  const apply = () => {
    if (!future(draft.starts)) { setDateError('Choisis un début de garde à venir.'); return; }
    if (!draft.ends || new Date(draft.ends) <= new Date(draft.starts)) { setDateError('La fin de la garde doit suivre son début.'); return; }
    if (new Date(draft.ends).getTime() - new Date(draft.starts).getTime() > 60 * 86400_000) { setDateError('Une garde dure 60 jours au plus.'); return; }
    if (!draft.place) { setError('Indique une ville ou utilise ta position.'); return; }
    setDateError(''); onApply(draft);
  };
  return <Card calm className="gd-criteria"><Stack gap={5}>
    {pets.length > 1 ? <Stack gap={2}><Text variant="label" as="p">Animal</Text>
      <OptionGroup aria-label="Animal" value={draft.pet} onChange={(pet) => set({ pet })} options={pets.map((p) => ({ value: p.id, label: p.name }))} /></Stack> : null}
    <div className="gd-dates">
      <Stack gap={2}><Text variant="label" as="p">Début de la garde</Text><SlotField label="Début de la garde" value={draft.starts} onChange={(starts) => set({ starts, ends: draft.ends && new Date(draft.ends) > new Date(starts) ? draft.ends : '' })} /></Stack>
      <Stack gap={2}><Text variant="label" as="p">Fin de la garde</Text><SlotField label="Fin de la garde" value={draft.ends} min={draft.starts} placeholder="Choisir la fin" onChange={(ends) => set({ ends })} /></Stack>
    </div>
    {dateError ? <p className="fx-field__error" role="alert">{dateError}</p> : null}
    <Stack gap={2}>
      <Field label="Ville ou code postal" hint={draft.place ? `Recherche autour de : ${draft.place.label}` : 'Seule une zone d’environ 1 km sert à la recherche ; elle n’est pas enregistrée.'}>
        <Input value={town} placeholder="Ex. Lille" autoComplete="address-level2" onChange={(e) => {locationVersion.current++;setLocating(null);setTown(e.target.value);set({place:null});}}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void locate('town'); } }} />
      </Field>
      <Row className="gd-locate">
        <Button variant="out" size="sm" icon="search" loading={locating === 'town'} disabled={!!locating || town.trim().length < 2} onClick={() => { void locate('town'); }}>Trouver la ville</Button>
        <Button variant="quiet" size="sm" icon="pin" loading={locating === 'device'} disabled={!!locating} onClick={() => { void locate('device'); }}>Utiliser ma position</Button>
      </Row>
      {error ? <p className="fx-field__error" role="alert">{error}</p> : null}
    </Stack>
    <Stack gap={2}><Text variant="label" as="p">Distance</Text>
      <OptionGroup aria-label="Distance" value={String(draft.radius)} onChange={(r) => set({ radius: Number(r) })} options={['5', '10', '25', '50'].map((km) => ({ value: km, label: `${km} km` }))} /></Stack>
    <Row className="gd-criteria__acts">
      <Button variant="ink" icon="search" onClick={apply}>Voir les gardiens</Button>
      {onClose ? <Button variant="quiet" onClick={onClose}>Fermer</Button> : null}
    </Row>
  </Stack></Card>;
}

/* Filtres des résultats : appliqués sur la liste déjà chargée (statut, tarif, extérieur, tri). */
type Filters = { kind: '' | SitterKind; max: string; outdoor: '' | 'jardin' | 'jardin_clos'; sort: 'distance' | 'prix' };
const noFilters: Filters = { kind: '', max: '', outdoor: '', sort: 'distance' };
const activeFilters = (f: Filters) => [f.kind, f.max, f.outdoor, f.sort !== 'distance' ? f.sort : ''].filter(Boolean).length;
const priceFor = (s: SitterResult, service: SittingService) => s.price_cents ?? s.services.find((x) => x.service === service)?.price_cents ?? null;
function applyFilters(list: SitterResult[], f: Filters, service: SittingService) {
  const kept = list.filter((s) => (!f.kind || s.kind === f.kind)
    && (!f.max || (priceFor(s, service) ?? Infinity) <= Number(f.max) * 100)
    && (!f.outdoor || (f.outdoor === 'jardin_clos' ? s.outdoor === 'jardin_clos' : s.outdoor !== 'sans_jardin')));
  return f.sort === 'prix' ? [...kept].sort((a, b) => (priceFor(a, service) ?? Infinity) - (priceFor(b, service) ?? Infinity)) : kept;
}

function FilterPanel({ filters, onChange, onClose }: { filters: Filters; onChange: (f: Filters) => void; onClose: () => void }) {
  const set = (next: Partial<Filters>) => onChange({ ...filters, ...next });
  return <Card calm className="gd-filters"><Stack gap={4}>
    <Stack gap={2}><Text variant="label" as="p">Gardien</Text>
      <OptionGroup aria-label="Type de gardien" value={filters.kind} onChange={(kind) => set({ kind })}
        options={[{ value: '', label: 'Tous' }, { value: 'particulier', label: 'Particulier' }, { value: 'professionnel', label: 'Professionnel' }]} /></Stack>
    <Stack gap={2}><Text variant="label" as="p">Prix maximum</Text>
      <OptionGroup aria-label="Prix maximum" value={filters.max} onChange={(max) => set({ max })}
        options={[{ value: '', label: 'Tous' }, ...['15', '20', '30', '50'].map((v) => ({ value: v, label: `${v} €` }))]} /></Stack>
    <Stack gap={2}><Text variant="label" as="p">Extérieur</Text>
      <OptionGroup aria-label="Extérieur" value={filters.outdoor} onChange={(outdoor) => set({ outdoor })}
        options={[{ value: '', label: 'Peu importe' }, { value: 'jardin', label: 'Avec jardin' }, { value: 'jardin_clos', label: 'Jardin clos' }]} /></Stack>
    <Stack gap={2}><Text variant="label" as="p">Trier par</Text>
      <OptionGroup aria-label="Trier par" value={filters.sort} onChange={(sort) => set({ sort })}
        options={[{ value: 'distance', label: 'Les plus proches' }, { value: 'prix', label: 'Les moins chers' }]} /></Stack>
    <Row className="gd-criteria__acts">
      <Button variant="ink" size="sm" onClick={onClose}>Voir les résultats</Button>
      {activeFilters(filters) ? <Button variant="quiet" size="sm" onClick={() => onChange(noFilters)}>Tout effacer</Button> : null}
    </Row>
  </Stack></Card>;
}

/** Recherche de garde : dates et lieu, formule, résultats et carte illustrative (planche « Recherche »). */
export function SearchView({ client, pets, criteria, setCriteria, onOpen }: {
  client: FurrixClient; pets: PetRow[]; criteria: Criteria; setCriteria: (c: Criteria) => void; onOpen: (s: SitterResult) => void;
}) {
  const pet = pets.find((p) => p.id === criteria.pet) ?? pets[0];
  const [editing, setEditing] = useState(!criteria.place);
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data: SitterResult[] }>({ status: 'idle', data: [] });
  const [attempt, setAttempt] = useState(0);
  const [hot, setHot] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [filtering, setFiltering] = useState(false);
  const ready = !!criteria.place && future(criteria.starts) && !!criteria.ends;
  const query = useMemo(() => ready ? { latitude: criteria.place!.latitude, longitude: criteria.place!.longitude, radius: criteria.radius, service: criteria.service,
    starts: isoOf(criteria.starts), ends: isoOf(criteria.ends), species: pet?.species } : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ready, criteria.place?.latitude, criteria.place?.longitude, criteria.radius, criteria.service, criteria.starts, criteria.ends, pet?.species]);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!query) return;
    let current = true; setState((s) => ({ ...s, status: 'loading' }));
    void searchSitters(client, query).then((data) => { if (current) setState({ status: 'ready', data }); }).catch(() => { if (current) setState({ status: 'error', data: [] }); });
    return () => { current = false; };
  }, [client, query, attempt]);

  const head = <>
    <PageHeader title={pet ? `Faire garder ${pet.name}` : 'Faire garder ton animal'} showTitleOnPhone />
    <Row className="gd-shortcuts">
      <Button as="a" href={gardeHref({ vue: 'mes-gardes' })} variant="out" size="sm" icon="calendar">Mes gardes</Button>
    </Row>
  </>;
  if (!pets.length) return <section aria-label="Recherche">{head}
    <EmptyState icon="paw" title="Ajoute d’abord ton animal" action={<Button as="a" href="#/animaux" variant="out" size="sm">Ajouter un animal</Button>}>
      Le gardien voit le profil de ton animal avant de répondre à une demande.
    </EmptyState></section>;

  const n = countUnits(criteria.service, criteria.starts, criteria.ends || criteria.starts);
  const whenTitle = criteria.ends ? shortPeriod(isoOf(criteria.starts), isoOf(criteria.ends)) : 'Choisis tes dates';
  const whenSub = [criteria.ends ? units(criteria.service, n) : null, criteria.place?.label.split(' · ')[0]].filter(Boolean).join(' · ') || 'Lieu à préciser';
  const results = applyFilters(state.data, filters, criteria.service);
  const active = activeFilters(filters);
  const map = <MapFrame className="gd-map" aria-label="Carte illustrative des gardiens">
    <MapMe x={50} y={48} />
    {results.map((s) => { const p = spot(s.sitter_id, s.distance_km, criteria.radius); return <MapMarker key={s.sitter_id} x={p.x} y={p.y} hot={hot === s.sitter_id}
      aria-label={`${nameOf(s.name)}, ${s.price_cents ? price(s.price_cents) : ''}`} onMouseEnter={() => setHot(s.sitter_id)} onFocus={() => setHot(s.sitter_id)} onClick={() => onOpen(s)}>
      {nameOf(s.name)}{s.price_cents ? ` · ${price(s.price_cents)}` : ''}</MapMarker>; })}
    <MapNote>Carte illustrative : seule la distance est réelle, arrondie.</MapNote>
  </MapFrame>;
  return <section aria-label="Recherche">
    {head}
    <div className="gd-qbar">
      <WhenBar title={whenTitle} subtitle={whenSub} onClick={() => setEditing((e) => !e)} actionLabel={editing ? 'Fermer' : 'Modifier'} />
      <ChipGroup aria-label="Formule de garde" value={criteria.service} onChange={(service) => setCriteria({ ...criteria, service })}
        options={SERVICES.map((s) => ({ value: s, label: serviceLabel[s] }))} />
    </div>
    {editing ? <CriteriaPanel pets={pets} criteria={criteria} onClose={criteria.place ? () => setEditing(false) : undefined}
      onApply={(c) => { setCriteria(c); setEditing(false); list.current?.scrollIntoView?.({ block: 'start' }); }} /> : null}
    {!ready ? null : state.status === 'error' ? <Alert tone="err" title="La recherche n’a pas abouti." actions={<Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((a) => a + 1)}>Réessayer</Button>} />
      : state.status === 'loading' || state.status === 'idle' ? <Loading label="Recherche des gardiens disponibles…" />
      : !results.length ? <EmptyState icon="search" title="Aucun gardien disponible à ces dates" action={<Row className="gd-empty-acts">
          {criteria.radius < 25 ? <Button variant="ink" size="sm" onClick={() => setCriteria({ ...criteria, radius: 25 })}>Élargir à 25 km</Button> : null}
          <Button variant="out" size="sm" onClick={() => setEditing(true)}>Changer les dates</Button>
          {criteria.service !== 'visite' ? <Button variant="out" size="sm" onClick={() => setCriteria({ ...criteria, service: 'visite' })}>Voir les visites à domicile</Button> : null}
        </Row>}>
          Personne ne propose encore « {serviceLabel[criteria.service].toLowerCase()} » dans un rayon de {criteria.radius} km pour ces dates.
        </EmptyState>
      : <div ref={list}><SearchLayout map={map} results={<>
          <ListHeader title={`${results.length} gardien${results.length > 1 ? 's' : ''} disponible${results.length > 1 ? 's' : ''}`}
            action={<Button variant={active ? 'ink' : 'out'} size="sm" icon="sliders" aria-expanded={filtering} onClick={() => setFiltering((f) => !f)}>{active ? `Filtres (${active})` : 'Filtres'}</Button>} />
          {filtering ? <FilterPanel filters={filters} onChange={setFilters} onClose={() => setFiltering(false)} /> : null}
          {results.length ? <ResultList>{results.map((s) => <SitterRow key={s.sitter_id} client={client} sitter={s} service={criteria.service} onOpen={() => onOpen(s)} />)}</ResultList>
            : <EmptyState icon="sliders" title="Aucun gardien avec ces filtres" action={<Button variant="out" size="sm" onClick={() => setFilters(noFilters)}>Retirer les filtres</Button>}>
                {state.data.length} gardien{state.data.length > 1 ? 's sont disponibles' : ' est disponible'} à ces dates sans filtre.
              </EmptyState>}
          <Note className="gd-note">Tarifs fixés par chaque gardien, hors frais de service. Les frais, encore à définir, seront affichés avant toute demande.</Note>
        </>} /></div>}
  </section>;
}
