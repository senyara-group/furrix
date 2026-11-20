import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test/fakeSupabase";
import Notifications, {
  NotificationsProvider,
  NotificationSettings,
  useNotifications,
} from "./Notifications";
import * as service from "./service";
import { notificationHref, type Notification } from "./types";
const client = createFakeSupabase().client;
const id = "11111111-1111-4111-8111-111111111111",
  target = "22222222-2222-4222-8222-222222222222";
const item: Notification = {
  id,
  category: "messages",
  kind: "match_message",
  target_type: "match",
  target_id: target,
  context_id: null,
  title: "Tu as reçu un nouveau message.",
  read_at: null,
  created_at: "2026-11-20T10:00:00Z",
  legacy: false,
  unread_total: 1,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
function Counter() {
  const value = useNotifications();
  return <p data-testid="count">{value?.unread}</p>;
}
it("refuse les destinations libres et les identifiants malformés", () => {
  expect(
    notificationHref({ ...item, target_type: "https://evil.test" }),
  ).toBeNull();
  expect(notificationHref({ ...item, target_id: "../compte" })).toBeNull();
  expect(
    notificationHref({
      ...item,
      target_type: "sitting_chat",
      context_id: "javascript:alert(1)",
    }),
  ).toBeNull();
  expect(notificationHref(item)).toBe("#/messages?match=" + target);
  expect(notificationHref({ ...item, target_type: "appointment" })).toBe(
    "#/services?vue=rendez-vous&rendezvous=" + target,
  );
});
it("partage un chargement entre la cloche et le centre, sans lire à l’affichage", async () => {
  const list = vi.spyOn(service, "listNotifications").mockResolvedValue([item]);
  vi.spyOn(service, "getPreferences").mockResolvedValue([]);
  const read = vi.spyOn(service, "readNotification");
  render(
    <NotificationsProvider client={client} owner="owner">
      <Counter />
      <Notifications client={client} />
    </NotificationsProvider>,
  );
  await screen.findByText(item.title);
  expect(screen.getByTestId("count").textContent).toBe("1");
  expect(list).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
});
it("revérifie la notification avant ouverture et ignore un double clic en attente", async () => {
  let finish!: (rows: Notification[]) => void;
  const list = vi
    .spyOn(service, "listNotifications")
    .mockResolvedValueOnce([item])
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
  vi.spyOn(service, "getPreferences").mockResolvedValue([]);
  vi.spyOn(service, "readNotification").mockResolvedValue();
  render(
    <NotificationsProvider client={client} owner="owner">
      <Notifications client={client} />
    </NotificationsProvider>,
  );
  const button = await screen.findByRole("button", { name: "Consulter" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(list).toHaveBeenCalledTimes(2);
  expect(service.readNotification).not.toHaveBeenCalled();
  finish([item]);
  await waitFor(() =>
    expect(window.location.hash).toBe("#/messages?match=" + target),
  );
  expect(service.readNotification).toHaveBeenCalledTimes(1);
});
it("un ancien lien devenu inaccessible ne marque rien comme lu et ne navigue pas", async () => {
  vi.spyOn(service, "listNotifications")
    .mockResolvedValueOnce([item])
    .mockResolvedValueOnce([]);
  vi.spyOn(service, "getPreferences").mockResolvedValue([]);
  const read = vi.spyOn(service, "readNotification");
  render(
    <NotificationsProvider client={client} owner="owner">
      <Notifications client={client} />
    </NotificationsProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Consulter" }));
  await screen.findByRole("alert");
  expect(read).not.toHaveBeenCalled();
  expect(window.location.hash).toBe("");
});
it("garde le compteur et annonce une erreur si l’actualisation échoue", async () => {
  vi.spyOn(service, "listNotifications")
    .mockResolvedValueOnce([item])
    .mockRejectedValueOnce(new Error("Réseau"));
  vi.spyOn(service, "getPreferences").mockResolvedValue([]);
  render(
    <NotificationsProvider client={client} owner="owner">
      <Counter />
      <Notifications client={client} />
    </NotificationsProvider>,
  );
  await screen.findByText(item.title);
  fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
  await screen.findByText("Notifications non actualisées");
  expect(screen.getByTestId("count").textContent).toBe("1");
});
it("n’annonce pas une préférence activée avant confirmation du serveur", async () => {
  vi.spyOn(service, "getPreferences").mockResolvedValue([
    { category: "messages", push_enabled: false },
  ]);
  let fail!: (e: Error) => void;
  vi.spyOn(service, "setPreference").mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  render(<NotificationSettings client={client} />);
  const checkbox = (await screen.findByRole("checkbox", {
    name: "Messages",
  })) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(false);
  fail(new Error("Réseau"));
  await screen.findByRole("alert");
  expect(checkbox.checked).toBe(false);
});
it("une réponse de l’ancien compte ne réapparaît pas après changement de session", async () => {
  let finish!: (rows: Notification[]) => void;
  vi.spyOn(service, "listNotifications")
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    )
    .mockResolvedValueOnce([]);
  const view = render(
    <NotificationsProvider key="a" client={client} owner="a">
      <Counter />
    </NotificationsProvider>,
  );
  view.rerender(
    <NotificationsProvider key="b" client={client} owner="b">
      <Counter />
    </NotificationsProvider>,
  );
  finish([item]);
  await waitFor(() =>
    expect(screen.getByTestId("count").textContent).toBe("0"),
  );
});
