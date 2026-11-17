import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (sending.current || !text.trim() || text.trim().length > 2000) return;
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
  return <section className="meet-conversation"><button className="fx-outline" onClick={close}>Revenir aux matchs</button><p className="fx-eyebrow">Un match, une conversation gratuite</p><h2>{match.name}{match.owner_name ? ` et ${match.owner_name}` : ''}</h2><p className="fx-small">Actualisation toutes les 10 secondes. La proposition d’une rencontre organisée arrivera dans un prochain lot.</p>
    {more && <button onClick={() => { void loadOlder(); }} disabled={older}>Voir les messages précédents</button>}
    {loading && <p role="status">Chargement de la conversation…</p>}
    {!loading && !messages.length && <p>Le premier bonjour est à toi.</p>}
    <ol className="meet-message-list" aria-label="Messages de la conversation">{messages.map((message) => <li className={message.sender_id === ownerId ? 'meet-mine' : ''} key={message.id}><span className="fx-small">{message.sender_id === ownerId ? 'Toi' : match.owner_name || 'Ton correspondant'}</span><p>{message.text}</p><time className="fx-small" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</time></li>)}</ol>
    <form onSubmit={(e) => { void submit(e); }}><label htmlFor="meet-message">Ton message<textarea id="meet-message" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} disabled={busy} rows={3} /></label><button className="fx-primary" disabled={busy || !text.trim()}>{busy ? 'Envoi…' : 'Envoyer'}</button></form>{error && <p role="alert">{error}</p>}
  </section>;
}
