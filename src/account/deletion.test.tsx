import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DeleteAccount from "./DeleteAccount";
import * as service from "./deletion";
import { createFakeSupabase } from "../test/fakeSupabase";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});
const mount = () => {
  const onSignOut = vi.fn().mockResolvedValue(true),
    onCancel = vi.fn();
  return {
    ...render(
      <DeleteAccount
        client={createFakeSupabase().client}
        onSignOut={onSignOut}
        onCancel={onCancel}
      />,
    ),
    onSignOut,
    onCancel,
  };
};
function confirm() {
  fireEvent.change(screen.getByLabelText("Ton mot de passe actuel"), {
    target: { value: "secret-test" },
  });
  fireEvent.change(screen.getByLabelText("Écris SUPPRIMER pour confirmer"), {
    target: { value: "SUPPRIMER" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}
it("affiche les activités, y compris celles du prestataire, sans permettre la confirmation", async () => {
  vi.spyOn(service, "deletionChecks").mockResolvedValue({
    owner: "moi",
    requested: false,
    blockers: [{ section: "garde", total: 2 }],
  });
  mount();
  await screen.findByText("Gardes à traiter : 2");
  expect(screen.queryByLabelText("Ton mot de passe actuel")).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Demander la suppression définitive",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("exige la confirmation et attend l’accusé serveur avant la déconnexion, sans double clic", async () => {
  vi.spyOn(service, "deletionChecks").mockResolvedValue({
    owner: "moi",
    requested: false,
    blockers: [],
  });
  let resolve!: () => void;
  const request = vi.spyOn(service, "requestDeletion").mockImplementation(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const { onSignOut } = mount();
  await screen.findByLabelText("Ton mot de passe actuel");
  confirm();
  const button = screen.getByRole("button", {
    name: "Demander la suppression définitive",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(request).toHaveBeenCalledTimes(1);
  expect(onSignOut).not.toHaveBeenCalled();
  await act(async () => resolve());
  expect(onSignOut).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem(service.deletionNoticeKey)).toBe("1");
});
it("une réponse perdue ne ferme pas la session et le mot de passe est effacé", async () => {
  vi.spyOn(service, "deletionChecks").mockResolvedValue({
    owner: "moi",
    requested: false,
    blockers: [],
  });
  vi.spyOn(service, "requestDeletion").mockRejectedValue(
    Error("Réponse non confirmée"),
  );
  const { onSignOut } = mount();
  await screen.findByLabelText("Ton mot de passe actuel");
  confirm();
  fireEvent.click(
    screen.getByRole("button", { name: "Demander la suppression définitive" }),
  );
  await screen.findByText("Réponse non confirmée");
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Ton mot de passe actuel") as HTMLInputElement)
        .value,
    ).toBe(""),
  );
  expect(onSignOut).not.toHaveBeenCalled();
});
it("une vérification échouée ne permet pas la suppression et une demande déjà acceptée ne repart pas", async () => {
  const checks = vi
    .spyOn(service, "deletionChecks")
    .mockRejectedValueOnce(Error("Vérification indisponible"))
    .mockResolvedValue({ owner: "moi", requested: true, blockers: [] });
  const request = vi.spyOn(service, "requestDeletion");
  mount();
  await screen.findByText("Vérification indisponible");
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Actualiser les vérifications" }),
  );
  await screen.findByRole("heading", { name: "Demande enregistrée" });
  expect(checks).toHaveBeenCalledTimes(2);
  expect(request).not.toHaveBeenCalled();
});
it("une réponse après démontage ne déconnecte pas un autre écran ou compte", async () => {
  vi.spyOn(service, "deletionChecks").mockResolvedValue({
    owner: "moi",
    requested: false,
    blockers: [],
  });
  let resolve!: () => void;
  vi.spyOn(service, "requestDeletion").mockImplementation(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const { unmount, onSignOut } = mount();
  await screen.findByLabelText("Ton mot de passe actuel");
  confirm();
  fireEvent.click(
    screen.getByRole("button", { name: "Demander la suppression définitive" }),
  );
  unmount();
  await act(async () => resolve());
  expect(onSignOut).not.toHaveBeenCalled();
});
