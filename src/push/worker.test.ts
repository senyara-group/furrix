// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  fcmMessage,
  pushHandler,
  sameSecret,
  serviceAssertion,
  validateServiceAccount,
  type PushStore,
} from "../../supabase/functions/android-push-worker/core";
const delivery = {
  token: "test-device-token",
  alert_id: "11111111-1111-4111-8111-111111111111",
  notification_id: "22222222-2222-4222-8222-222222222222",
  kind: "lost_local",
};
describe("serveur push", () => {
  it('les nouvelles catégories ne transmettent aucun contenu privé et utilisent un identifiant de notification',()=>{
    for(const kind of ['like','match','match_message','meeting_accepted','sitting_message','sitting_pending','sitting_update','appointment_countered']){
      const message=fcmMessage({...delivery,alert_id:null,kind}).message;
      expect(message.data).toEqual({app_notification_id:delivery.notification_id});
      expect(message.notification.title).toBe('Furrix');expect(message.notification.body).not.toContain('secteur');
      expect(Object.keys(message)).toEqual(['token','notification','data','android']);
    }
  });
  it("limite les données affichées et les données du lien", () => {
    const m = fcmMessage(delivery).message;
    expect(m.data).toEqual({
      alert_id: delivery.alert_id,
      notification_id: delivery.notification_id,
    });
    expect(m.notification).toEqual({
      title: "Furrix",
      body: "Une nouvelle alerte concerne ton secteur.",
    });
    expect(m.android.notification.tag).toContain(delivery.notification_id);
  });
  it("rejette une configuration provenant d’un autre projet", () => {
    expect(() => validateServiceAccount({ project_id: "other" })).toThrow(
      "Configuration Firebase invalide",
    );
  });
  it("signe une assertion avec la portée FCM et une durée limitée", async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const der = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    const pem =
      "-----BEGIN PRIVATE KEY-----\n" +
      btoa(String.fromCharCode(...new Uint8Array(der))) +
      "\n-----END PRIVATE KEY-----";
    const jwt = await serviceAssertion(
      {
        project_id: "furrix-8dd6e",
        client_email: "test@furrix-8dd6e.iam.gserviceaccount.com",
        private_key: pem,
      },
      100000,
    );
    const [h, p, s] = jwt.split(".");
    const payload = JSON.parse(atob(p!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.exp - payload.iat).toBe(3600);
    expect(payload.scope).toBe(
      "https://www.googleapis.com/auth/firebase.messaging",
    );
    expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        pair.publicKey,
        Uint8Array.from(atob(s!.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        ),
        new TextEncoder().encode(h + "." + p),
      ),
    ).toBe(true);
  });
  it("refuse un appel non autorisé sans lire la file", async () => {
    const claim = vi.fn();
    const handler = pushHandler(
      "s".repeat(48),
      { claim } as unknown as PushStore,
      vi.fn(),
    );
    expect(
      (await handler(new Request("https://test", { method: "POST" }))).status,
    ).toBe(401);
    expect(claim).not.toHaveBeenCalled();
    expect(await sameSecret("a".repeat(48), "b".repeat(48))).toBe(false);
    expect(await sameSecret("short", "short")).toBe(false);
  });
  it("revérifie chaque livraison et ignore les destinataires fournis dans la requête", async () => {
    const send = vi.fn().mockResolvedValue("sent"),
      finish = vi.fn(),
      store = {
        claim: vi.fn().mockResolvedValue([
          { job_id: 1, lease_id: "a" },
          { job_id: 2, lease_id: "b" },
        ]),
        delivery: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(delivery),
        finish,
      };
    const response = await pushHandler(
      "s".repeat(48),
      store,
      send,
    )(
      new Request("https://test", {
        method: "POST",
        headers: { "x-furrix-worker-key": "s".repeat(48) },
        body: JSON.stringify({ token: "attacker" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(delivery);
    expect(finish).toHaveBeenNthCalledWith(1, 1, "a", "ineligible", undefined);
    expect(await response.json()).toEqual({ sent: 1, retry: 0, skipped: 1 });
  });
  it("ne publie pas les détails d’une erreur interne", async () => {
    const response = await pushHandler(
      "s".repeat(48),
      {
        claim: async () => {
          throw Error("SECRET");
        },
      } as unknown as PushStore,
      vi.fn(),
    )(
      new Request("https://test", {
        method: "POST",
        headers: { "x-furrix-worker-key": "s".repeat(48) },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SECRET");
  });
});
