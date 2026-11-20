import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FurrixScope,
  Loading,
  Note,
  Stack,
  StatusBadge,
} from "../../design-system";
import type { FurrixClient } from "../../services/supabaseClient";
import { useNotifications } from "../../notifications/Notifications";
import { loadHomeActivity, type HomeActivity as Data } from "./service";
import { activityDate, activityItems, type ActivityItem } from "./activity";
import "./home.css";
function ActivityCard({ item }: { item: ActivityItem }) {
  return (
    <Card>
      <Stack gap={3}>
        <StatusBadge status={item.waiting ? "wait" : "ok"}>
          {item.status}
        </StatusBadge>
        <p className="app-home-category">{item.category}</p>
        <h3>{item.title}</h3>
        <p>{activityDate(item)}</p>
        <Button as="a" href={item.href} variant="out">
          Voir le détail
        </Button>
      </Stack>
    </Card>
  );
}
/** Aperçu à jour à l’ouverture, au retour de focus et toutes les minutes sur l’accueil visible. */
export default function HomeActivity({
  client,
  owner,
}: {
  client: FurrixClient;
  owner: string;
}) {
  const [data, setData] = useState<Data>(),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(true);
  const running = useRef(false),
    notifications = useNotifications();
  const refresh = useCallback(() => {
    if (!running.current) setAttempt((a) => a + 1);
  }, []);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    running.current = true;
    setLoading(true);
    setData(undefined);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    void loadHomeActivity(client, controller.signal)
      .then((value) => {
        if (current) setData(value);
      })
      .catch(() => {
        if (current)
          setData({
            matches: [],
            sittings: [],
            appointments: [],
            failed: ["Rencontres", "Garde", "Services"],
          });
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (current) {
          running.current = false;
          setLoading(false);
        }
      });
    return () => {
      current = false;
      controller.abort();
      window.clearTimeout(timeout);
      running.current = false;
    };
  }, [client, owner, attempt]);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) refresh();
    };
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  const groups = data
    ? activityItems(data, Date.now())
    : { waiting: [], upcoming: [] };
  return (
    <FurrixScope className="app-home-activity">
      <section aria-labelledby="home-activity-title">
        <Stack gap={4}>
          <div className="app-home-actions">
            <div>
              <p className="app-eyebrow">Le fil de tes aventures</p>
              <h2 id="home-activity-title">À suivre</h2>
            </div>
            <Button variant="quiet" loading={loading} onClick={refresh}>
              Actualiser le suivi
            </Button>
          </div>
          <Button as="a" variant="out" href="#/notifications">
            {notifications?.unread
              ? `Consulter mes notifications · ${notifications.unread} non lue${notifications.unread > 1 ? "s" : ""}`
              : "Consulter mes notifications"}
          </Button>
          {notifications?.error && (
            <Note>
              Les notifications n’ont pas pu être actualisées. Le compteur
              indique le dernier état connu.
            </Note>
          )}
          {loading && <Loading label="Chargement de tes activités…" />}
          {data?.failed.length ? (
            <Alert tone="warn" title="Suivi partiellement indisponible">
              Impossible de charger : {data.failed.join(", ")}. Les autres
              activités restent affichées. Tu peux actualiser ou ouvrir
              directement le parcours concerné.
            </Alert>
          ) : null}
          {!loading &&
            data &&
            !data.failed.length &&
            !groups.waiting.length &&
            !groups.upcoming.length && (
              <EmptyState icon="calendar" title="Rien à suivre dans cet aperçu">
                Tes prochaines demandes et activités apparaîtront ici.
              </EmptyState>
            )}
          {groups.waiting.length > 0 && (
            <Stack gap={3}>
              <h3>Demandes à consulter</h3>
              {groups.waiting.slice(0, 3).map((item) => (
                <ActivityCard key={item.id} item={item} />
              ))}
            </Stack>
          )}
          {groups.upcoming.length > 0 && (
            <Stack gap={3}>
              <h3>En cours et à venir</h3>
              {groups.upcoming.slice(0, 3).map((item) => (
                <ActivityCard key={item.id} item={item} />
              ))}
            </Stack>
          )}
          <Note>
            Cet aperçu présente jusqu’à trois demandes et trois activités à
            venir parmi les éléments récents. Consulte chaque espace pour le
            suivi complet. Les horaires suivent le fuseau de ton appareil.
          </Note>
          <div className="app-home-actions">
            <Button as="a" href="#/messages" variant="quiet">
              Mes rencontres
            </Button>
            <Button as="a" href="#/garde?vue=mes-gardes" variant="quiet">
              Mes gardes
            </Button>
            <Button as="a" href="#/services?vue=rendez-vous" variant="quiet">
              Mes rendez-vous
            </Button>
          </div>
        </Stack>
      </section>
    </FurrixScope>
  );
}
