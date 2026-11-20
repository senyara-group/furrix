import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  FurrixScope,
  Loading,
  PageHeader,
  Stack,
} from "../design-system";
import type { FurrixClient } from "../services/supabaseClient";
import type { PetRow } from "../types/database";
import {
  retirementBlockers,
  retirePet,
  type RetirementBlocker,
} from "./retirement";
const paths = {
  rencontres: "#/messages",
  garde: "#/garde?vue=mes-gardes",
  services: "#/services?vue=rendez-vous",
  animaux_perdus: "#/animaux-perdus?vue=mine",
};
const labels = {
  rencontres: "Propositions de rencontre à traiter",
  garde: "Gardes à traiter",
  services: "Rendez-vous à traiter",
  animaux_perdus: "Alertes à clôturer",
};
/** Retrait explicite et rejouable ; les activités en cours sont revérifiées côté serveur. */
export default function PetRetirement({
  client,
  pet,
  onCancel,
  onRetired,
}: {
  client: FurrixClient;
  pet: PetRow;
  onCancel: () => void;
  onRetired: () => void;
}) {
  const [blockers, setBlockers] = useState<RetirementBlocker[]>(),
    [attempt, setAttempt] = useState(0),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setBlockers(undefined);
    void retirementBlockers(client, pet.id)
      .then((rows) => {
        if (active) setBlockers(rows);
      })
      .catch(() => {
        if (active)
          setError(
            "Les activités n’ont pas pu être vérifiées. Réessaie avant de retirer le profil.",
          );
      });
    return () => {
      active = false;
    };
  }, [client, pet.id, attempt]);
  const submit = async () => {
    if (lock.current || !checked || !blockers || blockers.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await retirePet(client, pet.id);
      if (alive.current) onRetired();
    } catch (e) {
      if (alive.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Le retrait n’a pas pu être confirmé.",
        );
        setAttempt((x) => x + 1);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <FurrixScope className="app-page">
      <PageHeader
        title={`Retirer le profil de ${pet.name}`}
        showTitleOnPhone
        back={{
          label: "Mes animaux",
          onClick: () => {
            if (!busy) onCancel();
          },
        }}
      />
      <Stack gap={4}>
        <Card>
          <Stack gap={3}>
            <p>
              Ce profil disparaîtra de tes animaux et des recherches. Il ne
              pourra plus être modifié depuis l’application.
            </p>
            <p>
              Ses matchs seront fermés et leurs conversations ne seront plus
              accessibles, comme pour un match terminé. Les données des échanges
              restent conservées. L’historique des gardes et des rendez-vous
              passés reste consultable. Les annonces où cet animal est déjà
              retrouvé seront clôturées.
            </p>
            <p>
              Ce retrait n’efface pas définitivement toutes les données ni les
              photos privées. La suppression du compte sera un parcours
              distinct.
            </p>
          </Stack>
        </Card>
        {error && <Alert tone="err" title={error} />}
        {!blockers && !error && (
          <Loading label="Vérification des activités de cet animal…" />
        )}
        {blockers?.length ? (
          <Alert tone="info" title="Des activités restent à traiter">
            Ouvre les espaces ci-dessous pour retirer une demande, annuler une
            activité ou clôturer une alerte, puis actualise les vérifications.
          </Alert>
        ) : null}
        {blockers?.map((b) => (
          <Card key={b.section}>
            <Stack gap={3}>
              <p>
                {labels[b.section]} : {b.total}
              </p>
              <Button as="a" href={paths[b.section]} variant="out">
                Ouvrir{" "}
                {b.section === "animaux_perdus"
                  ? "mes alertes"
                  : b.section === "services"
                    ? "mes rendez-vous"
                    : b.section === "garde"
                      ? "mes gardes"
                      : "mes rencontres"}
              </Button>
            </Stack>
          </Card>
        ))}
        <Button
          variant="out"
          disabled={busy}
          onClick={() => {
            setError("");
            setAttempt((x) => x + 1);
          }}
        >
          Actualiser les vérifications
        </Button>
        {blockers?.length === 0 && (
          <Checkbox
            checked={checked}
            disabled={busy}
            onChange={(e) => setChecked(e.target.checked)}
          >
            Je comprends le retrait du profil de {pet.name} et la fermeture de
            ses matchs.
          </Checkbox>
        )}
        <Button
          variant="main"
          loading={busy}
          disabled={!checked || !blockers || blockers.length > 0}
          onClick={() => void submit()}
        >
          Confirmer le retrait
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          Conserver le profil
        </Button>
      </Stack>
    </FurrixScope>
  );
}
