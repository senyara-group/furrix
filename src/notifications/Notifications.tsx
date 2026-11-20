import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FurrixScope,
  Loading,
  Note,
  Page,
  PageHeader,
  Stack,
  StatusBadge,
} from "../design-system";
import type { FurrixClient } from "../services/supabaseClient";
import { AndroidPushSettings } from "../push/PushProvider";
import {
  getPreferences,
  listNotifications,
  readNotification,
  setPreference,
} from "./service";
import {
  categories,
  notificationHref,
  type Notification,
  type Preference,
} from "./types";
import "./notifications.css";
type State = {
  items: Notification[];
  unread: number;
  error: boolean;
  loading: boolean;
  more: boolean;
  refresh: () => void;
  next: () => Promise<void>;
};
const Context = createContext<State | null>(null);
export const useNotifications = () => useContext(Context);
/** Une seule interrogation partagée par la cloche et le centre, arrêtée à la déconnexion. */
export function NotificationsProvider({
  client,
  owner,
  children,
}: {
  client: FurrixClient;
  owner: string;
  children: ReactNode;
}) {
  const [items, setItems] = useState<Notification[]>([]),
    [unread, setUnread] = useState(0),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false);
  const current = useRef(true),
    running = useRef(false),
    pending = useRef(false),
    ref = useRef(items);
  ref.current = items;
  const load = useCallback(
    async (next = false) => {
      if (running.current) {
        if (!next) pending.current = true;
        return;
      }
      running.current = true;
      if (current.current) setLoading(true);
      try {
        const rows = await listNotifications(
          client,
          next && ref.current.length
            ? { before: ref.current[ref.current.length - 1] }
            : {},
        );
        if (current.current) {
          setItems((previous) =>
            next
              ? [
                  ...previous,
                  ...rows.filter((n) => !previous.some((p) => p.id === n.id)),
                ]
              : rows,
          );
          if (!next || rows.length)
            setUnread(Number(rows[0]?.unread_total ?? 0));
          setMore(rows.length === 50);
          setError(false);
        }
      } catch {
        if (current.current) setError(true);
      } finally {
        running.current = false;
        if (current.current) {
          setLoading(false);
          if (pending.current) {
            pending.current = false;
            void load();
          }
        }
      }
    },
    [client, owner],
  );
  useEffect(() => {
    current.current = true;
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(refresh, 30000);
    for (const event of [
      "focus",
      "furrix:notifications-read",
      "furrix:notifications-updated",
    ])
      window.addEventListener(event, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      current.current = false;
      window.clearInterval(timer);
      for (const event of [
        "focus",
        "furrix:notifications-read",
        "furrix:notifications-updated",
      ])
        window.removeEventListener(event, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  return (
    <Context.Provider
      value={{
        items,
        unread,
        error,
        loading,
        more,
        refresh: () => void load(),
        next: () => load(true),
      }}
    >
      {children}
    </Context.Provider>
  );
}
/** Préférences du compte : ne remplacent pas la permission propre à chaque appareil. */
export function NotificationSettings({ client }: { client: FurrixClient }) {
  const [prefs, setPrefs] = useState<Preference[]>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    let active = true;
    setError(false);
    void getPreferences(client)
      .then((data) => {
        if (active) setPrefs(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [client, attempt]);
  const save = async (pref: Preference) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    try {
      await setPreference(client, pref.category, !pref.push_enabled);
      if (alive.current)
        setPrefs((rows) =>
          rows?.map((p) =>
            p.category === pref.category
              ? { ...p, push_enabled: !pref.push_enabled }
              : p,
          ),
        );
    } catch {
      if (alive.current) setError(true);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Card>
      <Stack gap={3}>
        <h2>Mes alertes mobiles</h2>
        <p>
          Choisis les catégories envoyées sur tes appareils Android activés. Le
          centre conserve les notifications même si tu coupes leur alerte
          mobile.
        </p>
        {error && (
          <Alert
            tone="err"
            title="Préférences non confirmées"
            actions={
              <Button
                variant="out"
                disabled={busy}
                onClick={() => setAttempt((a) => a + 1)}
              >
                Actualiser les préférences
              </Button>
            }
          >
            Vérifie le réglage enregistré avant de réessayer.
          </Alert>
        )}
        {prefs
          ? prefs.map((pref) => (
              <Checkbox
                key={pref.category}
                checked={pref.push_enabled}
                disabled={busy}
                onChange={() => void save(pref)}
              >
                {categories[pref.category]}
              </Checkbox>
            ))
          : !error && <Loading label="Chargement des préférences…" />}
        <Note>
          Seuls les prochains événements sont envoyés après activation. Le
          secteur des animaux perdus reste un réglage distinct. Sur iPhone et
          navigateur, le centre fonctionne ; les alertes hors application ne
          sont pas encore raccordées.
        </Note>
      </Stack>
    </Card>
  );
}
/** Centre commun : aucune lecture implicite à l’affichage, liens vérifiés au moment de l’ouverture. */
export default function Notifications({ client }: { client: FurrixClient }) {
  const state = useNotifications(),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const act = async (item?: Notification, open = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      if (item && open) {
        const [latest] = await listNotifications(client, {
          id: item.id,
          limit: 1,
        });
        const href = latest && notificationHref(latest);
        if (!href) throw Error("Cette notification n’est plus accessible.");
        await readNotification(client, item.id);
        if (alive.current) window.location.hash = href;
      } else await readNotification(client, item?.id);
    } catch {
      if (alive.current)
        setFailure(
          "Action non confirmée. Actualise les notifications avant de réessayer.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <FurrixScope>
      <Page>
        <PageHeader
          title="Notifications"
          subtitle="Les nouvelles de tes animaux et de tes échanges."
          showTitleOnPhone
        />
        <Stack gap={4}>
          <div className="app-notification-actions">
            <Button
              variant="out"
              onClick={state?.refresh}
              disabled={state?.loading}
            >
              Actualiser
            </Button>
            <Button
              variant="quiet"
              loading={busy}
              disabled={!state?.unread}
              onClick={() => void act()}
            >
              Tout marquer comme lu
            </Button>
          </div>
          {failure && <Alert tone="err" title={failure} />}
          {state?.error && (
            <Alert tone="err" title="Notifications non actualisées">
              Les éléments affichés peuvent ne plus être à jour. Réessaie le
              chargement.
            </Alert>
          )}
          {state?.loading && !state.items.length && (
            <Loading label="Chargement des notifications…" />
          )}
          {!state?.loading && !state?.error && !state?.items.length && (
            <EmptyState icon="bell" title="Tu es à jour">
              Tes prochaines notifications apparaîtront ici.
            </EmptyState>
          )}
          {state?.items.map((item) => (
            <Card key={item.id}>
              <Stack gap={3}>
                <StatusBadge status={item.read_at ? "ok" : "wait"}>
                  {item.read_at ? "Lue" : "Non lue"} ·{" "}
                  {categories[item.category]}
                </StatusBadge>
                <h2>{item.title}</h2>
                <p>
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.created_at))}
                </p>
                <div className="app-notification-actions">
                  <Button
                    variant="out"
                    loading={busy}
                    onClick={() => void act(item, true)}
                  >
                    Consulter
                  </Button>
                  {!item.read_at && (
                    <Button
                      variant="quiet"
                      loading={busy}
                      onClick={() => void act(item)}
                    >
                      Marquer comme lu
                    </Button>
                  )}
                </div>
              </Stack>
            </Card>
          ))}
          {state?.more && (
            <Button
              variant="out"
              loading={state.loading}
              onClick={() => void state.next()}
            >
              Voir les notifications précédentes
            </Button>
          )}
          <NotificationSettings client={client} />
          <AndroidPushSettings />
        </Stack>
      </Page>
    </FurrixScope>
  );
}
