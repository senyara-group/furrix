import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Heart, MapPin, X } from 'lucide-react';
import type { PetRow } from '../types/database';
import type { FurrixClient } from '../services/supabaseClient';
import { PET_SPECIES, PET_PURPOSES } from '../types/pet';
import { PetPhoto } from '../pets/PetPhoto';
import { useActivePet } from './useActivePet';
import { approximateLocation } from './location';
import { discoverPets, decide, hasLocation, setLocation, listMatches } from './service';
import type { DiscoveryFilters, DiscoveryPet, PetMatch } from './types';
import Conversation from './Conversation';
import './meetings.css';
const label: Record<string, string> = { chien: 'Chien', chat: 'Chat', lapin: 'Lapin', oiseau: 'Oiseau', reptile: 'Reptile', rongeur: 'Rongeur', cheval: 'Cheval', ferme: 'Animal de ferme', balade: 'Balades', social: 'Socialisation', reproduction: 'Reproduction', show: 'Expositions' };

function AnimalMeetings({ client, active, ownerId, initialTab }: { client: FurrixClient; active: PetRow; ownerId: string; initialTab: 'discover' | 'matches' }) {
  const [tab, setTab] = useState(initialTab), [view, setView] = useState<'cards' | 'list'>('cards');
  const [filters, setFilters] = useState<DiscoveryFilters>({ species: active.species, purpose: '', radius: '' });
  const [applied, setApplied] = useState(filters), [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<{ key: string; data: DiscoveryPet[]; last?: string; more: boolean }>();
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [located, setLocated] = useState<boolean | null>(null), [locating, setLocating] = useState(false);
  const [matches, setMatches] = useState<PetMatch[]>([]), [conversation, setConversation] = useState<PetMatch>();
  const [matchNotice, setMatchNotice] = useState(false), [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<string>();
  const alive = useRef(true), writing = useRef(false), gesture = useRef<{ x: number; y: number }>();
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
  const act = async (pet: DiscoveryPet, direction: 'left' | 'right') => {
    if (writing.current) return; writing.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const match = await decide(client, active.id, pet.id, direction);
      if (alive.current) {
        setPage((v) => v ? { ...v, data: v.data.filter((p) => p.id !== pet.id) } : v); setDetail(undefined);
        setNotice(match ? `C’est un match avec ${pet.name} ! La conversation est gratuite.` : direction === 'right' ? `J’aime envoyé au nom de ${active.name}.` : `${pet.name} a été passé.`);
        setMatchNotice(!!match);
      }
    } catch { if (alive.current) setError('Décision non confirmée. Réessaie le même geste ou recharge : une décision déjà enregistrée ne peut pas être changée pendant cette bêta.'); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  };
  const locate = async (remove = false) => {
    setLocating(true); setError('');
    try { const location = remove ? undefined : await approximateLocation(); if (!alive.current) return; await setLocation(client, active.id, location); if (alive.current) { setLocated(!remove); setNotice(remove ? 'Localisation supprimée.' : 'Zone approximative enregistrée pour cet animal.'); if (remove) { const next = { ...applied, radius: '' }; setApplied(next); setFilters(next); } else setAttempt((v) => v + 1); } }
    catch { if (alive.current) setError('Position indisponible. Vérifie l’autorisation de localisation, ou continue sans filtre de distance.'); }
    finally { if (alive.current) setLocating(false); }
  };
  const more = async () => {
    if (!page?.last || busy) return; setBusy(true); setError('');
    try { const data = await discoverPets(client, active.id, applied, page.last); if (alive.current) setPage((current) => current?.key === key ? { key, data, last: data[data.length - 1]?.id, more: data.length === 20 } : current); }
    catch { if (alive.current) setError('La suite des profils n’a pas pu être chargée.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const apply = (event: FormEvent) => { event.preventDefault(); setPage(undefined); setApplied({ ...filters }); setNotice(''); setMatchNotice(false); };
  const card = (pet: DiscoveryPet) => <article className="meet-card" key={pet.id} onDragStart={(e) => e.preventDefault()} onPointerDown={view === 'cards' ? (e) => { if ((e.target as HTMLElement).closest('button,a,input,select')) return; e.currentTarget.setPointerCapture?.(e.pointerId); gesture.current = { x: e.clientX, y: e.clientY }; } : undefined} onPointerUp={view === 'cards' ? (e) => { const start = gesture.current; gesture.current = undefined; if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) void act(pet, dx > 0 ? 'right' : 'left'); } : undefined} onPointerCancel={() => { gesture.current = undefined; }}>
    <PetPhoto client={client} pet={{ ...pet, verified: false, created_at: '' }} /><div className="meet-card-body"><p className="fx-eyebrow">{label[pet.species] || pet.species}{pet.age ? ` · ${pet.age}` : ''}</p><h2>{pet.name}</h2><p>{pet.breed || 'Race non renseignée'}{pet.gender ? ` · ${pet.gender}` : ''}</p><p><MapPin size={16} aria-hidden /> {pet.city || 'Ville non renseignée'} · {pet.distance_km === null ? 'Distance inconnue' : `environ ${pet.distance_km} km`}</p><p>Avec {pet.owner_name || 'son propriétaire'} · {label[pet.purpose || ''] || 'Objectif non renseigné'}</p>{detail === pet.id && <p className="meet-bio">{pet.bio || 'Sa présentation arrive bientôt.'}</p>}
      <div className="meet-actions"><button disabled={busy} className="fx-outline" onClick={() => { void act(pet, 'left'); }}><X size={18} aria-hidden />Passer</button><button disabled={busy} className="fx-outline" aria-expanded={detail === pet.id} onClick={() => setDetail(detail === pet.id ? undefined : pet.id)}>Fiche</button><button disabled={busy} className="fx-primary" onClick={() => { void act(pet, 'right'); }}><Heart size={18} aria-hidden />J’aime</button></div><p className="fx-small">Un j’aime réciproque ouvre la conversation gratuite. Aucun score de compatibilité.</p></div>
  </article>;
  return <><div className="meet-tabs" aria-label="Parcours rencontres"><button aria-pressed={tab === 'discover'} onClick={() => { setTab('discover'); setConversation(undefined); }}>Découvrir</button><button aria-pressed={tab === 'matches'} onClick={() => setTab('matches')}>Mes matchs et messages</button></div>
    {notice && <p role="status" className="meet-notice">{notice}{matchNotice && <button onClick={() => setTab('matches')}>Voir mes matchs</button>}</p>}
    {error && <div role="alert" className="meet-error">{error}<button onClick={() => setAttempt((v) => v + 1)}>Réessayer le chargement</button></div>}
    {tab === 'matches' ? conversation ? <Conversation key={conversation.match_id} client={client} match={conversation} ownerId={ownerId} close={() => setConversation(undefined)} /> : <section><h2>Les matchs de {active.name}</h2><button className="fx-outline" onClick={() => setAttempt((v) => v + 1)}>Actualiser les matchs</button>{loading ? <p role="status">Chargement…</p> : !matches.length ? <p>Pas encore de match. Un j’aime réciproque ouvrira une conversation ici.</p> : <div className="meet-match-list">{matches.map((match) => <article key={match.match_id}><h3>{match.name}{match.owner_name ? ` et ${match.owner_name}` : ''}</h3><p>Conversation gratuite après votre match.</p><button className="fx-primary" onClick={() => setConversation(match)}>Écrire</button></article>)}</div>}</section> : <>
      <details className="meet-settings"><summary>Filtres et proximité</summary><form className="meet-filters" onSubmit={apply}><label>Espèce<select value={filters.species} onChange={(e) => setFilters((v) => ({ ...v, species: e.target.value }))}><option value="">Toutes</option>{PET_SPECIES.map((s) => <option key={s} value={s}>{label[s]}</option>)}</select></label><label>Objectif<select value={filters.purpose} onChange={(e) => setFilters((v) => ({ ...v, purpose: e.target.value }))}><option value="">Tous</option>{PET_PURPOSES.map((s) => <option key={s} value={s}>{label[s]}</option>)}</select></label><label>Rayon approximatif<select value={filters.radius} disabled={!located} onChange={(e) => setFilters((v) => ({ ...v, radius: e.target.value }))}><option value="">Sans limite</option>{[5,10,25,50,100,250,500].map((n) => <option key={n} value={n}>{n} km</option>)}</select></label><button className="fx-primary" disabled={busy}>Appliquer les filtres</button></form>
      <div className="meet-location"><p>La localisation est facultative, arrondie à environ un kilomètre et propre à {active.name}. Seule une distance approximative est affichée aux autres. Le rayon exclut les profils sans localisation.</p><button disabled={locating} onClick={() => { void locate(); }}>{locating ? 'Localisation…' : located ? 'Actualiser ma zone approximative' : 'Utiliser ma zone approximative'}</button>{located && <button disabled={locating} onClick={() => { void locate(true); }}>Supprimer ma localisation</button>}</div></details>
      <div className="meet-view"><button aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Cartes à balayer</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>Liste</button></div>
      {loading ? <p role="status">Recherche de compagnons…</p> : items.length ? <div className={`meet-results meet-${view}`}>{(view === 'cards' ? items.slice(0,1) : items).map(card)}</div> : !error && <div className="fx-empty"><Heart size={36} aria-hidden /><h2>Plus de profils pour le moment.</h2><p>Modifie tes filtres ou reviens quand de nouveaux testeurs auront ajouté leurs animaux.</p></div>}
      {!loading && page?.more && (!items.length || view === 'list') && <button disabled={busy} className="fx-outline" onClick={() => { void more(); }}>Voir la suite des profils</button>}
      <p className="fx-small">Version bêta : les profils passés ne sont pas réaffichés automatiquement. Les vues cartes et liste donnent accès aux mêmes profils.</p>
    </>}
  </>;
}

export default function MeetingsArea({ client, ownerId, pets, initialTab = 'discover' }: { client: FurrixClient; ownerId: string; pets: PetRow[]; initialTab?: 'discover' | 'matches' }) {
  const { active, select } = useActivePet(ownerId, pets);
  return <section className="fx-page meet-area"><p className="fx-eyebrow">Le début d’une belle compagnie</p><h1>{initialTab === 'matches' ? 'Matchs et messages' : 'Rencontres'}</h1>{!active ? <div className="fx-empty"><h2>Qui fait les présentations ?</h2><p>Ajoute d’abord ton animal pour découvrir ses futurs compagnons.</p><a className="fx-primary" href="#/animaux">Créer son profil</a></div> : <><label className="meet-animal">Je découvre et j’écris pour<select value={active.id} onChange={(e) => select(e.target.value)}>{pets.map((pet) => <option value={pet.id} key={pet.id}>{pet.name}</option>)}</select></label><AnimalMeetings key={`${ownerId}:${active.id}:${initialTab}`} client={client} active={active} ownerId={ownerId} initialTab={initialTab} /></>}</section>;
}
