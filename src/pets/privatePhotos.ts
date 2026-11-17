import { AppError, toStorageError } from '../services/errors';
import { PET_PHOTO_BUCKET, PET_PHOTO_MAX_BYTES } from '../services/petPhotos';
import type { FurrixClient } from '../services/supabaseClient';

/** Pas d'URL publique ou signée partageable : contrôle de session à chaque téléchargement. */
export async function downloadPrivatePetPhoto(client: FurrixClient, ownerId: string, petId: string, path: string, signal?: AbortSignal): Promise<Blob> {
  const prefix = `${ownerId}/${petId}/`;
  if (!path.startsWith(prefix) || !/^[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/.test(path.slice(prefix.length))) {
    throw new AppError('invalid_data', 'Chemin de photo invalide.');
  }
  const { data, error } = await client.storage.from(PET_PHOTO_BUCKET).download(path, {}, { signal, cache: 'no-store' });
  if (error) throw toStorageError(error);
  if (!data || !['image/jpeg', 'image/png', 'image/webp'].includes(data.type) || data.size > PET_PHOTO_MAX_BYTES) {
    throw new AppError('storage', 'Photo indisponible.');
  }
  return data;
}
