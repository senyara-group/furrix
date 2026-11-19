import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { nativeSessionStorage } from "../platform/sessionStorage";
import type { FurrixClient } from "../services/supabaseClient";
import { lostHref } from "../lost-pets/links";
export type PushPhase =
  | "loading"
  | "off"
  | "on"
  | "busy"
  | "denied"
  | "unavailable"
  | "error";
export const androidPushSupported = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
const storageKey = "furrix.push.device";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function pushTarget(data: unknown) {
  const d = data as { alert_id?: unknown; notification_id?: unknown } | null;
  return d &&
    typeof d.alert_id === "string" &&
    uuid.test(d.alert_id) &&
    typeof d.notification_id === "string" &&
    uuid.test(d.notification_id)
    ? { alert: d.alert_id, notification: d.notification_id }
    : null;
}
export class AndroidPush {
  private active = true;
  private wanted = false;
  private enabling = false;
  private handles: PluginListenerHandle[] = [];
  private waiter?: {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  constructor(
    private client: FurrixClient,
    private owner: string,
    private phase: (value: PushPhase) => void,
  ) {}
  private async device(create = false) {
    let id = await nativeSessionStorage.getItem(storageKey);
    if (id && !uuid.test(id)) id = null;
    if (!id && create) {
      id = crypto.randomUUID();
      await nativeSessionStorage.setItem(storageKey, id);
    }
    return id;
  }
  private settle(error?: Error) {
    const pending = this.waiter;
    this.waiter = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      if (error) pending.reject(error);
      else pending.resolve();
    }
  }
  private async sameUser() {
    const { data, error } = await this.client.auth.getSession();
    return !error && data.session?.user.id === this.owner;
  }
  private async listen(
    event:
      | "registration"
      | "registrationError"
      | "pushNotificationReceived"
      | "pushNotificationActionPerformed",
    callback: (value: unknown) => void,
  ) {
    // La surcharge du plugin ne sait pas exprimer une union des quatre événements.
    const add = PushNotifications.addListener as (
      name: string,
      cb: (data: unknown) => void,
    ) => Promise<PluginListenerHandle>;
    const handle = await add(event, callback);
    if (this.active) this.handles.push(handle);
    else await handle.remove();
  }
  async start() {
    if (!androidPushSupported()) return;
    try {
      await this.listen("registration", (value) => {
        void this.registered(value);
      });
      await this.listen("registrationError", () => {
        if (this.active) {
          this.phase("error");
          this.settle(Error("Inscription non confirmée"));
        }
      });
      await this.listen("pushNotificationReceived", () =>
        window.dispatchEvent(new Event("furrix:notifications-updated")),
      );
      await this.listen("pushNotificationActionPerformed", (value) => {
        void this.open(value);
      });
      if (!this.active) return;
      const id = await this.device();
      const { data, error } = await this.client.rpc("android_push_status", {
        p_device: id ?? "00000000-0000-0000-0000-000000000000",
      });
      if (error) {
        if (this.active) this.phase("unavailable");
        return;
      }
      const permission = await PushNotifications.checkPermissions();
      if (!this.active) return;
      if (id && data && permission.receive === "granted") {
        this.wanted = true;
        this.phase("busy");
        await this.register();
      } else {
        if (id && !data) await PushNotifications.unregister();
        this.phase(permission.receive === "denied" ? "denied" : "off");
      }
    } catch {
      if (this.active) this.phase("error");
    }
  }
  private register() {
    return new Promise<void>((resolve, reject) => {
      this.waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.settle(Error("Inscription non confirmée"));
        }, 20000),
      };
      void PushNotifications.register().catch(() =>
        this.settle(Error("Inscription non confirmée")),
      );
    });
  }
  private async registered(value: unknown) {
    if (!this.active || !this.wanted) return;
    const token = (value as { value?: unknown })?.value;
    try {
      if (
        typeof token !== "string" ||
        token.length < 20 ||
        token.length > 4096 ||
        !(await this.sameUser())
      )
        throw Error("Session indisponible");
      const id = await this.device(true);
      if (!this.active || !this.wanted) return;
      const { error } = await this.client.rpc("register_android_push", {
        p_device: id!,
        p_owner: this.owner,
        p_token: token,
      });
      if (error) throw Error("Inscription non confirmée");
      // Une désactivation peut avoir croisé la réponse d’inscription.
      if (!this.active || !this.wanted) {
        await this.client.rpc("remove_android_push", {p_device:id!,p_owner:this.owner});
        return;
      }
      if (this.active && this.wanted) {
        this.phase("on");
        this.settle();
      }
    } catch {
      if (this.active) {
        this.phase("error");
        this.settle(Error("Inscription non confirmée"));
      }
    }
  }
  async enable() {
    if (!this.active || !androidPushSupported() || this.enabling) return;
    this.enabling = true;
    this.phase("busy");
    this.wanted = true;
    try {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted")
        permission = await PushNotifications.requestPermissions();
      if (!this.active) return;
      if (permission.receive !== "granted") {
        this.wanted = false;
        this.phase("denied");
        return;
      }
      await PushNotifications.createChannel({
        id: "furrix-alertes",
        name: "Alertes Furrix",
        importance: 4,
        visibility: 0,
        vibration: true,
      });
      if (!this.active) return;
      await this.register();
    } catch {
      if (this.active) this.phase("error");
    } finally {
      this.enabling = false;
    }
  }
  async disable() {
    if (!androidPushSupported()) return;
    this.wanted = false;
    this.phase("busy");
    this.settle(Error("Activation annulée"));
    let failed = false;
    try {
      const id = await this.device();
      if (id) {
        const { error } = await this.client.rpc("remove_android_push", {
          p_device: id,
          p_owner: this.owner,
        });
        if (error) failed = true;
      }
    } catch {
      failed = true;
    }
    try {
      await PushNotifications.unregister();
    } catch {
      failed = true;
    }
    if (this.active) this.phase(failed ? "error" : "off");
  }
  private async open(value: unknown) {
    const target = pushTarget(
      (value as { notification?: { data?: unknown } })?.notification?.data,
    );
    if (!this.active || !target) return;
    try {
      if (!(await this.sameUser())) return;
      const { data, error } = await this.client
        .from("local_notifications")
        .select("id,alert_id")
        .eq("id", target.notification)
        .eq("user_id", this.owner)
        .single();
      if (error || data?.alert_id !== target.alert || !this.active) return;
      const { error: readError } = await this.client.rpc(
        "read_local_notification",
        { p_id: target.notification },
      );
      if (!this.active) return;
      if (!readError)
        window.dispatchEvent(new Event("furrix:notifications-read"));
      window.location.hash = lostHref("notifications", target.alert);
    } catch {
      /* Ni jeton, ni adresse reçue ne sont journalisés. */
    }
  }
  stop() {
    this.active = false;
    this.wanted = false;
    this.settle(Error("Écran quitté"));
    for (const handle of this.handles) void handle.remove().catch(() => {});
    this.handles = [];
  }
}
