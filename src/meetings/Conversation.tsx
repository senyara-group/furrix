import { useEffect, useRef, useState } from 'react';
import { Alert, Button, ChatThread, Composer, Loading, MessageBubble } from '../design-system';
import type { FurrixClient } from '../services/supabaseClient';
import { loadMessages, sendMessage } from './service';
import type { MatchMessage, PetMatch } from './types';

function mergeMessages(old: MatchMessage[], incoming: MatchMessage[]) {
  return [...new Map([...old, ...incoming].map((item) => [item.id, item])).values()].sort((a, b) => a.id - b.id);
}
export default function Conversation({ client, match, ownerId, close }: { client: FurrixClient; match: PetMatch; ownerId: string; close: () => void }) {
  const [messages, setMessages] = useState<MatchMessage[]>([]), [text, setText] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [older, setOlder] = useState(false), [more, setMore] = useState(false);
  const alive = useRef(true), sending = useRef(false), pending = useRef<{ text: string; id: string }>();
  useEffect(() => {
    alive.current = true; let running = false;
    const load = async () => {
      if (running) return; running = true;
      try { const data = await loadMessages(client, match.match_id); if (alive.current) { setMessages((v) => mergeMessages(v, data)); setMore((v) => v || data.length === 50); setError(''); } }
      catch { if (alive.current) setError('La conversation n’a pas pu être actualisée.'); }
      finally { running = false; if (alive.current) setLoading(false); }
    };
    void load(); const interval = window.setInterval(() => { void load(); }, 10_000);
    return () => { alive.current = false; window.clearInterval(interval); };
  }, [client, match.match_id]);
  /**
   * Un même texte garde son identifiant de requête tant qu'il n'est pas confirmé : un nouvel essai
   * après une réponse perdue ne crée pas de doublon côté serveur.
   */
  const submit = async () => {
    if (sending.current || !text.trim() || text.trim().length > 2000) return;
    const value = text.trim(); if (pending.current?.text !== value) pending.current = { text: value, id: crypto.randomUUID() };
    sending.current = true; setBusy(true); setError('');
    try {
      const saved = await sendMessage(client, match.match_id, value, pending.current.id);
      if (alive.current) { setMessages((v) => mergeMessages(v, [saved])); setText(''); pending.current = undefined; }
    } catch { if (alive.current) setError('Envoi non confirmé. Tu peux réessayer avec le même texte sans le dupliquer.'); }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  };
  const loadOlder = async () => {
    if (!messages.length || older) return; setOlder(true);
    try { const data = await loadMessages(client, match.match_id, messages[0]!.id); if (alive.current) { setMessages((v) => mergeMessages(v, data)); setMore(data.length === 50); } }
    catch { if (alive.current) setError('Les anciens messages n’ont pas pu être chargés.'); }
    finally { if (alive.current) setOlder(false); }
  };
  const time = (value: string) => <time dateTime={value}>{new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</time>;
  const other = match.owner_name || 'Ton correspondant';
  return <section className="meet-conversation" aria-labelledby="meet-conversation-title">
    <Button variant="quiet" size="sm" icon="chevronLeft" onClick={close}>Revenir aux matchs</Button>
    <p className="app-eyebrow">Un match, une conversation gratuite</p><h2 id="meet-conversation-title">{match.name}{match.owner_name ? ` et ${match.owner_name}` : ''}</h2>
    <p className="app-small">Actualisation toutes les 10 secondes. La proposition d’une rencontre organisée arrivera dans un prochain lot.</p>
    {more && <Button variant="quiet" size="sm" loading={older} loadingLabel="chargement" onClick={() => { void loadOlder(); }}>Voir les messages précédents</Button>}
    {loading && <Loading label="Chargement de la conversation…" />}
    {!loading && !messages.length && <p>Le premier bonjour est à toi.</p>}
    <ChatThread className="meet-thread" aria-label="Messages de la conversation">{messages.map((message) => {
      const mine = message.sender_id === ownerId;
      return <MessageBubble key={message.id} from={mine ? 'me' : 'them'} time={<><span className="fx-vh">{mine ? 'Toi' : other}, </span>{time(message.created_at)}</>}>{message.text}</MessageBubble>;
    })}</ChatThread>
    {error && <Alert tone="err" title={error} />}
    <Composer className="meet-composer" label="Ton message" placeholder="Écris ton message" value={text} onChange={setText} onSend={() => { void submit(); }} sending={busy} maxLength={2000} />
  </section>;
}
