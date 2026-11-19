import { useEffect, useState } from 'react';
import type { FurrixClient } from '../services/supabaseClient';
import { listNotifications } from './service';

/** Une seule vérification partagée par le header et son éventuel bandeau de contenu. */
export function useLocalAlertUnread(client: FurrixClient, owner: string) {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    let active = true, running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try { const rows = await listNotifications(client, owner, true); if (active) setUnread(rows.length > 0); }
      catch { if (active) setUnread(false); } // La migration animaux perdus peut ne pas encore être installée.
      finally { running = false; }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    const refresh = () => { void load(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('furrix:notifications-read', refresh);
    window.addEventListener('furrix:notifications-updated', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('furrix:notifications-read', refresh); window.removeEventListener('furrix:notifications-updated', refresh); };
  }, [client, owner]);
  return unread;
}
