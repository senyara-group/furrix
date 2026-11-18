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
} from "../design-system";
import "../design-system/styles";
import type { FurrixClient } from "../services/supabaseClient";
import type { PetRow } from "../types/database";
import { PetPhoto } from "../pets/PetPhoto";
import { approximateLocation } from "../meetings/location";
import { toDataError } from "../services/errors";
import * as api from "./service";
import type {
  LocalNotification,
  LostAlert,
  LostForm,
  LostSector,
  LostSighting,
} from "./types";
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
          <fieldset disabled={busy} className="app-lost-fields">
            <legend>Dernière zone connue</legend>
            <Field label="Animal">
              <select
                value={values.petId}
                onChange={(e) => change("petId", e.target.value)}
              >
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ville ou commune">
              <Input
                value={values.city}
                maxLength={80}
                onChange={(e) => change("city", e.target.value)}
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
                Choisis une autre zone ci-dessous si ton animal a disparu
                ailleurs. Les coordonnées sont arrondies avant envoi.
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
function SectorSettings({
  client,
  owner,
}: {
  client: FurrixClient;
  owner: string;
}) {
  const [sector, setSector] = useState<LostSector | null>(),
    [radius, setRadius] = useState("25"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useAlive(),
    running = useRef(false);
  useEffect(() => {
    let active = true;
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
      });
    return () => {
      active = false;
    };
  }, [client, owner]);
  const save = async (enabled: boolean) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const location = enabled ? await approximateLocation() : undefined;
      if (!alive.current) return;
      await api.setSector(
        client,
        enabled,
        location?.latitude,
        location?.longitude,
        Number(radius),
      );
      const fresh = await api.getSector(client, owner);
      if (alive.current) setSector(fresh);
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
        {sector
          ? `Abonnement actif : rayon maximal ${sector.radius_km} km. Le rayon choisi par le propriétaire peut être plus petit.`
          : "Tu ne reçois pas encore les alertes de secteur."}
      </p>
      <Field label="Rayon maximal">
        <select value={radius} onChange={(e) => setRadius(e.target.value)}>
          {[5, 10, 25, 50].map((n) => (
            <option value={n} key={n}>
              {n} km
            </option>
          ))}
        </select>
      </Field>
      <div className="app-lost-actions">
        <Button
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
  const [observations, setObservations] = useState<LostSighting[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
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
                  onClick={() => {
                    void execute(
                      () =>
                        api.updateLost(
                          client,
                          alert.id,
                          description,
                          instructions,
                          "found",
                        ),
                      "Alerte marquée retrouvée.",
                      true,
                    );
                  }}
                >
                  Mon animal est retrouvé
                </Button>
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() => {
                    void execute(
                      () =>
                        api.updateLost(
                          client,
                          alert.id,
                          description,
                          instructions,
                          "closed",
                        ),
                      "Alerte clôturée.",
                      true,
                    );
                  }}
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

/** Parcours autonome ; aucune modification du header ou des rencontres. */
export default function LostPetsArea({
  client,
  owner,
  pets,
}: {
  client: FurrixClient;
  owner: string;
  pets: PetRow[];
}) {
  const [tab, setTab] = useState<"list" | "new" | "notifications" | "sector">(
    () =>
      window.location.hash.includes("notifications") ? "notifications" : "list",
  );
  const [alerts, setAlerts] = useState<LostAlert[]>([]),
    [notifications, setNotifications] = useState<LocalNotification[]>([]),
    [detail, setDetail] = useState<LostAlert>();
  const [city, setCity] = useState(""),
    [filter, setFilter] = useState(""),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useAlive(),
    opening = useRef(false),
    listingKey = useRef("");
  listingKey.current = JSON.stringify([filter, attempt]);
  useEffect(() => {
    const read = () => {
      if (window.location.hash.includes("notifications")) {
        setTab("notifications");
        setDetail(undefined);
        setAttempt((v) => v + 1);
      }
    };
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      api.listLost(client, filter),
      api.listNotifications(client, owner),
    ])
      .then(([a, n]) => {
        if (active) {
          setAlerts(a);
          setNotifications(n);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Les alertes ne sont pas disponibles pour le moment. Réessaie plus tard.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, owner, filter, attempt]);
  const open = async (id: string, notification?: string) => {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setError("");
    try {
      const rows = await api.listLost(client, "", undefined, id);
      if (!rows[0]) throw new Error();
      if (notification) await api.readNotification(client, notification);
      if (alive.current) {
        setDetail(rows[0]);
        setAttempt((v) => v + 1);
      }
    } catch {
      if (alive.current) setError("Cette alerte n’est plus disponible.");
    } finally {
      opening.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const refreshDetail = () => {
    if (detail) void open(detail.id);
  };
  return (
    <FurrixScope className="app-lost">
      <p className="app-eyebrow">Ensemble, gardons les yeux ouverts</p>
      <h1>Animaux perdus</h1>
      <div className="app-lost-actions" aria-label="Parcours animaux perdus">
        {(["list", "new", "notifications", "sector"] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "ink" : "quiet"}
            onClick={() => {
              setTab(t);
              setDetail(undefined);
              setAttempt((v) => v + 1);
            }}
          >
            {t === "list"
              ? "Les alertes"
              : t === "new"
                ? "Déclarer une disparition"
                : t === "notifications"
                  ? "Mes notifications"
                  : "Mon secteur"}
          </Button>
        ))}
      </div>
      {error && (
        <Alert
          tone="err"
          title="Chargement impossible"
          actions={
            <Button variant="out" onClick={() => setAttempt((v) => v + 1)}>
              Réessayer
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {detail ? (
        <AlertDetail
          key={detail.id + detail.status}
          client={client}
          alert={detail}
          close={() => setDetail(undefined)}
          refreshed={refreshDetail}
        />
      ) : tab === "new" ? (
        <NewAlert
          client={client}
          pets={pets}
          saved={(id) => {
            setTab("list");
            void open(id);
            setAttempt((v) => v + 1);
          }}
          cancel={() => setTab("list")}
        />
      ) : tab === "sector" ? (
        <SectorSettings client={client} owner={owner} />
      ) : tab === "notifications" ? (
        <section>
          <h2>Mes notifications</h2>
          <p>
            Les alertes de secteur, les observations et les animaux retrouvés.
            Actualise pour voir les dernières nouvelles.
          </p>
          <Button variant="out" onClick={() => setAttempt((v) => v + 1)}>
            Actualiser
          </Button>
          {loading ? (
            <Loading label="Chargement des notifications" />
          ) : !notifications.length ? (
            <p>Aucune notification pour le moment.</p>
          ) : (
            notifications.map((n) => (
              <article className="app-lost-observation" key={n.id}>
                <h3>{n.title}</h3>
                <p>
                  {dateLabel(n.created_at)} · {n.read_at ? "Lue" : "Non lue"}
                </p>
                <Button
                  variant="out"
                  loading={busy}
                  onClick={() => {
                    void open(n.alert_id, n.id);
                  }}
                >
                  Consulter l’alerte
                </Button>
              </article>
            ))
          )}
        </section>
      ) : (
        <section>
          <form
            className="app-lost-filter"
            onSubmit={(e) => {
              e.preventDefault();
              setFilter(city);
            }}
          >
            <Field label="Filtrer par commune exacte">
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={80}
              />
            </Field>
            <Button variant="out" type="submit">
              Filtrer
            </Button>
          </form>
          {loading ? (
            <Loading label="Recherche des animaux" />
          ) : !alerts.length && !error ? (
            <p>Aucune alerte dans cette sélection.</p>
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
                    loading={busy}
                    onClick={() => {
                      void open(a.id);
                    }}
                  >
                    Voir l’alerte{a.is_mine ? " de mon animal" : ""}
                  </Button>
                </article>
              ))}
            </div>
          )}
          {alerts.length === 30 && (
            <Button
              variant="out"
              loading={busy}
              onClick={() => {
                const key = listingKey.current;
                setBusy(true);
                void api
                  .listLost(client, filter, alerts[alerts.length - 1]!.id)
                  .then((rows) => {
                    if (alive.current && listingKey.current === key)
                      setAlerts(rows);
                  })
                  .catch(() => {
                    if (alive.current)
                      setError("La suite des alertes n’a pas pu être chargée.");
                  })
                  .finally(() => {
                    if (alive.current) setBusy(false);
                  });
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
