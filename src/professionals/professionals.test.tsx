import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test/fakeSupabase";
import ProfessionalsArea from "./ProfessionalsArea";
import ProfessionalProfile from "./ProfessionalProfile";
import * as service from "./service";
import * as location from "../meetings/location";
import { safeWebsite, type Professional } from "./types";
const owner = "11111111-1111-4111-8111-111111111111";
const professional: Professional = {
  professional_id: "22222222-2222-4222-8222-222222222222",
  name: "Cabinet de test",
  category: "veterinaire",
  city: "Lille",
  bio: "Présentation déclarée pour le test.",
  species: ["chien", "chat"],
  hours: "Sur rendez-vous",
  accessibility: "Plain-pied",
  phone: "0320000000",
  website: "https://example.org/",
  services: [{ name: "Consultation", unit: "consultation", price_cents: 4500 }],
  distance_km: 2,
};
beforeEach(() => {
  window.history.replaceState(null, "", "/#/services");
  vi.spyOn(location, "locateTown").mockResolvedValue({
    latitude: 50.63,
    longitude: 3.06,
    label: "Lille · 59000",
  });
  vi.spyOn(location, "approximateLocation").mockResolvedValue({
    latitude: 50.63,
    longitude: 3.06,
  });
  vi.spyOn(service, "searchProfessionals").mockResolvedValue([professional]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
it("cherche par ville sans GPS, puis conserve le secteur lors du changement de catégorie", async () => {
  render(
    <ProfessionalsArea client={createFakeSupabase().client} owner={owner} />,
  );
  expect(service.searchProfessionals).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Ville ou code postal"), {
    target: { value: "Lille" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Trouver la ville" }));
  await screen.findByRole("link", { name: /Cabinet de test/ });
  expect(location.approximateLocation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Toilettage" }));
  await waitFor(() =>
    expect(service.searchProfessionals).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ latitude: 50.63, longitude: 3.06 }),
      10,
      "toilettage",
    ),
  );
});
it("une erreur conserve les critères et permet de réessayer", async () => {
  vi.mocked(service.searchProfessionals)
    .mockRejectedValueOnce(Error("network"))
    .mockResolvedValue([]);
  render(
    <ProfessionalsArea client={createFakeSupabase().client} owner={owner} />,
  );
  fireEvent.change(screen.getByLabelText("Ville ou code postal"), {
    target: { value: "Lille" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Trouver la ville" }));
  await screen.findByText("Les professionnels n’ont pas pu être chargés.");
  expect(
    (screen.getByLabelText("Ville ou code postal") as HTMLInputElement).value,
  ).toBe("Lille");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  await screen.findByText("Aucune activité dans ce secteur");
});
it("une fiche indique le statut déclaré et ne promet pas de réservation", async () => {
  window.history.replaceState(
    null,
    "",
    "/#/services?professionnel=" + professional.professional_id,
  );
  vi.spyOn(service, "getProfessional").mockResolvedValue(professional);
  render(
    <ProfessionalsArea client={createFakeSupabase().client} owner={owner} />,
  );
  await screen.findByRole("heading", { name: "Cabinet de test" });
  expect(
    screen.getByText(/qualifications n’ont pas été vérifiées/),
  ).toBeTruthy();
  expect(screen.getByText(/ne réserve aucun rendez-vous/)).toBeTruthy();
  const link = screen.getByRole("link", { name: "Ouvrir son site" });
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.getAttribute("href")).toBe("https://example.org/");
  expect(screen.queryByRole("button", { name: /réserver/i })).toBeNull();
});
it("les liens de site refusent les protocoles actifs et les identifiants", () => {
  expect(safeWebsite("javascript:alert(1)")).toBeNull();
  expect(safeWebsite("https://name:pass@example.org")).toBeNull();
  expect(safeWebsite("http://example.org")).toBeNull();
  expect(safeWebsite("https://example.org")).toBe("https://example.org/");
});
it("enregistre son profil sans changer de compte, avec tarifs convertis et secteur confirmé", async () => {
  vi.spyOn(service, "ownProfessional").mockResolvedValue(null);
  const save = vi
    .spyOn(service, "saveProfessional")
    .mockResolvedValue({} as never);
  render(
    <ProfessionalProfile client={createFakeSupabase().client} owner={owner} />,
  );
  await screen.findByLabelText("Présentation");
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer mon activité" }),
  );
  await screen.findByText(/Renseigne le nom/);
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(
    screen.getByLabelText("Nom de l’établissement ou de l’activité"),
    { target: { value: "Cabinet de test" } },
  );
  fireEvent.change(screen.getByLabelText("Ville ou commune"), {
    target: { value: "Lille" },
  });
  fireEvent.change(screen.getByLabelText("Présentation"), {
    target: { value: "Présentation déclarée pour le test." },
  });
  fireEvent.change(screen.getByLabelText("Prestation 1"), {
    target: { value: "Consultation" },
  });
  fireEvent.change(screen.getByLabelText(/Tarif 1/), {
    target: { value: "45,50" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Trouver ma ville" }));
  await screen.findByText(/Secteur confirmé/);
  fireEvent.click(
    screen.getByRole("button", { name: "Visible dans l’annuaire" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer mon activité" }),
  );
  await screen.findByText("Profil publié dans l’annuaire bêta");
  expect(save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      p_active: true,
      p_lat: 50.63,
      p_lng: 3.06,
      p_services: [
        { name: "Consultation", unit: "prestation", price_cents: 4550 },
      ],
    }),
  );
});
it("une ville modifiée invalide le secteur précédent", async () => {
  vi.spyOn(service, "ownProfessional").mockResolvedValue({
    ...professional,
    user_id: owner,
    latitude: 50.63,
    longitude: 3.06,
    active: true,
    updated_at: "",
  });
  const save = vi
    .spyOn(service, "saveProfessional")
    .mockResolvedValue({} as never);
  render(
    <ProfessionalProfile client={createFakeSupabase().client} owner={owner} />,
  );
  await screen.findByLabelText("Ville ou commune");
  fireEvent.change(screen.getByLabelText("Ville ou commune"), {
    target: { value: "Paris" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer mon activité" }),
  );
  await screen.findByText(/Confirme le secteur/);
  expect(save).not.toHaveBeenCalled();
});
