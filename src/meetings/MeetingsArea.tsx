import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { PetRow } from '../types/database';
import type { FurrixClient } from '../services/supabaseClient';
import { PET_SPECIES, PET_PURPOSES } from '../types/pet';
import { PetPhoto } from '../pets/PetPhoto';
import {
  Alert, Button, Card, EmptyState, Field, FurrixScope, Loading, Segmented, Select, SwipeActions, SwipeDeck, SwipeProfile,
  type SwipeDeckHandle, type SwipeDecision,
} from '../design-system';
import { useActivePet } from './useActivePet';
import { approximateLocation } from './location';
import { discoverPets, decide, hasLocation, setLocation, listMatches } from './service';
import type { DiscoveryFilters, DiscoveryPet, PetMatch } from './types';
import Conversation from './Conversation';
import './meetings.css';
const label: Record<string, string> = { chien: 'Chien', chat: 'Chat', lapin: 'Lapin', oiseau: 'Oiseau', reptile: 'Reptile', rongeur: 'Rongeur', cheval: 'Cheval', ferme: 'Animal de ferme', balade: 'Balades', social: 'Socialisation', reproduction: 'Reproduction', show: 'Expositions' };
const direction = (decision: SwipeDecision) => decision === 'like' ? 'right' : 'left';
const photoOf = (client: FurrixClient, pet: DiscoveryPet) => <PetPhoto client={client} pet={{ ...pet, verified: false, created_at: '' }} />;
const distance = (pet: DiscoveryPet) => pet.distance_km === null ? 'Distance inconnue' : `environ ${pet.distance_km} km`;
const summary = (pet: DiscoveryPet) => `${label[pet.species] || pet.species}${pet.age ? ` · ${pet.age}` : ''} · ${pet.breed || 'Race non renseignée'}${pet.gender ? ` · ${pet.gender}` : ''}`;
const place = (pet: DiscoveryPet) => `${pet.city || 'Ville non renseignée'} · ${distance(pet)}`;
const owner = (pet: DiscoveryPet) => `Avec ${pet.owner_name || 'son propriétaire'} · ${label[pet.purpose || ''] || 'Objectif non renseigné'}`;
const bio = (pet: DiscoveryPet) => pet.bio || 'Sa présentation arrive bientôt.';

function AnimalMeetings({ client, active, ownerId, initialTab }: { client: FurrixClient; active: PetRow; ownerId: string; initialTab: 'discover' | 'matches' }) {
  const [tab, setTab] = useState(initialTab), [view, setView] = useState<'cards' | 'list'>('cards');
  const [filters, setFilters] = useState<DiscoveryFilters>({ species: active.species, purpose: '', radius: '' });
  const [applied, setApplied] = useState(filters), [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<{ key: string; data: DiscoveryPet[]; last?: string; more: boolean }>();
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [located, setLocated] = useState<boolean | null>(null), [locating, setLocating] = useState<'set' | 'remove'>();
  const [matches, setMatches] = useState<PetMatch[]>([]), [conversation, setConversation] = useState<PetMatch>();
  const [matchNotice, setMatchNotice] = useState(false), [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<string>();
  const alive = useRef(true), writing = useRef(false), deck = useRef<SwipeDeckHandle>(null);
  const key = JSON.stringify(applied), items = page?.key === key ? page.data : [];
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (tab !== 'discover') return; let current = true; setLoading(true); setError(''); setPage(undefined); setDetail(undefined);
    void Promise.all([discoverPets(client, active.id, applied), hasLocation(client, active.id)]).then(([data, location]) => {
      if (current) { setPage({ key, data, last: data[data.length - 1]?.id, more: data.length === 20 }); setLocated(location); }
    }).catch(() => { if (current) setError('Les rencontres ne sont pas encore disponibles sur cet environnement. Réessaie plus tard.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, active.id, applied, attempt, key, tab]);
  useEffect(() => {
    if (tab !== 'matches') return; let current = true; setLoading(true); setError('');
    void listMatches(client, active.id).then((data) => { if (current) setMatches(data); }).catch(() => { if (current) setError('Les matchs n’ont pas pu être chargés.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, active.id, tab, attempt]);
  const remove = useCallback((pet: DiscoveryPet) => setPage((v) => v ? { ...v, data: v.data.filter((p) => p.id !== pet.id) } : v), []);
  /**
   * Enregistre la décision. Renvoie `true` seulement une fois confirmée par le serveur : la carte reste
   * en place jusque-là, et revient si l'envoi échoue. `leave` retire le profil (immédiatement en liste,
   * après l'animation de sortie en cartes).
   */
  const act = async (pet: DiscoveryPet, dir: 'left' | 'right', leave = true) => {
    if (writing.current) return false; writing.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const match = await decide(client, active.id, pet.id, dir);
      if (alive.current) {
        if (leave) remove(pet); setDetail(undefined);
        setNotice(match ? `C’est un match avec ${pet.name} ! La conversation est gratuite.` : dir === 'right' ? `J’aime envoyé au nom de ${active.name}.` : `${pet.name} a été passé.`);
        setMatchNotice(!!match);
      }
      return true;
    } catch { if (alive.current) setError('Décision non confirmée. Réessaie le même geste ou recharge : une décision déjà enregistrée ne peut pas être changée pendant cette bêta.'); return false; }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  };
  const locate = async (removing = false) => {
    setLocating(removing ? 'remove' : 'set'); setError('');
    try { const location = removing ? undefined : await approximateLocation(); if (!alive.current) return; await setLocation(client, active.id, location); if (alive.current) { setLocated(!removing); setNotice(removing ? 'Localisation supprimée.' : 'Zone approximative enregistrée pour cet animal.'); setMatchNotice(false); if (removing) { const next = { ...applied, radius: '' }; setApplied(next); setFilters(next); } else setAttempt((v) => v + 1); } }
    catch { if (alive.current) setError('Position indisponible. Vérifie l’autorisation de localisation, ou continue sans filtre de distance.'); }
    finally { if (alive.current) setLocating(undefined); }
  };
  const more = async () => {
    if (!page?.last || busy) return; setBusy(true); setError('');
    try { const data = await discoverPets(client, active.id, applied, page.last); if (alive.current) setPage((current) => current?.key === key ? { key, data, last: data[data.length - 1]?.id, more: data.length === 20 } : current); }
    catch { if (alive.current) setError('La suite des profils n’a pas pu être chargée.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const apply = (event: FormEvent) => { event.preventDefault(); setPage(undefined); setApplied({ ...filters }); setNotice(''); setMatchNotice(false); };
  const top = items[0];

  const listCard = (pet: DiscoveryPet) => <Card as="article" className="meet-list-card" key={pet.id}>
    <div className="meet-list-photo">{photoOf(client, pet)}</div>
    <div className="meet-list-body">
      <p className="app-eyebrow">{summary(pet)}</p><h2>{pet.name}</h2>
      <p>{place(pet)}</p><p>{owner(pet)}</p>
      {detail === pet.id && <p className="meet-bio">{bio(pet)}</p>}
      <div className="meet-actions">
        <Button variant="out" size="sm" icon="close" aria-label={`Passer ${pet.name}`} disabled={busy} onClick={() => { void act(pet, 'left'); }}>Passer</Button>
        <Button variant="quiet" size="sm" icon="info" aria-expanded={detail === pet.id} aria-label={`Fiche de ${pet.name}`} onClick={() => setDetail(detail === pet.id ? undefined : pet.id)}>Fiche</Button>
        <Button size="sm" icon="heart" aria-label={`J’aime ${pet.name}`} disabled={busy} onClick={() => { void act(pet, 'right'); }}>J’aime</Button>
      </div>
    </div>
  </Card>;

  return <>
    <Segmented className="meet-tabs" aria-label="Parcours rencontres" value={tab} onChange={(next) => { setTab(next); setConversation(undefined); }} options={[{ value: 'discover', label: 'Découvrir', icon: 'cards' }, { value: 'matches', label: 'Mes matchs et messages', icon: 'message' }]} />
    {notice && <Alert tone="ok" title={notice} actions={matchNotice ? <Button variant="out" size="sm" onClick={() => setTab('matches')}>Voir mes matchs</Button> : undefined} />}
    {error && <Alert tone="err" title={error} actions={<Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((v) => v + 1)}>Réessayer le chargement</Button>} />}
    {tab === 'matches' ? conversation ? <Conversation key={conversation.match_id} client={client} match={conversation} ownerId={ownerId} close={() => setConversation(undefined)} /> : <section className="meet-matches">
      <div className="meet-section-head"><h2>Les matchs de {active.name}</h2><Button variant="out" size="sm" icon="retry" loading={loading} loadingLabel="actualisation" onClick={() => setAttempt((v) => v + 1)}>Actualiser les matchs</Button></div>
      {loading ? <Loading label="Chargement des matchs…" /> : !matches.length ? <EmptyState icon="heart" title="Pas encore de match.">Un j’aime réciproque ouvrira une conversation ici.</EmptyState> : <div className="meet-match-list">{matches.map((match) => <Card as="article" key={match.match_id}><h3>{match.name}{match.owner_name ? ` et ${match.owner_name}` : ''}</h3><p>Conversation gratuite après votre match.</p><Button size="sm" icon="message" onClick={() => setConversation(match)}>Écrire</Button></Card>)}</div>}
    </section> : <>
      <details className="meet-settings"><summary>Filtres et proximité</summary>
        <form className="meet-filters" onSubmit={apply}>
          <Field label="Espèce"><Select value={filters.species} onChange={(e) => setFilters((v) => ({ ...v, species: e.target.value }))}><option value="">Toutes</option>{PET_SPECIES.map((s) => <option key={s} value={s}>{label[s]}</option>)}</Select></Field>
          <Field label="Objectif"><Select value={filters.purpose} onChange={(e) => setFilters((v) => ({ ...v, purpose: e.target.value }))}><option value="">Tous</option>{PET_PURPOSES.map((s) => <option key={s} value={s}>{label[s]}</option>)}</Select></Field>
          <Field label="Rayon approximatif" hint={located ? undefined : 'Disponible après avoir indiqué ta zone.'}><Select value={filters.radius} disabled={!located} onChange={(e) => setFilters((v) => ({ ...v, radius: e.target.value }))}><option value="">Sans limite</option>{[5, 10, 25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} km</option>)}</Select></Field>
          <Button type="submit" variant="ink" disabled={busy}>Appliquer les filtres</Button>
        </form>
        <div className="meet-location"><p>La localisation est facultative, arrondie à environ un kilomètre et propre à {active.name}. Seule une distance approximative est affichée aux autres. Le rayon exclut les profils sans localisation.</p>
          <div className="meet-actions"><Button variant="out" size="sm" icon="pin" loading={locating === 'set'} loadingLabel="localisation" disabled={locating === 'remove'} onClick={() => { void locate(); }}>{located ? 'Actualiser ma zone approximative' : 'Utiliser ma zone approximative'}</Button>{located && <Button variant="quiet" size="sm" loading={locating === 'remove'} disabled={locating === 'set'} onClick={() => { void locate(true); }}>Supprimer ma localisation</Button>}</div>
        </div>
      </details>
      <Segmented className="meet-view" aria-label="Affichage des profils" value={view} onChange={setView} options={[{ value: 'cards', label: 'Cartes à balayer', icon: 'cards' }, { value: 'list', label: 'Liste', icon: 'grid' }]} />
      {loading ? <Loading label="Recherche de compagnons…" /> : !items.length ? !error && <EmptyState icon="heart" title="Plus de profils pour le moment.">Modifie tes filtres ou reviens quand de nouveaux testeurs auront ajouté leurs animaux.</EmptyState>
        : view === 'cards' ? <div className="meet-deck">
          <SwipeDeck ref={deck} index={0} items={items} getKey={(pet) => pet.id} getLabel={(pet) => `Profil de ${pet.name}`} likeLabel="J’aime"
            onDecide={(pet, decision) => act(pet, direction(decision), false)} onLeave={remove} onPendingChange={setBusy}
            renderCard={(pet) => <SwipeProfile nameAs="h2" media={photoOf(client, pet)} distance={distance(pet)} name={pet.name} description={summary(pet)} owner={{ initial: (pet.owner_name || '?').charAt(0).toUpperCase(), name: pet.owner_name || 'Son propriétaire', note: label[pet.purpose || ''] || 'objectif non renseigné' }} />} />
          {top && <SwipeActions subject={top.name} likeLabel="J’aime" disabled={busy} onPass={() => deck.current?.pass()} onLike={() => deck.current?.like()} onInfo={() => setDetail(detail === top.id ? undefined : top.id)} hint="Un j’aime réciproque ouvre la conversation gratuite. Aucun score de compatibilité." />}
          {top && detail === top.id && <Card className="meet-detail" aria-label={`Fiche de ${top.name}`}><p>{place(top)}</p><p>{owner(top)}</p><p className="meet-bio">{bio(top)}</p></Card>}
        </div> : <div className="meet-list">{items.map(listCard)}</div>}
      {!loading && page?.more && (!items.length || view === 'list') && <Button variant="out" loading={busy} loadingLabel="chargement" onClick={() => { void more(); }}>Voir la suite des profils</Button>}
      <p className="app-small">Version bêta : les profils passés ne sont pas réaffichés automatiquement. Les vues cartes et liste donnent accès aux mêmes profils.</p>
    </>}
  </>;
}

export default function MeetingsArea({ client, ownerId, pets, initialTab = 'discover' }: { client: FurrixClient; ownerId: string; pets: PetRow[]; initialTab?: 'discover' | 'matches' }) {
  const { active, select } = useActivePet(ownerId, pets);
  return <FurrixScope className="app-page meet-area"><p className="app-eyebrow">Le début d’une belle compagnie</p><h1>{initialTab === 'matches' ? 'Matchs et messages' : 'Rencontres'}</h1>{!active ? <EmptyState icon="paw" title="Qui fait les présentations ?" action={<Button as="a" href="#/animaux" variant="out" size="sm">Créer son profil</Button>}>Ajoute d’abord ton animal pour découvrir ses futurs compagnons.</EmptyState> : <><Field label="Je découvre et j’écris pour" className="meet-animal"><Select value={active.id} onChange={(e) => select(e.target.value)}>{pets.map((pet) => <option value={pet.id} key={pet.id}>{pet.name}</option>)}</Select></Field><AnimalMeetings key={`${ownerId}:${active.id}:${initialTab}`} client={client} active={active} ownerId={ownerId} initialTab={initialTab} /></>}</FurrixScope>;
}
