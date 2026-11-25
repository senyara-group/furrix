import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cx, type PhotoSource } from '../utils';
import { Text } from './Text';

type Clickable = HTMLAttributes<HTMLElement> & { as?: ElementType; href?: string; disabled?: boolean };

const imgStyle = (p: PhotoSource) => (p.position ? { objectPosition: p.position } : undefined);

/** Grille d'`AnimalCard` : 2 colonnes sur téléphone, plus sur ordinateur. */
export function AnimalGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('fx-agrid', className)}>{children}</div>;
}

export interface AnimalCardProps extends Clickable {
  photo: PhotoSource;
  name: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
}

/** Carte d'un animal : photo 4/5, nom, description et contexte. */
export function AnimalCard({ photo, name, description, meta, as: Tag = 'button', className, ...rest }: AnimalCardProps) {
  return (
    <Tag className={cx('fx-acard', className)} {...(Tag === 'button' ? { type: 'button' } : {})} {...rest}>
      <img className="fx-photo fx-photo--4-5" src={photo.src} alt={photo.alt ?? ''} style={imgStyle(photo)} loading="lazy" />
      <span className="fx-acard__name">{name}</span>
      {description ? <span className="fx-t-body">{description}</span> : null}
      {meta ? <span className="fx-t-body-sm">{meta}</span> : null}
    </Tag>
  );
}

export interface ResultRowProps extends Clickable {
  photo?: PhotoSource;
  initials?: string;
  name: ReactNode;
  /** Un `Tag` (« Pro vérifié »). */
  tag?: ReactNode;
  meta?: ReactNode;
  price?: { value: ReactNode; unit?: ReactNode };
  /** Information discrète en haut à droite, à la place du prix (date du dernier message). */
  aside?: ReactNode;
}

/** Ligne de résultat (gardien, professionnel) avec prix à droite. */
export function ResultRow({ photo, initials, name, tag, meta, price, aside, as: Tag = 'button', className, ...rest }: ResultRowProps) {
  return (
    <Tag className={cx('fx-res', className)} {...(Tag === 'button' ? { type: 'button' } : {})} {...rest}>
      {photo
        ? <img className="fx-res__img" src={photo.src} alt={photo.alt ?? ''} style={imgStyle(photo)} loading="lazy" />
        : initials ? <span className="fx-mono fx-res__mono" aria-hidden="true">{initials}</span> : null}
      <span className="fx-res__body">
        <span className="fx-res__name">{name}</span>
        {tag}
        {meta ? <span className="fx-res__meta">{meta}</span> : null}
      </span>
      {price ? (
        <span className="fx-res__price">
          <b>{price.value}</b>
          {price.unit ? <span>{price.unit}</span> : null}
        </span>
      ) : aside ? <span className="fx-res__aside">{aside}</span> : null}
    </Tag>
  );
}

export function ResultList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cx('fx-reslist', className)}>{children}</ul>;
}

/** Titre d'une liste (« 3 gardiens ») avec une action à droite. */
export function ListHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="fx-listhead">
      <Text variant="h2">{title}</Text>
      {action}
    </div>
  );
}

export function UseGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('fx-uses', className)}>{children}</div>;
}

export interface UseCardProps extends Omit<Clickable, 'title'> {
  image: PhotoSource;
  title: ReactNode;
  children?: ReactNode;
}

/** Grande carte d'entrée d'un usage (Rencontres, Garde, Services). */
export function UseCard({ image, title, children, as: Tag = 'a', className, ...rest }: UseCardProps) {
  return (
    <Tag className={cx('fx-use', className)} {...rest}>
      <img className="fx-use__img" src={image.src} alt={image.alt ?? ''} style={imgStyle(image)} loading="lazy" />
      <span className="fx-use__body">
        <span className="fx-use__title">
          {title}
          <span className="fx-use__arrow"><Icon name="arrowRight" size={18} /></span>
        </span>
        {children ? <span className="fx-use__text">{children}</span> : null}
      </span>
    </Tag>
  );
}

/** Une ou deux photos en tête de fiche. */
export function HeroGallery({ photos, className }: { photos: PhotoSource[]; className?: string }) {
  return (
    <div className={cx('fx-hero', className)}>
      {photos.slice(0, 2).map((p) => <img key={p.src} src={p.src} alt={p.alt ?? ''} style={imgStyle(p)} />)}
    </div>
  );
}

export interface WhenBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actionLabel?: string;
  onClick?: () => void;
  className?: string;
}

/** Rappel des dates d'une recherche, à toucher pour les modifier. */
export function WhenBar({ title, subtitle, actionLabel = 'Modifier', onClick, className }: WhenBarProps) {
  return (
    <button type="button" className={cx('fx-when', className)} onClick={onClick}>
      <span className="fx-when__icon"><Icon name="calendar" size={20} /></span>
      <span>
        <span className="fx-when__title">{title}</span>
        {subtitle ? <span className="fx-when__sub">{subtitle}</span> : null}
      </span>
      <span className="fx-when__edit">{actionLabel}</span>
    </button>
  );
}

/** Résultats à gauche, carte à droite (ordinateur). */
export function SearchLayout({ results, map, className }: { results: ReactNode; map: ReactNode; className?: string }) {
  return (
    <div className={cx('fx-search', className)}>
      <div>{results}</div>
      <div className="fx-search__map">{map}</div>
    </div>
  );
}

export function FollowGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('fx-follow', className)}>{children}</div>;
}

export interface FollowItemProps {
  kicker?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Élément du bloc « À suivre » de l'accueil. */
export function FollowItem({ kicker, title, children, footer }: FollowItemProps) {
  return (
    <div className="fx-follow__item">
      {kicker ? <Text variant="kicker">{kicker}</Text> : null}
      <p className="fx-follow__title">{title}</p>
      {children ? <Text variant="body">{children}</Text> : null}
      {footer ? <div className="fx-follow__foot">{footer}</div> : null}
    </div>
  );
}

export interface HomeIntroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Un `Button` `main` `hero` : l'action principale de l'accueil. */
  aside?: ReactNode;
  className?: string;
}

export function HomeIntro({ eyebrow, title, aside, className }: HomeIntroProps) {
  return (
    <div className={cx('fx-intro', className)}>
      <div>
        {eyebrow ? <p className="fx-intro__eyebrow">{eyebrow}</p> : null}
        <Text variant="display" className="fx-intro__title">{title}</Text>
      </div>
      {aside ? <div className="fx-intro__aside">{aside}</div> : null}
    </div>
  );
}
