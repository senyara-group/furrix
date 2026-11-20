import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  FurrixScope,
  Input,
  Loading,
  Note,
  OptionGroup,
  Page,
  PageHeader,
  ResultList,
  ResultRow,
  Stack,
  StatusBadge,
} from "../design-system";
import type { FurrixClient } from "../services/supabaseClient";
import {
  approximateLocation,
  locateTown,
  LocationError,
  locationMessage,
  type ApproximatePosition,
} from "../meetings/location";
import { getProfessional, searchProfessionals } from "./service";
import { CityInput } from "../places/CityInput";
import { cityLabel } from "../places/cities";
import {
  categories,
  professionalHref,
  safeWebsite,
  servicePrice,
  type Category,
  type Professional,
} from "./types";
import ProfessionalProfile from "./ProfessionalProfile";
import "./professionals.css";
type Search = {
  position: ApproximatePosition | null;
  label: string;
  radius: number;
  category: Category | "";
};
const speciesLabel: Record<string, string> = {
  chien: "Chiens",
  chat: "Chats",
  autre: "Autres animaux",
};
/** Fiche déclarée, sans badge vérifié ni faux créneau ; contact à l’initiative de la personne. */
function ProfessionalDetail({
  client,
  id,
}: {
  client: FurrixClient;
  id: string;
}) {
  const [profile, setProfile] = useState<Professional | null>(),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setProfile(undefined);
    setFailed(false);
    void getProfessional(client, id)
      .then((p) => {
        if (current) setProfile(p);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [client, id, attempt]);
  const back = {
    label: "Services",
    onClick: () => {
      window.location.hash = professionalHref();
    },
  };
  if (failed)
    return (
      <>
        <PageHeader
          title="Fiche professionnelle"
          back={back}
          showTitleOnPhone
        />
        <Alert
          tone="err"
          title="Cette fiche n’a pas pu être chargée."
          actions={
            <Button variant="out" onClick={() => setAttempt((a) => a + 1)}>
              Réessayer
            </Button>
          }
        />
      </>
    );
  if (profile === undefined)
    return (
      <>
        <PageHeader
          title="Fiche professionnelle"
          back={back}
          showTitleOnPhone
        />
        <Loading label="Chargement de la fiche…" />
      </>
    );
  if (profile === null)
    return (
      <>
        <PageHeader
          title="Fiche professionnelle"
          back={back}
          showTitleOnPhone
        />
        <EmptyState icon="search" title="Activité indisponible">
          Cette activité n’est pas publiée ou n’est plus accessible.
        </EmptyState>
      </>
    );
  const site = profile.website ? safeWebsite(profile.website) : null;
  return (
    <>
      <PageHeader
        title={profile.name}
        subtitle={[
          categories[profile.category],
          profile.city,
          profile.distance_km === null ? null : `≈ ${profile.distance_km} km`,
        ]
          .filter(Boolean)
          .join(" · ")}
        back={back}
        showTitleOnPhone
      />
      <Stack gap={5}>
        <Note>
          Activité déclarée par son titulaire. Les qualifications n’ont pas été
          vérifiées par Furrix.
        </Note>
        <div className="app-pro-detail">
          <Card>
            <Stack gap={3}>
              <h2>Présentation</h2>
              <p className="app-pro-text">{profile.bio}</p>
              <p>
                {profile.species.map((s) => speciesLabel[s] ?? s).join(" · ")}
              </p>
              {profile.hours && (
                <>
                  <h3>Horaires</h3>
                  <p className="app-pro-text">{profile.hours}</p>
                </>
              )}
              {profile.accessibility && (
                <>
                  <h3>Accès et accueil</h3>
                  <p className="app-pro-text">{profile.accessibility}</p>
                </>
              )}
            </Stack>
          </Card>
          <Card>
            <Stack gap={3}>
              <h2>Prestations</h2>
              {profile.services.map((s, i) => (
                <div className="app-pro-price" key={i}>
                  <span>{s.name}</span>
                  <strong>{servicePrice(s)}</strong>
                </div>
              ))}
              <Note>
                Tarifs indicatifs déclarés par l’établissement. Confirme la
                prestation et son montant directement avec lui.
              </Note>
            </Stack>
          </Card>
        </div>
        <Card>
          <Stack gap={3}>
            <h2>Contacter l’établissement</h2>
            <p>
              Contacte directement l’établissement pour ses disponibilités.
              Aucun rendez-vous n’est réservé dans Furrix.
            </p>
            <div className="app-pro-actions">
              {profile.phone && (
                <Button
                  as="a"
                  variant="out"
                  href={"tel:" + profile.phone.replace(/[^+0-9]/g, "")}
                >
                  Appeler {profile.phone}
                </Button>
              )}
              {site && (
                <Button
                  as="a"
                  variant="out"
                  href={site}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ouvrir son site
                </Button>
              )}
            </div>
            {!profile.phone && !site && (
              <Note>
                Aucune coordonnée professionnelle n’a encore été renseignée.
              </Note>
            )}
          </Stack>
        </Card>
        {profile.category === "veterinaire" && (
          <Note>
            Furrix ne gère pas les urgences vétérinaires. Contacte directement
            un vétérinaire ou un service de garde.
          </Note>
        )}
      </Stack>
    </>
  );
}
function Directory({
  client,
  search,
  onSearch,
}: {
  client: FurrixClient;
  search: Search;
  onSearch: Dispatch<SetStateAction<Search>>;
}) {
  const [town, setTown] = useState(search.label),
    [locating, setLocating] = useState(false),
    [locationError, setLocationError] = useState("");
  const [results, setResults] = useState<Professional[]>([]),
    [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
      "idle",
    ),
    [attempt, setAttempt] = useState(0);
  const alive = useRef(true),
    request = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
    };
  }, []);
  useEffect(() => {
    if (!search.position) {
      setStatus("idle");
      return;
    }
    let current = true;
    setStatus("loading");
    setResults([]);
    void searchProfessionals(
      client,
      search.position,
      search.radius,
      search.category || undefined,
    )
      .then((data) => {
        if (current) {
          setResults(data);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (current) setStatus("error");
      });
    return () => {
      current = false;
    };
  }, [client, search, attempt]);
  const locate = async (gps = false) => {
    if (locating) return;
    const version = ++request.current;
    setLocating(true);
    setLocationError("");
    try {
      const position = gps
        ? await approximateLocation()
        : await locateTown(town, AbortSignal.timeout(15000));
      if (alive.current && version === request.current)
        onSearch((current) => ({
          ...current,
          position,
          label: gps
            ? "Autour de ma position"
            : "label" in position
              ? String(position.label)
              : town,
        }));
    } catch (e) {
      if (alive.current && version === request.current)
        setLocationError(
          e instanceof LocationError
            ? locationMessage[e.reason]
            : "La recherche du secteur a échoué.",
        );
    } finally {
      if (alive.current) setLocating(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Les bons services, près de toi."
        subtitle="Vétérinaires, toiletteurs et éducateurs, dans ton secteur."
        showTitleOnPhone
      />
      <div className="app-pro-actions app-pro-shortcuts">
        <Button as="a" href="#/services?vue=profil" variant="out">
          Proposer mes services
        </Button>
        <Button as="a" href="#/garde" variant="quiet">
          Trouver une garde
        </Button>
      </div>
      <Card>
        <Stack gap={3}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void locate();
            }}
          >
            <div className="app-pro-search">
              <Field label="Ville ou code postal">
                <CityInput
                  value={town}
                  maxLength={100}
                  placeholder="Ex. Lille ou 59000"
                  onPick={(c) => {
                    request.current++;
                    setLocationError("");
                    onSearch((current) => ({ ...current, position: { latitude: c.latitude, longitude: c.longitude }, label: cityLabel(c) }));
                  }}
                  onChange={(value) => {
                    request.current++;
                    setTown(value);
                  }}
                />
              </Field>
              <Button type="submit" variant="out" loading={locating}>
                Trouver la ville
              </Button>
              <Button
                variant="quiet"
                loading={locating}
                onClick={() => {
                  void locate(true);
                }}
              >
                Utiliser ma position
              </Button>
            </div>
          </form>
          <Note>
            La recherche par ville fonctionne sans autoriser ta localisation. Le
            nom saisi est envoyé au service public de géocodage.
          </Note>
          {locationError && <Alert tone="err" title={locationError} />}
          <OptionGroup
            aria-label="Catégorie de service"
            value={search.category}
            onChange={(v) =>
              onSearch({ ...search, category: v as Category | "" })
            }
            options={[
              { value: "", label: "Tous" },
              ...Object.entries(categories).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <OptionGroup
            aria-label="Rayon de recherche"
            value={String(search.radius)}
            onChange={(v) => onSearch({ ...search, radius: Number(v) })}
            options={[5, 10, 25, 50].map((n) => ({
              value: String(n),
              label: n + " km",
            }))}
          />
        </Stack>
      </Card>
      {status === "idle" ? (
        <Note>
          Choisis une ville ou utilise ta position pour voir les activités
          proches.
        </Note>
      ) : status === "loading" ? (
        <Loading label="Recherche des professionnels…" />
      ) : status === "error" ? (
        <Alert
          tone="err"
          title="Les professionnels n’ont pas pu être chargés."
          actions={
            <Button variant="out" onClick={() => setAttempt((a) => a + 1)}>
              Réessayer
            </Button>
          }
        >
          Ta ville, la catégorie et le rayon sont conservés.
        </Alert>
      ) : (
        <>
          <h2 className="app-pro-results">
            {results.length} activité{results.length > 1 ? "s" : ""} près de{" "}
            {search.label}
          </h2>
          {results.length ? (
            <>
              <ResultList>
                {results.map((p) => (
                  <ResultRow
                    key={p.professional_id}
                    as="a"
                    href={professionalHref(p.professional_id)}
                    initials={p.name[0]?.toUpperCase()}
                    name={p.name}
                    tag={
                      <StatusBadge status="wait">Activité déclarée</StatusBadge>
                    }
                    meta={[
                      categories[p.category],
                      p.city,
                      p.distance_km === null ? null : `≈ ${p.distance_km} km`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </ResultList>
              {results.length === 50 && (
                <Note>
                  Les 50 activités les plus proches sont affichées. Affine la
                  catégorie ou le rayon.
                </Note>
              )}
            </>
          ) : (
            <EmptyState
              icon="search"
              title="Aucune activité dans ce secteur"
              action={
                search.radius < 50 ? (
                  <Button
                    variant="out"
                    onClick={() =>
                      onSearch({
                        ...search,
                        radius: search.radius < 25 ? 25 : 50,
                      })
                    }
                  >
                    Élargir la recherche
                  </Button>
                ) : undefined
              }
            >
              Essaie une autre catégorie, une commune voisine ou un rayon plus
              large.
            </EmptyState>
          )}
          <Note>
            Activités déclarées par leurs titulaires, sans badge de
            vérification. La position des établissements et les distances sont
            approximatives.
          </Note>
        </>
      )}
    </>
  );
}
/** Annuaire bêta et activité professionnelle, séparés des profils personnels et du parcours Garde. */
export default function ProfessionalsArea({
  client,
  owner,
}: {
  client: FurrixClient;
  owner: string;
}) {
  const read = () =>
    new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const [params, setParams] = useState(read),
    [search, setSearch] = useState<Search>({
      position: null,
      label: "",
      radius: 10,
      category: "",
    });
  useEffect(() => {
    const changed = () => setParams(read());
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const id = params.get("professionnel"),
    edit = params.get("vue") === "profil";
  return (
    <FurrixScope className="app-pro-root">
      <Page>
        {edit ? (
          <ProfessionalProfile key={owner} client={client} owner={owner} />
        ) : id ? (
          <ProfessionalDetail key={id} client={client} id={id} />
        ) : (
          <Directory client={client} search={search} onSearch={setSearch} />
        )}
      </Page>
    </FurrixScope>
  );
}
