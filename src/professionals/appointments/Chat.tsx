import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  ChatLayout,
  ChatThread,
  Composer,
  EmptyState,
  Icon,
  Loading,
  MessageBubble,
  Note,
  Separator,
  Stack,
  StatusBadge,
  SystemMessage,
  Who,
} from "../../design-system";
import { useMessageDraft } from "../../meetings/messageDrafts";
import { AppError } from "../../services/errors";
import type { FurrixClient } from "../../services/supabaseClient";
import {
  listAppointments,
  loadProfessionalMessages,
  sendProfessionalMessage,
} from "./service";
import {
  appointmentHref,
  canWrite,
  labels,
  slotLabel,
  type Appointment,
  type ProMessage,
} from "./types";

/** Actualisation périodique, suspendue quand l'onglet est caché. Renvoie le nettoyage. */
function poll(run: () => unknown, every: number, stop: () => void) {
  const tick = () => {
    if (!document.hidden) void run();
  };
  const timer = window.setInterval(tick, every);
  document.addEventListener("visibilitychange", tick);
  return () => {
    stop();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", tick);
  };
}
const merge = (old: ProMessage[], incoming: ProMessage[]) =>
  [...new Map([...old, ...incoming].map((m) => [m.id, m])).values()].sort(
    (a, b) => a.id - b.id,
  );
const clock = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const tone = (status: Appointment["status"]) =>
  status === "confirmed"
    ? "ok"
    : status === "pending" || status === "countered"
      ? "wait"
      : "stop";

/** Conversation d'une demande de service, entre le propriétaire et l'établissement (planche « Conversation » de la garde). */
export function AppointmentChat({
  client,
  me,
  id,
}: {
  client: FurrixClient;
  me: string;
  id: string;
}) {
  const [item, setItem] = useState<Appointment | null | "error" | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [messages, setMessages] = useState<ProMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText, draftRequest] = useMessageDraft("services:" + id);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const sendingRef = useRef(false);
  const pending = useRef<{ text: string; id: string }>();
  const alive = useRef(true);
  const lastId = useRef<number>();

  // La demande : qui est l'autre personne, où en est-elle.
  useEffect(() => {
    let current = true;
    setItem(undefined);
    void listAppointments(client, id)
      .then((list) => {
        if (current) setItem(list[0] ?? null);
      })
      .catch(() => {
        if (current) setItem("error");
      });
    return () => {
      current = false;
    };
  }, [client, id, attempt]);

  // Les messages, actualisés toutes les 10 secondes.
  useEffect(() => {
    alive.current = true;
    let running = false;
    lastId.current = undefined;
    setLoading(true);
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const data = await loadProfessionalMessages(client, id, lastId.current);
        if (!alive.current) return;
        if (data.length) {
          lastId.current = Math.max(lastId.current ?? 0, ...data.map((m) => m.id));
          setMessages((v) => merge(v, data));
        }
        setLoadError(false);
      } catch {
        if (alive.current) setLoadError(true);
      } finally {
        running = false;
        if (alive.current) setLoading(false);
      }
    };
    void load();
    return poll(load, 10_000, () => {
      alive.current = false;
    });
  }, [client, id, attempt]);

  const send = async () => {
    const value = text.trim();
    if (!value || sendingRef.current) return;
    sendingRef.current = true;
    // Même texte après un échec : même identifiant, le serveur ne crée pas de doublon.
    if (pending.current?.text !== value)
      pending.current = { text: value, id: draftRequest ?? crypto.randomUUID() };
    setSending(true);
    setError("");
    try {
      const saved = await sendProfessionalMessage(client, id, value, pending.current.id);
      if (alive.current) {
        setMessages((v) => merge(v, [saved]));
        setText("");
        pending.current = undefined;
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof AppError && ["rate_limited", "forbidden", "validation"].includes(e.code)
            ? e.message
            : "Envoi non confirmé. Tu peux réessayer avec le même texte sans le dupliquer.",
        );
    } finally {
      sendingRef.current = false;
      if (alive.current) setSending(false);
    }
  };

  if (item === undefined) return <Loading label="Chargement de la conversation…" />;
  if (item === "error")
    return (
      <Alert
        tone="err"
        title="La conversation n’a pas pu être chargée."
        actions={
          <Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((a) => a + 1)}>
            Réessayer
          </Button>
        }
      >
        Vérifie ta connexion. Tes messages ne sont pas perdus.
      </Alert>
    );
  if (item === null)
    return (
      <EmptyState
        icon="message"
        title="Conversation indisponible"
        action={
          <Button as="a" href={appointmentHref()} variant="out" size="sm">
            Mes rendez-vous
          </Button>
        }
      >
        Cette demande n’existe pas ou ne te concerne pas.
      </EmptyState>
    );

  const pro = item.role === "professional";
  const name = pro ? item.owner_name?.trim() || "Le propriétaire" : item.professional_name;
  const open = canWrite(item);
  const detail = (
    <Button as="a" href={appointmentHref(item.id)} variant="out" size="sm">
      Voir la demande
    </Button>
  );
  // Le message joint à la demande ouvre la conversation, puis les échanges dans l'ordre.
  const first = item.message ? (
    <MessageBubble key="request" from={item.owner_id === me ? "me" : "them"} time={clock(item.created_at)}>
      {item.message}
    </MessageBubble>
  ) : null;
  return (
    <section aria-label="Conversation">
      <ChatLayout
        context={
          <div className="app-pro-ctx">
            <Icon name="calendar" size={20} />
            <div className="app-pro-ctx__b">
              <p className="fx-t-h3">{item.service_name}</p>
              <p className="fx-t-body-sm">
                {slotLabel(item)} · {labels[item.status]}
              </p>
            </div>
            {detail}
          </div>
        }
        side={
          <Card calm>
            <Stack gap={3}>
              <Who initials={name.charAt(0).toUpperCase()} name={name} subtitle={pro ? "Propriétaire" : "Établissement"} />
              <Separator />
              <p className="fx-t-body-sm">
                {item.service_name} · {slotLabel(item)}
              </p>
              <StatusBadge status={tone(item.status)}>{labels[item.status]}</StatusBadge>
              <Separator />
              {detail}
            </Stack>
          </Card>
        }
      >
        <Note icon="calendar">
          Conversation de rendez-vous : seuls toi et {name} la lisez. Le créneau et les réponses restent dans « Mes rendez-vous ».
        </Note>
        <ChatThread className="app-pro-chat">
          <SystemMessage>Demande envoyée · {stamp(item.created_at)}</SystemMessage>
          {first}
          {loading && !messages.length ? (
            <SystemMessage>Chargement des messages…</SystemMessage>
          ) : !messages.length && !item.message ? (
            <SystemMessage>
              {open ? `Pas encore de message. Pose ta question à ${name}.` : "Aucun message n’a été échangé."}
            </SystemMessage>
          ) : null}
          {messages.map((m) => (
            <MessageBubble key={m.id} from={m.sender_id === me ? "me" : "them"} time={clock(m.created_at)}>
              {m.text}
            </MessageBubble>
          ))}
          {!open ? <SystemMessage>{labels[item.status]}</SystemMessage> : null}
        </ChatThread>
        {loadError ? (
          <Alert
            tone="err"
            title="La conversation n’a pas pu être actualisée."
            actions={
              <Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((a) => a + 1)}>
                Réessayer
              </Button>
            }
          />
        ) : null}
        {error ? <Alert tone="err" title={error} /> : null}
        {open ? (
          <Composer
            className="app-pro-composer"
            value={text}
            onChange={setText}
            onSend={() => {
              void send();
            }}
            sending={sending}
            placeholder={`Écrire à ${name}…`}
            label="Ton message"
          />
        ) : (
          <Note>Cette demande est close : tu ne peux plus envoyer de message, mais l’historique reste consultable.</Note>
        )}
      </ChatLayout>
    </section>
  );
}
