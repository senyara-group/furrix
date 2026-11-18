import { useEffect, useState } from "react";
import type { FurrixClient } from "../services/supabaseClient";
import { listNotifications } from "./service";

/** Point d'intégration pour le futur header : aucune écriture ni notification navigateur. */
export default function LocalAlertNotice({
  client,
  owner,
}: {
  client: FurrixClient;
  owner: string;
}) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true,
      running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const n = await listNotifications(client, owner, true);
        if (active) setAvailable(n.length > 0);
      } catch {
        if (active) setAvailable(false);
      } finally {
        running = false;
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [client, owner]);
  return available ? (
    <aside className="app-local-alert" role="status">
      <a href="#/animaux-perdus?notifications">
        Une alerte animaux perdus demande ton attention. Consulter mes
        notifications.
      </a>
    </aside>
  ) : null;
}
