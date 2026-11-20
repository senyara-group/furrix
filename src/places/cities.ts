// Suggestions de communes françaises pendant la saisie (« li » → Lille, Limoges…), par nom ou code postal.
// Source : API Découpage administratif (geo.api.gouv.fr), service public sans clé. Seul le texte saisi est envoyé.

export type City = {
  /** Nom officiel (« Lille »). */
  name: string;
  /** Code postal principal, ou celui qui a été tapé. */
  postcode: string;
  department: string;
  /** Centre de la commune, arrondi à environ 1 km comme les autres positions de l'app. */
  latitude: number;
  longitude: number;
};

/** Libellé affiché d'une commune choisie (« Lille · 59000 »), comme celui de la recherche d'adresse. */
export const cityLabel = (city: City) => [city.name, city.postcode].filter(Boolean).join(' · ');

const round = (n: number) => Math.round(n * 100) / 100;
const cache = new Map<string, City[]>();

/** Ce qu'on envoie au service : un nom (2 lettres au moins) ou un code postal complet. Sinon rien. */
export function cityQuery(input: string): { nom: string } | { codePostal: string } | null {
  const q = input.trim().replace(/\s+/g, ' ');
  if (/^\d{5}$/.test(q)) return { codePostal: q };
  if (/\d/.test(q) || q.length < 2 || q.length > 80) return null;
  return { nom: q };
}

type Raw = { nom?: string; codesPostaux?: string[]; codeDepartement?: string; centre?: { coordinates?: [number, number] } };

/** Jusqu'à 6 communes, les plus peuplées d'abord. Liste vide si rien ne correspond ; erreur si le service ne répond pas. */
export async function searchCities(input: string, signal?: AbortSignal): Promise<City[]> {
  const query = cityQuery(input);
  if (!query) return [];
  const key = JSON.stringify(query).toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const params = new URLSearchParams({ ...query, fields: 'nom,codesPostaux,codeDepartement,centre', boost: 'population', limit: '6' });
  const response = await fetch(`https://geo.api.gouv.fr/communes?${params}`, { signal });
  if (!response.ok) throw new Error('cities');
  const body = await response.json() as Raw[];
  const typed = 'codePostal' in query ? query.codePostal : null;
  const cities = (Array.isArray(body) ? body : []).flatMap((c): City[] => {
    const [lng, lat] = c.centre?.coordinates ?? [];
    if (!c.nom || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{ name: c.nom, postcode: typed ?? c.codesPostaux?.[0] ?? '', department: c.codeDepartement ?? '', latitude: round(lat), longitude: round(lng) }];
  });
  if (cache.size > 200) cache.clear();
  cache.set(key, cities);
  return cities;
}

/** Ville saisie à la main : lettres (accents compris), espaces, tirets, apostrophes ; ou un code postal. */
export function cityTextError(input: string, { required = false, postcode = false } = {}): string | null {
  const value = input.trim();
  if (!value) return required ? 'Indique ta ville.' : null;
  if (value.length > 80) return '80 caractères maximum.';
  if (postcode && /^\d{5}$/.test(value)) return null;
  if (!/^\p{L}[\p{L}\p{M}' ’.()\s-]*$/u.test(value)) {
    return postcode ? 'Indique un nom de ville ou un code postal à 5 chiffres.' : 'Un nom de ville ne contient que des lettres, des espaces, des tirets ou des apostrophes.';
  }
  return null;
}
