import { useEffect, useState } from 'react';
import { PawPrint } from 'lucide-react';
import type { PetRow } from '../types/database';
import type { FurrixClient } from '../services/supabaseClient';
import { downloadPrivatePetPhoto } from './privatePhotos';

export function PetPhoto({ client, pet }: { client: FurrixClient; pet: PetRow }) {
  const path = pet.photos?.[0];
  const [result, setResult] = useState<{ path: string; url?: string; failed?: boolean }>();
  useEffect(() => {
    if (!path) return;
    let active = true, url: string | undefined;
    const controller = new AbortController();
    void downloadPrivatePetPhoto(client, pet.owner_id, pet.id, path, controller.signal).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setResult({ path, url });
    }).catch(() => { if (active) setResult({ path, failed: true }); });
    return () => { active = false; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [client, path, pet.owner_id, pet.id]);
  const current = result?.path === path ? result : undefined;
  return <div className="pet-photo">{current?.url ? <img src={current.url} alt={`Portrait de ${pet.name}`} /> : <><PawPrint size={48} strokeWidth={1.3} aria-hidden /><span>{path ? current?.failed ? 'Photo indisponible' : 'Chargement de la photo…' : 'Sa petite bouille, bientôt ici'}</span></>}</div>;
}
