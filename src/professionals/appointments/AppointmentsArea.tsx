import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Note,
  PageHeader,
  Select,
  Stack,
  StatusBadge,
  Textarea,
} from "../../design-system";
import type { FurrixClient } from "../../services/supabaseClient";
import type { PetRow } from "../../types/database";
import { servicePrice } from "../types";
import AppointmentRequest from "./Request";
import { AppointmentChat } from "./Chat";
import { SlotManager } from "./Slots";
import { ReceivedRequests, type ReceivedTab } from "./Received";
import { listAppointments, listSlots, updateAppointment } from "./service";
import {
  appointmentChatHref,
  appointmentHref,
  canWrite,
  labels,
  receivedHref,
  slotLabel,
  slotsHref,
  timezone,
  type Appointment,
} from "./types";
import {
  AppointmentNotice,
  mutationError,
  RemoteState,
  useRemote,
} from "./shared";
function Badge({ item }: { item: Appointment }) {
  return (
    <StatusBadge
      status={
        item.status === "confirmed"
          ? "ok"
          : ["pending", "countered"].includes(item.status)
            ? "wait"
            : "stop"
      }
    >
      {labels[item.status]}
    </StatusBadge>
  );
}
/** Les actions dépendent du participant ; le serveur reste la source de vérité du statut. */
export function AppointmentDetail({
  client,
  id,
}: {
  client: FurrixClient;
  id: string;
}) {
  const remote = useRemote(() => listAppointments(client, id), [client, id]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [alternate, setAlternate] = useState(""),
    [cancelling, setCancelling] = useState(false);
  const lock = useRef(false);
  const slots = useRemote(
    () =>
      remote.data?.[0]?.role === "professional"
        ? listSlots(client, remote.data[0].professional_id)
        : Promise.resolve([]),
    [client, remote.data],
  );
  const act = async (action: string, slot?: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await updateAppointment(client, {
        p_id: id,
        p_action: action,
        ...(slot ? { p_slot: slot } : {}),
        p_note: note,
      });
      setCancelling(false);
      setNote("");
      remote.reload();
    } catch (e) {
      setError(mutationError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!remote.data) return <RemoteState {...remote} />;
  const item = remote.data[0];
  if (!item)
    return (
      <EmptyState icon="calendar" title="Rendez-vous indisponible">
        Cette demande n’existe plus ou ne t’est pas accessible.
      </EmptyState>
    );
  const pro = item.role === "professional",
    open = ["pending", "countered"].includes(item.status);
  return (
    <Stack gap={4}>
      <AppointmentNotice />
      {error && (
        <Alert
          tone="err"
          title={error}
          actions={
            <Button variant="out" disabled={busy} onClick={remote.reload}>
              Actualiser le rendez-vous
            </Button>
          }
        />
      )}
      <Card>
        <Stack gap={3}>
          <Badge item={item} />
          <h2>{item.professional_name}</h2>
          <p>
            {item.service_name} ·{" "}
            {servicePrice({
              name: item.service_name,
              unit: item.unit,
              price_cents: item.price_cents,
            })}
          </p>
          <p>
            {slotLabel(item)} · {timezone}
          </p>
          <p>{item.city}</p>
          {pro && <p>Demande de {item.owner_name || "un membre bêta"}</p>}
          {item.pet_name ? (
            <p>
              Animal :{" "}
              {[item.pet_name, item.pet_species, item.pet_breed, item.pet_age]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : (
            <Note>
              Le propriétaire n’a pas partagé les informations de son animal.
            </Note>
          )}
          {!pro && (
            <p>
              Partage du profil limité :{" "}
              {item.share_pet ? "autorisé pour cette demande" : "non autorisé"}.
            </p>
          )}
          {item.message && (
            <p className="app-pro-text">
              Message du propriétaire : {item.message}
            </p>
          )}
          {item.professional_note && (
            <p className="app-pro-text">
              Réponse de l’établissement : {item.professional_note}
            </p>
          )}
          {item.cancelled_by && (
            <p className="app-pro-text">
              Annulé par{" "}
              {item.cancelled_by === item.professional_id
                ? "l’établissement"
                : "le propriétaire"}
              .{item.cancel_note ? " " + item.cancel_note : ""}
            </p>
          )}
          <Button as="a" href={appointmentChatHref(item.id)} variant="out" icon="message">
            {canWrite(item)
              ? pro
                ? "Écrire au propriétaire"
                : "Écrire à l’établissement"
              : "Voir la conversation"}
          </Button>
        </Stack>
      </Card>
      {open && pro && (
        <Card>
          <Stack gap={3}>
            <Field label="Réponse au propriétaire" optional>
              <Textarea
                value={note}
                disabled={busy}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {item.status === "pending" && (
              <Button
                variant="main"
                loading={busy}
                onClick={() => void act("confirm", item.slot_id)}
              >
                Confirmer ce rendez-vous
              </Button>
            )}
            <Field label="Autre créneau">
              <Select
                value={alternate}
                disabled={busy}
                onChange={(e) => setAlternate(e.target.value)}
              >
                <option value="">Choisir un autre horaire</option>
                {slots.data
                  ?.filter((s) => s.available && s.id !== item.slot_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {slotLabel(s)}
                    </option>
                  ))}
              </Select>
            </Field>
            {slots.error && <RemoteState {...slots} />}
            <Button
              variant="out"
              loading={busy}
              disabled={!alternate}
              onClick={() => void act("counter", alternate)}
            >
              Proposer cet autre créneau
            </Button>
            <Button
              variant="quiet"
              loading={busy}
              onClick={() => void act("decline")}
            >
              Refuser la demande
            </Button>
          </Stack>
        </Card>
      )}
      {open && !pro && (
        <Stack gap={3}>
          {item.status === "countered" && (
            <Button
              variant="main"
              loading={busy}
              onClick={() => void act("accept_counter", item.slot_id)}
            >
              Accepter ce nouveau créneau
            </Button>
          )}
          <Button
            variant="out"
            loading={busy}
            onClick={() => void act("withdraw")}
          >
            Retirer ma demande
          </Button>
        </Stack>
      )}
      {item.status === "confirmed" &&
        new Date(item.ends_at).getTime() > Date.now() &&
        (cancelling ? (
          <Card>
            <Stack gap={3}>
              <p>Confirmer l’annulation de ce rendez-vous ?</p>
              <Field label="Motif d’annulation" optional>
                <Textarea
                  maxLength={300}
                  value={note}
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <Button
                variant="main"
                loading={busy}
                onClick={() => void act("cancel")}
              >
                Confirmer l’annulation
              </Button>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => setCancelling(false)}
              >
                Conserver le rendez-vous
              </Button>
            </Stack>
          </Card>
        ) : (
          <Button
            variant="out"
            onClick={() => {
              setNote("");
              setCancelling(true);
            }}
          >
            Annuler le rendez-vous
          </Button>
        ))}
      <Button variant="out" disabled={busy} onClick={remote.reload}>
        Actualiser le rendez-vous
      </Button>
    </Stack>
  );
}
function AppointmentList({ client }: { client: FurrixClient }) {
  const remote = useRemote(() => listAppointments(client), [client]);
  return (
    <Stack gap={4}>
      <div className="app-pro-actions">
        {remote.data?.some((a) => a.role === "professional") && (
          <Button as="a" href={receivedHref()} variant="out">
            Demandes reçues
          </Button>
        )}
        <Button as="a" href={slotsHref} variant="out">
          Gérer mes créneaux professionnels
        </Button>
        <Button variant="quiet" onClick={remote.reload}>
          Actualiser
        </Button>
      </div>
      <AppointmentNotice />
      {remote.data ? (
        remote.data.length ? (
          remote.data.map((item) => (
            <Card key={item.id}>
              <Stack gap={3}>
                <Badge item={item} />
                <h2>
                  {item.professional_name} · {item.service_name}
                </h2>
                <p>{slotLabel(item)}</p>
                <p>
                  {item.role === "professional"
                    ? "Demande reçue"
                    : "Ma demande"}
                  {item.pet_name ? " · " + item.pet_name : ""}
                </p>
                <Button as="a" href={appointmentHref(item.id)} variant="out">
                  Voir le rendez-vous
                </Button>
              </Stack>
            </Card>
          ))
        ) : (
          <EmptyState icon="calendar" title="Aucun rendez-vous pour le moment">
            Choisis un créneau sur une fiche professionnelle pour envoyer ta
            demande.
          </EmptyState>
        )
      ) : (
        <RemoteState {...remote} />
      )}
      {remote.data?.length === 100 && (
        <Note>Les 100 demandes les plus récentes sont affichées.</Note>
      )}
    </Stack>
  );
}
/** Parcours Services dédié, sans modifier les formulaires d’activité confiés à Alexis. */
export default function AppointmentsArea({
  client,
  owner,
  params,
  pets,
}: {
  client: FurrixClient;
  owner: string;
  params: URLSearchParams;
  pets: PetRow[];
}) {
  const view = params.get("vue"),
    id = params.get("rendezvous"),
    professional = params.get("professionnel") ?? "",
    slot = params.get("creneau") ?? "",
    from = params.get("depuis"),
    fromMessages = from === "messages",
    fromReceived = from === "demandes",
    tabParam = params.get("onglet"),
    tab: ReceivedTab = tabParam === "a-venir" || tabParam === "passees" ? tabParam : "a-traiter";
  const backTo =
    view === "conversation" && id
      ? fromMessages
        ? { label: "Messages", href: "#/messages" }
        : fromReceived
          ? { label: "Demandes reçues", href: receivedHref() }
          : { label: "Retour à la demande", href: appointmentHref(id) }
      : view === "rendez-vous" && id
        ? fromReceived
          ? { label: "Demandes reçues", href: receivedHref(tab) }
          : { label: "Mes rendez-vous", href: appointmentHref() }
        : view === "demandes"
          ? { label: "Mon activité", href: "#/services?vue=profil" }
          : { label: "Services", href: "#/services" };
  return (
    <>
      <PageHeader
        title={
          view === "creneaux"
            ? "Mes créneaux"
            : view === "demander"
              ? "Demander un rendez-vous"
              : view === "conversation"
                ? "Conversation"
                : view === "demandes"
                  ? "Demandes reçues"
                  : "Mes rendez-vous"
        }
        subtitle={view === "demandes" ? "Les rendez-vous que les propriétaires te demandent." : undefined}
        showTitleOnPhone
        back={{
          label: backTo.label,
          onClick: () => {
            window.location.hash = backTo.href;
          },
        }}
      />
      {view === "creneaux" ? (
        <SlotManager client={client} owner={owner} />
      ) : view === "demandes" ? (
        <ReceivedRequests
          client={client}
          tab={tab}
          onTab={(next) => {
            window.location.hash = receivedHref(next);
          }}
        />
      ) : view === "demander" ? (
        <AppointmentRequest
          key={professional + ":" + slot}
          client={client}
          professional={professional}
          selected={slot}
          pets={pets}
        />
      ) : view === "conversation" && id ? (
        <AppointmentChat key={id} client={client} me={owner} id={id} />
      ) : id ? (
        <AppointmentDetail key={id} client={client} id={id} />
      ) : (
        <AppointmentList client={client} />
      )}
    </>
  );
}
