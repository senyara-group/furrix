import { beforeEach, it, expect, vi } from "vitest";
import type { FurrixClient } from "../services/supabaseClient";
const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (v: unknown) => void>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  createChannel: vi.fn(),
  removeAllDeliveredNotifications: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));
vi.mock("../platform/sessionStorage", () => ({
  nativeSessionStorage: { getItem: mocks.getItem, setItem: mocks.setItem },
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    ...mocks,
    addListener: async (name: string, cb: (v: unknown) => void) => {
      mocks.listeners.set(name, cb);
      return { remove: mocks.remove };
    },
  },
}));
import { AndroidPush, pushTarget } from "./androidPush";
const owner = "11111111-1111-4111-8111-111111111111";
const rpc = vi.fn(),
  getSession = vi.fn(),
  phase = vi.fn();
const client = { rpc, auth: { getSession } } as unknown as FurrixClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.getItem.mockResolvedValue(null);
  mocks.setItem.mockResolvedValue(undefined);
  mocks.checkPermissions.mockResolvedValue({ receive: "prompt" });
  mocks.requestPermissions.mockResolvedValue({ receive: "granted" });
  mocks.register.mockResolvedValue(undefined);
  mocks.unregister.mockResolvedValue(undefined);
  mocks.createChannel.mockResolvedValue(undefined);
  mocks.removeAllDeliveredNotifications.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  rpc.mockResolvedValue({ data: false, error: null });
  getSession.mockResolvedValue({
    data: { session: { user: { id: owner } } },
    error: null,
  });
});
it("ne demande aucune permission à l’ouverture", async () => {
  const runtime = new AndroidPush(client, owner, phase);
  await runtime.start();
  expect(mocks.requestPermissions).not.toHaveBeenCalled();
  expect(mocks.register).not.toHaveBeenCalled();
  expect(phase).toHaveBeenLastCalledWith("off");
  runtime.stop();
  expect(mocks.remove).toHaveBeenCalledTimes(4);
});
it('un appui sur une notification commune consulte le serveur avant de naviguer',async()=>{
 const runtime=new AndroidPush(client,owner,phase);await runtime.start();
 const target='22222222-2222-4222-8222-222222222222';
 window.history.replaceState(null,'','/');
 rpc.mockImplementation(async(name:string)=>({data:name==='list_app_notifications'?[]:null,error:null}));
 mocks.listeners.get('pushNotificationActionPerformed')!({notification:{data:{app_notification_id:owner,url:'https://evil.test'}}});
 await vi.waitFor(()=>expect(rpc).toHaveBeenCalledWith('list_app_notifications',{p_id:owner,p_limit:1}));
 expect(window.location.hash).toBe('');
 rpc.mockImplementation(async(name:string)=>({data:name==='list_app_notifications'?[{id:owner,target_type:'appointment',target_id:target}]:null,error:null}));
 mocks.listeners.get('pushNotificationActionPerformed')!({notification:{data:{app_notification_id:owner}}});
 await vi.waitFor(()=>expect(window.location.hash).toBe('#/services?vue=rendez-vous&rendezvous='+target));
 expect(rpc).toHaveBeenCalledWith('read_app_notification',{p_id:owner});runtime.stop();window.history.replaceState(null,'','/');
});
it("un refus système n’inscrit pas l’appareil", async () => {
  mocks.requestPermissions.mockResolvedValue({ receive: "denied" });
  const runtime = new AndroidPush(client, owner, phase);
  await runtime.start();
  await runtime.enable();
  expect(phase).toHaveBeenLastCalledWith("denied");
  expect(rpc.mock.calls.some((c) => c[0] === "register_android_push")).toBe(
    false,
  );
  runtime.stop();
});
it("attend la confirmation serveur avant d’annoncer l’activation", async () => {
  const runtime = new AndroidPush(client, owner, phase);
  await runtime.start();
  let confirm: (v: unknown) => void = () => {};
  rpc.mockImplementation((name: string) =>
    name === "register_android_push"
      ? new Promise((resolve) => {
          confirm = resolve;
        })
      : Promise.resolve({ data: false, error: null }),
  );
  const enabled = runtime.enable();
  await vi.waitFor(() => expect(mocks.register).toHaveBeenCalled());
  mocks.listeners.get("registration")!({ value: "fake-token-".repeat(6) });
  await vi.waitFor(() =>
    expect(rpc).toHaveBeenCalledWith(
      "register_android_push",
      expect.objectContaining({ p_owner: owner }),
    ),
  );
  expect(phase).not.toHaveBeenCalledWith("on");
  confirm({ error: null });
  await enabled;
  expect(phase).toHaveBeenLastCalledWith("on");
  runtime.stop();
});
it("ignore une inscription devenue celle d’un autre compte", async () => {
  const runtime = new AndroidPush(client, owner, phase);
  await runtime.start();
  getSession.mockResolvedValue({
    data: { session: { user: { id: "other" } } },
  });
  const enabled = runtime.enable();
  await vi.waitFor(() => expect(mocks.register).toHaveBeenCalled());
  mocks.listeners.get("registration")!({ value: "fake-token-".repeat(6) });
  await enabled;
  expect(rpc.mock.calls.some((c) => c[0] === "register_android_push")).toBe(
    false,
  );
  expect(phase).toHaveBeenLastCalledWith("error");
  runtime.stop();
});
it("rejette les liens reçus libres ou incomplets", () => {
  expect(pushTarget({ url: "https://evil" })).toBeNull();
  expect(pushTarget({ alert_id: owner })).toBeNull();
  expect(pushTarget({ alert_id: owner, notification_id: owner })).toEqual({
    alert: owner,
    notification: owner,
  });
});
it('retire une inscription dont la réponse arrive après la désactivation',async()=>{
 const runtime=new AndroidPush(client,owner,phase);await runtime.start();mocks.getItem.mockResolvedValue(owner);
 let confirm:(v:unknown)=>void=()=>{};rpc.mockImplementation((name:string)=>name==='register_android_push'?new Promise(resolve=>{confirm=resolve;}):Promise.resolve({error:null}));
 const enabled=runtime.enable();await vi.waitFor(()=>expect(mocks.register).toHaveBeenCalled());mocks.listeners.get('registration')!({value:'fake-token-'.repeat(6)});
 await vi.waitFor(()=>expect(rpc).toHaveBeenCalledWith('register_android_push',expect.anything()));const disabled=runtime.disable();await enabled;
 confirm({error:null});await disabled;expect(rpc.mock.calls.filter(c=>c[0]==='remove_android_push')).toHaveLength(2);expect(phase).toHaveBeenLastCalledWith('off');runtime.stop();
});
it('ne ferme pas la session si le retrait serveur échoue hors ligne, puis permet de réessayer',async()=>{
 const runtime=new AndroidPush(client,owner,phase);await runtime.start();mocks.getItem.mockResolvedValue(owner);
 const action=vi.fn().mockResolvedValue(true);
 rpc.mockResolvedValue({error:{message:'Failed to fetch'}});
 await expect(runtime.signOut(action)).rejects.toThrow('Rétablis ta connexion');
 expect(action).not.toHaveBeenCalled();expect(phase).toHaveBeenLastCalledWith('error');
 rpc.mockResolvedValue({error:null});
 await expect(runtime.signOut(action)).resolves.toBe(true);
 expect(action).toHaveBeenCalledOnce();expect(mocks.removeAllDeliveredNotifications).toHaveBeenCalled();runtime.stop();
});
it('ne ferme pas la session si le retrait natif échoue',async()=>{
 const runtime=new AndroidPush(client,owner,phase);await runtime.start();mocks.getItem.mockResolvedValue(owner);
 mocks.unregister.mockRejectedValueOnce(Error('indisponible'));const action=vi.fn();
 await expect(runtime.signOut(action)).rejects.toThrow('La déconnexion n’est pas confirmée');
 expect(action).not.toHaveBeenCalled();runtime.stop();
});
it('attend une inscription en vol avant de fermer la session et interdit une nouvelle activation',async()=>{
 const runtime=new AndroidPush(client,owner,phase);await runtime.start();mocks.getItem.mockResolvedValue(owner);
 let confirm:(v:unknown)=>void=()=>{};
 rpc.mockImplementation((name:string)=>name==='register_android_push'?new Promise(resolve=>{confirm=resolve;}):Promise.resolve({error:null}));
 const enabled=runtime.enable();await vi.waitFor(()=>expect(mocks.register).toHaveBeenCalled());mocks.listeners.get('registration')!({value:'fake-token-'.repeat(6)});
 await vi.waitFor(()=>expect(rpc).toHaveBeenCalledWith('register_android_push',expect.anything()));
 const action=vi.fn().mockResolvedValue(true),closed=runtime.signOut(action);await enabled;
 await runtime.enable();expect(mocks.register).toHaveBeenCalledOnce();expect(action).not.toHaveBeenCalled();
 confirm({error:null});await closed;
 expect(action).toHaveBeenCalledOnce();expect(rpc.mock.calls.at(-1)).toEqual(['remove_android_push',{p_device:owner,p_owner:owner}]);
 expect(mocks.removeAllDeliveredNotifications.mock.invocationCallOrder[0]).toBeLessThan(action.mock.invocationCallOrder[0]);runtime.stop();
});
it('le compte suivant ne réactive pas les notifications du compte précédent',async()=>{
 mocks.getItem.mockResolvedValue(owner);rpc.mockResolvedValue({data:false,error:null});
 const next='22222222-2222-4222-8222-222222222222';getSession.mockResolvedValue({data:{session:{user:{id:next}}},error:null});
 const runtime=new AndroidPush(client,next,phase);await runtime.start();
 expect(mocks.unregister).toHaveBeenCalled();expect(mocks.register).not.toHaveBeenCalled();expect(phase).toHaveBeenLastCalledWith('off');runtime.stop();
});
