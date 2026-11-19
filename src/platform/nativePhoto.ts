import { Capacitor } from '@capacitor/core';
import { Camera, EncodingType, MediaTypeSelection } from '@capacitor/camera';
import { AppError } from '../services/errors';
import { validatePhotoFile } from '../services/petPhotos';

/** Selection native sur action explicite, sans requete de metadonnees ni sauvegarde dans la galerie. */
export async function pickNativePetPhoto(source: 'camera' | 'gallery'): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) throw new AppError('validation', 'Ce choix est disponible dans l’application mobile.');
  try {
    const options = { quality: 80, targetWidth: 1600, targetHeight: 1600, includeMetadata: false, correctOrientation: true };
    const media = source === 'camera'
      ? await Camera.takePhoto({ ...options, encodingType: EncodingType.JPEG, saveToGallery: false })
      : (await Camera.chooseFromGallery({ ...options, mediaType: MediaTypeSelection.Photo, allowMultipleSelection: false, editable: 'no' })).results[0];
    if (!media) return null;
    if (!media.webPath) throw new AppError('storage', 'La photo sélectionnée est indisponible.');
    const response = await fetch(media.webPath);
    if (!response.ok) throw new AppError('storage', 'La photo n’a pas pu être lue.');
    const blob = await response.blob();
    const problem = validatePhotoFile(blob);
    if (problem) throw new AppError('validation', problem);
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], 'animal.' + extension, { type: blob.type });
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as {message?: string})?.message ?? '');
    if (/cancelled|canceled/i.test(message)) return null;
    if (error instanceof AppError) throw error;
    throw new AppError('storage', 'La photo n’est pas disponible. Vérifie les autorisations dans les réglages du téléphone.');
  }
}
