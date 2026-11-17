import type { ButtonHTMLAttributes, ImgHTMLAttributes } from 'react';
import { Icon } from '../icons/Icon';
import { cssVars, cx, type PhotoSource } from '../utils';

export interface PhotoProps extends ImgHTMLAttributes<HTMLImageElement> {
  ratio?: '4/5' | '4/3' | '1/1';
  radius?: 'xl' | '3xl' | '4xl' | '5xl';
  /** `object-position` pour cadrer le museau. */
  position?: string;
}

/** Photo d'animal ou de lieu (`alt=""` si le nom est écrit à côté). */
export function Photo({ ratio, radius, position, className, style, loading = 'lazy', ...rest }: PhotoProps) {
  const st = position ? { objectPosition: position, ...style } : style;
  return (
    <img
      className={cx('fx-photo', ratio && `fx-photo--${ratio.replace('/', '-')}`, radius && `fx-photo--r-${radius}`, className)}
      style={st}
      loading={loading}
      decoding="async"
      {...rest}
    />
  );
}

export interface MonogramProps {
  initials: string;
  size?: number;
  shape?: 'rounded' | 'circle';
  className?: string;
}

/** Initiales sur fond sable, quand il n'y a pas de photo. */
export function Monogram({ initials, size = 56, shape = 'rounded', className }: MonogramProps) {
  return (
    <span
      className={cx('fx-mono', shape === 'circle' && 'fx-mono--circle', className)}
      style={cssVars({
        '--_s': `${size}px`,
        '--_fs': size <= 32 ? '14px' : size <= 84 ? '20px' : '44px',
        // Maquettes : 56 → rayon 18 ; 72 → 20 ; 84 → 24
        ...(shape === 'rounded' && size >= 72 ? { '--_r': size >= 80 ? 'var(--fx-radius-3xl)' : 'var(--fx-radius-2xl)' } : {}),
      })}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export interface AvatarProps {
  initials: string;
  label?: string;
  onClick?: () => void;
  className?: string;
}

/** Initiales du compte dans un rond encre ; bouton si `onClick`. */
export function Avatar({ initials, label, onClick, className }: AvatarProps) {
  if (onClick) {
    return <button type="button" className={cx('fx-avatar', className)} aria-label={label ?? 'Mon compte'} onClick={onClick}>{initials}</button>;
  }
  return <span className={cx('fx-avatar', className)} aria-label={label} role={label ? 'img' : undefined}>{initials}</span>;
}

export interface WhoProps {
  photo?: PhotoSource;
  initials?: string;
  name: string;
  subtitle?: string;
  className?: string;
}

/** Personne : photo (ou monogramme), nom et sous-titre. */
export function Who({ photo, initials, name, subtitle, className }: WhoProps) {
  return (
    <div className={cx('fx-who', className)}>
      {photo
        ? <img className="fx-who__img" src={photo.src} alt={photo.alt ?? ''} style={photo.position ? { objectPosition: photo.position } : undefined} />
        : initials ? <Monogram initials={initials} /> : null}
      <div>
        <p className="fx-who__name">{name}</p>
        {subtitle ? <p className="fx-who__sub">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export interface PetSwitcherProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  name: string;
  initial?: string;
}

/** « Pour Moka » : change l'animal concerné par la recherche. */
export function PetSwitcher({ name, initial, className, ...rest }: PetSwitcherProps) {
  return (
    <button type="button" className={cx('fx-petsel', className)} aria-label={`Animal sélectionné : ${name}. Changer d'animal`} {...rest}>
      <Monogram initials={initial ?? name.charAt(0).toUpperCase()} size={30} shape="circle" />
      <span>Pour <b>{name}</b></span>
      <Icon name="chevronDown" size={16} strokeWidth={2.2} />
    </button>
  );
}
