import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Loading,
  Note,
  OptionGroup,
  PageHeader,
  Segmented,
  Stack,
  Textarea,
} from "../design-system";
import type { FurrixClient } from "../services/supabaseClient";
import {
  locateTown,
  approximateLocation,
  LocationError,
  locationMessage,
  type ApproximatePosition,
} from "../meetings/location";
import { ownProfessional, saveProfessional } from "./service";
import { CityInput } from "../places/CityInput";
import { decimalInput, euroCents, phoneError, phoneInput } from "../validation/numbers";
import {
  categories,
  safeWebsite,
  type Category,
  type OwnProfessional,
} from "./types";
export type ServiceDraft = { name: string; price: string; unit: string };
type Draft = {
  name: string;
  category: Category;
  city: string;
  bio: string;
  species: string[];
  hours: string;
  accessibility: string;
  phone: string;
  website: string;
  active: boolean;
  position: ApproximatePosition | null;
  services: ServiceDraft[];
};
const empty: Draft = {
  name: "",
  category: "veterinaire",
  city: "",
  bio: "",
  species: ["chien", "chat"],
  hours: "",
  accessibility: "",
  phone: "",
  website: "",
  active: false,
  position: null,
  services: [{ name: "", price: "", unit: "prestation" }],
};
const fromProfile = (p: OwnProfessional): Draft => ({
  ...p,
  phone: p.phone ?? "",
  website: p.website ?? "",
  position: { latitude: p.latitude, longitude: p.longitude },
  services: p.services.map((s) => ({
    name: s.name,
    unit: s.unit,
    price: s.price_cents === null ? "" : String(s.price_cents / 100),
  })),
});
/** Édition de sa seule activité professionnelle, sans changer son compte personnel. */
export default function ProfessionalProfile({
  client,
  owner,
}: {
  client: FurrixClient;
  owner: string;
}) {
  const [form, setForm] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false);
  const alive = useRef(true),
    operation = useRef(false),
    locVersion = useRef(0);
  useEffect(() => {
    alive.current = true;
    let current = true;
    setError("");
    setForm(null);
    void ownProfessional(client, owner)
      .then((p) => {
        if (current) setForm(p ? fromProfile(p) : { ...empty });
      })
      .catch(() => {
        if (current) setError("Ton activité n’a pas pu être chargée.");
      });
    return () => {
      current = false;
      alive.current = false;
      locVersion.current++;
    };
  }, [client, owner, attempt]);
  const change = (next: Partial<Draft>) => {
    setForm((f) => (f ? { ...f, ...next } : f));
    setSaved(false);
  };
  const locate = async (gps = false) => {
    if (!form || locating) return;
    const version = ++locVersion.current;
    setLocating(true);
    setError("");
    try {
      const p = gps
        ? await approximateLocation()
        : await locateTown(form.city, AbortSignal.timeout(15000));
      if (alive.current && version === locVersion.current)
        change({ position: p });
    } catch (e) {
      if (alive.current && version === locVersion.current)
        setError(
          e instanceof LocationError
            ? locationMessage[e.reason]
            : "Le secteur n’a pas pu être trouvé.",
        );
    } finally {
      if (alive.current) setLocating(false);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || operation.current) return;
    setError("");
    setSaved(false);
    if (
      form.name.trim().length < 2 ||
      form.city.trim().length < 2 ||
      form.bio.trim().length < 10 ||
      !form.species.length
    ) {
      setError(
        "Renseigne le nom, la ville, une présentation d’au moins 10 caractères et les animaux accueillis.",
      );
      return;
    }
    if (!form.position) {
      setError(
        "Confirme le secteur en recherchant ta ville ou avec ta position.",
      );
      return;
    }
    const website = form.website.trim() ? safeWebsite(form.website.trim()) : "";
    if (website === null) {
      setError(
        "Indique une adresse de site en https, sans identifiant ni mot de passe.",
      );
      return;
    }
    const phoneProblem = phoneError(form.phone);
    if (phoneProblem) {
      setError(phoneProblem);
      return;
    }
    if (
      form.services.some(
        (s) =>
          s.name.trim().length < 2 ||
          !s.unit.trim() ||
          (s.price.trim() && !/^\d{1,5}([,.]\d{1,2})?$/.test(s.price.trim())) ||
          Number(s.price.replace(",", ".")) > 10000,
      )
    ) {
      setError(
        "Vérifie les prestations : nom, unité et tarif entre 0 et 10 000 €, ou laisse le tarif vide.",
      );
      return;
    }
    operation.current = true;
    setBusy(true);
    try {
      await saveProfessional(client, {
        p_name: form.name.trim(),
        p_category: form.category,
        p_city: form.city.trim(),
        p_lat: form.position.latitude,
        p_lng: form.position.longitude,
        p_bio: form.bio.trim(),
        p_species: form.species,
        p_hours: form.hours.trim(),
        p_accessibility: form.accessibility.trim(),
        p_phone: form.phone.trim(),
        p_website: website,
        p_services: form.services.map((s) => ({
          name: s.name.trim(),
          unit: s.unit.trim(),
          price_cents: s.price.trim() ? euroCents(s.price) : null,
        })),
        p_active: form.active,
      });
      if (alive.current) setSaved(true);
    } catch {
      if (alive.current)
        setError(
          "Ton activité n’a pas été enregistrée. Vérifie les informations et réessaie.",
        );
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Mon activité professionnelle"
        subtitle="Le même compte, un profil d’activité distinct."
        back={{
          label: "Services",
          onClick: () => {
            window.location.hash = "#/services";
          },
        }}
        showTitleOnPhone
      />
      <Note>
        Tu veux proposer des gardes ?{" "}
        <a href="#/garde?vue=profil">Ouvrir mon profil de gardien</a>.
      </Note>
      {!form ? (
        error ? (
          <Alert
            tone="err"
            title={error}
            actions={
              <Button variant="out" onClick={() => setAttempt((a) => a + 1)}>
                Réessayer
              </Button>
            }
          />
        ) : (
          <Loading label="Chargement de ton activité…" />
        )
      ) : (
        <form
          onSubmit={(e) => {
            void submit(e);
          }}
          noValidate
        >
          <fieldset disabled={busy || locating} className="app-pro-fieldset">
            <Stack gap={5}>
              <Card>
                <Stack gap={3}>
                  <h2>Présentation</h2>
                  <Field label="Nom de l’établissement ou de l’activité">
                    <Input
                      value={form.name}
                      maxLength={100}
                      onChange={(e) => change({ name: e.target.value })}
                    />
                  </Field>
                  <Field label="Catégorie">
                    <select
                      value={form.category}
                      onChange={(e) =>
                        change({ category: e.target.value as Category })
                      }
                    >
                      {Object.entries(categories).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Présentation">
                    <Textarea
                      value={form.bio}
                      maxLength={2000}
                      rows={4}
                      onChange={(e) => change({ bio: e.target.value })}
                    />
                  </Field>
                  <div>
                    <p>Animaux accueillis</p>
                    <OptionGroup
                      multiple
                      aria-label="Animaux accueillis"
                      value={form.species}
                      onChange={(species) => change({ species })}
                      options={[
                        { value: "chien", label: "Chiens" },
                        { value: "chat", label: "Chats" },
                        { value: "autre", label: "Autres" },
                      ]}
                    />
                  </div>
                </Stack>
              </Card>
              <Card>
                <Stack gap={3}>
                  <h2>Ton secteur</h2>
                  <Field label="Ville ou commune">
                    <CityInput
                      value={form.city}
                      maxLength={80}
                      placeholder="Ex. Lille"
                      onChange={(city) => {
                        locVersion.current++;
                        change({ city, position: null });
                      }}
                      onPick={(c) => {
                        locVersion.current++;
                        setError("");
                        change({ city: c.name, position: { latitude: c.latitude, longitude: c.longitude } });
                      }}
                    />
                  </Field>
                  <Note>
                    Utilise la position actuelle seulement si tu es sur le lieu
                    de ton activité.
                  </Note>
                  <div className="app-pro-actions">
                    <Button
                      variant="out"
                      onClick={() => {
                        void locate();
                      }}
                    >
                      Trouver ma ville
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        void locate(true);
                      }}
                    >
                      Utiliser ma position
                    </Button>
                  </div>
                  {form.position && (
                    <Note>
                      Secteur confirmé. Seuls la ville et une distance
                      approximative figurent dans l’annuaire.
                    </Note>
                  )}
                  <Field label="Horaires" optional>
                    <Textarea
                      value={form.hours}
                      maxLength={500}
                      rows={2}
                      onChange={(e) => change({ hours: e.target.value })}
                    />
                  </Field>
                  <Field label="Accès et accueil" optional>
                    <Textarea
                      value={form.accessibility}
                      maxLength={500}
                      rows={2}
                      onChange={(e) =>
                        change({ accessibility: e.target.value })
                      }
                    />
                  </Field>
                </Stack>
              </Card>
              <Card>
                <Stack gap={3}>
                  <h2>Prestations et tarifs indicatifs</h2>
                  <Note>
                    Les tarifs sont déclarés par ton établissement. Un tarif
                    vide sera affiché « Tarif à demander ».
                  </Note>
                  {form.services.map((service, i) => (
                    <div className="app-pro-service-edit" key={i}>
                      <Field label={"Prestation " + (i + 1)}>
                        <Input
                          maxLength={100}
                          value={service.name}
                          onChange={(e) =>
                            change({
                              services: form.services.map((s, n) =>
                                n === i ? { ...s, name: e.target.value } : s,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label={"Tarif " + (i + 1) + " (€)"} optional>
                        <Input
                          inputMode="decimal"
                          maxLength={8}
                          value={service.price}
                          onChange={(e) =>
                            change({
                              services: form.services.map((s, n) =>
                                n === i ? { ...s, price: decimalInput(e.target.value) } : s,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label={"Unité " + (i + 1)}>
                        <Input
                          value={service.unit}
                          maxLength={30}
                          onChange={(e) =>
                            change({
                              services: form.services.map((s, n) =>
                                n === i ? { ...s, unit: e.target.value } : s,
                              ),
                            })
                          }
                        />
                      </Field>
                      {form.services.length > 1 && (
                        <Button
                          variant="quiet"
                          aria-label={"Retirer la prestation " + (i + 1)}
                          onClick={() =>
                            change({
                              services: form.services.filter((_, n) => n !== i),
                            })
                          }
                        >
                          Retirer
                        </Button>
                      )}
                    </div>
                  ))}
                  {form.services.length < 20 && (
                    <Button
                      variant="out"
                      onClick={() =>
                        change({
                          services: [
                            ...form.services,
                            { name: "", price: "", unit: "prestation" },
                          ],
                        })
                      }
                    >
                      Ajouter une prestation
                    </Button>
                  )}
                </Stack>
              </Card>
              <Card>
                <Stack gap={3}>
                  <h2>Contact et visibilité</h2>
                  <Note>
                    Ces coordonnées professionnelles seront visibles des
                    testeurs quand ton profil sera publié. Ton e-mail personnel
                    et les données de tes animaux ne sont pas affichés.
                  </Note>
                  <Field label="Téléphone professionnel" optional>
                    <Input
                      type="tel"
                      value={form.phone}
                      maxLength={26}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="Ex. 03 20 12 34 56"
                      onChange={(e) => change({ phone: phoneInput(e.target.value) })}
                    />
                  </Field>
                  <Field
                    label="Site professionnel"
                    optional
                    hint="Adresse complète commençant par https://"
                  >
                    <Input
                      type="url"
                      value={form.website}
                      maxLength={300}
                      inputMode="url"
                      autoComplete="url"
                      placeholder="https://"
                      onChange={(e) => change({ website: e.target.value.replace(/\s/g, "") })}
                    />
                  </Field>
                  <Segmented
                    aria-label="Visibilité du profil professionnel"
                    value={form.active ? "active" : "paused"}
                    onChange={(v) => change({ active: v === "active" })}
                    options={[
                      { value: "active", label: "Visible dans l’annuaire" },
                      { value: "paused", label: "En pause" },
                    ]}
                  />
                  <Note>
                    Activité déclarée par son titulaire. Aucun badge de
                    vérification n’est attribué par cette publication.
                  </Note>
                </Stack>
              </Card>
            </Stack>
          </fieldset>
          <Button type="submit" loading={busy} disabled={locating}>
            Enregistrer mon activité
          </Button>
          {locating && <Loading label="Recherche du secteur…" />}
          {error && <Alert tone="err" title={error} />}{" "}
          {saved && (
            <Alert
              tone="ok"
              title={
                form.active
                  ? "Profil publié dans l’annuaire bêta"
                  : "Profil enregistré en pause"
              }
            />
          )}
        </form>
      )}
    </>
  );
}
