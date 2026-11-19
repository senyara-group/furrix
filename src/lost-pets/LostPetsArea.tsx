import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Field,
  FurrixScope,
  Input,
  Loading,
  StatusBadge,
  Textarea,
  Select,
} from "../design-system";
import "../design-system/styles";
import type { FurrixClient } from "../services/supabaseClient";
import type { PetRow } from "../types/database";
import { PetPhoto } from "../pets/PetPhoto";
import { approximateLocation, locateTown } from "../meetings/location";
import { toDataError } from "../services/errors";
import * as api from "./service";
import type {
  LocalNotification,
  LostAlert,
  LostForm,
  LostSector,
  LostSighting,
} from "./types";
import { lostHref, lostShareUrl, readLostRoute, type LostTab } from "./links";
import "./lost-pets.css";

const localTime = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
function useAlive() {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
}
const dateLabel = (value: string) =>
  new Date(value).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });

/** Déclaration : même identifiant lors d'un nouvel essai, copie indépendante du portrait. */
function NewAlert({
  client,
  pets,
  saved,
  cancel,
}: {
  client: FurrixClient;
  pets: PetRow[];
  saved: (id: string) => void;
  cancel: () => void;
}) {
  const [values, setValues] = useState<LostForm>({
    petId: pets[0]?.id || "",
    city: pets[0]?.city || "",
    latitude: "",
    longitude: "",
    seenAt: localTime(),
    description: "",
    instructions: "",
    radius: "25",
    photo: true,
  });
  const [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [error, setError] = useState("");
  const draft = useRef({
      id: crypto.randomUUID(),
      photo: undefined as string | undefined,
      photoPet: "",
    }),
    running = useRef(false),
    alive = useAlive();
  const change = (key: keyof LostForm, value: string | boolean) =>
    setValues((v) => ({ ...v, [key]: value }));
  const locate = async () => {
    setLocating(true);
    setError("");
    try {
      const point = await approximateLocation();
      if (alive.current)
        setValues((v) => ({
          ...v,
          latitude: String(point.latitude),
          longitude: String(point.longitude),
        }));
    } catch {
      if (alive.current)
        setError(
          "Position indisponible. Tu peux renseigner une zone manuellement.",
        );
    } finally {
      if (alive.current) setLocating(false);
    }
  };
  const useTown = async () => {
    setLocating(true);
    setError("");
    try {
      const point = await locateTown(values.city);
      if (alive.current)
        setValues((v) => ({
          ...v,
          city: point.label.split(" · ")[0] || v.city,
          latitude: String(point.latitude),
          longitude: String(point.longitude),
        }));
    } catch {
      if (alive.current)
        setError(
          "Commune introuvable. Précise son nom ou utilise ta position.",
        );
    } finally {
      if (alive.current) setLocating(false);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (running.current) return;
    setError("");
    try {
      const args = api.validateLostForm(values),
        pet = pets.find((p) => p.id === args.p_pet);
      if (!pet) {
        setError("Choisis un animal de ton compte.");
        return;
      }
      running.current = true;
      setBusy(true);
      if (
        values.photo &&
        pet.photos?.[0] &&
        (!draft.current.photo || draft.current.photoPet !== pet.id)
      ) {
        const path = await api.snapshotLostPhoto(client, pet, draft.current.id);
        draft.current.photo = path;
        draft.current.photoPet = pet.id;
      }
      if (!alive.current) return;
      const id = await api.publishLost(client, {
        ...args,
        p_id: draft.current.id,
        ...(values.photo &&
        draft.current.photoPet === pet.id &&
        draft.current.photo
          ? { p_photo: draft.current.photo }
          : {}),
      });
      if (alive.current) saved(id);
    } catch (e) {
      if (alive.current)
        setError(
          `${toDataError(e).message} En cas de doute après un envoi, vérifie la liste avant de créer une nouvelle déclaration.`,
        );
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section>
      <Button variant="quiet" onClick={cancel} disabled={busy}>
        Revenir aux alertes
      </Button>
      <h2>Déclarer sa disparition</h2>
      <p>
        La zone, la description et la photo seront visibles des testeurs
        autorisés. N’indique pas d’adresse personnelle ni de numéro de
        téléphone.
      </p>
      {!pets.length ? (
        <p>
          Ajoute d’abord ton animal dans <a href="#/animaux">Mes animaux</a>.
        </p>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            void submit(e);
          }}
        >
          <fieldset disabled={busy || locating} className="app-lost-fields">
            <legend>Dernière zone connue</legend>
            <Field label="Animal">
              <Select
                value={values.petId}
                onChange={(e) => change("petId", e.target.value)}
              >
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ville ou commune">
              <Input
                value={values.city}
                maxLength={80}
                onChange={(e) => {
                  change("city", e.target.value);
                  change("latitude", "");
                  change("longitude", "");
                }}
                required
              />
            </Field>
            <Field label="Vu pour la dernière fois">
              <Input
                type="datetime-local"
                value={values.seenAt}
                onChange={(e) => change("seenAt", e.target.value)}
                required
              />
            </Field>
            <Field label="Rayon de diffusion">
              <select
                value={values.radius}
                onChange={(e) => change("radius", e.target.value)}
              >
                {[5, 10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n} km
                  </option>
                ))}
              </select>
            </Field>
            <div className="app-lost-wide">
              <Button
                variant="out"
                loading={locating}
                onClick={() => {
                  void locate();
                }}
              >
                Utiliser ma position actuelle comme dernière zone connue
              </Button>
              <p>
                Choisis le centre de la commune ou une autre zone ci-dessous si
                ton animal a disparu ailleurs. Les coordonnées sont arrondies
                avant envoi.
              </p>
            </div>
            <div className="app-lost-wide">
              <Button
                variant="out"
                loading={locating}
                onClick={() => {
                  void useTown();
                }}
              >
                Utiliser le centre de cette commune
              </Button>
              <p>
                Le nom de commune est envoyé au service public de géocodage. La
                zone publiée reste approximative.
              </p>
            </div>
            <Field label="Latitude de la zone">
              <Input
                inputMode="decimal"
                placeholder="Ex. 50.63"
                value={values.latitude}
                onChange={(e) => change("latitude", e.target.value)}
                required
              />
            </Field>
            <Field label="Longitude de la zone">
              <Input
                inputMode="decimal"
                placeholder="Ex. 3.06"
                value={values.longitude}
                onChange={(e) => change("longitude", e.target.value)}
                required
              />
            </Field>
            <div className="app-lost-wide">
              <Field label="Description et signes distinctifs">
                <Textarea
                  value={values.description}
                  maxLength={1500}
                  rows={4}
                  onChange={(e) => change("description", e.target.value)}
                  required
                />
              </Field>
            </div>
            <div className="app-lost-wide">
              <Field label="Consignes d’approche" optional>
                <Textarea
                  value={values.instructions}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => change("instructions", e.target.value)}
                />
              </Field>
            </div>
            <label className="app-lost-wide app-lost-check">
              <input
                type="checkbox"
                checked={values.photo}
                onChange={(e) => change("photo", e.target.checked)}
              />
              Copier la photo principale de son profil dans l’alerte, si elle
              existe.
            </label>
            <p className="app-lost-wide">
              Une notification sera créée dans Furrix pour les abonnés de ce
              secteur. Les notifications push hors application ne sont pas
              encore disponibles.
            </p>
            <Button type="submit" loading={busy}>
              Publier l’alerte locale
            </Button>
          </fieldset>
        </form>
      )}
      {error && (
        <Alert tone="err" title="Publication non confirmée">
          {error}
        </Alert>
      )}
    </section>
  );
}

/** Réglage volontaire : aucun suivi de position ni abonnement automatique. */
/** Préférences de secteur partagées entre Mon compte et Animaux perdus. */
export function SectorSettings({
  client,
  owner,
  activationVariant = "main",
}: {
  client: FurrixClient;
  owner: string;
  activationVariant?: "main" | "out";
}) {
  const [sector, setSector] = useState<LostSector | null>(),
    [radius, setRadius] = useState("25"),
    [attempt, setAttempt] = useState(0),
    [town, setTown] = useState(""),
    [sectorLoading, setSectorLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useAlive(),
    running = useRef(false);
  useEffect(() => {
    let active = true;
    setSectorLoading(true);
    setError("");
    void api
      .getSector(client, owner)
      .then((s) => {
        if (active) {
          setSector(s);
          if (s) setRadius(String(s.radius_km));
        }
      })
      .catch(() => {
        if (active) setError("Le secteur n’a pas pu être chargé.");
      })
      .finally(() => {
        if (active) setSectorLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, owner, attempt]);
  const save = async (enabled: boolean, fromTown = false) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const location = enabled
        ? fromTown
          ? await locateTown(town)
          : await approximateLocation()
        : undefined;
      if (!alive.current) return;
      await api.setSector(
        client,
        enabled,
        location?.latitude,
        location?.longitude,
        Number(radius),
      );
      const fresh = await api.getSector(client, owner);
      if (alive.current) {
        setSector(fresh);
        setNotice(
          enabled
            ? "Ton secteur est enregistré pour les prochaines alertes."
            : "Ton abonnement est désactivé et ta zone supprimée.",
        );
      }
    } catch {
      if (alive.current)
        setError(
          "Enregistrement impossible. Vérifie ton accès et l’autorisation de localisation.",
        );
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section>
      <h2>Les alertes près de chez toi</h2>
      <p>
        Inscris volontairement ta zone approximative pour recevoir les
        prochaines alertes dans Furrix. Elle reste privée et ne suit pas tes
        déplacements.
      </p>
      <p>
        {sectorLoading
          ? "Vérification de ton abonnement…"
          : sector === undefined
            ? "Ton abonnement n’a pas pu être vérifié."
            : sector
              ? `Abonnement actif : rayon maximal ${sector.radius_km} km. Le rayon choisi par le propriétaire peut être plus petit.`
              : "Tu ne reçois pas encore les alertes de secteur."}
      </p>
      {sectorLoading && <Loading label="Chargement de ton secteur" />}
      {!sectorLoading && sector === undefined && (
        <Button variant="out" onClick={() => setAttempt((v) => v + 1)}>
          Réessayer le chargement du secteur
        </Button>
      )}
      <Field label="Rayon maximal">
        <Select value={radius} onChange={(e) => setRadius(e.target.value)}>
          {[5, 10, 25, 50].map((n) => (
            <option value={n} key={n}>
              {n} km
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Commune de mon secteur">
        <Input
          value={town}
          maxLength={80}
          onChange={(e) => setTown(e.target.value)}
          placeholder="Nom de commune ou code postal"
        />
      </Field>
      <p>
        Tu peux choisir le centre d’une commune sans autoriser le GPS. Seul le
        nom saisi est envoyé au service public de géocodage.
      </p>
      <div className="app-lost-actions">
        <Button
          variant="out"
          loading={busy}
          disabled={
            sectorLoading || sector === undefined || town.trim().length < 2
          }
          onClick={() => {
            void save(true, true);
          }}
        >
          Activer les alertes pour cette commune
        </Button>
        <Button
          variant={activationVariant}
          disabled={sectorLoading || sector === undefined}
          loading={busy}
          onClick={() => {
            void save(true);
          }}
        >
          {sector
            ? "Actualiser mon secteur"
            : "Activer les alertes pour ma zone actuelle"}
        </Button>
        {sector && (
          <Button
            variant="out"
            disabled={busy}
            onClick={() => {
              void save(false);
            }}
          >
            Désactiver et supprimer ma zone
          </Button>
        )}
      </div>
      <p>
        Tu pourras les consulter dans « Mes notifications ». Aucun push, e-mail
        ou SMS n’est envoyé pour l’instant.
      </p>
      {notice && <Alert tone="ok" title={notice} />}
      {error && (
        <Alert tone="err" title="Secteur non confirmé">
          {error}
        </Alert>
      )}
    </section>
  );
}

/** Portrait indépendant, toujours téléchargé avec la session. */
function LostPortrait({
  client,
  alert,
}: {
  client: FurrixClient;
  alert: LostAlert;
}) {
  return alert.photo_path ? (
    <PetPhoto
      client={client}
      pet={{
        id: alert.id,
        owner_id: alert.reporter_id,
        name: alert.display_name,
        species: alert.species,
        photos: [alert.photo_path],
        breed: null,
        age: null,
        gender: null,
        purpose: null,
        city: alert.city,
        bio: null,
        verified: false,
        created_at: "",
      }}
    />
  ) : null;
}

/** Les observations restent entre leur auteur et le propriétaire, sans contact public. */
function AlertDetail({
  client,
  alert,
  close,
  refreshed,
}: {
  client: FurrixClient;
  alert: LostAlert;
  close: () => void;
  refreshed: () => void;
}) {
  const [description, setDescription] = useState(alert.description),
    [instructions, setInstructions] = useState(alert.instructions || "");
  const [seen, setSeen] = useState(localTime()),
    [city, setCity] = useState(alert.city),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState("");
  const [linkNotice, setLinkNotice] = useState("");
  const [observations, setObservations] = useState<LostSighting[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pendingStatus, setPendingStatus] = useState<"found" | "closed">(),
    [busy, setBusy] = useState(false);
  const alive = useAlive(),
    running = useRef(false),
    sighting = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    void api
      .listSightings(client, alert.id)
      .then((v) => {
        if (active) setObservations(v);
      })
      .catch(() => {
        if (active) setError("Les observations n’ont pas pu être chargées.");
      });
    return () => {
      active = false;
    };
  }, [client, alert.id]);
  const copyLink = async () => {
    setLinkNotice("");
    try {
      if (!navigator.clipboard?.writeText) throw Error("Copie indisponible");
      await navigator.clipboard.writeText(lostShareUrl(alert.id));
      if (alive.current) setLinkNotice("Le lien de l’alerte est copié.");
    } catch {
      if (alive.current)
        setLinkNotice("Copie le lien ci-dessous pour partager cette alerte.");
    }
  };
  const execute = async (
    operation: () => Promise<void>,
    text: string,
    refresh = false,
  ) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      if (alive.current) {
        setNotice(text);
        if (refresh) refreshed();
      }
    } catch (e) {
      if (alive.current) setError(toDataError(e).message);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section>
      <Button variant="quiet" onClick={close}>
        Revenir aux alertes
      </Button>
      <h2>{alert.display_name}</h2>
      <StatusBadge status={alert.status === "lost" ? "alert" : "ok"}>
        {alert.status === "lost"
          ? "Recherché"
          : alert.status === "found"
            ? "Retrouvé"
            : "Clôturé"}
      </StatusBadge>
      <LostPortrait client={client} alert={alert} />
      <p>
        {alert.species} · {alert.city} · Dernière observation :{" "}
        {dateLabel(alert.last_seen_at)}
      </p>
      <p className="app-lost-text">{alert.description}</p>
      {alert.instructions && (
        <p className="app-lost-text">Consignes : {alert.instructions}</p>
      )}
      <a
        href={`https://www.openstreetmap.org/?mlat=${Number(alert.latitude)}&mlon=${Number(alert.longitude)}#map=14/${Number(alert.latitude)}/${Number(alert.longitude)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Voir la zone approximative sur OpenStreetMap (site externe)
      </a>
      <div className="app-lost-share">
        <Button
          variant="out"
          onClick={() => {
            void copyLink();
          }}
        >
          Copier le lien de l’alerte
        </Button>
        <p>Le lien est accessible aux personnes autorisées à la bêta Furrix.</p>
        {linkNotice && (
          <>
            <p role="status">{linkNotice}</p>
            <Field label="Lien de l’alerte">
              <Input
                readOnly
                value={lostShareUrl(alert.id)}
                onFocus={(event) => event.target.select()}
              />
            </Field>
          </>
        )}
      </div>
      {alert.is_mine ? (
        <>
          <h3>Gérer mon alerte</h3>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1500}
            />
          </Field>
          <Field label="Consignes">
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={500}
            />
          </Field>
          <div className="app-lost-actions">
            <Button
              variant="out"
              loading={busy}
              onClick={() => {
                void execute(
                  () =>
                    api.updateLost(
                      client,
                      alert.id,
                      description,
                      instructions,
                      alert.status,
                    ),
                  "Modifications enregistrées.",
                  true,
                );
              }}
            >
              Enregistrer les modifications
            </Button>
            {alert.status === "lost" && (
              <>
                <Button
                  loading={busy}
                  variant={pendingStatus ? "out" : "main"}
                  onClick={() => setPendingStatus("found")}
                >
                  Mon animal est retrouvé
                </Button>
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() => setPendingStatus("closed")}
                >
                  Clôturer sans retour
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        alert.status === "lost" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void execute(async () => {
                await api.addSighting(
                  client,
                  sighting.current,
                  alert.id,
                  seen,
                  city,
                  message,
                );
                if (alive.current) {
                  sighting.current = crypto.randomUUID();
                  setMessage("");
                }
                try {
                  const fresh = await api.listSightings(client, alert.id);
                  if (alive.current) setObservations(fresh);
                } catch {
                  /* L’envoi est confirmé ; une relecture indisponible ne doit pas provoquer un second envoi. */
                }
              }, "Ton observation a été transmise au propriétaire.");
            }}
          >
            <h3>Je l’ai aperçu</h3>
            <p>
              Ces informations ne seront visibles que de toi et du propriétaire.
              Aucun match n’est nécessaire.
            </p>
            <Field label="Date de l’observation">
              <Input
                type="datetime-local"
                value={seen}
                onChange={(e) => setSeen(e.target.value)}
                required
              />
            </Field>
            <Field label="Lieu ou secteur">
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={80}
                required
              />
            </Field>
            <Field label="Observation et précisions utiles">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                required
              />
            </Field>
            <Button type="submit" loading={busy}>
              Transmettre mon observation
            </Button>
          </form>
        )
      )}
      {pendingStatus && (
        <Alert
          tone="warn"
          title={
            pendingStatus === "found"
              ? "Confirmer que ton animal est retrouvé"
              : "Clôturer cette alerte"
          }
          actions={
            <>
              <Button
                loading={busy}
                onClick={() => {
                  const status = pendingStatus;
                  void execute(
                    async () => {
                      await api.updateLost(
                        client,
                        alert.id,
                        description,
                        instructions,
                        status,
                      );
                      if (alive.current) setPendingStatus(undefined);
                    },
                    status === "found"
                      ? "Alerte marquée retrouvée."
                      : "Alerte clôturée.",
                    true,
                  );
                }}
              >
                Confirmer
              </Button>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => setPendingStatus(undefined)}
              >
                Annuler
              </Button>
            </>
          }
        >
          {pendingStatus === "found"
            ? "Les personnes prévenues recevront une notification de retour. Les nouvelles observations seront fermées."
            : "L’annonce ne sera plus visible des autres testeurs. Cette action ne pourra pas être annulée depuis ce parcours."}
        </Alert>
      )}
      <h3>{alert.is_mine ? "Observations reçues" : "Mes observations"}</h3>
      {!observations.length ? (
        <p>Aucune observation pour le moment.</p>
      ) : (
        observations.map((s) => (
          <article className="app-lost-observation" key={s.id}>
            <time dateTime={s.seen_at}>{dateLabel(s.seen_at)}</time>
            <p>{s.city}</p>
            <p className="app-lost-text">{s.message}</p>
          </article>
        ))
      )}
      {!alert.is_mine && alert.status === "lost" && (
        <details>
          <summary>Signaler cette annonce</summary>
          <Field label="Motif du signalement">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </Field>
          <Button
            variant="out"
            loading={busy}
            disabled={!reason.trim()}
            onClick={() => {
              void execute(
                () => api.reportLost(client, alert.id, reason),
                "Signalement enregistré pour examen.",
              );
            }}
          >
            Envoyer le signalement
          </Button>
        </details>
      )}
      {notice && <Alert tone="ok" title={notice} />}{" "}
      {error && (
        <Alert tone="err" title="Action non confirmée">
          {error}
        </Alert>
      )}
    </section>
  );
}

/** Listes et liens d’alertes : l’adresse garde l’onglet et la fiche ouverte. */
export default function LostPetsArea({
  client,
  owner,
  pets,
}: {
  client: FurrixClient;
  owner: string;
  pets: PetRow[];
}) {
  const [route, setRoute] = useState(() => readLostRoute(window.location.hash));
  const [alerts, setAlerts] = useState<LostAlert[]>([]),
    [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [city, setCity] = useState(""),
    [filter, setFilter] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [loadingMore, setLoadingMore] = useState(false);
  const [unavailable, setUnavailable] = useState(false),
    [listError, setListError] = useState(""),
    [actionError, setActionError] = useState("");
  const [notificationAttempt, setNotificationAttempt] = useState(0),
    [notificationLoading, setNotificationLoading] = useState(false),
    [notificationError, setNotificationError] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false),
    [reading, setReading] = useState<string>();
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [detailState, setDetailState] = useState<{
    key: string;
    status: "loading" | "ready" | "error" | "missing";
    data?: LostAlert;
  }>({ key: "", status: "loading" });
  const alive = useAlive(),
    page = useRef(0),
    moreRunning = useRef(false),
    readRunning = useRef(false),
    listingKey = useRef(""),
    clientRevision = useRef({ client, revision: 0 });
  const mine = route.tab === "mine";
  if (clientRevision.current.client !== client)
    clientRevision.current = {
      client,
      revision: clientRevision.current.revision + 1,
    };
  listingKey.current = JSON.stringify([
    clientRevision.current.revision,
    owner,
    mine,
    filter,
    attempt,
  ]);
  const detailKey = JSON.stringify([owner, route.alertId, detailAttempt]);
  const navigate = (tab: LostTab, id?: string) => {
    const hash = lostHref(tab, id);
    setRoute(readLostRoute(hash));
    if (window.location.hash !== hash) window.location.hash = hash;
  };
  useEffect(() => {
    const read = () => setRoute(readLostRoute(window.location.hash));
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setListError("");
    page.current = 0;
    void (mine ? api.listOwnLost(client, owner) : api.listLost(client, filter))
      .then((rows) => {
        if (active) {
          setUnavailable(false);
          setAlerts(rows);
          setMore(rows.length === 30);
        }
      })
      .catch((cause: unknown) => {
        const error = cause as { code?: string; cause?: { code?: string } };
        if (active) {
          setUnavailable(
            ["PGRST202", "PGRST205", "42P01", "42883"].includes(
              error.cause?.code ?? error.code ?? "",
            ),
          );
          setListError(
            "Les alertes ne sont pas disponibles pour le moment. Réessaie plus tard.",
          );
          setAlerts([]);
          setMore(false);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, owner, mine, filter, attempt]);
  useEffect(() => {
    if (route.tab !== "notifications") return;
    let active = true;
    setNotificationLoading(true);
    setNotificationError("");
    void api
      .listNotifications(client, owner, unreadOnly)
      .then((rows) => {
        if (active) setNotifications(rows);
      })
      .catch(() => {
        if (active)
          setNotificationError("Tes notifications n’ont pas pu être chargées.");
      })
      .finally(() => {
        if (active) setNotificationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, owner, route.tab, unreadOnly, notificationAttempt]);
  useEffect(() => {
    if (route.tab !== "notifications") return;
    const refresh = () => {
      if (!document.hidden) setNotificationAttempt((v) => v + 1);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("furrix:notifications-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("furrix:notifications-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [route.tab]);
  useEffect(() => {
    if (!route.alertId) return;
    let active = true;
    setDetailState({ key: detailKey, status: "loading" });
    void api
      .listLost(client, "", undefined, route.alertId)
      .then((rows) => {
        if (active)
          setDetailState({
            key: detailKey,
            status: rows[0] ? "ready" : "missing",
            data: rows[0],
          });
      })
      .catch(() => {
        if (active) setDetailState({ key: detailKey, status: "error" });
      });
    return () => {
      active = false;
    };
  }, [client, owner, route.alertId, detailAttempt, detailKey]);
  const loadMore = async () => {
    if (moreRunning.current) return;
    moreRunning.current = true;
    setLoadingMore(true);
    const key = listingKey.current;
    try {
      const rows = mine
        ? await api.listOwnLost(client, owner, page.current + 1)
        : await api.listLost(client, filter, alerts[alerts.length - 1]!.id);
      if (alive.current && listingKey.current === key) {
        if (mine) page.current += 1;
        setAlerts((previous) => [
          ...new Map([...previous, ...rows].map((a) => [a.id, a])).values(),
        ]);
        setMore(rows.length === 30);
      }
    } catch {
      if (alive.current && listingKey.current === key)
        setListError("La suite des alertes n’a pas pu être chargée.");
    } finally {
      moreRunning.current = false;
      if (alive.current) setLoadingMore(false);
    }
  };
  const read = async (n: LocalNotification, open: boolean) => {
    if (readRunning.current) return;
    readRunning.current = true;
    setReading(n.id);
    setActionError("");
    const context = window.location.hash;
    try {
      if (!n.read_at) {
        await api.readNotification(client, n.id);
        if (alive.current)
          setNotifications((rows) =>
            rows.map((row) =>
              row.id === n.id
                ? { ...row, read_at: new Date().toISOString() }
                : row,
            ),
          );
        window.dispatchEvent(new Event("furrix:notifications-read"));
      }
    } catch {
      if (alive.current)
        setActionError(
          "La lecture de cette notification n’a pas été enregistrée. Tu peux réessayer.",
        );
    } finally {
      readRunning.current = false;
      if (alive.current) {
        setReading(undefined);
        if (open && window.location.hash === context)
          navigate("notifications", n.alert_id);
      }
    }
  };
  const currentDetail = detailState.key === detailKey ? detailState : undefined;
  const shownNotifications = unreadOnly
    ? notifications.filter((n) => !n.read_at)
    : notifications;
  const tabs: Array<[LostTab, string]> = [
    ["list", "Les alertes"],
    ["mine", "Mes alertes"],
    ["new", "Déclarer une disparition"],
    ["notifications", "Mes notifications"],
    ["sector", "Mon secteur"],
  ];
  return (
    <FurrixScope className="app-lost">
      <p className="app-eyebrow">Ensemble, gardons les yeux ouverts</p>
      <h1>Animaux perdus</h1>
      <div className="app-lost-actions" aria-label="Parcours animaux perdus">
        {tabs.map(([tab, label]) => (
          <Button
            key={tab}
            disabled={unavailable && tab !== "list"}
            variant={route.tab === tab ? "ink" : "quiet"}
            aria-pressed={route.tab === tab}
            onClick={() => {
              setActionError("");
              navigate(tab);
              if (tab === "notifications") setNotificationAttempt((v) => v + 1);
              else setAttempt((v) => v + 1);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {actionError && <Alert tone="err" title={actionError} />}
      {route.invalid ? (
        <Alert tone="err" title="Ce lien d’alerte est invalide." />
      ) : route.alertId ? (
        !currentDetail || currentDetail.status === "loading" ? (
          <Loading label="Chargement de l’alerte" />
        ) : currentDetail.status === "ready" && currentDetail.data ? (
          <AlertDetail
            key={currentDetail.data.id + currentDetail.data.status}
            client={client}
            alert={currentDetail.data}
            close={() => navigate(route.tab)}
            refreshed={() => {
              setDetailAttempt((v) => v + 1);
              setAttempt((v) => v + 1);
            }}
          />
        ) : (
          <Alert
            tone={currentDetail.status === "missing" ? "info" : "err"}
            title={
              currentDetail.status === "missing"
                ? "Cette alerte a été retirée ou n’est plus disponible."
                : "Cette alerte n’a pas pu être chargée."
            }
            actions={
              <>
                <Button variant="out" onClick={() => navigate(route.tab)}>
                  Revenir aux alertes
                </Button>
                {currentDetail.status === "error" && (
                  <Button
                    variant="out"
                    onClick={() => setDetailAttempt((v) => v + 1)}
                  >
                    Réessayer l’alerte
                  </Button>
                )}
              </>
            }
          />
        )
      ) : unavailable ? (
        <Alert
          tone="info"
          title="Les alertes locales se préparent"
          actions={
            <Button variant="out" onClick={() => setAttempt((v) => v + 1)}>
              Vérifier la disponibilité
            </Button>
          }
        >
          Ce service n’est pas encore disponible sur cet environnement. Tes
          profils et tes rencontres restent accessibles.
        </Alert>
      ) : route.tab === "new" ? (
        <NewAlert
          client={client}
          pets={pets}
          saved={(id) => {
            navigate("mine", id);
            setAttempt((v) => v + 1);
          }}
          cancel={() => navigate("list")}
        />
      ) : route.tab === "sector" ? (
        <SectorSettings client={client} owner={owner} />
      ) : route.tab === "notifications" ? (
        <section>
          <h2>Mes notifications</h2>
          <p>
            Les alertes de secteur, les observations et les animaux retrouvés.
            Les 50 dernières notifications de ta sélection sont affichées.
          </p>
          <div className="app-lost-actions">
            <Button
              variant="out"
              onClick={() => setNotificationAttempt((v) => v + 1)}
            >
              Actualiser
            </Button>
            <Button
              variant={unreadOnly ? "ink" : "quiet"}
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((v) => !v)}
            >
              Non lues uniquement
            </Button>
          </div>
          {notificationError ? (
            <Alert tone="err" title={notificationError} />
          ) : notificationLoading ? (
            <Loading label="Chargement des notifications" />
          ) : !shownNotifications.length ? (
            <p>
              {unreadOnly
                ? "Tu n’as aucune notification non lue."
                : "Aucune notification pour le moment."}
            </p>
          ) : (
            shownNotifications.map((n) => (
              <article className="app-lost-observation" key={n.id}>
                <h3>{n.title}</h3>
                <p>
                  {dateLabel(n.created_at)} · {n.read_at ? "Lue" : "Non lue"}
                </p>
                <div className="app-lost-actions">
                  <Button
                    variant="out"
                    loading={reading === n.id}
                    disabled={!!reading && reading !== n.id}
                    onClick={() => {
                      void read(n, true);
                    }}
                  >
                    Consulter l’alerte
                  </Button>
                  {!n.read_at && (
                    <Button
                      variant="quiet"
                      disabled={!!reading}
                      onClick={() => {
                        void read(n, false);
                      }}
                    >
                      Marquer comme lue
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      ) : (
        <section>
          {mine ? (
            <h2>Mes alertes</h2>
          ) : (
            <form
              className="app-lost-filter"
              onSubmit={(event) => {
                event.preventDefault();
                setFilter(city);
              }}
            >
              <Field label="Filtrer par commune exacte">
                <Input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  maxLength={80}
                />
              </Field>
              <Button variant="out" type="submit">
                Filtrer
              </Button>
            </form>
          )}
          {listError && (
            <Alert
              tone="err"
              title="Chargement impossible"
              actions={
                <Button variant="out" onClick={() => setAttempt((v) => v + 1)}>
                  Réessayer
                </Button>
              }
            >
              {listError}
            </Alert>
          )}
          {loading ? (
            <Loading label="Recherche des animaux" />
          ) : !alerts.length && !listError ? (
            <p>
              {mine
                ? "Tu n’as pas encore déclaré de disparition."
                : "Aucune alerte dans cette sélection."}
            </p>
          ) : (
            <div className="app-lost-grid">
              {alerts.map((a) => (
                <article key={a.id} className="app-lost-card">
                  <StatusBadge status={a.status === "lost" ? "alert" : "ok"}>
                    {a.status === "lost"
                      ? "Recherché"
                      : a.status === "found"
                        ? "Retrouvé"
                        : "Clôturé"}
                  </StatusBadge>
                  <LostPortrait client={client} alert={a} />
                  <h2>{a.display_name}</h2>
                  <p>
                    {a.species} · {a.city}
                  </p>
                  <p>Dernière observation : {dateLabel(a.last_seen_at)}</p>
                  <p className="app-lost-text">{a.description}</p>
                  <Button
                    variant="out"
                    onClick={() => navigate(route.tab, a.id)}
                  >
                    Voir l’alerte{a.is_mine ? " de mon animal" : ""}
                  </Button>
                </article>
              ))}
            </div>
          )}
          {more && (
            <Button
              variant="out"
              loading={loadingMore}
              onClick={() => {
                void loadMore();
              }}
            >
              Voir la suite
            </Button>
          )}
        </section>
      )}
    </FurrixScope>
  );
}
