import type { ReactNode } from 'react';
import { MapCard, MapFrame, MapMarker, MapMe, type PhotoSource } from '../design-system';
import { placeSchematic } from './schematic';
import './results-map.css';

/**
 * Un résultat à placer sur la carte (établissement, gardien, animal…).
 * `position` : coordonnées autorisées renvoyées par le serveur, si elles existent.
 * Tant qu'aucun fond de carte n'est branché, seul `distanceKm` sert (vue schématique).
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
  radiusKm: number;
  status: MapStatus;
  /** Repère sélectionné, partagé avec la liste. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Ouvre la fiche du résultat (depuis la mini-fiche). */
  onOpen: (id: string) => void;
  /** Message quand la recherche ne renvoie rien. */
  emptyText: string;
  className?: string;
}

/**
 * Carte de résultats commune (Services aujourd'hui, Garde et Rencontres ensuite).
 * Rendu actuel : vue schématique dans le cadre du design system — la distance est réelle (arrondie),
 * la direction est arbitraire mais stable. Le fond de carte (fournisseur à brancher) remplacera ce rendu
 * quand les points auront une `position` autorisée ; la sélection, la mini-fiche et les états restent ici.
 */
export function ResultsMap({ label, points, radiusKm, status, selected, onSelect, onOpen, emptyText, className }: ResultsMapProps) {
  const spots = placeSchematic(points, radiusKm);
  const current = points.find((p) => p.id === selected) ?? null;
  const overlay = status === 'loading' ? 'Recherche en cours…'
    : status === 'error' ? 'Résultats indisponibles : réessaie depuis la liste.'
    : points.length === 0 ? emptyText : null;
  return <MapFrame size="big" role="region" aria-label={label} aria-busy={status === 'loading'}
    className={['app-map', status !== 'ready' && 'app-map--dim', className].filter(Boolean).join(' ')}
    onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
    <svg className="app-map__radius" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <ellipse cx="50" cy="48" rx="42" ry="33.6" vectorEffect="non-scaling-stroke" />
    </svg>
    <span className="app-map__scale" aria-hidden="true">{radiusKm} km</span>
    <MapMe x={50} y={48} />
    {status === 'ready' && points.map((p) => {
      const spot = spots[p.id]!;
      return <MapMarker key={p.id} x={spot.x} y={spot.y} hot={p.id === selected} aria-pressed={p.id === selected}
        aria-label={[p.name, p.short].filter(Boolean).join(', ')}
        onClick={() => onSelect(p.id === selected ? null : p.id)}>
        {p.name}{p.short ? ` · ${p.short}` : ''}
      </MapMarker>;
    })}
    {overlay && <p className="app-map__state" role="status">{overlay}</p>}
    {status === 'ready' && current && <MapCard photo={current.photo} initials={current.name.charAt(0).toUpperCase()} name={current.name}
      tag={current.tag} meta={current.detail} onClick={() => onOpen(current.id)} />}
  </MapFrame>;
}
