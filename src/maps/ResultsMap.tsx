import { useState, type ReactNode } from 'react';
import { IconButton, MapCard, MapFrame, MapMarker, MapMe, Note, useBreakpoint, type PhotoSource } from '../design-system';
import { MapboxLayer } from './MapboxLayer';
import { mapboxToken } from './mapbox';
import { placeSchematic } from './schematic';
import './results-map.css';

/**
 * Un résultat à placer sur la carte (établissement, gardien, animal…).
 * `position` : coordonnées autorisées renvoyées par le serveur (jamais plus précises que ce que le serveur publie).
 */
export type MapPoint = {
  id: string;
  name: string;
  /** Texte court du repère, après le nom (« ≈ 3 km »). */
  short?: string;
  /** Ligne d'information de la mini-fiche. */
  detail?: string;
  tag?: ReactNode;
  photo?: PhotoSource;
  distanceKm: number | null;
  position?: { latitude: number; longitude: number } | null;
};
export type MapStatus = 'loading' | 'ready' | 'error';

export interface ResultsMapProps {
  /** Nom accessible de la carte (« Carte des services »). */
  label: string;
  points: MapPoint[];
  /** Centre de la recherche (ville choisie ou position approximative). */
  center?: { latitude: number; longitude: number } | null;
  /** Rayon de recherche en km ; 0 = sans limite. */
  radiusKm: number;
  status: MapStatus;
  /** Repère sélectionné, partagé avec la liste. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Ouvre la fiche du résultat (depuis la mini-fiche). */
  onOpen: (id: string) => void;
  /** Message quand la recherche ne renvoie rien. */
  emptyText: string;
  /**
   * Ce que partagent des résultats placés au même point : « au même endroit » (commune d'un professionnel)
   * ou « dans le même secteur » (particuliers, position arrondie à ≈ 5 km).
   */
  sameSpot?: string;
  /** Explication des positions, affichée uniquement quand le fond géographique fonctionne. */
  positionNote?: string;
  /** Mini-fiche personnalisée (photo à charger, etc.) ; sinon `MapCard` à partir du point. */
  card?: (id: string) => ReactNode;
  className?: string;
}

/** Vrai si un fond de carte réel est configuré (jeton Mapbox public présent). */
export const hasMapBackground = () => mapboxToken() !== null;

/**
 * Carte de résultats commune (Services aujourd'hui, Garde et Rencontres ensuite).
 * Fond Mapbox quand un jeton est configuré et que tous les points ont une position autorisée ;
 * sinon (pas de jeton, jeton refusé, WebGL absent, serveur sans positions) vue schématique :
 * distance réelle arrondie, direction arbitraire mais stable. Sélection, mini-fiche et états sont communs.
 */
export function ResultsMap({ label, points, center = null, radiusKm, status, selected, onSelect, onOpen, emptyText, sameSpot = 'au même endroit', positionNote, card, className }: ResultsMapProps) {
  const { isPhone } = useBreakpoint();
  const token = mapboxToken();
  const [failed, setFailed] = useState(false);
  const real = token !== null && !failed && points.every((p) => p.position);
  const current = points.find((p) => p.id === selected) ?? null;
  // Activités placées au même endroit que la sélection (même commune) : navigation dans la mini-fiche.
  const siblings = real && current?.position
    ? points.filter((p) => p.position?.latitude === current.position!.latitude && p.position?.longitude === current.position!.longitude)
    : [];
  const index = current ? siblings.indexOf(current) : -1;
  const overlay = status === 'loading' ? 'Recherche en cours…'
    : status === 'error' ? 'Résultats indisponibles : réessaie depuis la liste.'
    : points.length === 0 ? emptyText : null;
  const scale = radiusKm > 0 ? radiusKm : Math.max(5, ...points.map((p) => p.distanceKm ?? 0));
  const spots = real ? {} : placeSchematic(points, scale);
  return <><MapFrame size="big" role="region" aria-label={label} aria-busy={status === 'loading'}
    className={['app-map', real && 'app-map--real', status !== 'ready' && 'app-map--dim', className].filter(Boolean).join(' ')}
    onClick={(e) => { if (!real && e.target === e.currentTarget) onSelect(null); }}>
    {real ? <MapboxLayer token={token} points={points} center={center} radiusKm={radiusKm} showPoints={status === 'ready'}
      selected={selected} onSelect={onSelect} onFail={() => setFailed(true)} cooperative={!isPhone} sameSpot={sameSpot} />
      : <>
        <svg className="app-map__radius" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="50" cy="48" rx="42" ry="33.6" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="app-map__scale" aria-hidden="true">{scale} km</span>
        <MapMe x={50} y={48} />
        {status === 'ready' && points.map((p) => {
          const spot = spots[p.id]!;
          return <MapMarker key={p.id} x={spot.x} y={spot.y} hot={p.id === selected} aria-pressed={p.id === selected}
            aria-label={[p.name, p.short].filter(Boolean).join(', ')}
            onClick={() => onSelect(p.id === selected ? null : p.id)}>
            {p.name}{p.short ? ` · ${p.short}` : ''}
          </MapMarker>;
        })}
      </>}
    {overlay && <p className="app-map__state" role="status">{overlay}</p>}
    {status === 'ready' && current && <div className="app-map__sheet">
      {siblings.length > 1 && <div className="app-map__group" role="group" aria-label={`Résultats ${sameSpot}`}>
        <IconButton icon="chevronLeft" label="Résultat précédent" size={18}
          onClick={() => onSelect(siblings[(index - 1 + siblings.length) % siblings.length]!.id)} />
        <span aria-live="polite">{index + 1} / {siblings.length} {sameSpot}</span>
        <IconButton icon="chevronLeft" label="Résultat suivant" size={18} className="app-map__next"
          onClick={() => onSelect(siblings[(index + 1) % siblings.length]!.id)} />
      </div>}
      {card ? card(current.id) : <MapCard photo={current.photo} initials={current.name.charAt(0).toUpperCase()} name={current.name}
        tag={current.tag} meta={current.detail} onClick={() => onOpen(current.id)} />}
    </div>}
  </MapFrame>
    {real ? positionNote && <Note>{positionNote}</Note>
      : <Note>Carte schématique : seule la distance est réelle, arrondie ; la direction des repères est indicative.</Note>}
  </>;
}
