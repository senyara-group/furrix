import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  FurrixScope,
  Input,
  Loading,
  PageHeader,
  Stack,
} from "../design-system";
import type { FurrixClient } from "../services/supabaseClient";
import { clearAndroidPushAfterDeletion } from '../push/androidPush';
import {
  deletionChecks,
  rememberDeletion,
  requestDeletion,
  type AccountBlocker,
} from "./deletion";
const destinations: Record<string, { label: string; href?: string }> = {
  rencontres: { label: "Rencontres à traiter", href: "#/messages" },
  garde: { label: "Gardes à traiter", href: "#/garde?vue=mes-gardes" },
  services: {
    label: "Rendez-vous à traiter",
    href: "#/services?vue=rendez-vous",
  },
  animaux_perdus: {
    label: "Alertes à clôturer",
    href: "#/animaux-perdus?vue=mine",
  },
  abonnement: { label: "Abonnement à résilier auprès de la boutique" },
  signalements: { label: "Signalements à traiter avec l’équipe" },
  moderation: { label: "Dossier à traiter avec l’équipe" },
};
/** Confirmation dédiée : aucune suppression optimiste ni mot de passe conservé. */
export default function DeleteAccount({
  client,
  onCancel,
  onSignOut,
}: {
  client: FurrixClient;
  onCancel: () => void;
  onSignOut: () => Promise<boolean>;
}) {
  const [blockers, setBlockers] = useState<AccountBlocker[]>(),
    [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    lock = useRef(false);
  const leaving = useRef(false);
  const owner = useRef<string>();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const leave = async () => {
    if (leaving.current) return;
    leaving.current = true;
    setBusy(true);
    rememberDeletion();
    try {
      await clearAndroidPushAfterDeletion();
      if (!alive.current) return;
      if (!(await onSignOut()) && alive.current)
        setError(
          "La demande est enregistrée. Ferme ta session sur cet appareil avec le bouton ci-dessous.",
        );
    } catch {
      if (alive.current)
        setError(
          "La demande est enregistrée. La déconnexion locale reste à terminer.",
        );
    } finally {
      leaving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    setBlockers(undefined);
    void deletionChecks(client)
      .then((result) => {
        if (!active) return;
        owner.current = result.owner;
        if (result.requested) {
          setAccepted(true);
          rememberDeletion();
        } else setBlockers(result.blockers);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [client, attempt]);
  const submit = async () => {
    if (
      lock.current ||
      !owner.current ||
      !checked ||
      confirmation !== "SUPPRIMER" ||
      !password ||
      !blockers ||
      blockers.length
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await requestDeletion(client, password, confirmation, owner.current);
      rememberDeletion();
      if (!alive.current) return;
      setAccepted(true);
      setPassword("");
      await leave();
    } catch (cause) {
      if (alive.current) {
        setError(
          cause instanceof Error ? cause.message : "Demande non confirmée.",
        );
        setAttempt((x) => x + 1);
      }
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        setPassword("");
      }
    }
  };
  return (
    <FurrixScope className="app-page">
      <PageHeader
        title={accepted ? "Demande enregistrée" : "Supprimer mon compte"}
        showTitleOnPhone
        back={
          !accepted
            ? {
                label: "Mon compte",
                onClick: () => {
                  if (!busy) onCancel();
                },
              }
            : undefined
        }
      />
      <Stack gap={4}>
        {accepted ? (
          <>
            <Alert tone="ok" title="Ta demande de suppression est enregistrée">
              Ton accès à Furrix est fermé. Le traitement des données et photos
              continue côté serveur et reprend automatiquement en cas de panne.
              Il n’est pas encore annoncé comme terminé.
            </Alert>
            {error && <Alert tone="err" title={error} />}
            <Button loading={busy} onClick={() => void leave()}>
              Revenir à la connexion
            </Button>
          </>
        ) : (
          <>
            <Card>
              <Stack gap={3}>
                <p>
                  La suppression est irréversible. Ton profil, les photos
                  déposées, la localisation et les textes des conversations
                  liées à ton compte seront effacés.
                </p>
                <p>
                  Les dates, statuts et montants des activités passées resteront
                  dans l’historique partagé sous « Compte supprimé ». Un
                  identifiant technique reste conservé pour relier cet
                  historique. Il ne s’agit pas d’une garantie d’anonymat absolu.
                </p>
                <p>
                  Les activités en cours doivent d’abord être traitées. Les
                  notifications seront arrêtées dès l’acceptation et les
                  sessions révoquées à la finalisation.
                </p>
              </Stack>
            </Card>
            {error && <Alert tone="err" title={error} />}
            {!blockers && !error && (
              <Loading label="Vérification des activités…" />
            )}
            {blockers?.map((b) => (
              <Card key={b.section}>
                <Stack gap={3}>
                  <p>
                    {destinations[b.section]?.label ?? "Activité à traiter"} :{" "}
                    {b.total}
                  </p>
                  {destinations[b.section]?.href ? (
                    <Button
                      as="a"
                      href={destinations[b.section]!.href}
                      variant="out"
                    >
                      Ouvrir l’espace concerné
                    </Button>
                  ) : (
                    <p>
                      Termine cette démarche avant de demander la suppression.
                    </p>
                  )}
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
              <>
                <Field label="Ton mot de passe actuel">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    disabled={busy}
                    maxLength={4096}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Field label="Écris SUPPRIMER pour confirmer">
                  <Input
                    autoComplete="off"
                    value={confirmation}
                    disabled={busy}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
                <Checkbox
                  checked={checked}
                  disabled={busy}
                  onChange={(e) => setChecked(e.target.checked)}
                >
                  Je comprends l’effacement des données personnelles et la
                  conservation de l’historique partagé.
                </Checkbox>
              </>
            )}
            <Button
              loading={busy}
              disabled={
                !blockers ||
                blockers.length > 0 ||
                !checked ||
                !password ||
                confirmation !== "SUPPRIMER"
              }
              onClick={() => void submit()}
            >
              Demander la suppression définitive
            </Button>
            <Button variant="quiet" disabled={busy} onClick={onCancel}>
              Conserver mon compte
            </Button>
          </>
        )}
      </Stack>
    </FurrixScope>
  );
}
