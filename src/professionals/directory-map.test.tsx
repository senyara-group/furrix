import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test/fakeSupabase";
import ProfessionalsArea from "./ProfessionalsArea";
import * as service from "./service";
import * as location from "../meetings/location";
import { LocationError } from "../meetings/location";
import { placeSchematic } from "../maps/schematic";
import type { Professional } from "./types";

const owner = "11111111-1111-4111-8111-111111111111";
const pro = (id: string, name: string, km: number): Professional => ({
  professional_id: id, name, category: "veterinaire", city: "Lille", bio: "Présentation.", species: ["chien"], hours: "", accessibility: "",
  phone: null, website: null, services: [{ name: "Consultation", unit: "consultation", price_cents: null }], distance_km: km,
});
const vet = pro("p1", "Cabinet des Oyats", 2), groomer = pro("p2", "Toilettage du Vieux-Lille", 7);
const open = () => render(<ProfessionalsArea client={createFakeSupabase().client} owner={owner} />);
const map = () => screen.getByRole("region", { name: /Carte des activités/ });
async function searchLille() {
  fireEvent.change(screen.getByLabelText("Ville ou code postal"), { target: { value: "Lille" } });
  fireEvent.click(screen.getByRole("button", { name: "Trouver la ville" }));
  await within(await screen.findByRole("region", { name: /Carte des activités/ })).findByRole("button", { name: /Cabinet des Oyats/ });
}
/** Ordinateur (≥ 900 px) : liste et carte côte à côte. */
function desktop() {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width"), media: query, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/#/services");
  vi.spyOn(location, "locateTown").mockResolvedValue({ latitude: 50.63, longitude: 3.06, label: "Lille · 59000" });
  vi.spyOn(location, "approximateLocation").mockResolvedValue({ latitude: 50.63, longitude: 3.06 });
  vi.spyOn(service, "searchProfessionals").mockResolvedValue([vet, groomer]);
  vi.spyOn(service, "getProfessional").mockResolvedValue(vet);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("carte de l’annuaire Services", () => {
  it("un repère par résultat, synchronisé avec la liste dans les deux sens", async () => {
    desktop();
    open();
    await searchLille();
    expect(within(map()).getAllByRole("button", { name: /km/ })).toHaveLength(2);
    // Survol d'une ligne : son repère passe en sélection.
    fireEvent.mouseEnter(screen.getByRole("link", { name: /Toilettage du Vieux-Lille/ }));
    expect(within(map()).getByRole("button", { name: /^Toilettage du Vieux-Lille.*, ≈/ }).getAttribute("aria-pressed")).toBe("true");
    // Clic sur un repère : la ligne correspondante est marquée et la mini-fiche apparaît.
    fireEvent.click(within(map()).getByRole("button", { name: /^Cabinet des Oyats.*, ≈/ }));
    expect(screen.getByRole("link", { name: /Cabinet des Oyats/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: /Toilettage du Vieux-Lille/ }).getAttribute("aria-current")).toBeNull();
    expect(within(map()).getByRole("button", { name: /Voir la fiche/ }).textContent).toContain("Vétérinaire · Lille · ≈ 2 km");
  });

  it("la mini-fiche d’un repère ouvre la fiche, et le retour retrouve la recherche et la sélection", async () => {
    desktop();
    open();
    await searchLille();
    fireEvent.click(within(map()).getByRole("button", { name: /^Cabinet des Oyats.*, ≈/ }));
    fireEvent.click(within(map()).getByRole("button", { name: /Voir la fiche/ }));
    expect(window.location.hash).toBe("#/services?professionnel=p1");
    fireEvent(window, new HashChangeEvent("hashchange"));
    await screen.findByText("Présentation.");
    fireEvent.click(screen.getAllByRole("button", { name: /Services/ })[0]!);
    fireEvent(window, new HashChangeEvent("hashchange"));
    await within(map()).findByRole("button", { name: /^Cabinet des Oyats.*, ≈/ });
    expect(within(map()).getByRole("button", { name: /^Cabinet des Oyats.*, ≈/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("2 activités près de Lille · 59000")).toBeTruthy();
  });

  it("une nouvelle ville ou un nouveau rayon actualise liste et repères", async () => {
    open();
    await searchLille();
    vi.mocked(service.searchProfessionals).mockResolvedValue([groomer]);
    fireEvent.click(screen.getByRole("button", { name: "25 km" }));
    await waitFor(() => expect(within(map()).queryByRole("button", { name: /^Cabinet des Oyats.*, ≈/ })).toBeNull());
    expect(service.searchProfessionals).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 25, undefined);
    expect(within(map()).getByRole("button", { name: /^Toilettage du Vieux-Lille.*, ≈/ })).toBeTruthy();
    expect(within(map()).getByText("25 km")).toBeTruthy();
  });

  it("le GPS refusé garde la recherche par ville et ses résultats", async () => {
    open();
    await searchLille();
    vi.mocked(location.approximateLocation).mockRejectedValue(new LocationError("denied"));
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ma position" }));
    await screen.findByRole("alert");
    expect(within(map()).getByRole("button", { name: /^Cabinet des Oyats.*, ≈/ })).toBeTruthy();
    expect(screen.getByText("2 activités près de Lille · 59000")).toBeTruthy();
    expect(service.searchProfessionals).toHaveBeenCalledTimes(1);
  });

  it("états de la carte : chargement, erreur puis aucun résultat", async () => {
    let finish: (v: Professional[]) => void = () => {};
    vi.mocked(service.searchProfessionals)
      .mockImplementationOnce(() => new Promise((ok) => { finish = ok; }))
      .mockRejectedValueOnce(Error("network"))
      .mockResolvedValue([]);
    open();
    fireEvent.change(screen.getByLabelText("Ville ou code postal"), { target: { value: "Lille" } });
    fireEvent.click(screen.getByRole("button", { name: "Trouver la ville" }));
    expect(await within(await screen.findByRole("region", { name: /Carte des activités/ })).findByText("Recherche en cours…")).toBeTruthy();
    expect(map().getAttribute("aria-busy")).toBe("true");
    finish([vet]);
    await within(map()).findByRole("button", { name: /^Cabinet des Oyats.*, ≈/ });
    fireEvent.click(screen.getByRole("button", { name: "25 km" }));
    expect(await within(map()).findByText(/Résultats indisponibles/)).toBeTruthy();
    expect(within(map()).queryByRole("button", { name: /^Cabinet des Oyats.*, ≈/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await within(map()).findByText("Aucune activité à moins de 25 km.")).toBeTruthy();
    expect(screen.getByText("Aucune activité dans ce secteur")).toBeTruthy();
  });

  it("sur téléphone, bascule entre liste et carte et garde le choix au retour d’une fiche", async () => {
    open();
    await searchLille();
    const layout = () => map().closest(".fx-search")!;
    expect(layout().className).toContain("app-pro-layout--liste");
    fireEvent.click(screen.getByRole("button", { name: "Carte" }));
    expect(layout().className).toContain("app-pro-layout--carte");
    fireEvent.click(within(map()).getByRole("button", { name: /^Toilettage.*, ≈/ }));
    fireEvent.click(within(map()).getByRole("button", { name: /Voir la fiche/ }));
    fireEvent(window, new HashChangeEvent("hashchange"));
    await screen.findByText("Présentation.");
    window.location.hash = "#/services";
    fireEvent(window, new HashChangeEvent("hashchange"));
    await within(map()).findByRole("button", { name: /^Toilettage.*, ≈/ });
    expect(layout().className).toContain("app-pro-layout--carte");
    expect(screen.getByRole("button", { name: "Carte" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("placement schématique", () => {
  it("garde la distance relative, reste dans le cadre et écarte les repères superposés", () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ id: "same-" + (i % 2), distanceKm: 3 }))
      .map((p, i) => ({ ...p, id: p.id + "-" + i }));
    const spots = placeSchematic([...points, { id: "loin", distanceKm: 10 }, { id: "pres", distanceKm: 0 }], 10);
    for (const s of Object.values(spots)) {
      expect(s.x).toBeGreaterThanOrEqual(24); expect(s.x).toBeLessThanOrEqual(76);
      expect(s.y).toBeGreaterThanOrEqual(9); expect(s.y).toBeLessThanOrEqual(86);
    }
    const from = (s: { x: number; y: number }) => Math.hypot(s.x - 50, (s.y - 48) / 0.8);
    expect(from(spots.pres!)).toBeLessThan(from(spots.loin!));
    expect(placeSchematic([{ id: "a", distanceKm: 4 }], 10)).toEqual(placeSchematic([{ id: "a", distanceKm: 4 }], 10));
  });
});
