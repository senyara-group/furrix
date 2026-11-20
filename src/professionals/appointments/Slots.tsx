import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Stack,
} from "../../design-system";
import type { FurrixClient } from "../../services/supabaseClient";
import { ownProfessional } from "../service";
import { closeSlot, listSlots, publishSlot } from "./service";
import { slotLabel, slotsHref, timezone } from "./types";
import { mutationError, RemoteState, useRemote } from "./shared";
/** Créneaux publiés par l’établissement, sans horaires fictifs. */
export function AvailableSlots({
  client,
  professional,
  owner,
}: {
  client: FurrixClient;
  professional: string;
  owner: string;
}) {
  const remote = useRemote(
    () => listSlots(client, professional),
    [client, professional],
  );
  return (
    <Card>
      <Stack gap={3}>
        <h2>Demander un rendez-vous</h2>
        {owner === professional ? (
          <Button as="a" href={slotsHref} variant="out">
            Gérer mes créneaux
          </Button>
        ) : remote.data ? (
          remote.data.length ? (
            remote.data.map((slot) => (
              <Button
                key={slot.id}
                as="a"
                variant="out"
                href={
                  "#/services?vue=demander&professionnel=" +
                  encodeURIComponent(professional) +
                  "&creneau=" +
                  encodeURIComponent(slot.id)
                }
              >
                {slotLabel(slot)}
              </Button>
            ))
          ) : (
            <p>
              Aucun créneau proposé pour le moment. Tu peux contacter
              directement l’établissement.
            </p>
          )
        ) : (
          <RemoteState {...remote} />
        )}
        <p>
          Horaires affichés dans ton fuseau : {timezone}. Le rendez-vous sera
          réservé après confirmation.
        </p>
      </Stack>
    </Card>
  );
}
/** Un calendrier par activité ; la publication et la fermeture sont contrôlées sur le serveur. */
export function SlotManager({
  client,
  owner,
}: {
  client: FurrixClient;
  owner: string;
}) {
  const remote = useRemote(
    async () => ({
      profile: await ownProfessional(client, owner),
      slots: await listSlots(client, owner),
    }),
    [client, owner],
  );
  const [start, setStart] = useState(""),
    [duration, setDuration] = useState("30"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ payload: string; id: string }>(),
    lock = useRef(false);
  const publish = async () => {
    if (lock.current) return;
    const date = new Date(start),
      minutes = Number(duration);
    if (
      !Number.isFinite(date.getTime()) ||
      date.getTime() <= Date.now() ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 1440
    ) {
      setError(
        "Choisis une date future et une durée entre 1 et 1 440 minutes.",
      );
      return;
    }
    const starts = date.toISOString(),
      ends = new Date(date.getTime() + minutes * 60000).toISOString(),
      payload = JSON.stringify([starts, ends]);
    if (pending.current?.payload !== payload)
      pending.current = { payload, id: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await publishSlot(client, {
        p_id: pending.current.id,
        p_starts: starts,
        p_ends: ends,
      });
      pending.current = undefined;
      setStart("");
      remote.reload();
    } catch (e) {
      setError(mutationError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const close = async (id: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await closeSlot(client, id);
      remote.reload();
    } catch {
      setError(
        "Le créneau n’a pas pu être fermé. Traite ses demandes et rendez-vous en cours, puis réessaie.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!remote.data) return <RemoteState {...remote} />;
  if (!remote.data.profile)
    return (
      <EmptyState
        icon="calendar"
        title="Crée d’abord ton activité"
        action={
          <Button as="a" href="#/services?vue=profil" variant="out">
            Mon activité professionnelle
          </Button>
        }
      />
    );
  return (
    <Stack gap={4}>
      <p>
        Un calendrier commun à ton activité. Horaires dans ton fuseau :{" "}
        {timezone}. Les créneaux ne doivent pas se chevaucher.
      </p>
      {!remote.data.profile.active && (
        <Alert tone="info" title="Ton activité est en pause">
          Les créneaux seront visibles quand tu republieras ton activité.
        </Alert>
      )}
      {error && <Alert tone="err" title={error} />}
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void publish();
          }}
        >
          <Stack gap={3}>
            <Field label="Début du créneau">
              <Input
                type="datetime-local"
                required
                value={start}
                disabled={busy}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Durée en minutes">
              <Input
                type="number"
                required
                min={1}
                max={1440}
                step={1}
                value={duration}
                disabled={busy}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
            <Button variant="main" type="submit" loading={busy}>
              Publier le créneau
            </Button>
          </Stack>
        </form>
      </Card>
      <h2>Mes créneaux à venir</h2>
      {remote.data.slots.length ? (
        remote.data.slots.map((slot) => (
          <Card key={slot.id}>
            <Stack gap={3}>
              <p>
                {slotLabel(slot)} ·{" "}
                {slot.available ? "Non confirmé" : "Rendez-vous confirmé"}
              </p>
              <Button
                variant="out"
                disabled={busy || !slot.available}
                onClick={() => void close(slot.id)}
              >
                Fermer ce créneau
              </Button>
            </Stack>
          </Card>
        ))
      ) : (
        <p>Aucun créneau publié.</p>
      )}
    </Stack>
  );
}
