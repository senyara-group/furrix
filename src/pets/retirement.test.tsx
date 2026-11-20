import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PetRetirement from "./PetRetirement";
import PetsWorkspace from "./PetsWorkspace";
import * as service from "./retirement";
import { createFakeSupabase } from "../test/fakeSupabase";
import type { PetRow } from "../types/database";
const client = createFakeSupabase().client,
  pet = {
    id: "pet",
    owner_id: "owner",
    name: "Luna",
    species: "chien",
    breed: null,
    age: null,
    gender: null,
    purpose: null,
    city: null,
    bio: null,
    verified: false,
    created_at: "2026-11-20T12:00:00Z",
    photos: [],
  } as PetRow;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
it("ouvre directement la création depuis les premiers pas et permet de revenir à la liste", () => {
  window.history.replaceState(null, "", "/#/animaux?nouveau=1");
  render(
    <PetsWorkspace
      client={client}
      ownerId="owner"
      pets={[]}
      onSaved={vi.fn()}
      reload={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Fais les présentations.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Mes animaux" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Mes animaux",
  );
  expect(window.location.hash).toBe("#/animaux");
});
it("affiche les activités bloquantes et ne propose aucune confirmation tant qu’elles restent ouvertes", async () => {
  vi.spyOn(service, "retirementBlockers").mockResolvedValue([
    { section: "garde", total: 1 },
    { section: "animaux_perdus", total: 2 },
  ]);
  const retire = vi.spyOn(service, "retirePet");
  render(
    <PetRetirement
      client={client}
      pet={pet}
      onCancel={vi.fn()}
      onRetired={vi.fn()}
    />,
  );
  await screen.findByText("Gardes à traiter : 1");
  expect(
    screen
      .getByRole("link", { name: "Ouvrir mes alertes" })
      .getAttribute("href"),
  ).toBe("#/animaux-perdus?vue=mine");
  expect(
    (
      screen.getByRole("button", {
        name: "Confirmer le retrait",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(retire).not.toHaveBeenCalled();
});
it("attend une confirmation explicite, bloque le double clic et conserve le même animal après une réponse perdue", async () => {
  vi.spyOn(service, "retirementBlockers").mockResolvedValue([]);
  let reject!: (e: Error) => void;
  const retire = vi
    .spyOn(service, "retirePet")
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue();
  const done = vi.fn();
  render(
    <PetRetirement
      client={client}
      pet={pet}
      onCancel={vi.fn()}
      onRetired={done}
    />,
  );
  await screen.findByRole("checkbox");
  expect(retire).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  const button = screen.getByRole("button", { name: "Confirmer le retrait" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(retire).toHaveBeenCalledTimes(1);
  expect(done).not.toHaveBeenCalled();
  reject(new Error("Réponse perdue"));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Confirmer le retrait",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le retrait" }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(retire.mock.calls.map((x) => x[1])).toEqual(["pet", "pet"]);
});
it("une activité apparue après le premier contrôle bloque le retrait sans retirer la carte locale", async () => {
  vi.spyOn(service, "retirementBlockers")
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ section: "services", total: 1 }]);
  vi.spyOn(service, "retirePet").mockRejectedValue(
    new Error("Une activité reste à traiter."),
  );
  const done = vi.fn();
  render(
    <PetRetirement
      client={client}
      pet={pet}
      onCancel={vi.fn()}
      onRetired={done}
    />,
  );
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le retrait" }));
  await screen.findByText("Rendez-vous à traiter : 1");
  expect(done).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: "Confirmer le retrait",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("une vérification en panne n’est jamais traitée comme une absence d’activité", async () => {
  vi.spyOn(service, "retirementBlockers").mockRejectedValue(
    new Error("Réseau"),
  );
  const retire = vi.spyOn(service, "retirePet");
  render(
    <PetRetirement
      client={client}
      pet={pet}
      onCancel={vi.fn()}
      onRetired={vi.fn()}
    />,
  );
  await screen.findByRole("alert");
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(retire).not.toHaveBeenCalled();
});
it("une réponse après sortie de la session ne déclenche pas le retrait local d’un autre compte", async () => {
  vi.spyOn(service, "retirementBlockers").mockResolvedValue([]);
  let resolve!: () => void;
  vi.spyOn(service, "retirePet").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const done = vi.fn();
  const view = render(
    <PetRetirement
      client={client}
      pet={pet}
      onCancel={vi.fn()}
      onRetired={done}
    />,
  );
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le retrait" }));
  view.unmount();
  await act(async () => resolve());
  expect(done).not.toHaveBeenCalled();
});
