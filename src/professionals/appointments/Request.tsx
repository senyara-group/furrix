import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Select,
  Stack,
  Textarea,
} from "../../design-system";
import type { FurrixClient } from "../../services/supabaseClient";
import type { PetRow } from "../../types/database";
import { getProfessional } from "../service";
import { servicePrice } from "../types";
import { listSlots, requestAppointment } from "./service";
import { appointmentHref, slotLabel, timezone } from "./types";
import {
  AppointmentNotice,
  mutationError,
  RemoteState,
  useRemote,
} from "./shared";
/** Demande explicite pour un animal à soi ; le partage limité du profil reste décoché. */
export default function AppointmentRequest({
  client,
  professional,
  selected,
  pets,
}: {
  client: FurrixClient;
  professional: string;
  selected: string;
  pets: PetRow[];
}) {
  const remote = useRemote(
    async () => ({
      profile: await getProfessional(client, professional),
      slots: await listSlots(client, professional),
    }),
    [client, professional],
  );
  const [pet, setPet] = useState(""),
    [service, setService] = useState(""),
    [message, setMessage] = useState(""),
    [share, setShare] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ payload: string; id: string }>(),
    lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const submit = async () => {
    if (lock.current || !pet || !service) return;
    const payload = JSON.stringify([selected, pet, service, message, share]);
    if (pending.current?.payload !== payload)
      pending.current = { payload, id: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const id = await requestAppointment(client, {
        p_slot: selected,
        p_pet: pet,
        p_service: service,
        p_message: message,
        p_share: share,
        p_request: pending.current.id,
      });
      if (alive.current) window.location.hash = appointmentHref(id);
    } catch (e) {
      if (alive.current) setError(mutationError(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  if (!remote.data) return <RemoteState {...remote} />;
  const { profile, slots } = remote.data,
    slot = slots.find((s) => s.id === selected);
  if (!profile || !slot)
    return (
      <EmptyState
        icon="calendar"
        title="Ce créneau n’est plus disponible"
        action={
          <Button variant="out" onClick={remote.reload}>
            Actualiser les créneaux
          </Button>
        }
      >
        Retourne sur la fiche pour choisir un autre horaire.
      </EmptyState>
    );
  if (!pets.length)
    return (
      <EmptyState
        icon="paw"
        title="Ajoute d’abord ton animal"
        action={
          <Button as="a" href="#/animaux" variant="out">
            Mes animaux
          </Button>
        }
      />
    );
  const services = profile.services.filter(
    (s) => profile.services.filter((x) => x.name === s.name).length === 1,
  );
  return (
    <Stack gap={4}>
      <AppointmentNotice />
      <Card>
        <Stack gap={3}>
          <h2>{profile.name}</h2>
          <p>
            {slotLabel(slot)} · {timezone}
          </p>
          <p>{profile.city}</p>
        </Stack>
      </Card>
      {error && (
        <Alert tone="err" title={error}>
          Ton formulaire est conservé. Consulte tes rendez-vous si tu ne sais
          pas si l’envoi est arrivé, ou réessaie la même demande.
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Stack gap={3}>
          <Field label="Ton animal">
            <Select
              required
              value={pet}
              disabled={busy}
              onChange={(e) => setPet(e.target.value)}
            >
              <option value="">Choisir un animal</option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prestation">
            <Select
              required
              value={service}
              disabled={busy}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">Choisir une prestation</option>
              {services.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} · {servicePrice(s)}
                </option>
              ))}
            </Select>
          </Field>
          {!services.length && (
            <Alert tone="info" title="Aucune prestation réservable">
              Contacte directement l’établissement.
            </Alert>
          )}
          <Field
            label="Ton message"
            optional
            hint="1 000 caractères maximum. Évite les informations médicales sensibles."
          >
            <Textarea
              value={message}
              disabled={busy}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <Checkbox
            checked={share}
            disabled={busy}
            onChange={(e) => setShare(e.target.checked)}
          >
            Partager le nom, l’espèce, la race et l’âge de mon animal avec cet
            établissement pour cette demande. Les informations de santé et les
            photos ne sont pas partagées.
          </Checkbox>
          <Button
            variant="main"
            type="submit"
            loading={busy}
            disabled={!pet || !service}
          >
            Envoyer la demande
          </Button>
          <Button as="a" href={appointmentHref()} variant="quiet">
            Consulter mes rendez-vous
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
