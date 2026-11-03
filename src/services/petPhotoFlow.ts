import type { PetRow } from '../types/database';
import { AppError, toDataError, toStorageError } from './errors';
import { removePetPhotos, uploadPetPhoto } from './petPhotos';
import { fetchPetById, setPetPhotos } from './pets';
import type { FurrixClient } from './supabaseClient';

/**
 * Sort de l'objet téléversé quand le remplacement échoue :
 * - none    : aucun objet connu (téléversement en échec ou incertain avant d'obtenir un chemin) ;
 * - removed : refus serveur définitif ET relecture confirmant que le chemin n'est pas référencé ;
 * - kept    : toute incertitude (réponse perdue, relecture impossible, suppression en échec).
 *             Un objet orphelin est préférable à une photo référencée mais supprimée.
 */
export type OrphanFate = 'none' | 'removed' | 'kept';

export type PhotoOutcome =
  | { status: 'saved'; pet: PetRow; reconciled: boolean }
  | { status: 'failed'; pet: PetRow; error: AppError; uploadedPath: string | null; orphan: OrphanFate };

/** Erreur dont la réponse serveur a bien été reçue : l'écriture n'a pas eu lieu. */
const isDefinitiveRejection = (e: AppError) =>
  e.code === 'forbidden' || e.code === 'invalid_data' || e.code === 'not_found' || e.code === 'validation';

/**
 * Remplace la photo principale d'un animal : téléversement, enregistrement du chemin, puis
 * suppression des anciennes photos — uniquement d'après un état serveur confirmé.
 *
 * Si l'enregistrement du chemin échoue, l'état serveur est relu avant toute suppression :
 * l'écriture a pu réussir malgré la perte de la réponse.
 */
export async function replacePetPhoto(
  client: FurrixClient,
  { userId, pet, file }: { userId: string; pet: PetRow; file: File | Blob },
): Promise<PhotoOutcome> {
  const previous = pet.photos ?? [];

  let path: string;
  try {
    path = await uploadPetPhoto(client, { userId, petId: pet.id, file });
  } catch (e) {
    // Échec ou réponse perdue du téléversement : chemin inconnu côté appelant, rien n'est supprimé.
    const error = e instanceof AppError ? e : toStorageError(e);
    return { status: 'failed', pet, error, uploadedPath: null, orphan: 'none' };
  }

  let confirmed: PetRow;
  let reconciled = false;
  try {
    confirmed = await setPetPhotos(client, pet.id, [path]);
  } catch (e) {
    const error = e instanceof AppError ? e : toDataError(e);
    let fresh: PetRow | null | undefined;
    try {
      fresh = await fetchPetById(client, pet.id);
    } catch {
      fresh = undefined; // état serveur inconnu
    }
    if (fresh && (fresh.photos ?? []).includes(path)) {
      confirmed = fresh; // écriture réussie, réponse perdue
      reconciled = true;
    } else {
      // Une écriture dont la réponse est perdue peut encore aboutir après la relecture :
      // on ne supprime que sur refus définitif confirmé par une relecture réussie.
      const safeToRemove = fresh !== undefined && fresh !== null && isDefinitiveRejection(error);
      const orphan: OrphanFate = safeToRemove && (await removePetPhotos(client, [path])) ? 'removed' : 'kept';
      return { status: 'failed', pet: fresh ?? pet, error, uploadedPath: path, orphan };
    }
  }

  // Anciennes photos : supprimées seulement si l'état serveur confirmé ne les référence plus.
  const kept = confirmed.photos ?? [];
  await removePetPhotos(client, previous.filter((p) => !kept.includes(p)));
  return { status: 'saved', pet: confirmed, reconciled };
}
