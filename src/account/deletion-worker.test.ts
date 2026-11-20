import { expect, it, vi } from "vitest";
import {
  deletionRequest,
  deletionWorker,
  type DeletionStore,
  type RequestStore,
} from "../../supabase/functions/account-deletion/core";
const payload = {
  password: "secret-test",
  confirmation: "SUPPRIMER",
  expected_user: "moi",
  user_id: "victime",
};
const post = (body = payload, token = "valid") =>
  new Request("https://test/account-deletion", {
    method: "POST",
    headers: { authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
const requestStore = (): RequestStore => ({
  identify: vi.fn().mockResolvedValue({ id: "moi", email: "test@example.com" }),
  verifyPassword: vi.fn().mockResolvedValue(true),
  request: vi.fn().mockResolvedValue("accepted"),
});
const workerStore = (): DeletionStore => ({
  claim: vi.fn().mockResolvedValue({ user_id: "moi", claim: "bail" }),
  clean: vi.fn().mockResolvedValue(undefined),
  files: vi.fn().mockResolvedValue([]),
  remove: vi.fn().mockResolvedValue(undefined),
  eraseIdentity: vi.fn().mockResolvedValue(undefined),
  finish: vi.fn().mockResolvedValue(undefined),
});
const key = "x".repeat(40),
  work = () =>
    new Request("https://test/worker", {
      method: "POST",
      headers: { "x-furrix-worker-key": key },
    });
it("la cible vient de la session vérifiée, le mot de passe est vérifié avant tout effet", async () => {
  const store = requestStore();
  const result = await deletionRequest(store)(post());
  expect(result.status).toBe(202);
  expect(store.request).toHaveBeenCalledWith("moi");
  expect(store.verifyPassword).toHaveBeenCalledWith(
    "test@example.com",
    "secret-test",
    "moi",
  );
  expect(await result.text()).not.toContain("secret-test");
});
it("refuse une identité absente, un mot de passe incorrect, une confirmation absente et un second facteur", async () => {
  const store = requestStore(),
    handler = deletionRequest(store);
  expect((await handler(post({ ...payload, confirmation: "" }))).status).toBe(
    400,
  );
  expect(
    (await handler(post({ ...payload, expected_user: "autre" }))).status,
  ).toBe(409);
  vi.mocked(store.identify).mockResolvedValueOnce(null);
  expect((await handler(post())).status).toBe(401);
  vi.mocked(store.verifyPassword).mockResolvedValueOnce(false);
  expect((await handler(post())).status).toBe(401);
  vi.mocked(store.identify).mockResolvedValueOnce({
    id: "moi",
    email: "test@example.com",
    hasMfa: true,
  });
  expect((await handler(post())).status).toBe(409);
  expect(store.request).not.toHaveBeenCalled();
});
it("une activité concurrente et une indisponibilité ne sont jamais annoncées comme acceptées", async () => {
  const store = requestStore(),
    handler = deletionRequest(store);
  vi.mocked(store.request)
    .mockResolvedValueOnce("blocked")
    .mockRejectedValueOnce(Error("secret serveur"));
  expect((await handler(post())).status).toBe(409);
  const response = await handler(post());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret serveur");
});
it("le worker refuse les jetons utilisateurs, les mauvaises clés et une configuration vide", async () => {
  const store = workerStore();
  expect((await deletionWorker(key, store)(post())).status).toBe(401);
  expect((await deletionWorker("", store)(work())).status).toBe(401);
  expect(store.claim).not.toHaveBeenCalled();
});
it("efface toutes les pages de fichiers avant Auth, et n’acquitte qu’après la confirmation Auth", async () => {
  const store = workerStore();
  vi.mocked(store.files)
    .mockResolvedValueOnce([
      { bucket: "pet-photos", path: "moi/animal/photo.jpg" },
    ])
    .mockResolvedValueOnce([{ bucket: "documents", path: "moi/doc.pdf" }])
    .mockResolvedValue([]);
  const response = await deletionWorker(key, store)(work());
  expect(response.status).toBe(200);
  expect(store.remove).toHaveBeenNthCalledWith(1, "pet-photos", [
    "moi/animal/photo.jpg",
  ]);
  expect(store.remove).toHaveBeenNthCalledWith(2, "documents", ["moi/doc.pdf"]);
  expect(vi.mocked(store.remove).mock.invocationCallOrder[1]).toBeLessThan(
    vi.mocked(store.eraseIdentity).mock.invocationCallOrder[0]!,
  );
  expect(store.finish).toHaveBeenCalledWith("moi", "bail", true);
});
it("un échec Storage conserve le travail à reprendre sans supprimer l’identité ni annoncer un succès", async () => {
  const store = workerStore();
  vi.mocked(store.files).mockResolvedValue([
    { bucket: "photos", path: "moi/photo" },
  ]);
  vi.mocked(store.remove).mockRejectedValue(Error("stockage"));
  expect((await deletionWorker(key, store)(work())).status).toBe(503);
  expect(store.eraseIdentity).not.toHaveBeenCalled();
  expect(store.finish).toHaveBeenCalledWith("moi", "bail", false);
});
it("un échec Auth est repris, y compris après les fichiers déjà effacés", async () => {
  const store = workerStore();
  vi.mocked(store.eraseIdentity).mockRejectedValueOnce(Error("auth"));
  const handler = deletionWorker(key, store);
  expect((await handler(work())).status).toBe(503);
  expect(store.finish).toHaveBeenCalledWith("moi", "bail", false);
  expect((await handler(work())).status).toBe(200);
  expect(store.finish).toHaveBeenLastCalledWith("moi", "bail", true);
});
it("borne le travail par invocation sans abandonner les autres fichiers", async () => {
  const store = workerStore();
  vi.mocked(store.files).mockResolvedValue([
    { bucket: "photos", path: "moi/photo" },
  ]);
  expect((await deletionWorker(key, store)(work())).status).toBe(202);
  expect(store.remove).toHaveBeenCalledTimes(5);
  expect(store.eraseIdentity).not.toHaveBeenCalled();
  expect(store.finish).toHaveBeenCalledWith("moi", "bail", false);
});
