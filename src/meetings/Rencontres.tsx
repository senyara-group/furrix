import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActionBar, AnimalCard, AnimalGrid, Alert, Button, Card, Chip, CheckList, DetailLayout, EmptyState, Facts, FurrixScope,
  HeroGallery, IconButton, Loading, MatchPair, Monogram, Note, OptionGroup, Page, PageHeader, PetSwitcher, Row, Segmented,
  Separator, Stack, StatusBadge, Steps, SwipeActions, SwipeDeck, SwipeProfile, Tag, Text, Toast, Who,
  Icon, Input, MapCard, MapFrame, MapMarker, MapMe, MapNote, Field, useBreakpoint, type SwipeDeckHandle, type SwipeDecision,
} from '../design-system';
import type { PetRow } from '../types/database';
import type { FurrixClient } from '../services/supabaseClient';
import { usePhoneBar } from '../app/phoneBar';
import { useActivePet } from './useActivePet';
import { approximateLocation, locateTown, LocationError, locationMessage } from './location';
import { decide, discoverPets, hasLocation, listNewMatches, markMatchSeen, setLocation } from './service';
import type { DiscoveryFilters, DiscoveryPet } from './types';
import { usePetPhotoUrl } from './usePetPhotoUrl';
import { messagesHref } from './links';
import './rencontres.css';

const PAGE = 20;
const goalLabel: Record<string, string> = { balade: 'Balade', jeu: 'Jeu au parc', socialisation: 'Socialisation' };
const sizeLabel: Record<string, string> = { petit: 'Petit gabarit', moyen: 'Gabarit moyen', grand: 'Grand gabarit' };
const species: Record<string, [string, string]> = {
  chien: ['Chien', 'Chienne'], chat: ['Chat', 'Chatte'], lapin: ['Lapin', 'Lapine'], oiseau: ['Oiseau', 'Oiseau'], reptile: ['Reptile', 'Reptile'],
  rongeur: ['Rongeur', 'Rongeur'], cheval: ['Cheval', 'Jument'], ferme: ['Animal de ferme', 'Animal de ferme'],
};
/** Pixel transparent : la carte garde son fond illustré tant que la photo n'est pas là. */
const NO_PHOTO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const describe = (p: DiscoveryPet) => [species[p.species]?.[p.gender === '♀' ? 1 : 0] ?? p.species, p.breed, p.age].filter(Boolean).join(' · ');
const distance = (p: DiscoveryPet) => p.distance_km === null ? undefined : p.distance_km < 1 ? '< 1 km' : `≈ ${p.distance_km} km`;
const ownerOf = (p: { owner_name: string | null }) => p.owner_name?.trim() || 'son propriétaire';
const initialOf = (name: string | null | undefined) => (name?.trim().charAt(0) || '?').toUpperCase();

type Filters = { goal: string; size: string; radius: string };
type Origin = 'cards' | 'list' | 'map';
type Screen = { kind: 'cards' } | { kind: 'list' } | { kind: 'map' } | { kind: 'fiche'; pet: DiscoveryPet; from: Origin } | { kind: 'match'; matchId: string; name: string; owner: string | null; photo: string | null };
const noFilters: Filters = { goal: '', size: '', radius: '' };

function DeckCard({ client, pet }: { client: FurrixClient; pet: DiscoveryPet }) {
  const url = usePetPhotoUrl(client, pet.photos[0]);
  return <SwipeProfile
    photo={{ src: url ?? NO_PHOTO, alt: url ? `Portrait de ${pet.name}` : '' }}
    distance={distance(pet)} name={pet.name} description={describe(pet)}
    goals={(pet.meeting_goals ?? []).map((g) => goalLabel[g] ?? g)} traits={pet.behaviour_traits}
    owner={{ initial: initialOf(pet.owner_name), name: ownerOf(pet), note: `propriétaire de ${pet.name} · comportement déclaré, non vérifié` }} />;
}

function ListCard({ client, pet, open }: { client: FurrixClient; pet: DiscoveryPet; open: () => void }) {
  const url = usePetPhotoUrl(client, pet.photos[0]);
  return <AnimalCard photo={{ src: url ?? NO_PHOTO, alt: '' }} name={pet.name} description={describe(pet)}
    meta={[`Avec ${ownerOf(pet)}`, distance(pet)].filter(Boolean).join(' · ')} onClick={open} />;
}

function Fiche({ client, pet, active, from, back, onDecide, busy }: {
  client: FurrixClient; pet: DiscoveryPet; active: PetRow; from: Origin; back: () => void; onDecide: (d: SwipeDecision) => void; busy: boolean;
}) {
  const url = usePetPhotoUrl(client, pet.photos[0]);
  const backLabel = from === 'cards' ? 'Cartes' : from === 'list' ? 'Liste' : 'Carte';
  usePhoneBar(useMemo(() => ({ title: pet.name, back: { label: `Retour : ${backLabel}`, onClick: back } }), [pet.name, backLabel, back]));
  const facts = [['Caractère', pet.temperament], ['S’entend avec', pet.good_with], ['Sorties', pet.usual_outings]]
    .filter((f): f is [string, string] => !!f[1]).map(([label, value]) => ({ label, value }));
  const owner = ownerOf(pet);
  return <section aria-label="Fiche détaillée">
    <PageHeader back={{ label: backLabel, onClick: back }} title={pet.name}
      subtitle={[describe(pet), `avec ${owner}`, distance(pet)].filter(Boolean).join(' · ')} />
    <DetailLayout
      aside={<Card calm><Stack gap={3}>
        <Text variant="kicker">Propriétaire</Text>
        <Who initials={initialOf(pet.owner_name)} name={owner} subtitle={[`Propriétaire de ${pet.name}`, distance(pet)].filter(Boolean).join(' · ')} />
        <Separator />
        <Text variant="body-sm">Pour écrire à {owner} ou proposer une rencontre, il faut un match : un j’aime de chaque côté.</Text>
      </Stack></Card>}
      actions={<ActionBar>
        <Button icon="heartFill" loading={busy} onClick={() => onDecide('like')}>J’aime au nom de {active.name}</Button>
        <Button variant="out" disabled={busy} onClick={() => onDecide('pass')}>Passer</Button>
      </ActionBar>}>
      {url ? <HeroGallery photos={[{ src: url, alt: `Portrait de ${pet.name}` }]} /> : <div className="meet-hero-empty" aria-hidden="true" />}
      <Row>
        {(pet.meeting_goals ?? []).map((g) => <Tag key={g} kind="goal">Cherche&nbsp;:&nbsp;{goalLabel[g] ?? g}</Tag>)}
        {pet.size ? <Tag>{sizeLabel[pet.size]}</Tag> : null}
        {distance(pet) ? <Tag>{distance(pet)}</Tag> : null}
      </Row>
      {facts.length ? <Facts items={facts} /> : null}
      {pet.behaviour_traits?.length ? <Stack gap={2}><Text variant="h2">Comportement</Text><CheckList items={pet.behaviour_traits} /></Stack> : null}
      {pet.bio ? <Stack gap={2}><Text variant="h2">Le mot de {owner}</Text><Text variant="body" className="meet-bio">« {pet.bio} »</Text></Stack> : null}
      <Note>Informations déclarées par {owner}, non vérifiées par Furrix. Aucun score de compatibilité n’est calculé.</Note>
    </DetailLayout>
  </section>;
}

function MatchView({ client, active, match, onContinue }: { client: FurrixClient; active: PetRow; match: Extract<Screen, { kind: 'match' }>; onContinue: () => void }) {
  const url = usePetPhotoUrl(client, match.photo);
  usePhoneBar(useMemo(() => ({ title: 'Match', back: { label: 'Retour : Cartes', onClick: onContinue } }), [onContinue]));
  const owner = match.owner?.trim() || 'son propriétaire';
  return <section aria-label="Match réciproque" className="fx-match meet-match">
    <MatchPair left={{ initials: initialOf(active.name) }} right={url ? { photo: { src: url, alt: '' } } : { initials: initialOf(match.name) }} />
    <StatusBadge status="ok">Match</StatusBadge>
    <Text as="h1" variant="match-title">C’est un match</Text>
    <Text variant="body-sm" className="meet-match__cap">{active.name} et {match.name} ({owner})</Text>
    <Text variant="body" className="fx-match__text">{owner} a aussi aimé le profil de {active.name}. La conversation est ouverte gratuitement ; pour vous retrouver, proposez ensuite une activité, un lieu et un créneau.</Text>
    <Steps className="meet-match__steps" label="Où vous en êtes" steps={[{ label: 'J’aime', state: 'done' }, { label: 'Match', state: 'done' }, { label: 'Proposition' }, { label: 'Rencontre' }]} />
    <div className="fx-match__actions">
      <Button as="a" href={messagesHref(match.matchId)} icon="message">Écrire à {owner}</Button>
      <Button as="a" href={messagesHref(match.matchId, 'proposer')} variant="out" icon="calendar">Proposer une rencontre</Button>
      <Button variant="quiet" onClick={onContinue}>Continuer à découvrir</Button>
    </div>
    <Note className="meet-match__note">Le j’aime et le match sont rattachés à {active.name}. Un match n’est pas un rendez-vous : la rencontre est confirmée quand une proposition est acceptée.</Note>
  </section>;
}

/** Répartition régulière (angle d'or) : la direction est illustrative, seule la distance est réelle. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function MapPetCard({ client, pet, open }: { client: FurrixClient; pet: DiscoveryPet; open: () => void }) {
  const url = usePetPhotoUrl(client, pet.photos[0]);
  return <MapCard photo={{ src: url ?? NO_PHOTO, alt: '' }} name={pet.name} meta={[describe(pet), distance(pet)].filter(Boolean).join(' · ')} onClick={open} />;
}

/** Vue Carte (maquette) : profils placés autour de toi selon leur distance arrondie. */
function MapView({ client, pets, located, open, askZone }: { client: FurrixClient; pets: DiscoveryPet[]; located: boolean | null; open: (pet: DiscoveryPet) => void; askZone: () => void }) {
  // Du plus proche au plus loin : l'éloignement sur la carte suit la distance réelle.
  const placed = pets.filter((p) => p.distance_km !== null).sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0) || a.id.localeCompare(b.id));
  const [selected, setSelected] = useState<string>();
  const current = placed.find((p) => p.id === selected) ?? placed[0];
  // Étiquettes qui se chevauchent (petits écrans) : mesurées après rendu, puis décalées vers le bas.
  const box = useRef<HTMLElement>(null);
  const shift = useRef<Record<string, number>>({});
  const [, redraw] = useState(0);
  const layoutKey = placed.map((p) => p.id).join(',');
  useLayoutEffect(() => {
    const run = () => {
      const frame = box.current?.querySelector<HTMLElement>('.meet-map');
      if (!frame) return;
      const height = frame.clientHeight || 1;
      const taken: Array<{ l: number; r: number; t: number; b: number }> = [];
      const next: Record<string, number> = {};
      for (const mark of frame.querySelectorAll<HTMLElement>('.fx-marker')) {
        const id = mark.dataset.id ?? '';
        const rect = mark.getBoundingClientRect();
        const base = ((shift.current[id] ?? 0) / 100) * height;
        const own = { l: rect.left, r: rect.right, t: rect.top - base, b: rect.bottom - base };
        let dy = 0;
        const hit = () => taken.some((o) => o.l < own.r + 4 && own.l < o.r + 4 && o.t < own.b + dy + 4 && own.t + dy < o.b + 4);
        while (hit() && dy < height / 2) dy += 6;
        taken.push({ ...own, t: own.t + dy, b: own.b + dy });
        if (dy) next[id] = (dy / height) * 100;
      }
      if (JSON.stringify(next) !== JSON.stringify(shift.current)) { shift.current = next; redraw((n) => n + 1); }
    };
    run();
    window.addEventListener('resize', run);
    return () => window.removeEventListener('resize', run);
  }, [layoutKey, located]);
  if (!located) return <EmptyState icon="map" title="Indique ta zone pour voir la carte" action={<Button variant="out" size="sm" icon="pin" onClick={askZone}>Choisir ma zone</Button>}>
    La carte place les profils autour de toi selon leur distance arrondie. Ta position exacte n’est jamais montrée.
  </EmptyState>;
  const max = Math.max(5, ...placed.map((p) => p.distance_km ?? 0));
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const hidden = pets.length - placed.length;
  return <section aria-label="Carte" ref={box}>
    <MapFrame size="big" className="meet-map">
      <svg viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M0 380 C 120 330, 240 420, 400 350 L 400 520 L 0 520 Z" fill="#AFCBE0" />
        <path d="M30 40 C 120 10, 190 80, 160 150 C 130 210, 40 190, 30 40 Z" fill="#BFD8B8" />
        <path d="M260 70 C 340 50, 400 110, 390 170 C 360 220, 280 200, 260 70 Z" fill="#BFD8B8" />
        <path d="M60 250 C 120 230, 170 270, 150 310 C 120 340, 70 320, 60 250 Z" fill="#BFD8B8" />
        <path d="M0 220 L 400 180 M 230 0 L 200 520 M 0 120 L 160 160" stroke="#FBFAF6" strokeWidth="9" />
      </svg>
      <MapMe x={50} y={42} />
      {placed.map((p, i) => {
        const rank = placed.length > 1 ? i / (placed.length - 1) : 0;
        const r = 12 + (((p.distance_km ?? 0) / max) * 0.5 + rank * 0.5) * 30, a = i * GOLDEN - Math.PI / 2;
        return <MapMarker key={p.id} data-id={p.id} x={clamp(50 + r * Math.cos(a), 20, 80)} y={Math.min(78, clamp(42 + r * Math.sin(a), 8, 72) + (shift.current[p.id] ?? 0))} hot={p.id === current?.id}
          aria-pressed={p.id === current?.id} onClick={() => setSelected(p.id)}>{p.name} · {distance(p)}</MapMarker>;
      })}
      <MapNote><Tag>carte illustrative · distances arrondies</Tag></MapNote>
      {current ? <MapPetCard client={client} pet={current} open={() => open(current)} /> : null}
    </MapFrame>
    <Stack gap={3} className="meet-map-notes">
      {hidden ? <Note>{hidden} profil{hidden > 1 ? 's' : ''} sans zone {hidden > 1 ? 'ne sont' : 'n’est'} pas sur la carte : retrouve-{hidden > 1 ? 'les' : 'le'} dans la liste.</Note> : null}
      <Note>Seule la distance est réelle : la direction est illustrative, pour protéger la position de chacun.</Note>
    </Stack>
  </section>;
}

/** Ferme un menu déroulant au clic à côté (hors de ses déclencheurs) ou avec Échap. */
function useDismiss(trigger: string, close: () => void) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!menu.current?.contains(target) && !target.closest(`[${trigger}]`)) close();
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [trigger, close]);
  return menu;
}

/** Liste déroulante des animaux du compte, juste sous le sélecteur. */
function PetMenu({ pets, activeId, pick, close }: { pets: PetRow[]; activeId: string; pick: (id: string) => void; close: () => void }) {
  const menu = useDismiss('data-pet-trigger', close);
  return <div ref={menu} className="meet-petmenu" id="meet-petmenu">
    <ul aria-label="Animal sélectionné">{pets.map((p) => <li key={p.id}>
      <button type="button" className="meet-petmenu__item" aria-current={p.id === activeId || undefined} onClick={() => pick(p.id)}>
        <Monogram initials={initialOf(p.name)} size={30} shape="circle" /><span>{p.name}</span>{p.id === activeId ? <Icon name="check" size={18} /> : null}
      </button></li>)}</ul>
    <a className="meet-petmenu__add" href="#/animaux">Ajouter un animal</a>
  </div>;
}

/** Réglages des filtres : petit menu sous le bouton, aligné à droite. */
function FilterMenu({ close, children }: { close: () => void; children: ReactNode }) {
  const menu = useDismiss('data-filter-trigger', close);
  return <div ref={menu} className="meet-filtermenu" id="meet-filtermenu" role="group" aria-label="Filtres">{children}</div>;
}

function Discovery({ client, active, pets, select }: { client: FurrixClient; active: PetRow; pets: PetRow[]; select: (id: string) => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'cards' });
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [queue, setQueue] = useState<DiscoveryPet[]>([]);
  const [deckItems, setDeckItems] = useState<DiscoveryPet[]>([]);
  const [deckKey, setDeckKey] = useState(0);
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<DiscoveryPet | null>(null);
  const [pending, setPending] = useState(false);
  const [located, setLocated] = useState<boolean | null>(null);
  const [town, setTown] = useState(active.city ?? '');
  const [locMessage, setLocMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [panel, setPanel] = useState<'filters' | 'pets' | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const { isDesktop } = useBreakpoint();
  const [unseen, setUnseen] = useState<Array<Extract<Screen, { kind: 'match' }>>>([]);
  const deck = useRef<SwipeDeckHandle>(null);
  const alive = useRef(true);
  const fetching = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const request = useCallback((): DiscoveryFilters => ({ species: active.species, radius: filters.radius, goal: filters.goal, size: filters.size }), [active.species, filters]);

  // Profils : rechargés à chaque changement d'animal ou de filtre.
  useEffect(() => {
    let current = true; setLoading(true); setLoadError(false); setSent(null); setError('');
    void discoverPets(client, active.id, request()).then((data) => {
      if (!current) return;
      setQueue(data); setDeckItems(data); setDeckKey((k) => k + 1); setDecided(new Set()); setMore(data.length === PAGE);
    }).catch(() => { if (current) setLoadError(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, active.id, request, attempt]);

  useEffect(() => {
    let current = true;
    void hasLocation(client, active.id).then((v) => { if (current) setLocated(v); }).catch(() => { if (current) setLocated(false); });
    return () => { current = false; };
  }, [client, active.id]);

  // Les matchs créés par l'autre personne arrivent aussi pendant la visite.
  useEffect(() => {
    let current = true, running = false;
    const announced = new Set<string>();
    const refresh = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const list = await listNewMatches(client, active.id);
        if (!current) return;
        const fresh = list.filter(m => !announced.has(m.match_id));
        fresh.forEach(m => announced.add(m.match_id));
        if (fresh.length) setUnseen(old => [...old, ...fresh.map(m => ({ kind: 'match' as const, matchId: m.match_id, name: m.name, owner: m.owner_name, photo: m.photo }))]);
      } catch { /* Une prochaine actualisation réessaiera. */ }
      finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { current = false; window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [client, active.id]);
  useEffect(() => {
    if (screen.kind !== 'cards' && screen.kind !== 'list') return;
    const next = unseen[0]; if (!next) return;
    setUnseen(list => list.slice(1)); setScreen(next);
  }, [unseen, screen.kind]);
  useEffect(() => {
    if (screen.kind === 'match') void markMatchSeen(client, screen.matchId, active.id).catch(() => { /* Réannoncé à la prochaine visite. */ });
  }, [client, screen, active.id]);

  // Comme la maquette : chaque changement d'écran repart du haut.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [screen.kind]);

  const remaining = useMemo(() => queue.filter((p) => !decided.has(p.id)), [queue, decided]);
  const top = deckItems.find((p) => !decided.has(p.id));

  // Suite des profils quand la pile se vide.
  useEffect(() => {
    if (!more || loading || remaining.length > 3 || fetching.current) return;
    const last = queue[queue.length - 1]; if (!last) return;
    fetching.current = true;
    void discoverPets(client, active.id, request(), last.id).then((data) => {
      if (!alive.current) return;
      setQueue((q) => [...q, ...data]); setDeckItems((d) => [...d, ...data]); setMore(data.length === PAGE);
    }).catch(() => { if (alive.current) setMore(false); }).finally(() => { fetching.current = false; });
  }, [more, loading, remaining.length, queue, client, active.id, request]);

  const send = async (pet: DiscoveryPet, decision: SwipeDecision) => {
    setError(''); setSent(null);
    try {
      const match = await decide(client, active.id, pet.id, decision === 'like' ? 'right' : 'left');
      if (!alive.current) return;
      setDecided((s) => new Set(s).add(pet.id));
      if (match) setScreen({ kind: 'match', matchId: match, name: pet.name, owner: pet.owner_name, photo: pet.photos[0] ?? null });
      else if (decision === 'like') setSent(pet);
    } catch (e) {
      if (alive.current) setError('Ta décision n’a pas été confirmée. Réessaie le même geste.');
      throw e;
    }
  };
  // Décision prise hors de la pile (fiche, liste) : la pile repart des profils restants.
  const decideOutside = async (pet: DiscoveryPet, decision: SwipeDecision) => {
    if (pending) return;
    setPending(true);
    try {
      await send(pet, decision);
      if (!alive.current) return;
      setDeckItems(queue.filter((p) => p.id !== pet.id && !decided.has(p.id))); setDeckKey((k) => k + 1);
      setScreen((s) => s.kind === 'fiche' ? { kind: s.from === 'list' ? 'list' : 'cards' } : s);
    } catch { /* Message affiché ; la fiche reste ouverte. */ } finally { if (alive.current) setPending(false); }
  };

  // Retour aux cartes : la pile repart des profils non décidés (callbacks stables pour la barre téléphone).
  const latest = useRef({ queue, decided });
  latest.current = { queue, decided };
  const toCards = useCallback(() => {
    const { queue: q, decided: d } = latest.current;
    setDeckItems(q.filter((p) => !d.has(p.id))); setDeckKey((k) => k + 1); setScreen({ kind: 'cards' });
  }, []);
  const origin = useRef<Origin>('cards');
  origin.current = screen.kind === 'fiche' ? screen.from : origin.current;
  const backFromFiche = useCallback(() => { if (origin.current === 'cards') toCards(); else setScreen({ kind: origin.current }); }, [toCards]);
  // Un filtre inchangé (même option recliquée) ne relance pas la recherche.
  const change = (next: Partial<Filters>) => { setFilters((f) => (Object.keys(next) as Array<keyof Filters>).every((k) => f[k] === next[k]) ? f : { ...f, ...next }); setScreen((s) => s.kind === 'list' || s.kind === 'map' ? s : { kind: 'cards' }); };
  // Zone : position de l'appareil, ou ville saisie en secours. Les messages s'affichent dans le menu des filtres.
  const locate = async (how: 'device' | 'town' | 'remove' = 'device') => {
    setLocating(true); setLocMessage(null);
    try {
      const position = how === 'remove' ? undefined : how === 'town' ? await locateTown(town) : await approximateLocation();
      if (!alive.current) return;
      await setLocation(client, active.id, position && { latitude: position.latitude, longitude: position.longitude });
      if (!alive.current) return;
      setLocated(how !== 'remove');
      setLocMessage({ ok: true, text: how === 'remove' ? 'Zone supprimée.' : `Zone enregistrée${position && 'label' in position ? ` : ${position.label}` : ''}. Seule une distance arrondie est montrée aux autres.` });
      if (how === 'remove') change({ radius: '' }); else if (!filters.radius) change({ radius: '5' });
    } catch (e) {
      if (!alive.current) return;
      setLocMessage({ ok: false, text: e instanceof LocationError ? locationMessage[e.reason] : 'La zone n’a pas pu être enregistrée. Réessaie.' });
      setPanel('filters');
    } finally { if (alive.current) setLocating(false); }
  };
  const toggleRadius = () => {
    if (filters.radius) change({ radius: '' });
    else if (located) change({ radius: '5' });
    else void locate();
  };
  const filtered = !!(filters.goal || filters.size || filters.radius);
  const activeCount = [filters.size, filters.radius].filter(Boolean).length;

  if (screen.kind === 'match') return <MatchView client={client} active={active} match={screen} onContinue={toCards} />;
  if (screen.kind === 'fiche') return <Fiche client={client} pet={screen.pet} active={active} from={screen.from} back={backFromFiche}
    busy={pending} onDecide={(d) => { void decideOutside(screen.pet, d); }} />;

  const view = screen.kind;
  const widen = filters.radius && filters.radius !== '15' && filters.radius !== '50' ? <Button variant="ink" size="sm" onClick={() => change({ radius: '15' })}>Élargir à 15 km</Button> : null;
  const empty = filtered && !decided.size
    ? <EmptyState icon="search" title="Aucun profil avec ces filtres" action={<Row className="meet-empty-actions">{widen}<Button variant="out" size="sm" onClick={() => change(noFilters)}>Retirer les filtres</Button></Row>}>
        Personne ne correspond pour l’instant. Élargis la zone ou retire un filtre.
      </EmptyState>
    : <EmptyState icon="cardsDone" title="Tu as vu tous les profils autour de toi" action={widen || filtered ? <Row className="meet-empty-actions">{widen}{filtered ? <Button variant="out" size="sm" onClick={() => change(noFilters)}>Retirer les filtres</Button> : null}</Row> : undefined}>
        C’est tout pour ces filtres. Tes j’aime restent enregistrés : tu verras le match ici dès qu’il y en a un.
      </EmptyState>;

  const filterMenu = <FilterMenu close={closePanel}><Stack gap={4}>
      <Stack gap={2}><Text variant="label" as="p">Gabarit</Text>
        <OptionGroup aria-label="Gabarit" value={filters.size} onChange={(size) => change({ size })} options={[{ value: '', label: 'Tous' }, { value: 'petit', label: 'Petit' }, { value: 'moyen', label: 'Moyen' }, { value: 'grand', label: 'Grand' }]} /></Stack>
      <Stack gap={2}><Text variant="label" as="p">Distance</Text>
        <OptionGroup aria-label="Distance" value={filters.radius} onChange={(radius) => change({ radius })} options={[{ value: '', label: 'Sans limite' }, ...['5', '15', '50'].map((km) => ({ value: km, label: `${km} km`, disabled: !located }))]} />
        <Text variant="body-sm">La distance utilise une zone approximative (environ 1 km), propre à {active.name}. Seule une distance arrondie est montrée aux autres.</Text>
        <Row>
          <Button variant="out" size="sm" icon="pin" loading={locating} onClick={() => { void locate(); }}>{located ? 'Actualiser avec ma position' : 'Utiliser ma position'}</Button>
          {located ? <Button variant="quiet" size="sm" disabled={locating} onClick={() => { void locate('remove'); }}>Supprimer ma zone</Button> : null}
        </Row>
        <form className="meet-town" onSubmit={(e) => { e.preventDefault(); void locate('town'); }}>
          <Field label="Ou indique ta ville" hint="Le centre de la commune sert de zone. Seul ce nom est envoyé au service public d’adresses.">
            <Input value={town} maxLength={80} placeholder="Ex. Lille ou 59000" autoComplete="address-level2" onChange={(e) => setTown(e.target.value)} />
          </Field>
          <Button type="submit" variant="ink" size="sm" disabled={locating || town.trim().length < 2}>Utiliser cette ville</Button>
        </form>
        {locMessage ? <p className={locMessage.ok ? 'meet-locok' : 'fx-field__error'} role={locMessage.ok ? 'status' : 'alert'}><Icon name={locMessage.ok ? 'check' : 'warning'} size={16} />{locMessage.text}</p> : null}
      </Stack>
  </Stack></FilterMenu>;
  const petMenu = <PetMenu pets={pets} activeId={active.id} close={closePanel} pick={(id) => { setPanel(null); if (id !== active.id) select(id); }} />;
  return <>
    <PageHeader title="Rencontres" />
    <div className="meet-vbar">
      <div className="meet-petwrap meet-petsel">
        <PetSwitcher data-pet-trigger aria-expanded={panel === 'pets'} aria-controls="meet-petmenu" name={active.name} onClick={() => setPanel(panel === 'pets' ? null : 'pets')} />
        {panel === 'pets' && isDesktop ? petMenu : null}
      </div>
      <Segmented aria-label="Présentation des résultats" className="meet-views" value={view} onChange={(v) => { if (v === 'cards') toCards(); else setScreen({ kind: v }); }}
        options={[{ value: 'cards', label: 'Cartes', icon: 'cards' }, { value: 'list', label: 'Liste', icon: 'grid' }, { value: 'map', label: 'Carte', icon: 'map' }]} />
      <div className="fx-chips meet-chips" role="group" aria-label="Filtres">
        <Chip data-pet-trigger aria-controls="meet-petmenu" className="meet-petchip" aria-label={`Animal sélectionné : ${active.name}. Changer d'animal`} aria-expanded={panel === 'pets'} onClick={() => setPanel(panel === 'pets' ? null : 'pets')}>
          <Monogram initials={initialOf(active.name)} size={30} shape="circle" />{active.name}
        </Chip>
        {Object.entries(goalLabel).map(([value, label]) => <Chip key={value} pressed={filters.goal === value} onClick={() => change({ goal: filters.goal === value ? '' : value })}>{label}</Chip>)}
        <Chip data-filter-trigger aria-controls="meet-filtermenu" pressed={!!filters.size} aria-expanded={panel === 'filters'} onClick={() => setPanel(panel === 'filters' ? null : 'filters')}>{filters.size ? sizeLabel[filters.size] : 'Tous gabarits'}</Chip>
        <Chip pressed={!!filters.radius} disabled={locating} onClick={toggleRadius}>{filters.radius ? `À moins de ${filters.radius} km` : 'À moins de 5 km'}</Chip>
      </div>
      <div className="meet-fwrap meet-fbtn">
        <IconButton data-filter-trigger aria-controls="meet-filtermenu" icon="sliders" label={activeCount ? `Filtres : ${activeCount} actif${activeCount > 1 ? 's' : ''}` : 'Filtres'} aria-expanded={panel === 'filters'} onClick={() => setPanel(panel === 'filters' ? null : 'filters')} />
        {panel === 'filters' ? filterMenu : null}
      </div>
      {panel === 'pets' && !isDesktop ? petMenu : null}
    </div>


    {error ? <Alert tone="err" title={error} /> : null}

    {loading ? <Loading label="Recherche de compagnons…" />
      : loadError ? <Alert tone="err" title="Les profils n’ont pas pu être chargés." actions={<Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((a) => a + 1)}>Réessayer</Button>}>Vérifie ta connexion, puis réessaie.</Alert>
      : view === 'map' ? (remaining.length || !located ? <MapView client={client} pets={remaining} located={located} open={(pet) => setScreen({ kind: 'fiche', pet, from: 'map' })} askZone={() => setPanel('filters')} /> : empty)
      : view === 'list' ? (remaining.length ? <section aria-label="Liste">
          <AnimalGrid>{remaining.map((pet) => <ListCard key={pet.id} client={client} pet={pet} open={() => setScreen({ kind: 'fiche', pet, from: 'list' })} />)}</AnimalGrid>
          <Note className="meet-list-note">Mêmes règles que les cartes : depuis une fiche, j’aime ou passer. La conversation et la proposition de rencontre viennent après un match.</Note>
        </section> : empty)
      : <section aria-label="Cartes à balayer"><div className="meet-swlay">
          <div className="meet-swcol">
            {sent ? <Toast tone="info" title={`J’aime de ${active.name} envoyé à ${sent.name}`}>Si {ownerOf(sent)} aime aussi le profil de {active.name}, ce sera un match : la conversation s’ouvrira gratuitement pour vous deux.</Toast> : null}
            <SwipeDeck key={deckKey} ref={deck} items={deckItems} getKey={(p) => p.id} getLabel={(p) => p.name}
              renderCard={(pet) => <DeckCard client={client} pet={pet} />}
              onDecide={(pet, d) => send(pet, d)} onPendingChange={setPending} empty={empty} />
            {top ? <SwipeActions subject={top.name} disabled={pending}
              onPass={() => deck.current?.pass()} onLike={() => deck.current?.like()}
              onInfo={() => setScreen({ kind: 'fiche', pet: top, from: 'cards' })}
              hint="Glisse la carte vers la droite pour aimer, vers la gauche pour passer. Les boutons font la même chose, au doigt comme au clavier." /> : null}
          </div>
          <aside className="meet-swside">
            <Card calm><Stack gap={3}>
              <Text variant="h3">La règle des rencontres</Text>
              <ol className="meet-rules">
                <li><b>J’aime</b><span>Donné au nom de l’animal sélectionné (ici {active.name}) : il exprime un intérêt et n’ouvre rien à lui seul.</span></li>
                <li><b>Match</b><span>Deux j’aime réciproques. Il ouvre gratuitement la conversation entre les deux propriétaires.</span></li>
                <li><b>Proposition de rencontre</b><span>Après le match seulement : une activité, un lieu et un créneau. L’acceptation confirme la rencontre.</span></li>
              </ol>
              <Note>Sans match, ni conversation ni proposition, quelle que soit la vue : cartes, liste ou carte.</Note>
            </Stack></Card>
            <Note>Aucun score de compatibilité : chaque carte montre seulement ce que le propriétaire a déclaré.</Note>
          </aside>
        </div></section>}
  </>;
}

/** Rencontres (maquette « Plein air ») : découvrir, aimer, matcher. La messagerie reste celle de la page Messages. */
export default function Rencontres({ client, ownerId, pets }: { client: FurrixClient; ownerId: string; pets: PetRow[] }) {
  const { active, select } = useActivePet(ownerId, pets);
  return <FurrixScope className="meet-root"><Page>
    {active ? <Discovery key={active.id} client={client} active={active} pets={pets.filter((p) => p.owner_id === ownerId)} select={select} />
      : <><PageHeader title="Rencontres" /><EmptyState icon="paw" title="Qui fait les présentations ?" action={<Button as="a" href="#/animaux" variant="out" size="sm">Créer son profil</Button>}>
          Ajoute d’abord ton animal : les j’aime et les matchs se font à son nom.
        </EmptyState></>}
  </Page></FurrixScope>;
}
