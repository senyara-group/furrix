import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  Note,
  Segmented,
  Stack,
  StatusBadge,
  Textarea,
  type Status,
} from "../../design-system";
import type { FurrixClient } from "../../services/supabaseClient";
import { listAppointments, updateAppointment } from "./service";
import { mutationError, useRemote } from "./shared";
import {
  appointmentChatHref,
  canWrite,
  receivedDetailHref,
  receivedHref,
  slotLabel,
  slotsHref,
  type Appointment,
} from "./types";

export type ReceivedTab = "a-traiter" | "a-venir" | "passees";

/** Statut vu par l'établissement : ce qu'il doit faire, ou ce qui s'est passé. */
const proStatus: Record<Appointment["status"], { status: Status; label: string }> = {
  pending: { status: "todo", label: "À traiter" },
  countered: { status: "wait", label: "Autre créneau proposé : en attente de réponse" },
  confirmed: { status: "ok", label: "Rendez-vous confirmé" },
  declined: { status: "stop", label: "Demande refusée" },
  withdrawn: { status: "stop", label: "Retirée par le propriétaire" },
  cancelled: { status: "stop", label: "Rendez-vous annulé" },
};

const open = (a: Appointment) => a.status === "pending" || a.status === "countered";
const at = (iso: string) => new Date(iso).getTime();

/**
 * Répartition des demandes reçues :
 * à traiter (ouvertes, créneau pas encore commencé), à venir (confirmées, pas terminées), passées (le reste).
 */
export function sortReceived(items: Appointment[], now = Date.now()) {
  const mine = items.filter((a) => a.role === "professional");
  const todo = mine.filter((a) => open(a) && at(a.starts_at) > now);
  const coming = mine.filter((a) => a.status === "confirmed" && at(a.ends_at) > now);
  const past = mine.filter((a) => !todo.includes(a) && !coming.includes(a));
  const soonest = (x: Appointment, y: Appointment) => at(x.starts_at) - at(y.starts_at);
  return {
    "a-traiter": todo.sort(soonest),
    "a-venir": coming.sort(soonest),
    passees: past.sort((x, y) => -soonest(x, y)),
  } satisfies Record<ReceivedTab, Appointment[]>;
}

const empty: Record<ReceivedTab, string> = {
  "a-traiter": "Aucune demande à traiter. Les nouvelles demandes s’afficheront ici.",
  "a-venir": "Aucun rendez-vous confirmé à venir.",
  passees: "Aucune demande passée pour le moment.",
};

/** Personne qui a fait la demande : son prénom, sinon une mention neutre. */
const who = (a: Appointment) => a.owner_name?.trim() || "Un membre bêta";
const petLine = (a: Appointment) =>
  a.pet_name
    ? [a.pet_name, a.pet_species, a.pet_breed, a.pet_age].filter(Boolean).join(" · ")
    : "Informations non partagées";

type Ask = { kind: "decline" | "cancel"; note: string };

/** Une demande reçue, avec les actions permises par son statut (le serveur reste juge). */
function RequestCard({
  client,
  item,
  tab,
  onDone,
}: {
  client: FurrixClient;
  item: Appointment;
  tab: ReceivedTab;
  onDone: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ask, setAsk] = useState<Ask | null>(null);
  const lock = useRef(false);
  const badge = proStatus[item.status];
  const upcoming = item.status === "confirmed" && at(item.ends_at) > Date.now();
  const actionable = open(item) && at(item.starts_at) > Date.now();
  const act = async (action: "confirm" | "decline" | "cancel", note = "") => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await updateAppointment(client, {
        p_id: item.id,
        p_action: action,
        ...(action === "confirm" ? { p_slot: item.slot_id } : {}),
        p_note: note.trim(),
      });
      setAsk(null);
      onDone(
        action === "confirm"
          ? `Rendez-vous confirmé avec ${who(item)}.`
          : action === "decline"
            ? `Demande de ${who(item)} refusée.`
            : `Rendez-vous avec ${who(item)} annulé.`,
      );
    } catch (e) {
      setError(mutationError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const title = `${item.service_name} · ${who(item)}`;
  return (
    <Card as="article" className="app-req" aria-label={title}>
      <Stack gap={3}>
        <div className="app-req__head">
          <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
          {open(item) && !actionable && <StatusBadge status="draft">Créneau dépassé</StatusBadge>}
        </div>
        <h2 className="app-req__title">{item.service_name}</h2>
        <dl className="app-req__facts">
          <div>
            <dt>Date</dt>
            <dd>{slotLabel(item)}</dd>
          </div>
          <div>
            <dt>Personne</dt>
            <dd>{who(item)}</dd>
          </div>
          <div>
            <dt>Animal</dt>
            <dd>{petLine(item)}</dd>
          </div>
        </dl>
        {item.message && (
          <blockquote className="app-req__message">
            <span className="fx-t-kicker">Message</span>
            <p className="app-pro-text">{item.message}</p>
          </blockquote>
        )}
        {item.status === "cancelled" && item.cancelled_by && (
          <p className="app-req__muted">
            Annulé par {item.cancelled_by === item.professional_id ? "toi" : "le propriétaire"}
            {item.cancel_note ? ` : ${item.cancel_note}` : "."}
          </p>
        )}
        {error && <Alert tone="err" title={error} />}
        {ask ? (
          <Stack gap={3} className="app-req__confirm">
            <p>
              {ask.kind === "decline"
                ? `Refuser la demande de ${who(item)} ? Elle ne pourra plus être acceptée.`
                : `Annuler le rendez-vous avec ${who(item)} ? Le propriétaire le verra dans son suivi.`}
            </p>
            <Field label={ask.kind === "decline" ? "Un mot pour le propriétaire" : "Motif d’annulation"} optional>
              <Textarea
                value={ask.note}
                disabled={busy}
                maxLength={ask.kind === "decline" ? 1000 : 300}
                onChange={(e) => setAsk({ ...ask, note: e.target.value })}
              />
            </Field>
            <div className="app-req__actions">
              <Button variant="main" loading={busy} onClick={() => void act(ask.kind, ask.note)}>
                {ask.kind === "decline" ? "Oui, refuser" : "Oui, annuler"}
              </Button>
              <Button variant="quiet" disabled={busy} onClick={() => setAsk(null)}>
                {ask.kind === "decline" ? "Garder la demande" : "Conserver le rendez-vous"}
              </Button>
            </div>
          </Stack>
        ) : (
          <div className="app-req__actions">
            {actionable && item.status === "pending" && (
              <Button variant="main" icon="check" loading={busy} onClick={() => void act("confirm")}>
                Accepter
              </Button>
            )}
            {actionable && (
              <Button variant="out" disabled={busy} onClick={() => setAsk({ kind: "decline", note: "" })}>
                Refuser
              </Button>
            )}
            {upcoming && (
              <Button variant="out" disabled={busy} onClick={() => setAsk({ kind: "cancel", note: "" })}>
                Annuler le rendez-vous
              </Button>
            )}
            <Button as="a" href={appointmentChatHref(item.id) + "&depuis=demandes"} variant="quiet" icon="message">
              {canWrite(item) ? "Ouvrir la conversation" : "Voir la conversation"}
            </Button>
            <Button as="a" href={receivedDetailHref(item.id, tab)} variant="quiet">
              {actionable ? "Proposer un autre créneau" : "Voir le détail"}
            </Button>
          </div>
        )}
      </Stack>
    </Card>
  );
}

/** Demandes reçues par l'établissement : à traiter, à venir, passées. */
export function ReceivedRequests({
  client,
  tab,
  onTab,
}: {
  client: FurrixClient;
  tab: ReceivedTab;
  onTab: (tab: ReceivedTab) => void;
}) {
  const remote = useRemote(() => listAppointments(client), [client]);
  const [done, setDone] = useState("");
  const groups = remote.data ? sortReceived(remote.data) : null;
  const total = groups ? groups["a-traiter"].length + groups["a-venir"].length + groups.passees.length : 0;
  const list = groups?.[tab] ?? [];
  return (
    <Stack gap={4}>
      <div className="app-pro-actions">
        <Button as="a" href={slotsHref} variant="out" icon="calendar">
          Mes créneaux
        </Button>
        <Button variant="quiet" icon="retry" disabled={!remote.data && !remote.error} onClick={() => { setDone(""); remote.reload(); }}>
          Actualiser
        </Button>
      </div>
      {done && <Alert tone="ok" title={done} />}
      {remote.error ? (
        <Alert
          tone="err"
          title="Les demandes reçues n’ont pas pu être chargées. Vérifie ta connexion puis réessaie."
          actions={
            <Button variant="out" icon="retry" onClick={remote.reload}>
              Réessayer
            </Button>
          }
        />
      ) : !groups ? (
        <Loading label="Chargement des demandes reçues…" />
      ) : total === 0 ? (
        <EmptyState
          icon="calendar"
          title="Aucune demande reçue pour le moment"
          action={
            <Button as="a" href={slotsHref} variant="out" size="sm">
              Publier des créneaux
            </Button>
          }
        >
          Les propriétaires demandent un rendez-vous sur un de tes créneaux publiés. Leurs demandes s’afficheront ici.
        </EmptyState>
      ) : (
        <>
          <Segmented
            fill
            aria-label="Demandes reçues"
            value={tab}
            onChange={(v) => { setDone(""); onTab(v); }}
            options={[
              { value: "a-traiter", label: `À traiter (${groups["a-traiter"].length})` },
              { value: "a-venir", label: `À venir (${groups["a-venir"].length})` },
              { value: "passees", label: "Passées" },
            ]}
          />
          {list.length ? (
            <Stack gap={4} as="section" aria-label={tab === "a-traiter" ? "À traiter" : tab === "a-venir" ? "À venir" : "Passées"}>
              {list.map((item) => (
                <RequestCard
                  key={item.id + ":" + item.status}
                  client={client}
                  item={item}
                  tab={tab}
                  onDone={(text) => { setDone(text); remote.reload(); }}
                />
              ))}
            </Stack>
          ) : (
            <p className="app-req__empty" role="status">{empty[tab]}</p>
          )}
          {remote.data?.length === 100 && <Note>Les 100 demandes les plus récentes sont affichées.</Note>}
        </>
      )}
    </Stack>
  );
}

/** Accès aux demandes reçues depuis « Mon activité » : nombre à traiter, et lien vers la liste. */
export function ReceivedShortcut({ client }: { client: FurrixClient }) {
  const remote = useRemote(() => listAppointments(client), [client]);
  const groups = remote.data ? sortReceived(remote.data) : null;
  const todo = groups?.["a-traiter"].filter((a) => a.status === "pending").length ?? 0;
  const coming = groups?.["a-venir"].length ?? 0;
  return (
    <Card className="app-req-shortcut" aria-label="Demandes reçues">
      <Stack gap={3}>
        <h2>Demandes reçues</h2>
        <p role="status">
          {remote.error
            ? "Le nombre de demandes n’a pas pu être chargé."
            : !groups
              ? "Chargement des demandes…"
              : todo || coming
                ? [todo && `${todo} demande${todo > 1 ? "s" : ""} à traiter`, coming && `${coming} rendez-vous à venir`].filter(Boolean).join(" · ")
                : "Aucune demande à traiter pour le moment."}
        </p>
        <div className="app-req__actions">
          <Button as="a" href={receivedHref()} variant={todo ? "main" : "out"} icon="calendar">
            Voir les demandes reçues
          </Button>
          <Button as="a" href={slotsHref} variant="quiet">
            Gérer mes créneaux
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
