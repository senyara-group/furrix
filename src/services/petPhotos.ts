import { AppError, toStorageError } from './errors';
import type { FurrixClient } from './supabaseClient';

export const PET_PHOTO_BUCKET = 'pet-photos';
/** Identique à storage.buckets.file_size_limit (migration 0004). */
export const PET_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PET_PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type PetPhotoMime = keyof typeof PET_PHOTO_TYPES;

export type PhotoFile = Pick<File, 'type' | 'size'>;

const isAllowedType = (t: string): t is PetPhotoMime => Object.prototype.hasOwnProperty.call(PET_PHOTO_TYPES, t);

export function validatePhotoFile(file: PhotoFile | null | undefined): string | null {
  if (!file) return 'Aucune photo sélectionnée';
  if (!isAllowedType(file.type)) return 'Format non accepté (JPEG, PNG ou WebP)';
  if (file.size <= 0) return 'Photo vide';
  if (file.size > PET_PHOTO_MAX_BYTES) return 'Photo trop lourde (5 Mo maximum)';
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chemin <userId>/<petId>/<uuid>.<ext> : seule forme acceptée par les policies Storage (0004)
 * et par la contrainte pets_photos_owned (0005). L'extension dérive du type MIME, jamais du nom du fichier.
 */
export function buildPetPhotoPath(userId: string, petId: string, mime: string, id: string = crypto.randomUUID()): string {
  if (!UUID_RE.test(userId) || !UUID_RE.test(petId) || !UUID_RE.test(id)) {
    throw new AppError('invalid_data', 'Identifiant invalide pour la photo.');
  }
  if (!isAllowedType(mime)) throw new AppError('invalid_data', 'Format non accepté (JPEG, PNG ou WebP).');
  return `${userId}/${petId}/${id}.${PET_PHOTO_TYPES[mime]}`;
}

export async function uploadPetPhoto(
  client: FurrixClient,
  { userId, petId, file }: { userId: string; petId: string; file: File | Blob },
): Promise<string> {
  const problem = validatePhotoFile(file);
  if (problem) throw new AppError('validation', problem);
  const path = buildPetPhotoPath(userId, petId, file.type);
  const { error } = await client.storage
    .from(PET_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (error) throw toStorageError(error);
  return path;
}

/** Suppression au mieux (ancienne photo remplacée) : une erreur n'interrompt pas le parcours. */
export async function removePetPhotos(client: FurrixClient, paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { error } = await client.storage.from(PET_PHOTO_BUCKET).remove(paths);
  return !error;
}

export function petPhotoUrl(client: FurrixClient, path: string | null | undefined): string | null {
  if (!path) return null;
  return client.storage.from(PET_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
