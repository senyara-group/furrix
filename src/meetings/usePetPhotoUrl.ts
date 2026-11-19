import { useEffect, useState } from 'react';
import type { FurrixClient } from '../services/supabaseClient';
import { downloadPrivatePetPhoto } from '../pets/privatePhotos';

/*
 * Cache mémoire des photos déjà téléchargées pendant la session : une même photo (pile, fiche, liste, carte)
 * n'est demandée qu'une fois. Les URL `blob:` restent locales à l'onglet ; les plus anciennes inutilisées sont libérées.
 */
type Entry = { url?: string; promise: Promise<string>; users: number; used: number };
const cache = new WeakMap<FurrixClient, Map<string, Entry>>();
const KEEP = 60;
const watched = new WeakSet<FurrixClient>();
function watchSession(client: FurrixClient) {
  if (watched.has(client)) return;
  watched.add(client);
  let user: string | undefined;
  client.auth.onAuthStateChange((event, session) => {
    const next = session?.user.id;
    if (event === 'SIGNED_OUT' || (user !== undefined && next !== user)) {
      const map = cache.get(client);
      map?.forEach(entry => { if (entry.url) URL.revokeObjectURL(entry.url); });
      map?.clear();
    }
    user = next;
  });
}

function entries(client: FurrixClient) {
  let map = cache.get(client);
  if (!map) { map = new Map(); cache.set(client, map); }
  return map;
}

function trim(map: Map<string, Entry>) {
  const idle = [...map.entries()].filter(([, e]) => e.users === 0 && e.url).sort((a, b) => a[1].used - b[1].used);
  for (const [path, e] of idle.slice(0, Math.max(0, map.size - KEEP))) { URL.revokeObjectURL(e.url!); map.delete(path); }
}

function acquire(client: FurrixClient, path: string, owner: string, pet: string): Entry {
  watchSession(client);
  const map = entries(client);
  let entry = map.get(path);
  if (!entry) {
    const created: Entry = { users: 0, used: Date.now(), promise: Promise.resolve('') };
    created.promise = downloadPrivatePetPhoto(client, owner, pet, path).then((blob) => {
      if (map.get(path) !== created) throw new Error('Session terminée');
      return (created.url = URL.createObjectURL(blob));
    });
    created.promise.catch(() => { if (map.get(path) === created) map.delete(path); });
    map.set(path, created);
    entry = created;
  }
  entry.users += 1; entry.used = Date.now();
  return entry;
}

/**
 * Photo principale d'un animal, téléchargée avec la session (jamais d'URL publique).
 * Le propriétaire et l'animal se lisent dans le chemin : `<propriétaire>/<animal>/<fichier>`.
 */
export function usePetPhotoUrl(client: FurrixClient, path: string | null | undefined) {
  const [result, setResult] = useState<{ path: string; url: string } | undefined>(() => {
    const url = path ? cache.get(client)?.get(path)?.url : undefined;
    return path && url ? { path, url } : undefined;
  });
  useEffect(() => {
    if (!path) return;
    const [owner, pet] = path.split('/');
    if (!owner || !pet) return;
    let active = true;
    const entry = acquire(client, path, owner, pet);
    void entry.promise.then((url) => { if (active) setResult({ path, url }); }).catch(() => { /* Sans photo : le fond illustré reste affiché. */ });
    return () => { active = false; entry.users -= 1; trim(entries(client)); };
  }, [client, path]);
  return result && result.path === path ? result.url : undefined;
}
