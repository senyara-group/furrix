import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GeoJSONSource, Marker } from 'mapbox-gl';
import { circle, clusterOnScreen, groupByPosition, loadMapbox, radiusBounds, releaseMap, takeMap, type PooledMap } from './mapbox';
import type { MapPoint } from './ResultsMap';
import { tokens } from '../design-system/tokens/tokens';

type Position = { latitude: number; longitude: number };

export interface MapboxLayerProps {
  token: string;
  /** Points à placer (ceux sans position sont ignorés). */
  points: MapPoint[];
  /** Centre de la recherche (ville ou position approximative) : repère « toi » et cercle du rayon. */
  center: Position | null;
  /** Rayon de recherche ; 0 = sans limite (pas de cercle, cadrage sur les résultats). */
  radiusKm: number;
  /** Faux pendant le chargement ou en erreur : aucun repère. */
  showPoints: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Jeton refusé, bibliothèque introuvable ou WebGL absent : la carte schématique prend le relais. */
  onFail: () => void;
  /** Ordinateur : la molette fait défiler la page, Ctrl + molette zoome. */
  cooperative: boolean;
  /** « au même endroit » ou « dans le même secteur » (voir ResultsMap). */
  sameSpot: string;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const lngLat = (p: Position): [number, number] => [p.longitude, p.latitude];

/**
 * Fond Mapbox de `ResultsMap`. La carte n'est créée que lorsque son cadre devient visible
 * (jamais en arrière-plan, ni derrière l'onglet « Liste » du téléphone), puis elle est gardée :
 * filtres, rayon et sélection ne font que déplacer le cadrage et mettre à jour les repères.
 */
export function MapboxLayer({ token, points, center, radiusKm, showPoints, selected, onSelect, onFail, cooperative, sameSpot }: MapboxLayerProps) {
  const slot = useRef<HTMLDivElement>(null);
  const [pooled, setPooled] = useState<PooledMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const onSelectRef = useRef(onSelect), onFailRef = useRef(onFail);
  onSelectRef.current = onSelect;
  onFailRef.current = onFail;

  // Création (ou reprise) de la carte, au premier affichage du cadre seulement.
  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    let cancelled = false, taken: PooledMap | null = null, started = false;
    const start = () => {
      if (started) return;
      started = true;
      observer?.disconnect();
      loadMapbox().then((lib) => {
        if (cancelled) return;
        try {
          taken = takeMap(lib, token, el, cooperative);
          setPooled(taken);
        } catch {
          onFailRef.current();
        }
      }).catch(() => { if (!cancelled) onFailRef.current(); });
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null
      : new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) start(); });
    if (observer) observer.observe(el); else start();
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (taken) releaseMap(taken);
      setPooled(null);
      setStyleReady(false);
    };
  }, [token, cooperative]);

  // Style chargé : zone du rayon ; clic sur le fond = désélection ; jeton refusé = repli.
  useEffect(() => {
    if (!pooled) return;
    const { map } = pooled;
    const ready = () => {
      if (!map.getSource('app-radius')) {
        map.addSource('app-radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'app-radius-fill', type: 'fill', source: 'app-radius', paint: { 'fill-color': tokens.color.surface.white, 'fill-opacity': 0.25 } });
        map.addLayer({ id: 'app-radius-line', type: 'line', source: 'app-radius', paint: { 'line-color': tokens.color.ink.DEFAULT, 'line-opacity': 0.35, 'line-width': 1.5, 'line-dasharray': [3, 3] } });
      }
      setStyleReady(true);
    };
    if (map.isStyleLoaded()) ready(); else map.once('load', ready);
    const click = (e: { originalEvent?: Event }) => {
      if ((e.originalEvent?.target as Element | null)?.closest?.('.app-map__pin')) return;
      onSelectRef.current(null);
    };
    const error = (e: { error: Error }) => {
      const status = (e.error as Error & { status?: number }).status;
      if (status === 401 || status === 403) onFailRef.current();
    };
    map.on('click', click);
    map.on('error', error);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.resize());
    if (slot.current) resize?.observe(slot.current);
    return () => {
      map.off('load', ready);
      map.off('click', click);
      map.off('error', error);
      resize?.disconnect();
    };
  }, [pooled]);

  // Cercle du rayon et cadrage : seulement quand la recherche change (pas à chaque sélection, ni au retour d'une fiche).
  // Sans rayon (0), cadrage sur le centre et les résultats, refait seulement si les positions changent.
  const lat = center?.latitude, lng = center?.longitude;
  const spread = radiusKm > 0 ? '' : [...new Set(points.flatMap((p) => p.position ? [`${p.position.latitude},${p.position.longitude}`] : []))].sort().join(';');
  useEffect(() => {
    if (!pooled || !styleReady) return;
    const source = pooled.map.getSource('app-radius') as GeoJSONSource | undefined;
    const key = `${lat},${lng},${radiusKm},${spread}`;
    if (radiusKm > 0 && lat !== undefined && lng !== undefined) {
      const c = { latitude: lat, longitude: lng };
      source?.setData(circle(c, radiusKm));
      if (pooled.framed !== key) {
        pooled.map.fitBounds(radiusBounds(c, radiusKm), { padding: 24, duration: pooled.framed === null || reduced() ? 0 : 500 });
        pooled.framed = key;
      }
      return;
    }
    source?.setData({ type: 'FeatureCollection', features: [] });
    const spots = [...(lat !== undefined && lng !== undefined ? [[lng, lat]] : []), ...spread.split(';').filter(Boolean).map((s) => s.split(',').reverse().map(Number))];
    if (!spots.length || pooled.framed === key) return;
    const lngs = spots.map((s) => s[0]!), lats = spots.map((s) => s[1]!);
    pooled.map.fitBounds([[Math.min(...lngs) - 0.03, Math.min(...lats) - 0.03], [Math.max(...lngs) + 0.03, Math.max(...lats) + 0.03]],
      { padding: { top: 60, bottom: 60, left: 80, right: 80 }, maxZoom: 12, duration: pooled.framed === null || reduced() ? 0 : 500 });
    pooled.framed = key;
  }, [pooled, styleReady, lat, lng, radiusKm, spread]);

  // Repère du centre de recherche.
  const meEl = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!pooled || lat === undefined || lng === undefined) return;
    let marker: Marker | null = null;
    void loadMapbox().then((lib) => {
      meEl.current ??= Object.assign(document.createElement('span'), { className: 'fx-map__me' });
      meEl.current.setAttribute('aria-hidden', 'true');
      marker = new lib.Marker({ element: meEl.current }).setLngLat([lng, lat]).addTo(pooled.map);
    });
    return () => { marker?.remove(); };
  }, [pooled, lat, lng]);

  // Recalcul des regroupements quand la vue change (zoom, déplacement, recadrage).
  const [, setView] = useState(0);
  useEffect(() => {
    if (!pooled) return;
    const moved = () => setView((v) => v + 1);
    pooled.map.on('moveend', moved);
    return () => { pooled.map.off('moveend', moved); };
  }, [pooled]);

  // Repères : un par position (les activités d'une même commune partagent le leur) ; ceux qui se
  // chevaucheraient à l'écran sont réunis en « N activités proches » (un clic zoome pour les séparer).
  const groups = showPoints ? groupByPosition(points) : [];
  const clusters = pooled && styleReady
    ? clusterOnScreen(groups, (p) => pooled.map.project(lngLat(p)))
    : groups.map((g) => ({ key: g.key, groups: [g], position: g.position }));
  const elements = useRef(new Map<string, HTMLDivElement>());
  const element = (key: string) => {
    let el = elements.current.get(key);
    if (!el) { el = document.createElement('div'); el.className = 'app-map__pin-anchor'; elements.current.set(key, el); }
    return el;
  };
  const markers = useRef(new Map<string, Marker>());
  const signature = clusters.map((c) => c.key).join('§');
  useEffect(() => {
    if (!pooled) return;
    let cancelled = false;
    void loadMapbox().then((lib) => {
      if (cancelled) return;
      const wanted = new Set(clusters.map((c) => c.key));
      for (const [key, marker] of markers.current) if (!wanted.has(key)) { marker.remove(); markers.current.delete(key); }
      for (const c of clusters) if (!markers.current.has(c.key))
        markers.current.set(c.key, new lib.Marker({ element: element(c.key) }).setLngLat(lngLat(c.position)).addTo(pooled.map));
    });
    return () => { cancelled = true; };
    // `signature` résume `clusters` : mêmes regroupements, mêmes repères.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pooled, signature]);
  useEffect(() => () => { for (const m of markers.current.values()) m.remove(); markers.current.clear(); }, [pooled]);

  // Repère choisi : au premier plan, et ramené dans le cadre s'il en sort.
  useEffect(() => {
    for (const c of clusters) element(c.key).style.zIndex = c.groups.some((g) => g.members.some((m) => m.id === selected)) ? '3' : '1';
    const point = points.find((p) => p.id === selected)?.position;
    if (!pooled || !point) return;
    if (!pooled.map.getBounds()?.contains(lngLat(point))) pooled.map.easeTo({ center: lngLat(point), duration: reduced() ? 0 : 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pooled, selected, signature]);

  const zoomTo = (positions: Position[]) => {
    if (!pooled) return;
    const lngs = positions.map((p) => p.longitude), lats = positions.map((p) => p.latitude);
    pooled.map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 90, maxZoom: 14, duration: reduced() ? 0 : 500 });
  };

  return <>
    <div ref={slot} className="fx-map__canvas app-map__slot" />
    {pooled && clusters.map((c) => {
      const members = c.groups.flatMap((g) => g.members);
      const n = members.length, chosen = members.find((m) => m.id === selected), lead = chosen ?? members[0]!;
      const short = lead.short ? `, ${lead.short}` : '';
      let label: string, text: string, onClick: () => void;
      if (c.groups.length > 1) {
        // Plusieurs communes trop proches à ce niveau de zoom.
        label = chosen ? `${chosen.name}, et ${n - 1} autre${n > 2 ? 's' : ''} résultat${n > 2 ? 's' : ''} proche${n > 2 ? 's' : ''} : zoomer pour les séparer`
          : `${n} résultats proches : zoomer pour les séparer`;
        text = chosen ? `${chosen.name} · +${n - 1}` : `${n} proches`;
        onClick = () => zoomTo(c.groups.map((g) => g.position));
      } else {
        label = n === 1 ? `${lead.name}${short}`
          : chosen ? `${chosen.name}, et ${n - 1} autre${n > 2 ? 's' : ''} ${sameSpot}${short}`
          : `${n} résultats ${sameSpot}${short}`;
        text = n === 1 ? `${lead.name}${lead.short ? ` · ${lead.short}` : ''}`
          : chosen ? `${chosen.name} · +${n - 1}` : `${n} résultats${lead.short ? ` · ${lead.short}` : ''}`;
        onClick = () => {
          if (!chosen) onSelect(members[0]!.id);
          else if (n === 1) onSelect(null);
          else onSelect(members[(members.indexOf(chosen) + 1) % n]!.id);
        };
      }
      return createPortal(
        <button type="button" className={['fx-marker', 'app-map__pin', chosen && 'fx-marker--hot'].filter(Boolean).join(' ')}
          aria-pressed={Boolean(chosen)} aria-label={label} onClick={onClick}>
          {text}
        </button>,
        element(c.key), c.key);
    })}
  </>;
}
