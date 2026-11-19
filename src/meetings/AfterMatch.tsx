import {AppError} from '../services/errors';
import {useMessageDraft} from './messageDrafts';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActionBar, Alert, Button, Card, ChatLayout, ChatThread, CheckList, Composer, DetailLayout, EmptyState, Field, FurrixScope, Icon,
  Input, Loading, MessageBubble, Note, OptionGroup, Page, PageHeader, ResultList, ResultRow, Separator, SlotGrid, Stack, StatusBadge,
  Steps, SystemMessage, Text, Textarea, Who, type StepState,
} from '../design-system';
import type { FurrixClient } from '../services/supabaseClient';
import { usePhoneBar } from '../app/phoneBar';
import { createProposal, endMatch, latestProposal, listMyMatches, loadMessages, loadOlderMessages, reportOrBlock, sendMessage, updateProposal } from './service';
import type { MatchMessage, MeetingProposal, MyMatch, ProposalDraft, ReportReason } from './types';
import { usePetPhotoUrl } from './usePetPhotoUrl';
import { messagesHref, views, type View } from './links';
import './after-match.css';

const activityLabel = { balade: 'Balade', jeu: 'Jeu au parc' } as const;
const reasons: Array<{ value: ReportReason; label: string }> = [
  { value: 'profil_trompeur', label: 'Profil trompeur' }, { value: 'message_deplace', label: 'Message déplacé' },
  { value: 'animal_danger', label: 'Animal en danger' }, { value: 'autre', label: 'Autre' },
];
const species: Record<string, [string, string]> = { chien: ['Chien', 'Chienne'], chat: ['Chat', 'Chatte'] };
const STEP_LABELS = ['Match', 'Proposition', 'Réponse', 'Rencontre'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** « Sam. 22 nov., 10:00 » */
export const longSlot = (iso: string) => cap(new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)));
/** « Sam. 22 · 10:00 » */
const shortSlot = (iso: string) => {
  const d = new Date(iso);
  return `${cap(new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(d))} ${d.getDate()} · ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d)}`;
};
const day = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
const time = (iso: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const ownerOf = (m: MyMatch) => m.owner_name?.trim() || 'son propriétaire';
const describe = (m: MyMatch) => [species[m.species]?.[m.gender === '♀' ? 1 : 0] ?? null, m.breed, m.age].filter(Boolean).join(' · ');
const steps = (reached: number, stopped = false) => STEP_LABELS.map((label, i): { label: string; state: StepState } =>
  ({ label, state: i < reached ? 'done' : i === reached ? (stopped ? 'stop' : 'now') : 'todo' }));

/** Paramètres de la page Messages dans l'adresse : `#/messages?match=…&vue=…`. */
function useMessagesParams() {
  const read = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const [params, setParams] = useState(read);
  useEffect(() => {
    const update = () => setParams(read());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const view = params.get('vue');
  return { match: params.get('match'), view: (views as readonly string[]).includes(view ?? '') ? view as View : 'conversation' };
}
const go = (match?: string, view?: View) => { window.location.hash = messagesHref(match, view); };

/** Actualisation périodique, suspendue quand l'onglet est caché et relancée dès son retour. Renvoie le nettoyage. */
function poll(run: () => unknown, every: number, stop: () => void) {
  const tick = () => { if (!document.hidden) void run(); };
  const timer = window.setInterval(tick, every);
  document.addEventListener('visibilitychange', tick);
  return () => { stop(); window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
}

/* ───────── Liste des matchs ───────── */

const statusOf: Record<string, { status: 'wait' | 'todo' | 'ok' | 'stop'; label: string }> = {
  pending: { status: 'wait', label: 'Proposition en attente' }, accepted: { status: 'ok', label: 'Rencontre confirmée' },
  declined: { status: 'stop', label: 'Proposition déclinée' }, cancelled: { status: 'stop', label: 'Rencontre annulée' },
};

function MatchRow({ client, match }: { client: FurrixClient; match: MyMatch }) {
  const url = usePetPhotoUrl(client, match.photo);
  const [draft]=useMessageDraft(match.match_id);
  const status = match.proposal_status ? statusOf[match.proposal_status] : undefined;
  return <ResultRow as="a" href={messagesHref(match.match_id)} photo={url ? { src: url, alt: '' } : undefined} initials={url ? undefined : match.name.charAt(0).toUpperCase()}
    name={`${match.name} et ${ownerOf(match)}`}
    tag={draft.trim()||status?<>{draft.trim()&&<StatusBadge status="todo">Brouillon</StatusBadge>}{status&&<StatusBadge status={status.status}>{status.label}</StatusBadge>}</>:undefined}
    meta={draft.trim() ? `Brouillon : ${draft.trim().slice(0,80)}` : match.last_text ? `« ${match.last_text.length > 80 ? `${match.last_text.slice(0, 80)}…` : match.last_text} »` : `Match avec ${match.my_pet_name} · ${day(match.matched_at)}`} />;
}

function MatchList({ client }: { client: FurrixClient }) {
  const [state,setState]=useState<{status:'loading'|'ready'|'error';data:MyMatch[]}>({status:'loading',data:[]});
  const [attempt,setAttempt]=useState(0),[refreshing,setRefreshing]=useState(false),[query,setQuery]=useState('');
  useEffect(()=>{
    let current=true,running=false;
    const load=async()=>{
      if(running)return;running=true;if(current)setRefreshing(true);
      try{const data=await listMyMatches(client);if(current)setState({status:'ready',data});}
      catch(error){if(current)setState(previous=>({data:error instanceof AppError&&error.code==='network'?previous.data:[],status:'error'}));}
      finally{running=false;if(current)setRefreshing(false);}
    };
    void load();return poll(load,15_000,()=>{current=false;});
  },[client,attempt]);
  const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-FR');
  const words=normalize(query).trim().split(/\s+/).filter(Boolean);
  const filtered=state.data.filter(m=>{const text=normalize([m.name,m.owner_name,m.my_pet_name].filter(Boolean).join(' '));return words.every(word=>text.includes(word));});
  const retry=<Button variant="out" size="sm" icon="retry" loading={refreshing} onClick={()=>setAttempt(a=>a+1)}>Actualiser</Button>;
  return <>
    <PageHeader title="Messages" subtitle="Une conversation s’ouvre gratuitement après chaque match." />
    {state.status==='error'&&<Alert tone="err" title={state.data.length?'Actualisation indisponible':'Tes conversations n’ont pas pu être chargées.'} actions={retry}>{state.data.length?'Les dernières conversations chargées restent affichées. Réessaie pour récupérer les nouveaux messages.':undefined}</Alert>}
    {state.status==='loading'?<Loading label="Chargement de tes conversations…"/>:<>
      {state.data.length>0&&<Stack gap={3}>
        <Field label="Rechercher une conversation"><Input type="search" value={query} maxLength={100} placeholder="Animal ou propriétaire" onChange={e=>setQuery(e.target.value)}/></Field>
        {state.data.length===100&&<Note>La recherche porte sur tes 100 conversations les plus récentes.</Note>}
        <div className="app-message-tools"><Note>{filtered.length} conversation{filtered.length>1?'s':''}</Note>{state.status!=='error'&&retry}</div>
      </Stack>}
      {filtered.length?<ResultList>{filtered.map(m=><MatchRow key={m.match_id} client={client} match={m}/>)}</ResultList>:state.data.length?
        <EmptyState icon="search" title="Aucune conversation trouvée" action={<Button variant="quiet" onClick={()=>setQuery('')}>Effacer la recherche</Button>}>Essaie le prénom du propriétaire ou le nom d’un des animaux.</EmptyState>:
        state.status!=='error'&&<EmptyState icon="message" title="Pas encore de conversation" action={<Button as="a" href="#/rencontres" variant="out" size="sm">Découvrir des compagnons</Button>}>Un j’aime de chaque côté, et la conversation s’ouvre ici.</EmptyState>}
    </>}
  </>;
}

/* ───────── Un match ───────── */

function SideCard({ client, match, proposal, children }: { client: FurrixClient; match: MyMatch; proposal?: Pick<MeetingProposal, 'activity' | 'place'> & { slot?: string } | null; children?: ReactNode }) {
  const url = usePetPhotoUrl(client, match.photo);
  return <Card calm><Stack gap={3}>
    <Who photo={url ? { src: url, alt: '' } : undefined} initials={url ? undefined : match.name.charAt(0).toUpperCase()} name={match.name}
      subtitle={[describe(match), `propriétaire : ${ownerOf(match)}`, `match avec ${match.my_pet_name}`].filter(Boolean).join(' · ')} />
    {proposal ? <><Separator />
      <p className="am-ln"><Icon name="walk" size={20} /><b>{activityLabel[proposal.activity]}</b></p>
      {proposal.slot ? <p className="am-ln"><Icon name="calendar" size={20} /><b className="fx-num">{longSlot(proposal.slot)}</b></p> : null}
      {proposal.place.trim() ? <p className="am-ln"><Icon name="pin" size={20} /><span>{proposal.place}</span></p> : null}
    </> : null}
    {children}
  </Stack></Card>;
}

function StepsCard({ reached, stopped }: { reached: number; stopped?: boolean }) {
  return <Card calm><Stack gap={3}><Text variant="kicker">Où en est la rencontre</Text><Steps label="Étapes" steps={steps(reached, stopped)} /></Stack></Card>;
}

/* Créneaux : heure locale « AAAA-MM-JJTHH:MM », convertie en ISO à l'envoi. */
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nextSlotInput = () => `${dayKey(new Date(Date.now() + 2 * 86400_000))}T10:00`;
const HOURS = Array.from({ length: 12 }, (_, i) => `${pad(8 + i)}:00`);
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const monthName = (d: Date) => cap(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d));
const validSlot = (s: string) => !!s && !Number.isNaN(new Date(s).getTime());

/** Un créneau : le champ ouvre un petit calendrier (jour puis heure) sous lui. */
function SlotField({ value, onChange, label }: { value: string; onChange: (slot: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const initial = validSlot(value) ? new Date(value) : new Date(today.getTime() + 2 * 86400_000);
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [picked, setPicked] = useState(() => dayKey(initial));
  const [step, setStep] = useState<'day' | 'hour'>('day');
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = () => {
    if (!open && validSlot(value)) { const d = new Date(value); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setPicked(dayKey(d)); }
    setStep('day');
    setOpen((o) => !o);
  };
  const lead = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const now = Date.now();
  const pickedDate = new Date(`${picked}T00:00`);
  return <div className="am-slotfield" ref={box}>
    <button type="button" className="fx-input am-slotbtn" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
      <Icon name="calendar" size={18} />
      <span className={validSlot(value) ? 'fx-num' : 'am-placeholder'}>{validSlot(value) ? longSlot(new Date(value).toISOString()) : 'Choisir un jour et une heure'}</span>
    </button>
    {open && step === 'hour' ? <div className="am-cal" role="dialog" aria-label={`${label} : heure`}>
      <div className="am-cal__head">
        <button type="button" className="am-cal__nav" aria-label="Changer de jour" onClick={() => setStep('day')}>‹</button>
        <b>{cap(day(pickedDate.toISOString()))}</b>
        <span className="am-cal__spacer" aria-hidden="true" />
      </div>
      <p className="am-cal__label">Choisis l’heure</p>
      <div className="am-cal__hours" role="group" aria-label="Heure">
        {HOURS.map((h) => { const slot = `${picked}T${h}`; return <button key={h} type="button" className="am-cal__hour fx-num"
          aria-pressed={value === slot} disabled={new Date(slot).getTime() <= now} onClick={() => { onChange(slot); setOpen(false); }}>{h}</button>; })}
      </div>
    </div> : open ? <div className="am-cal" role="dialog" aria-label={`${label} : jour`}>
      <div className="am-cal__head">
        <button type="button" className="am-cal__nav" aria-label="Mois précédent" disabled={month <= thisMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <b>{monthName(month)}</b>
        <button type="button" className="am-cal__nav" aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="am-cal__grid" role="group" aria-label="Jour">
        {WEEKDAYS.map((w, i) => <span key={i} className="am-cal__wd" aria-hidden="true">{w}</span>)}
        {cells.map((d, i) => d ? <button key={i} type="button" className="am-cal__day fx-num" aria-pressed={dayKey(d) === picked}
          aria-label={new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)}
          data-today={dayKey(d) === dayKey(today) || undefined} disabled={d < today || HOURS.every((h) => new Date(`${dayKey(d)}T${h}`).getTime() <= now)}
          onClick={() => { setPicked(dayKey(d)); setStep('hour'); }}>{d.getDate()}</button>
          : <span key={i} />)}
      </div>
    </div> : null}
  </div>;
}

function ProposalForm({ client, match, onSent }: { client: FurrixClient; match: MyMatch; onSent: (p: MeetingProposal) => void }) {
  const owner = ownerOf(match);
  const storage = `furrix:proposal-draft:${match.match_id}`;
  // Brouillon gardé sur cet appareil jusqu'à l'envoi confirmé.
  const [draft, setDraft] = useState<ProposalDraft & { request: string }>(() => {
    try { const saved = sessionStorage.getItem(storage); if (saved) return JSON.parse(saved); } catch { /* sans stockage local */ }
    return { activity: 'balade', place: '', slots: [nextSlotInput()], message: '', request: crypto.randomUUID() };
  });
  const [errors, setErrors] = useState<{ place?: string; slots?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { try { sessionStorage.setItem(storage, JSON.stringify(draft)); } catch { /* sans stockage local */ } }, [draft, storage]);
  const set = (next: Partial<ProposalDraft>) => setDraft((d) => ({ ...d, ...next }));
  const send = async () => {
    const problems: typeof errors = {};
    if (draft.place.trim().length < 3) problems.place = 'Indique le lieu du rendez-vous.';
    const dates = draft.slots.filter(Boolean).map((s) => new Date(s));
    if (!dates.length || dates.some((d) => Number.isNaN(d.getTime()) || d.getTime() <= Date.now())) problems.slots = 'Choisis un ou plusieurs créneaux à venir.';
    else if (new Set(dates.map((d) => d.getTime())).size !== dates.length) problems.slots = 'Deux créneaux sont identiques.';
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true); setFailed(false);
    try {
      const saved = await createProposal(client, match.match_id, { ...draft, slots: dates.map((d) => d.toISOString()) }, draft.request);
      try { sessionStorage.removeItem(storage); } catch { /* sans stockage local */ }
      onSent(saved);
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  const first = draft.slots.find((s) => s && !Number.isNaN(new Date(s).getTime()));
  return <section aria-label="Proposition">
    <PageHeader back={{ label: `Conversation avec ${owner}`, onClick: () => go(match.match_id) }} title={`Proposer une rencontre à ${owner} et ${match.name}`}
      status={failed ? <StatusBadge status="alert">Non envoyée</StatusBadge> : <StatusBadge status="draft">Brouillon</StatusBadge>}
      subtitle={`Après votre match du ${day(match.matched_at)} avec ${match.name}.`} />
    <DetailLayout aside={<SideCard client={client} match={match} proposal={{ activity: draft.activity, place: draft.place, slot: first ? new Date(first).toISOString() : undefined }} />}
      actions={<ActionBar><Button icon={failed ? 'retry' : 'send'} loading={busy} onClick={() => { void send(); }}>{failed ? 'Réessayer l’envoi' : 'Envoyer la proposition'}</Button></ActionBar>}>
      {failed ? <Alert tone="err" title="La proposition n’est pas partie">Connexion interrompue ou proposition déjà en cours. Ton texte et tes créneaux sont conservés sur cet appareil ; {owner} n’a rien reçu.</Alert>
        : <Note icon="heart">{match.my_pet_name} et {match.name} ont matché le {day(match.matched_at)} : tu peux proposer une activité, un lieu et un créneau.</Note>}
      <Stack gap={5}>
        <Stack gap={2}><Text variant="label" as="p">Type de rencontre</Text>
          <OptionGroup aria-label="Type de rencontre" value={draft.activity} onChange={(activity) => set({ activity })} options={[{ value: 'balade', label: 'Balade' }, { value: 'jeu', label: 'Jeu au parc' }]} /></Stack>
        <Field label="Lieu" hint="Pour une première rencontre, un lieu public est conseillé." error={errors.place}>
          <Input value={draft.place} maxLength={120} placeholder="Ex. Parc de la Citadelle, entrée Champ de Mars" onChange={(e) => set({ place: e.target.value })} />
        </Field>
        <Stack gap={2}>
          <Text variant="label" as="p">Créneaux proposés</Text>
          {draft.slots.map((slot, i) => <div className="am-slot" key={i}>
            <SlotField label={`Créneau ${i + 1}`} value={slot} onChange={(next) => set({ slots: draft.slots.map((s, j) => j === i ? next : s) })} />
            {draft.slots.length > 1 ? <Button variant="quiet" size="sm" onClick={() => set({ slots: draft.slots.filter((_, j) => j !== i) })}>Retirer</Button> : null}
          </div>)}
          {draft.slots.length < 3 ? <Button variant="out" size="sm" icon="calendar" className="am-addslot" onClick={() => set({ slots: [...draft.slots, ''] })}>Ajouter un créneau</Button> : null}
          {errors.slots ? <p className="fx-field__error" role="alert"><Icon name="warning" size={16} />{errors.slots}</p> : <p className="fx-hint">Jusqu’à 3 créneaux : {owner} en choisira un.</p>}
        </Stack>
        <Field label={`Message à ${owner}`} optional>
          <Textarea value={draft.message} maxLength={500} rows={4} placeholder={`Présente ${match.my_pet_name} en quelques mots…`} onChange={(e) => set({ message: e.target.value })} />
        </Field>
      </Stack>
    </DetailLayout>
  </section>;
}

function ProposalView({ client, match, proposal, ownerId, onChange }: { client: FurrixClient; match: MyMatch; proposal: MeetingProposal; ownerId: string; onChange: (p: MeetingProposal) => void }) {
  const owner = ownerOf(match);
  const mine = proposal.proposer_id === ownerId;
  const [slot, setSlot] = useState<string | null>(proposal.slots[0] ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const run = async (action: 'withdraw' | 'decline' | 'accept') => {
    setBusy(action); setError('');
    try { onChange(await updateProposal(client, proposal.id, action, action === 'accept' ? slot ?? undefined : undefined)); }
    catch { setError('L’action n’a pas été confirmée. Réessaie.'); } finally { setBusy(null); }
  };
  const summary = { activity: proposal.activity, place: proposal.place, slot: proposal.chosen_slot ?? proposal.slots[0] };
  const toChat = <Button as="a" href={messagesHref(match.match_id)} variant="out" icon="message">Écrire à {owner}</Button>;
  const discover = <Button as="a" href="#/rencontres" variant="quiet">Découvrir d’autres compagnons</Button>;
  const back = { label: `Conversation avec ${owner}`, onClick: () => go(match.match_id) };
  let head: { title: string; status?: ReactNode; subtitle?: string }, body: ReactNode, actions: ReactNode;

  if (proposal.status === 'pending' && mine) {
    head = { title: 'Proposition envoyée', status: <StatusBadge status="wait">En attente de {owner}</StatusBadge> };
    body = <><StepsCard reached={2} /><Card><Stack><Text variant="h2">{owner} a reçu ta proposition</Text><Text variant="body">{owner} peut la lire et y répondre gratuitement. Sa réponse s’affichera ici et dans la conversation.</Text></Stack></Card></>;
    actions = <ActionBar><Button variant="danger" loading={busy === 'withdraw'} onClick={() => { void run('withdraw'); }}>Retirer ma proposition</Button></ActionBar>;
  } else if (proposal.status === 'pending') {
    head = { title: 'Proposition de rencontre', status: <StatusBadge status="todo">À toi de répondre</StatusBadge>, subtitle: `${match.my_pet_name} et ${match.name} ont matché le ${day(match.matched_at)}` };
    body = <>
      <Card><Stack gap={4}><Who initials={match.name.charAt(0).toUpperCase()} name={`${match.name} et ${owner}`} subtitle={[describe(match), `match avec ${match.my_pet_name} le ${day(match.matched_at)}`].filter(Boolean).join(' · ')} />
        {proposal.message ? <><Separator /><Text variant="body">«&nbsp;{proposal.message}&nbsp;»</Text></> : null}</Stack></Card>
      <Card calm><Stack gap={3}><Text variant="kicker">Créneaux proposés par {owner}</Text>
        <SlotGrid aria-label="Créneau choisi" value={slot} onChange={setSlot} options={proposal.slots.map((s) => ({ value: s, label: shortSlot(s), disabled: new Date(s).getTime() <= Date.now() }))} /></Stack></Card>
      <Note>Répondre est gratuit. Tu peux décliner sans donner de raison.</Note>
    </>;
    actions = <ActionBar>
      <Button icon="check" disabled={!slot} loading={busy === 'accept'} onClick={() => { void run('accept'); }}>{slot ? `Accepter ${shortSlot(slot).replace(' · ', ' à ')}` : 'Choisis un créneau'}</Button>
      {toChat}
      <Button variant="danger" loading={busy === 'decline'} onClick={() => { void run('decline'); }}>Décliner</Button>
    </ActionBar>;
  } else if (proposal.status === 'withdrawn') {
    head = { title: 'Proposition retirée', status: <StatusBadge status="stop">Retirée</StatusBadge> };
    body = <><StepsCard reached={2} stopped /><Alert tone="info" title="Proposition retirée">{mine ? `${owner} ne la voit plus dans ses demandes.` : `${owner} a retiré sa proposition.`}</Alert></>;
    actions = <ActionBar><Button as="a" href={messagesHref(match.match_id)} variant="out">Revenir à la conversation</Button>{discover}</ActionBar>;
  } else if (proposal.status === 'declined') {
    head = { title: mine ? `${owner} a décliné` : 'Proposition déclinée', status: <StatusBadge status="stop">Déclinée</StatusBadge> };
    body = <><StepsCard reached={2} stopped /><Card><Stack><Text variant="h2">Ce ne sera pas pour cette fois</Text>
      <Text variant="body">{mine ? `${owner} a décliné ta proposition. Aucune raison n’est demandée.` : `Tu as décliné la proposition de ${owner}.`} Votre match et votre conversation restent ouverts : vous pouvez proposer un autre moment.</Text></Stack></Card></>;
    actions = <ActionBar><Button as="a" href={messagesHref(match.match_id)}>Revenir à la conversation</Button>{discover}</ActionBar>;
  } else if (proposal.status === 'accepted') {
    head = { title: 'Rencontre confirmée', status: <StatusBadge status="ok">Confirmée</StatusBadge> };
    body = <>
      <Alert tone="ok" title={`Rendez-vous ${longSlot(proposal.chosen_slot!).toLowerCase()}`}>{mine ? `${owner} a accepté.` : 'Tu as accepté.'} {match.my_pet_name} et {match.name} se retrouvent : {proposal.place}.</Alert>
      <StepsCard reached={3} />
      <Card><Stack gap={3}><Text variant="h2">Pour une première rencontre</Text>
        <CheckList items={['Restez dans un lieu public et gardez les chiens en laisse le temps qu’ils fassent connaissance.', `Un empêchement ? Préviens ${owner} depuis la conversation.`]} /></Stack></Card>
    </>;
    actions = <ActionBar>{toChat}<Button as="a" href={messagesHref(match.match_id, 'annuler')} variant="danger">Annuler la rencontre</Button></ActionBar>;
  } else {
    const byMe = proposal.cancelled_by === ownerId;
    head = { title: 'Rencontre annulée', status: <StatusBadge status="stop">{byMe ? 'Annulée par toi' : `Annulée par ${owner}`}</StatusBadge> };
    body = <><StepsCard reached={3} stopped /><Alert tone="info" title="Rencontre annulée">{byMe ? `Nous avons prévenu ${owner}.` : `${owner} a annulé la rencontre${proposal.cancel_note ? ` : « ${proposal.cancel_note} »` : '.'}`}</Alert></>;
    actions = <ActionBar><Button as="a" href={messagesHref(match.match_id)} variant="out">Revenir à la conversation</Button>{discover}</ActionBar>;
  }
  return <section aria-label={head.title}>
    <PageHeader back={back} title={head.title} status={head.status} subtitle={head.subtitle} />
    <DetailLayout aside={<SideCard client={client} match={match} proposal={summary} />} actions={actions}>
      {error ? <Alert tone="err" title={error} /> : null}
      {body}
    </DetailLayout>
  </section>;
}

function CancelView({ client, match, proposal, onChange }: { client: FurrixClient; match: MyMatch; proposal: MeetingProposal; onChange: (p: MeetingProposal) => void }) {
  const owner = ownerOf(match);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true); setError('');
    try { onChange(await updateProposal(client, proposal.id, 'cancel', undefined, note)); go(match.match_id, 'rencontre'); }
    catch { setError('L’annulation n’a pas été confirmée. Réessaie.'); } finally { setBusy(false); }
  };
  return <section aria-label="Annuler : confirmation">
    <PageHeader back={{ label: 'Rencontre', onClick: () => go(match.match_id, 'rencontre') }} title="Annuler la rencontre ?" status={<StatusBadge status="ok">Confirmée</StatusBadge>} />
    <DetailLayout aside={<SideCard client={client} match={match} proposal={{ activity: proposal.activity, place: proposal.place, slot: proposal.chosen_slot ?? undefined }} />}
      actions={<ActionBar><Button as="a" href={messagesHref(match.match_id, 'rencontre')} variant="out">Garder la rencontre</Button><Button variant="danger" loading={busy} onClick={() => { void confirm(); }}>Confirmer l’annulation</Button></ActionBar>}>
      {error ? <Alert tone="err" title={error} /> : null}
      <Card><Stack gap={4}><Text variant="h2">Nous préviendrons {owner}</Text>
        <Text variant="body">La rencontre du {longSlot(proposal.chosen_slot!).toLowerCase()} sera annulée. Tu pourras en proposer une autre plus tard.</Text>
        <Field label={`Un mot pour ${owner}`} optional><Textarea value={note} maxLength={300} rows={3} placeholder="Désolé, un imprévu…" onChange={(e) => setNote(e.target.value)} /></Field>
      </Stack></Card>
    </DetailLayout>
  </section>;
}

/** Confirmation distincte du blocage : seul ce match est fermé. */
function EndMatchView({ client, match, onEnded }: { client: FurrixClient; match: MyMatch; onEnded: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const running = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const confirm = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await endMatch(client, match.match_id); if (alive.current) onEnded(); }
    catch { if (alive.current) setError('La fin du match n’a pas été confirmée. Réessaie.'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  return <section aria-label="Mettre fin au match">
    <PageHeader title="Mettre fin au match" back={{ label: 'Conversation', onClick: () => go(match.match_id) }} />
    <DetailLayout aside={<SideCard client={client} match={match} />}
      actions={<ActionBar><Button as="a" href={messagesHref(match.match_id)} variant="out">Garder le match</Button><Button variant="danger" loading={busy} onClick={() => { void confirm(); }}>Confirmer la fin du match</Button></ActionBar>}>
      <Alert tone="info" title="Cette action est définitive">La conversation entre {match.my_pet_name} et {match.name} sera retirée pour vous deux. Les propositions et la rencontre prévue seront annulées. Vous ne pourrez plus échanger pour ce match.</Alert>
      <Note>Les autres matchs restent ouverts. Pour empêcher tout échange avec ce propriétaire, utilise « Signaler ou bloquer ».</Note>
      {error && <Alert tone="err" title={error} />}
    </DetailLayout>
  </section>;
}

function ReportView({ client, match }: { client: FurrixClient; match: MyMatch }) {
  const owner = ownerOf(match);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState<'report' | 'block' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'report' | 'block' | null>(null);
  usePhoneBar(useMemo(() => done ? { title: 'Signalement', back: { label: 'Retour aux messages', onClick: () => go() } } : null, [done]));
  const send = async (report: boolean) => {
    if (report && !reason) { setError('Choisis ce que tu veux signaler.'); return; }
    setBusy(report ? 'report' : 'block'); setError('');
    try { await reportOrBlock(client, match.match_id, report, reason ?? undefined, details); setDone(report ? 'report' : 'block'); }
    catch { setError('Ta demande n’a pas été confirmée. Réessaie.'); } finally { setBusy(null); }
  };
  if (done) return <section aria-label="Signalement envoyé">
    <PageHeader title={done === 'report' ? 'Signalement envoyé' : 'Blocage effectué'} status={done === 'report' ? <StatusBadge status="wait">En cours d’examen</StatusBadge> : undefined} />
    <DetailLayout actions={<ActionBar><Button as="a" href="#/rencontres" variant="out">Retour aux rencontres</Button></ActionBar>}>
      <Alert tone="ok" title={done === 'report' ? 'Merci, c’est transmis' : 'C’est fait'}>{done === 'report' ? `L’équipe Furrix examinera ton signalement. Tu as aussi bloqué ${owner}.` : `Tu ne verras plus le profil de ${owner}, et ${owner} ne pourra plus t’écrire.`}</Alert>
    </DetailLayout>
  </section>;
  return <section aria-label="Signaler ou bloquer">
    <PageHeader back={{ label: 'Conversation', onClick: () => go(match.match_id) }} title="Signaler ou bloquer" />
    <DetailLayout aside={<SideCard client={client} match={match} />}
      actions={<ActionBar><Button variant="ink" icon="send" loading={busy === 'report'} disabled={busy === 'block'} onClick={() => { void send(true); }}>Envoyer le signalement</Button>
        <Button variant="out" icon="block" loading={busy === 'block'} disabled={busy === 'report'} onClick={() => { void send(false); }}>Bloquer sans signaler</Button></ActionBar>}>
      {error ? <Alert tone="err" title={error} /> : null}
      <Card calm><Stack gap={4}>
        <Stack gap={2}><Text variant="label" as="p">Que veux-tu signaler ?</Text><OptionGroup aria-label="Motif" value={reason} onChange={setReason} options={reasons} /></Stack>
        <Field label="Précise" optional><Textarea value={details} maxLength={1000} rows={3} placeholder="Ce qui s’est passé…" onChange={(e) => setDetails(e.target.value)} /></Field>
      </Stack></Card>
      <Card calm><Stack gap={2}><Text variant="h3">Bloquer {owner}</Text><Text variant="body">Tu ne verras plus son profil et {owner} ne pourra plus t’écrire. Le signalement bloque aussi.</Text></Stack></Card>
    </DetailLayout>
  </section>;
}

function Conversation({ client, match, proposal, ownerId }: { client: FurrixClient; match: MyMatch; proposal: MeetingProposal | null; ownerId: string }) {
  const owner = ownerOf(match);
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText, draftRequest] = useMessageDraft(match.match_id);
  const [sending, setSending] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ text: string; id: string }>();
  const sendInProgress = useRef(false);
  const alive = useRef(true);
  const merge = (old: MatchMessage[], incoming: MatchMessage[]) => [...new Map([...old, ...incoming].map((m) => [m.id, m])).values()].sort((a, b) => a.id - b.id);
  // Dernier message reçu par actualisation (pas par envoi : un message de l'autre, plus ancien, pourrait sinon être sauté).
  const lastId = useRef<number>();
  useEffect(() => {
    alive.current = true; let running = false; lastId.current = undefined;
    const load = async () => {
      if (running) return; running = true;
      try {
        const data = await loadMessages(client, match.match_id, lastId.current);
        if (!alive.current) return;
        if (lastId.current === undefined) setHasOlder(data.length === 50);
        if (data.length) { lastId.current = Math.max(lastId.current ?? 0, ...data.map((m) => m.id)); setMessages((v) => merge(v, data)); }
        setError('');
      }
      catch { if (alive.current) setError('La conversation n’a pas pu être actualisée.'); }
      finally { running = false; if (alive.current) setLoading(false); }
    };
    void load();
    return poll(load, 10_000, () => { alive.current = false; });
  }, [client, match.match_id]);
  const loadOlder = async () => {
    if (olderLoading || !messages[0]) return;
    setOlderLoading(true);
    try {
      const data = await loadOlderMessages(client, match.match_id, messages[0].id);
      if (alive.current) { setMessages(v => merge(v, data)); setHasOlder(data.length === 50); }
    } catch { if (alive.current) setError('Les anciens messages n’ont pas pu être chargés.'); }
    finally { if (alive.current) setOlderLoading(false); }
  };
  const send = async () => {
    const value = text.trim(); if (!value || sendInProgress.current) return;
    sendInProgress.current = true;
    if (pending.current?.text !== value) pending.current = { text: value, id: draftRequest ?? crypto.randomUUID() };
    setSending(true); setError('');
    try { const saved = await sendMessage(client, match.match_id, value, pending.current.id); if (alive.current) { setMessages((v) => merge(v, [saved])); setText(''); pending.current = undefined; } }
    catch { if (alive.current) setError('Envoi non confirmé. Tu peux réessayer avec le même texte sans le dupliquer.'); }
    finally { sendInProgress.current = false; if (alive.current) setSending(false); }
  };
  const open = proposal && (proposal.status === 'pending' || proposal.status === 'accepted');
  const ctxTitle = proposal?.status === 'accepted' ? longSlot(proposal.chosen_slot!) : proposal?.status === 'pending' ? (proposal.proposer_id === ownerId ? 'Proposition envoyée' : 'Proposition reçue') : 'Aucune rencontre prévue';
  const ctxSub = proposal?.status === 'accepted' ? 'Rencontre confirmée' : proposal?.status === 'pending' ? (proposal.proposer_id === ownerId ? `En attente de ${owner}` : 'À toi de répondre') : 'Propose une activité, un lieu et un créneau.';
  const meetingButton = open
    ? <Button as="a" href={messagesHref(match.match_id, 'rencontre')} variant="out" size="sm">{proposal.status === 'accepted' ? 'Voir la rencontre' : 'Voir la proposition'}</Button>
    : <Button as="a" href={messagesHref(match.match_id, 'proposer')} size="sm">Proposer</Button>;
  return <section aria-label="Conversation">
    <PageHeader back={{ label: 'Messages', onClick: () => go() }} title={`Conversation avec ${owner}`}
      status={proposal?.status === 'accepted' ? <StatusBadge status="ok">Rencontre confirmée</StatusBadge> : <StatusBadge status="ok">Match</StatusBadge>} />
    <ChatLayout
      context={<div className="am-ctx"><Icon name={proposal?.status === 'accepted' ? 'walk' : 'calendar'} size={20} />
        <div className="am-ctx__b"><p className="fx-t-h3 fx-num">{ctxTitle}</p><p className="fx-t-body-sm">{ctxSub}</p></div>
        {meetingButton}
        <Button as="a" href={messagesHref(match.match_id, 'signaler')} variant="quiet" size="sm" className="am-ctx__flag" aria-label="Signaler ou bloquer" icon="flag" /></div>}
      side={<SideCard client={client} match={match} proposal={open ? { activity: proposal.activity, place: proposal.place, slot: proposal.chosen_slot ?? proposal.slots[0] } : null}>
        <Separator />
        {open ? <Button as="a" href={messagesHref(match.match_id, 'rencontre')} variant="out" size="sm">{proposal.status === 'accepted' ? 'Voir la rencontre' : 'Voir la proposition'}</Button>
          : <Button as="a" href={messagesHref(match.match_id, 'proposer')} size="sm" icon="calendar">Proposer une rencontre</Button>}
        <Button as="a" href={messagesHref(match.match_id, 'signaler')} variant="quiet" size="sm" icon="flag">Signaler ou bloquer</Button>
      </SideCard>}>
      <Button as="a" href={messagesHref(match.match_id, 'terminer')} variant="quiet" size="sm" icon="xCircle">Mettre fin au match</Button>
      <Note icon="heart">Conversation ouverte gratuitement depuis le match de {match.my_pet_name} et {match.name}, le {day(match.matched_at)}</Note>
      <ChatThread className="am-chat">
        {hasOlder && <Button variant="quiet" disabled={olderLoading} onClick={() => { void loadOlder(); }}>{olderLoading ? 'Chargement…' : 'Charger les anciens messages'}</Button>}
        <SystemMessage><Icon name="heartFill" size={16} />Match de {match.my_pet_name} et {match.name} · {day(match.matched_at)}, {time(match.matched_at)}</SystemMessage>
        {loading ? <SystemMessage>Chargement des messages…</SystemMessage> : !messages.length ? <SystemMessage>Le premier bonjour est à toi.</SystemMessage> : null}
        {messages.map((m) => <MessageBubble key={m.id} from={m.sender_id === ownerId ? 'me' : 'them'} time={time(m.created_at)}>{m.text}</MessageBubble>)}
      </ChatThread>
      {error ? <Alert tone="err" title={error} /> : null}
      {text.trim()&&<Note>Ton brouillon reste disponible pendant ta navigation. Il sera effacé à la déconnexion ou à la fermeture de l’application.</Note>}
      <Composer className="am-composer" value={text} onChange={setText} onSend={() => { void send(); }} sending={sending} placeholder={`Écrire à ${owner}…`} label="Ton message" />
    </ChatLayout>
  </section>;
}

function MatchSpace({ client, ownerId, matchId, view }: { client: FurrixClient; ownerId: string; matchId: string; view: View }) {
  const [match, setMatch] = useState<MyMatch | null>();
  const [ended, setEnded] = useState(false);
  const [proposal, setProposal] = useState<MeetingProposal | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (ended) return;
    let current = true; setError(false);
    const load = () => Promise.all([listMyMatches(client, matchId), latestProposal(client, matchId)]).then(([list, p]) => {
      if (current) { setMatch(list[0] ?? null); setProposal(p); }
    });
    load().catch(() => { if (current) setError(true); });
    // La réponse de l'autre personne s'affiche sans recharger la page.
    return poll(() => load().catch(() => {}), 15_000, () => { current = false; });
  }, [client, matchId, attempt, ended]);

  const owner = match ? ownerOf(match) : '';
  const titles: Record<View, string> = { conversation: owner, proposer: 'Proposer une rencontre', rencontre: 'Rencontre', annuler: 'Annuler', signaler: 'Signaler', terminer: 'Terminer le match' };
  const back = useCallback(() => {
    if (view === 'conversation') go(); else if (view === 'annuler') go(matchId, 'rencontre'); else go(matchId);
  }, [view, matchId]);
  usePhoneBar(useMemo(() => ended ? { title: 'Match terminé', back: { label: 'Retour aux messages', onClick: () => go() } } : match ? { title: titles[view], back: { label: view === 'conversation' ? 'Retour aux messages' : 'Retour', onClick: back } } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [match?.match_id, owner, view, back, ended]));

  if (ended) return <EmptyState icon="xCircle" title="Match terminé" action={<Button as="a" href="#/messages" variant="out">Retour aux messages</Button>}>La conversation et les propositions de ce match ne sont plus accessibles.</EmptyState>;
  if (error) return <Alert tone="err" title="Ce match n’a pas pu être chargé." actions={<Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((a) => a + 1)}>Réessayer</Button>} />;
  if (match === undefined) return <Loading label="Chargement…" />;
  if (match === null) return <EmptyState icon="message" title="Conversation indisponible" action={<Button as="a" href="#/messages" variant="out" size="sm">Retour aux messages</Button>}>
    Ce match n’existe plus ou n’est plus accessible.
  </EmptyState>;

  const open = proposal && (proposal.status === 'pending' || proposal.status === 'accepted') ? proposal : null;
  if (view === 'terminer') return <EndMatchView client={client} match={match} onEnded={() => setEnded(true)} />;
  if (view === 'signaler') return <ReportView client={client} match={match} />;
  if (view === 'proposer' && !open) return <ProposalForm client={client} match={match} onSent={(p) => { setProposal(p); go(matchId, 'rencontre'); }} />;
  if (view === 'annuler' && proposal?.status === 'accepted') return <CancelView client={client} match={match} proposal={proposal} onChange={setProposal} />;
  if ((view === 'rencontre' || view === 'proposer' || view === 'annuler') && proposal) return <ProposalView key={proposal.id + proposal.status} client={client} match={match} proposal={proposal} ownerId={ownerId} onChange={setProposal} />;
  return <Conversation client={client} match={match} proposal={proposal} ownerId={ownerId} />;
}

/** Page Messages : matchs, conversation et rencontre (planche 1b « Après le match »). */
export default function MessagesArea({ client, ownerId }: { client: FurrixClient; ownerId: string }) {
  const { match, view } = useMessagesParams();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [match, view]);
  return <FurrixScope className="meet-root am-root"><Page>
    {match ? <MatchSpace key={match} client={client} ownerId={ownerId} matchId={match} view={view} /> : <MatchList client={client} />}
  </Page></FurrixScope>;
}
