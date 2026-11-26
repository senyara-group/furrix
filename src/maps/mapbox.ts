// Fond de carte Mapbox : jeton public selon la plateforme, chargement différé de la bibliothèque,
// et une seule instance de carte réutilisée pendant la consultation (chaque création compte comme un
// chargement facturé par Mapbox). Aucun téléchargement de zones hors ligne : seul le cache normal du
// navigateur et de la bibliothèque est utilisé, comme le prévoient les conditions de Mapbox.
import type { Map as MapboxMap } from 'mapbox-gl';
import { isNative } from '../design-system/platform';

type Mapbox = typeof import('mapbox-gl')['default'];

/** Style du fond : sobre, pour que les repères Furrix restent lisibles. */
export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';
/** Une carte inutilisée est libérée après ce délai (retour à la recherche plus tard : nouveau chargement). */
const IDLE_MS = 10 * 60_000;

/** Jeton public (« pk. ») : celui de l'app sur iOS / Android, celui du site (restreint à ses adresses) sinon. */
export function mapboxToken(): string | null {
  const token = (isNative() ? import.meta.env.VITE_MAPBOX_TOKEN_APP : import.meta.env.VITE_MAPBOX_TOKEN_WEB) as string | undefined;
  return token?.startsWith('pk.') ? token : null;
}

let library: Promise<Mapbox> | null = null;
/** Bibliothèque et feuille de style chargées à la première carte visible seulement (fichier séparé). */
export function loadMapbox(): Promise<Mapbox> {
  library ??= Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')]).then(([m]) => m.default);
  library.catch(() => { library = null; });
  return library;
}

/** Textes des contrôles Mapbox en français. */
const locale = {
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'NavigationControl.ResetBearing': 'Remettre le nord en haut',
  'ScrollZoomBlocker.CtrlMessage': 'Ctrl + molette pour zoomer sur la carte',
  'ScrollZoomBlocker.CmdMessage': '⌘ + molette pour zoomer sur la carte',
  'TouchPanBlocker.Message': 'Deux doigts pour déplacer la carte',
  'Map.Title': 'Carte',
};

export type PooledMap = {
  map: MapboxMap;
  /** Élément qui contient la carte : déplacé d'un écran à l'autre sans recréer la carte. */
  host: HTMLDivElement;
  /** Dernier cadrage appliqué (centre + rayon) : un retour sur la même recherche ne recadre pas. */
  framed: string | null;
  timer?: ReturnType<typeof setTimeout>;
};

let idle: PooledMap | null = null;

/**
 * Carte à afficher dans `slot` : l'instance mise de côté si elle existe, sinon une nouvelle.
 * `cooperative` : sur ordinateur, la molette fait défiler la page (Ctrl + molette pour zoomer).
 */
export function takeMap(mapboxgl: Mapbox, token: string, slot: HTMLElement, cooperative: boolean): PooledMap {
  if (idle) {
    const pooled = idle;
    idle = null;
    clearTimeout(pooled.timer);
    slot.appendChild(pooled.host);
    pooled.map.resize();
    return pooled;
  }
  const host = document.createElement('div');
  host.className = 'app-map__gl';
  slot.appendChild(host);
  const map = new mapboxgl.Map({
    container: host,
    accessToken: token,
    style: MAP_STYLE,
    center: [2.35, 46.6],
    zoom: 5,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    cooperativeGestures: cooperative,
    locale,
    attributionControl: true,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
  return { map, host, framed: null };
}

/** Rend la carte : gardée de côté quelques minutes pour la prochaine recherche, sinon libérée. */
export function releaseMap(pooled: PooledMap) {
  pooled.host.remove();
  if (idle) { pooled.map.remove(); return; }
  idle = pooled;
  pooled.timer = setTimeout(() => {
    if (idle === pooled) idle = null;
    pooled.map.remove();
  }, IDLE_MS);
}

/** Cercle (polygone GeoJSON) de `radiusKm` autour du centre, pour la zone de recherche. */
export function circle(center: { latitude: number; longitude: number }, radiusKm: number, steps = 64) {
  const lat = (center.latitude * Math.PI) / 180;
  const dLat = radiusKm / 110.574, dLng = radiusKm / (111.32 * Math.cos(lat));
  const ring = Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [center.longitude + dLng * Math.cos(a), center.latitude + dLat * Math.sin(a)];
  });
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}

/** Emprise [[ouest, sud], [est, nord]] du cercle de recherche. */
export function radiusBounds(center: { latitude: number; longitude: number }, radiusKm: number): [[number, number], [number, number]] {
  const lat = (center.latitude * Math.PI) / 180;
  const dLat = radiusKm / 110.574, dLng = radiusKm / (111.32 * Math.cos(lat));
  return [[center.longitude - dLng, center.latitude - dLat], [center.longitude + dLng, center.latitude + dLat]];
}

/** Repères placés au même endroit (même commune) : regroupés pour rester tous accessibles. */
export function groupByPosition<T extends { id: string; position?: { latitude: number; longitude: number } | null }>(points: T[]) {
  const groups = new Map<string, T[]>();
  for (const p of points) {
    if (!p.position) continue;
    const key = `${p.position.latitude.toFixed(4)},${p.position.longitude.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([key, members]) => ({ key, members, position: members[0]!.position! }));
}

type Projected = { x: number; y: number };
/**
 * Repères qui se chevaucheraient à l'écran (zoom faible) : réunis en un seul, pour qu'aucun ne soit caché.
 * `box` : écart minimal, en pixels, entre deux repères (largeur et hauteur d'une étiquette courte).
 */
export function clusterOnScreen<G extends { key: string; position: { latitude: number; longitude: number } }>(
  groups: G[], project: (p: { latitude: number; longitude: number }) => Projected, box = { w: 150, h: 44 },
) {
  const found: { groups: G[]; at: Projected }[] = [];
  for (const g of groups) {
    const at = project(g.position);
    const hit = found.find((c) => Math.abs(c.at.x - at.x) < box.w && Math.abs(c.at.y - at.y) < box.h);
    if (hit) hit.groups.push(g); else found.push({ groups: [g], at });
  }
  return found.map(({ groups: members }) => ({
    key: members.map((g) => g.key).sort().join('|'),
    groups: members,
    position: {
      latitude: members.reduce((s, g) => s + g.position.latitude, 0) / members.length,
      longitude: members.reduce((s, g) => s + g.position.longitude, 0) / members.length,
    },
  }));
}
