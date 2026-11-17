import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cssVars, cx, space, type SpaceStep } from '../utils';
import { BackLink } from './Button';
import { Text } from './Text';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Ton apaisé pour les moments sensibles (paiement, annulation). */
  calm?: boolean;
  as?: ElementType;
}

/** Panneau blanc à anneau de 1 px, sans ombre portée. */
export function Card({ calm, as: Tag = 'div', className, ...rest }: CardProps) {
  return <Tag className={cx('fx-card', calm && 'fx-card--calm', className)} {...rest} />;
}

export interface FlowProps extends HTMLAttributes<HTMLElement> {
  /** Écart en pas de 4 px. */
  gap?: SpaceStep;
  as?: ElementType;
}

export function Stack({ gap, as: Tag = 'div', className, style, ...rest }: FlowProps) {
  return <Tag className={cx('fx-stack', className)} style={gap ? { ...cssVars({ '--fx-gap': space(gap) }), ...style } : style} {...rest} />;
}

export function Row({ gap, as: Tag = 'div', className, style, ...rest }: FlowProps) {
  return <Tag className={cx('fx-row', className)} style={gap ? { ...cssVars({ '--fx-gap': space(gap) }), ...style } : style} {...rest} />;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cx('fx-sep', className)} />;
}

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
  /** Occupe toute la hauteur (conversation). */
  fill?: boolean;
}

/** Contenu de page : marges et largeur maximale. */
export function Page({ fill, className, ...rest }: PageProps) {
  return <div className={cx('fx-page', fill && 'fx-page--fill', className)} {...rest} />;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Un `StatusBadge` à droite du titre. */
  status?: ReactNode;
  back?: { label: ReactNode; onClick?: () => void };
  /** Sur téléphone le titre est dans la `PhoneBar` ; forcer son affichage ici. */
  showTitleOnPhone?: boolean;
  className?: string;
}

export function PageHeader({ title, subtitle, status, back, showTitleOnPhone, className }: PageHeaderProps) {
  return (
    <header className={cx('fx-pagehead', showTitleOnPhone && 'fx-pagehead--phone', className)}>
      {back ? <BackLink onClick={back.onClick}>{back.label}</BackLink> : null}
      <div className="fx-pagehead__row">
        <Text variant="h1" className="fx-pagehead__title">{title}</Text>
        {status}
      </div>
      {subtitle ? <p className="fx-pagehead__sub">{subtitle}</p> : null}
    </header>
  );
}

export interface DetailLayoutProps {
  children: ReactNode;
  aside?: ReactNode;
  /** Une `ActionBar` (collée en bas sur téléphone). */
  actions?: ReactNode;
  className?: string;
}

export function DetailLayout({ children, aside, actions, className }: DetailLayoutProps) {
  return (
    <div className={cx('fx-detail', className)}>
      <div className="fx-detail__main fx-stack">{children}</div>
      {aside ? <aside className="fx-detail__side">{aside}</aside> : null}
      {actions}
    </div>
  );
}

/** Actions d'un écran : la première est l'action principale. */
export function ActionBar({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('fx-actions', className)} {...rest} />;
}
