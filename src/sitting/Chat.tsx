import {useMessageDraft} from '../meetings/messageDrafts';
import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, ChatLayout, ChatThread, Composer, EmptyState, Icon, Loading, MessageBubble, Note, PageHeader, Separator, Stack, StatusBadge,
  SystemMessage, Who,
} from '../design-system';
import { AppError } from '../services/errors';
import type { FurrixClient } from '../services/supabaseClient';
import { getSitter, listMySittings, listSittingThreads, loadSittingMessages, sendSittingMessage } from './service';
import { clock, nameOf, period, phaseOf, shortPeriod, stamp, statusOf } from './format';
import { gardeHref } from './links';
import type { MySitting, SittingMessage } from './types';

/** Actualisation périodique, suspendue quand l'onglet est caché. Renvoie le nettoyage. */
function poll(run: () => unknown, every: number, stop: () => void) {
  const tick = () => { if (!document.hidden) void run(); };
  const timer = window.setInterval(tick, every);
  document.addEventListener('visibilitychange', tick);
  return () => { stop(); window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
}
const merge = (old: SittingMessage[], incoming: SittingMessage[]) => [...new Map([...old, ...incoming].map((m) => [m.id, m])).values()].sort((a, b) => a.id - b.id);

/** Conversation de garde entre un propriétaire et un gardien (planche « Conversation »), avant ou après une demande. */
export function SittingChat({ client, me, owner, sitter }: { client: FurrixClient; me: string; owner: string; sitter: string }) {
  const role = me === owner ? 'owner' : 'sitter';
  const [info, setInfo] = useState<{ name: string; sitting: MySitting | null } | null | 'error' | undefined>();
  const [infoAttempt, setInfoAttempt] = useState(0);
  const [messages, setMessages] = useState<SittingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text,setText,draftRequest]=useMessageDraft('garde:'+owner+':'+sitter);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const sendingRef=useRef(false);
  const pending = useRef<{ text: string; id: string }>();
  const alive = useRef(true);
  const lastId = useRef<number>();

  useEffect(() => {
    let current = true; setInfo(undefined);
    void (async () => {
      const [sittings, threads] = await Promise.all([listMySittings(client), listSittingThreads(client)]);
      const mine = sittings.filter((x) => x.owner_id === owner && x.sitter_id === sitter);
      const open = mine.find((x) => ['pending', 'accepted', 'confirmed'].includes(x.status)) ?? mine[0] ?? null;
      const thread = threads.find((x) => x.owner_id === owner && x.sitter_id === sitter);
      let name = open?.other_name ?? thread?.other_name ?? null;
      if (!open && !thread && role === 'owner') {
        const found = await getSitter(client, sitter);
        if (!found) { if (current) setInfo(null); return; }
        name = found.name;
      } else if (!open && !thread) { if (current) setInfo(null); return; }
      if (current) setInfo({ name: nameOf(name, role === 'owner' ? 'Le gardien' : 'Le propriétaire'), sitting: open });
    })().catch(() => { if (current) setInfo('error'); });
    return () => { current = false; };
  }, [client, owner, sitter, role, infoAttempt]);

  useEffect(() => {
    alive.current = true; let running = false; lastId.current = undefined;
    const load = async () => {
      if (running) return; running = true;
      try {
        const data = await loadSittingMessages(client, owner, sitter, lastId.current);
        if (!alive.current) return;
        if (data.length) { lastId.current = Math.max(lastId.current ?? 0, ...data.map((m) => m.id)); setMessages((v) => merge(v, data)); }
        setError('');
      } catch { if (alive.current) setError('La conversation n’a pas pu être actualisée.'); }
      finally { running = false; if (alive.current) setLoading(false); }
    };
    void load();
    return poll(load, 10_000, () => { alive.current = false; });
  }, [client, owner, sitter]);

  const send = async () => {
    const value = text.trim(); if (!value||sendingRef.current) return;
    sendingRef.current=true;
    if (pending.current?.text !== value) pending.current = { text: value, id: draftRequest??crypto.randomUUID() };
    setSending(true); setError('');
    try { const saved = await sendSittingMessage(client, owner, sitter, value, pending.current.id); if (alive.current) { setMessages((v) => merge(v, [saved])); setText(''); pending.current = undefined; } }
    catch (e) { if (alive.current) setError(e instanceof AppError && e.code === 'rate_limited' ? e.message : 'Envoi non confirmé. Tu peux réessayer avec le même texte sans le dupliquer.'); }
    finally { sendingRef.current=false;if (alive.current) setSending(false); }
  };

  if (info === undefined) return <Loading label="Chargement de la conversation…" />;
  if (info === 'error') return <Alert tone="err" title="La conversation n’a pas pu être chargée." actions={<Button variant="out" size="sm" icon="retry" onClick={() => setInfoAttempt((a) => a + 1)}>Réessayer</Button>}>
    Vérifie ta connexion. Tes messages ne sont pas perdus.</Alert>;
  if (info === null) return <EmptyState icon="message" title="Conversation indisponible" action={<Button as="a" href={gardeHref({ vue: 'mes-gardes' })} variant="out" size="sm">Mes gardes</Button>}>
    Cette conversation n’existe pas ou n’est plus accessible.
  </EmptyState>;
  const { name, sitting } = info;
  const phase = sitting ? phaseOf(sitting) : null;
  const badge = sitting && phase ? statusOf(phase, role, name, sitting.cancelled_by === me) : null;
  const toPay = role === 'owner' && phase === 'accepted';
  const detail = sitting ? <Button as="a" href={gardeHref({ vue: toPay ? 'paiement' : 'suivi', demande: sitting.id })} variant={toPay ? 'ink' : 'out'} size="sm">{toPay ? 'Payer' : 'Voir la demande'}</Button>
    : role === 'owner' ? <Button as="a" href={gardeHref({ vue: 'demander', gardien: sitter })} size="sm">Demander une garde</Button> : null;
  // Messages et événements de la demande, dans l'ordre chronologique.
  const events = sitting ? [{ at: sitting.created_at, key: 'sent', node: <SystemMessage key="sent">Demande envoyée · {stamp(sitting.created_at)}</SystemMessage> },
    ...(sitting.responded_at && (sitting.status === 'declined' || sitting.status === 'accepted' || sitting.status === 'confirmed' || sitting.status === 'cancelled')
      ? [{ at: sitting.responded_at, key: 'reply', node: <SystemMessage key="reply"><Icon name={sitting.status === 'declined' ? 'close' : 'check'} size={16} />
          {sitting.status === 'declined' ? (role === 'owner' ? `${name} a refusé` : 'Tu as refusé') : (role === 'owner' ? `${name} a accepté` : 'Tu as accepté')} · {stamp(sitting.responded_at)}</SystemMessage> }] : [])] : [];
  const timeline = [...events, ...messages.map((m) => ({ at: m.created_at, key: `m${m.id}`,
    node: <MessageBubble key={`m${m.id}`} from={m.sender_id === me ? 'me' : 'them'} time={clock(m.created_at)}>{m.text}</MessageBubble> }))]
    .sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  return <section aria-label="Conversation">
    <PageHeader back={{ label: 'Mes gardes', onClick: () => { window.location.hash = gardeHref({ vue: 'mes-gardes' }); } }} title={`Conversation avec ${name}`}
      status={badge ? <StatusBadge status={badge.status}>{badge.label}</StatusBadge> : undefined} />
    <ChatLayout
      context={<div className="gd-ctx"><Icon name="homeDoor" size={20} />
        <div className="gd-ctx__b"><p className="fx-t-h3 fx-num">{sitting ? shortPeriod(sitting.starts_at, sitting.ends_at) : 'Pas encore de demande'}</p><p className="fx-t-body-sm">{badge?.label ?? 'Pose tes questions avant de demander une garde.'}</p></div>
        {detail}
        {sitting ? <Button as="a" href={gardeHref({ vue: 'probleme', demande: sitting.id })} variant="quiet" size="sm" aria-label="Signaler un problème" icon="flag" /> : null}</div>}
      side={<Card calm><Stack gap={3}>
        <Who initials={name.charAt(0).toUpperCase()} name={name} subtitle={sitting ? (role === 'owner' ? `Garde de ${sitting.pet_name}` : `Propriétaire de ${sitting.pet_name}`) : 'Gardien'} />
        {sitting ? <><Separator /><p className="gd-ln"><Icon name="calendar" size={20} /><b className="fx-num">{period(sitting.starts_at, sitting.ends_at)}</b></p>
          {badge ? <StatusBadge status={badge.status}>{badge.label}</StatusBadge> : null}
          {toPay ? <p className="fx-t-body-sm">La garde n’est pas encore réservée.</p> : null}</> : null}
        <Separator />
        {detail}
        {sitting ? <Button as="a" href={gardeHref({ vue: 'probleme', demande: sitting.id })} variant="quiet" size="sm" icon="flag">Signaler un problème</Button> : null}
      </Stack></Card>}>
      <Note icon="homeDoor">Conversation de garde : la demande, l’accord et le paiement restent dans « Mes gardes ».</Note>
      <ChatThread className="gd-chat">
        {loading ? <SystemMessage>Chargement des messages…</SystemMessage> : !messages.length && !sitting ? <SystemMessage>Le premier message est à toi.</SystemMessage> : null}
        {timeline.map((item) => item.node)}
      </ChatThread>
      {error ? <Alert tone="err" title={error} /> : null}
      <Composer className="gd-composer" value={text} onChange={setText} onSend={() => { void send(); }} sending={sending} placeholder={`Écrire à ${name}…`} label="Ton message" />
    </ChatLayout>
  </section>;
}
