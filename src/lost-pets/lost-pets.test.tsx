import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, fakeSession } from "../test/fakeSupabase";
import type { PetRow } from "../types/database";
import type { LostAlert, LostForm, LocalNotification } from "./types";
import LostPetsArea from "./LostPetsArea";
import LocalAlertNotice from "./LocalAlertNotice";
import * as api from "./service";
import * as geo from "../meetings/location";
const owner = fakeSession().user.id;
const pet: PetRow = {
  id: "22222222-2222-4222-8222-222222222222",
  owner_id: owner,
  name: "Luna",
  species: "chien",
  breed: null,
  age: null,
  gender: null,
  purpose: null,
  city: "Lille",
  bio: null,
  photos: [],
  verified: false,
  created_at: "",
};
const alert: LostAlert = {
  id: "33333333-3333-4333-8333-333333333333",
  reporter_id: owner,
  pet_id: pet.id,
  display_name: "Luna",
  species: "chien",
  city: "Lille",
  latitude: 50.63,
  longitude: 3.06,
  last_seen_at: "2026-11-17T10:00:00Z",
  description: "Collier bleu",
  instructions: null,
  photo_path: null,
  radius_km: 25,
  status: "lost",
  is_mine: false,
};
const form: LostForm = {
  petId: pet.id,
  city: "Lille",
  latitude: "50.632345",
  longitude: "3.061234",
  seenAt: "2026-11-17T10:00",
  description: "Collier bleu",
  instructions: "Ne pas courir",
  radius: "25",
  photo: true,
};
beforeEach(() => {
  window.history.replaceState(null, "", "/#/animaux-perdus");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
function setup() {
  vi.spyOn(api, "listLost").mockResolvedValue([alert]);
  vi.spyOn(api, "listNotifications").mockResolvedValue([]);
  vi.spyOn(api, "listSightings").mockResolvedValue([]);
  return createFakeSupabase();
}
describe("animaux perdus : validation et publication", () => {
  it("arrondit avant envoi et refuse zone absente, future date et texte trop long", () => {
    expect(api.validateLostForm(form)).toMatchObject({
      p_lat: 50.63,
      p_lng: 3.06,
    });
    expect(() => api.validateLostForm({ ...form, latitude: "" })).toThrow();
    expect(() => api.validateLostForm({ ...form, latitude: "91" })).toThrow();
    expect(() =>
      api.validateLostForm({ ...form, seenAt: "2099-01-01T00:00" }),
    ).toThrow();
    expect(() =>
      api.validateLostForm({ ...form, description: "x".repeat(1501) }),
    ).toThrow();
  });
  it("bloque une déclaration incomplète avant toute écriture", async () => {
    const fake = setup(),
      publish = vi.spyOn(api, "publishLost");
    render(<LostPetsArea client={fake.client} owner={owner} pets={[pet]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Déclarer une disparition" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Publier l’alerte locale" }),
    );
    await screen.findByRole("alert");
    expect(publish).not.toHaveBeenCalled();
  });
  it("garde le même identifiant et le formulaire après une réponse perdue", async () => {
    const fake = setup(),
      publish = vi
        .spyOn(api, "publishLost")
        .mockRejectedValue(new Error("réseau"));
    render(<LostPetsArea client={fake.client} owner={owner} pets={[pet]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Déclarer une disparition" }),
    );
    for (const [label, value] of [
      ["Latitude de la zone", "50.63"],
      ["Longitude de la zone", "3.06"],
      ["Description et signes distinctifs", "Collier bleu"],
    ] as const)
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText("Vu pour la dernière fois"), {
      target: { value: "2026-11-17T10:00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Publier l’alerte locale" }),
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Publier l’alerte locale" }),
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(publish.mock.calls[0]![1].p_id).toBe(publish.mock.calls[1]![1].p_id);
    expect(publish.mock.calls[0]![1]).not.toHaveProperty("reporter_id");
  });
});
describe("secteur, notifications et observations", () => {
  it("n’active aucune localisation sans action et laisse le secteur désactivé après refus", async () => {
    const fake = setup();
    vi.spyOn(api, "getSector").mockResolvedValue(null);
    const set = vi.spyOn(api, "setSector");
    const locate = vi
      .spyOn(geo, "approximateLocation")
      .mockRejectedValue(new Error("refus"));
    render(<LostPetsArea client={fake.client} owner={owner} pets={[pet]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mon secteur" }));
    await screen.findByText("Tu ne reçois pas encore les alertes de secteur.");
    expect(locate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Activer les alertes pour ma zone actuelle",
      }),
    );
    await screen.findByRole("alert");
    expect(set).not.toHaveBeenCalled();
  });
  it("ouvre la notification, marque seulement celle-ci comme lue et affiche l’annonce", async () => {
    const fake = setup();
    const n: LocalNotification = {
      id: "notification",
      user_id: owner,
      alert_id: alert.id,
      kind: "lost_local",
      title: "Luna est recherchée",
      read_at: null,
      created_at: "2026-11-17T10:00:00Z",
    };
    vi.mocked(api.listNotifications).mockResolvedValue([n]);
    const read = vi.spyOn(api, "readNotification").mockResolvedValue();
    render(<LostPetsArea client={fake.client} owner={owner} pets={[pet]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mes notifications" }));
    await screen.findByText(n.title);
    fireEvent.click(screen.getByRole("button", { name: "Consulter l’alerte" }));
    await screen.findByRole("heading", { name: "Luna" });
    expect(read).toHaveBeenCalledWith(fake.client, n.id);
    expect(api.listLost).toHaveBeenCalledWith(
      fake.client,
      "",
      undefined,
      alert.id,
    );
  });
  it("permet une observation sans match et n’affiche pas de coordonnées de contact", async () => {
    const fake = setup(),
      sighting = vi.spyOn(api, "addSighting").mockResolvedValue();
    render(<LostPetsArea client={fake.client} owner={owner} pets={[pet]} />);
    await screen.findByRole("button", { name: "Voir l’alerte" });
    fireEvent.click(screen.getByRole("button", { name: "Voir l’alerte" }));
    await screen.findByRole("heading", { name: "Je l’ai aperçu" });
    fireEvent.change(
      screen.getByLabelText("Observation et précisions utiles"),
      { target: { value: "Au parc près du portail" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Transmettre mon observation" }),
    );
    await screen.findByText("Ton observation a été transmise au propriétaire.");
    expect(sighting).toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /mailto/ })).toBeNull();
  });
  it("n’affiche pas une alerte après démontage et réponse tardive", async () => {
    const fake = createFakeSupabase();
    let finish!: (n: LocalNotification[]) => void;
    vi.spyOn(api, "listNotifications").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(
      <LocalAlertNotice client={fake.client} owner={owner} />,
    );
    view.unmount();
    await act(async () => finish([{ id: "n" } as LocalNotification]));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("filtre les notifications par propriétaire et ne les écrit pas directement", async () => {
    const fake = createFakeSupabase();
    fake.respond({ data: [], error: null });
    await api.listNotifications(fake.client, owner, true);
    expect(fake.calls).toContainEqual({
      table: "local_notifications",
      op: "eq",
      args: ["user_id", owner],
    });
    expect(fake.calls).toContainEqual({
      table: "local_notifications",
      op: "is",
      args: ["read_at", null],
    });
    expect(fake.calls.some((c) => c.op === "insert")).toBe(false);
  });
});
