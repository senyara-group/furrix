import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx, type PhotoSource } from '../utils';

export interface MapFrameProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'default' | 'big';
}

/** Cadre visuel de la carte. Ce n'est PAS un fond de carte : brancher le fournisseur dedans. */
export function MapFrame({ size = 'default', children, className, ...rest }: MapFrameProps) {
  return <div className={cx('fx-map', size === 'big' && 'fx-map--big', className)} {...rest}>{children}</div>;
}

export interface MapMarkerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Position en % du cadre (0 à 100). */
  x: number;
  y: number;
  /** Repère sélectionné (coquelicot). */
  hot?: boolean;
}

export function MapMarker({ x, y, hot, children, className, ...rest }: MapMarkerProps) {
  return (
    <button type="button" className={cx('fx-marker', hot && 'fx-marker--hot', className)} style={{ left: `${x}%`, top: `${y}%` }} {...rest}>
      {children}
    </button>
  );
}

/** Position de l'utilisateur (décoratif). */
export function MapMe({ x, y }: { x: number; y: number }) {
  return <span className="fx-map__me" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true" />;
}

export interface MapButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
}

export function MapButton({ children, icon = 'map', className, ...rest }: MapButtonProps) {
  return (
    <button type="button" className={cx('fx-map__btn', className)} {...rest}>
      <Icon name={icon} size={16} strokeWidth={2.2} />
      {children}
    </button>
  );
}

export function MapNote({ children }: { children: ReactNode }) {
  return <div className="fx-map__note">{children}</div>;
}

export interface MapCardProps {
  /** Photo, ou à défaut `initials` (activité sans photo). */
  photo?: PhotoSource;
  initials?: string;
  name: ReactNode;
  tag?: ReactNode;
  meta?: ReactNode;
  linkLabel?: string;
  onClick?: () => void;
}

/** Mini-fiche flottante en bas de la grande carte. */
export function MapCard({ photo, initials, name, tag, meta, linkLabel = 'Voir la fiche', onClick }: MapCardProps) {
  return (
    <button type="button" className="fx-mapcard" onClick={onClick}>
      {photo ? <img src={photo.src} alt={photo.alt ?? ''} /> : <span className="fx-mono fx-mapcard__mono" aria-hidden="true">{initials}</span>}
      <span className="fx-mapcard__body">
        <span className="fx-res__name">{name}</span>
        {tag}
        {meta ? <span className="fx-res__meta">{meta}</span> : null}
      </span>
      <span className="fx-mapcard__link">{linkLabel}</span>
    </button>
  );
}
