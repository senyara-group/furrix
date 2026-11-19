import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LostPetsArea from "./LostPetsArea";
import * as api from "./service";
import { lostHref, lostShareUrl, readLostRoute } from "./links";
import type { LostAlert, LocalNotification } from "./types";
import { createFakeSupabase } from "../test/fakeSupabase";
const owner = "10000000-0000-0000-0000-000000000001";
const id = "30000000-0000-0000-0000-000000000001";
const otherId = "30000000-0000-0000-0000-000000000002";
const alert: LostAlert = {
  id,
  reporter_id: owner,
  pet_id: "pet",
  display_name: "Luna",
  species: "chien",
  city: "Lille",
  latitude: 50.63,
  longitude: 3.06,
  last_seen_at: "2026-11-19T12:00:00Z",
  description: "Collier bleu",
  instructions: null,
  photo_path: null,
  radius_km: 25,
  status: "lost",
  is_mine: true,
};
const notification: LocalNotification = {
  id: "n1",
  user_id: owner,
  alert_id: id,
  kind: "lost_local",
  title: "Luna a disparu",
  read_at: null,
  created_at: "2026-11-19T12:00:00Z",
};
beforeEach(() => {
  window.history.replaceState(null, "", "/#/animaux-perdus");
  vi.spyOn(api, "listLost").mockResolvedValue([alert]);
  vi.spyOn(api, "listOwnLost").mockResolvedValue([alert]);
  vi.spyOn(api, "listNotifications").mockResolvedValue([notification]);
  vi.spyOn(api, "listSightings").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
const mount = () => {
  const fake = createFakeSupabase();
  render(<LostPetsArea client={fake.client} owner={owner} pets={[]} />);
  return fake;
};

it("valide les liens et garde l’onglet sans y placer de données personnelles", () => {
  expect(readLostRoute(lostHref("mine", id))).toEqual({
    tab: "mine",
    alertId: id,
    invalid: false,
  });
  expect(readLostRoute("#/animaux-perdus?notifications").tab).toBe(
    "notifications",
  );
  expect(
    readLostRoute("#/animaux-perdus?alerte=javascript:alert(1)").invalid,
  ).toBe(true);
  expect(
    readLostRoute(`#/animaux-perdus?alerte=${id}&alerte=${otherId}`).invalid,
  ).toBe(true);
  expect(() => lostHref("list", "mauvais")).toThrow();
  expect(lostShareUrl(id)).toBe(
    `https://furrix.fr/#/animaux-perdus?alerte=${id}`,
  );
});

it("ouvre directement une fiche et revient à Mes alertes", async () => {
  window.history.replaceState(null, "", "/" + lostHref("mine", id));
  mount();
  await screen.findByRole("heading", { name: "Luna" });
  expect(api.listLost).toHaveBeenCalledWith(
    expect.anything(),
    "",
    undefined,
    id,
  );
  fireEvent.click(screen.getByRole("button", { name: "Revenir aux alertes" }));
  expect(window.location.hash).toBe(lostHref("mine"));
  await screen.findByRole("button", { name: "Voir l’alerte de mon animal" });
});

it("Mes alertes utilise sa liste serveur et conserve les anciennes pages", async () => {
  const first = Array.from({ length: 30 }, (_, i) => ({
    ...alert,
    id: `30000000-0000-0000-0000-${String(i + 10).padStart(12, "0")}`,
    display_name: "Mon animal " + i,
  }));
  vi.mocked(api.listOwnLost)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce([
      { ...alert, status: "closed", display_name: "Ancienne alerte" },
    ]);
  const fake = mount();
  fireEvent.click(screen.getByRole("button", { name: "Mes alertes" }));
  fireEvent.click(await screen.findByRole("button", { name: "Voir la suite" }));
  await screen.findByRole("heading", { name: "Ancienne alerte" });
  expect(screen.getByRole("heading", { name: "Mon animal 0" })).toBeTruthy();
  expect(api.listOwnLost).toHaveBeenLastCalledWith(fake.client, owner, 1);
});

it("une ancienne réponse de fiche ne remplace pas la nouvelle adresse", async () => {
  let finish!: (rows: LostAlert[]) => void;
  vi.mocked(api.listLost).mockImplementation(
    async (_client, _city, _after, target) =>
      target === id
        ? await new Promise((resolve) => {
            finish = resolve;
          })
        : target === otherId
          ? [{ ...alert, id: otherId, display_name: "Nuage" }]
          : [alert],
  );
  window.history.replaceState(null, "", "/" + lostHref("list", id));
  mount();
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  act(() => {
    window.history.replaceState(null, "", "/" + lostHref("list", otherId));
    fireEvent(window, new HashChangeEvent("hashchange"));
  });
  await screen.findByRole("heading", { name: "Nuage" });
  await act(async () => finish([alert]));
  expect(screen.queryByRole("heading", { name: "Luna" })).toBeNull();
});

it("marque comme lue sans ouvrir et filtre les non lues côté serveur", async () => {
  const read = vi.spyOn(api, "readNotification").mockResolvedValue();
  const fake = mount();
  fireEvent.click(screen.getByRole("button", { name: "Mes notifications" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Non lues uniquement" }),
  );
  await waitFor(() =>
    expect(api.listNotifications).toHaveBeenCalledWith(
      fake.client,
      owner,
      true,
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Marquer comme lue" }),
  );
  await screen.findByText("Tu n’as aucune notification non lue.");
  expect(read).toHaveBeenCalledWith(fake.client, "n1");
  expect(window.location.hash).not.toContain("alerte=");
});

it("une lecture non confirmée reste non lue et peut être réessayée", async () => {
  const read = vi
    .spyOn(api, "readNotification")
    .mockRejectedValueOnce(new Error("réseau"))
    .mockResolvedValueOnce();
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Mes notifications" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Marquer comme lue" }),
  );
  await screen.findByText(
    "La lecture de cette notification n’a pas été enregistrée. Tu peux réessayer.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Marquer comme lue" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Marquer comme lue" }),
    ).toBeNull(),
  );
  expect(read).toHaveBeenCalledTimes(2);
});

it("une erreur des notifications ne fait pas disparaître les alertes consultables", async () => {
  vi.mocked(api.listNotifications).mockRejectedValue(new Error("réseau"));
  mount();
  await screen.findByRole("heading", { name: "Luna" });
  fireEvent.click(screen.getByRole("button", { name: "Mes notifications" }));
  await screen.findByText("Tes notifications n’ont pas pu être chargées.");
  fireEvent.click(screen.getByRole("button", { name: "Les alertes" }));
  await screen.findByRole("heading", { name: "Luna" });
});

it("la requête de Mes alertes filtre le propriétaire avant de paginer", async () => {
  const fake = createFakeSupabase();
  const { latitude, longitude, is_mine, ...row } = alert;
  fake.respond({
    data: [
      {
        ...row,
        lat: latitude,
        lng: longitude,
        created_at: "2026-11-19T12:00:00Z",
      },
    ],
    error: null,
  });
  vi.mocked(api.listOwnLost).mockRestore();
  expect((await api.listOwnLost(fake.client, owner, 1))[0]).toMatchObject({
    id,
    is_mine: true,
    latitude,
    longitude,
  });
  expect(fake.calls).toContainEqual({
    table: "lost_pets",
    op: "eq",
    args: ["reporter_id", owner],
  });
  expect(fake.calls).toContainEqual({
    table: "lost_pets",
    op: "range",
    args: [30, 59],
  });
  await expect(api.listOwnLost(fake.client, owner, -1)).rejects.toThrow();
});

it("copie le lien ou propose une copie manuelle sans annoncer un faux succès", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const write = vi
    .fn()
    .mockRejectedValueOnce(new Error("permission"))
    .mockResolvedValueOnce(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write },
  });
  try {
    window.history.replaceState(null, "", "/" + lostHref("list", id));
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Copier le lien de l’alerte" }),
    );
    await screen.findByText(
      "Copie le lien ci-dessous pour partager cette alerte.",
    );
    expect(screen.queryByText("Le lien de l’alerte est copié.")).toBeNull();
    expect(
      (screen.getByLabelText("Lien de l’alerte") as HTMLInputElement).value,
    ).toBe(lostShareUrl(id));
    fireEvent.click(
      screen.getByRole("button", { name: "Copier le lien de l’alerte" }),
    );
    await screen.findByText("Le lien de l’alerte est copié.");
    expect(write).toHaveBeenLastCalledWith(lostShareUrl(id));
  } finally {
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
