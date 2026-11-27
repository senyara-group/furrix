import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export type ApproximatePosition = { latitude: number; longitude: number };
const round = (n: number) => Math.round(n * 100) / 100;

/** Raison lisible d'un échec de localisation (refus, position introuvable, délai). */
export class LocationError extends Error {
  constructor(public reason: 'denied' | 'unavailable' | 'timeout' | 'not_found' | 'network') { super(reason); }
}

/** Déclenché seulement par une action explicite, jamais en arrière-plan. Arrondi à environ 1 km. */
export async function approximateLocation(): Promise<ApproximatePosition> {
  try {
    // Android : getCurrentPosition demande lui-même l'autorisation approximative et peut
    // proposer l'activation des services. requestPermissions échoue avant ce dialogue si le GPS est coupé.
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'android') {
      const permissions = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
      if (permissions.coarseLocation !== 'granted') throw new LocationError('denied');
    }
    const { coords } = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 });
    return { latitude: round(coords.latitude), longitude: round(coords.longitude) };
  } catch (error) {
    if (error instanceof LocationError) throw error;
    // Erreur du navigateur (GeolocationPositionError) : 1 refus, 2 indisponible, 3 délai dépassé.
    const code = (error as { code?: number | string })?.code;
    const text = String((error as { message?: string })?.message ?? '').toLowerCase();
    throw new LocationError(code === 1 || code === 'OS-PLUG-GLOC-0003' || text.includes('denied') ? 'denied' : code === 3 || code === 'OS-PLUG-GLOC-0010' || text.includes('timeout') ? 'timeout' : 'unavailable');
  }
}

/**
 * Solution de secours sans GPS : centre de la commune, via la Base Adresse Nationale (service public, sans clé).
 * Seul le nom de ville ou le code postal saisi est envoyé ; le résultat est arrondi comme la position.
 */
export async function locateTown(query: string, signal?: AbortSignal): Promise<ApproximatePosition & { label: string }> {
  const q = query.trim();
  if (q.length < 2 || q.length > 200) throw new LocationError('not_found');
  let response: Response;
  try {
    response = await fetch(`https://data.geopf.fr/geocodage/search?index=address&q=${encodeURIComponent(q)}&type=municipality&limit=1`, { signal });
  } catch { throw new LocationError('network'); }
  if (!response.ok) throw new LocationError('network');
  const body = await response.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: { label?: string; postcode?: string } }> };
  const found = body.features?.[0];
  const [lng, lat] = found?.geometry?.coordinates ?? [];
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new LocationError('not_found');
  const label = [found?.properties?.label, found?.properties?.postcode].filter(Boolean).join(' · ');
  return { latitude: round(lat), longitude: round(lng), label: label || q };
}

export const locationMessage: Record<LocationError['reason'], string> = {
  denied: 'La localisation n’est pas autorisée. Vérifie les autorisations de l’application ou du navigateur, ou saisis une ville.',
  unavailable: 'Ton appareil ne trouve pas ta position. Vérifie que la localisation est activée, puis réessaie, ou saisis une ville.',
  timeout: 'La position met trop de temps à arriver. Réessaie, ou saisis une ville.',
  not_found: 'Ville introuvable. Vérifie l’orthographe ou essaie le code postal.',
  network: 'La recherche de la ville n’a pas abouti. Vérifie ta connexion et réessaie.',
};
