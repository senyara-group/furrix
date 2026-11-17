import { forwardRef, type ButtonHTMLAttributes, type ElementType, type MouseEvent, type ReactNode, type Ref } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../utils';
import { Spinner } from './Feedback';

export type ButtonVariant = 'main' | 'ink' | 'out' | 'quiet' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'hero';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLElement> {
  /** `main` = coquelicot, UNE seule action principale par écran. */
  variant?: ButtonVariant;
  /** `md` 52 px, `sm` 44 px, `hero` 64 px (56 px sur téléphone). */
  size?: ButtonSize;
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  /** `as="a"` + `href` en fait un lien. */
  as?: ElementType;
  href?: string;
  /**
   * Action en cours (envoi, enregistrement) : indicateur, `aria-busy` et clics ignorés.
   * Le bouton garde le focus, contrairement à `disabled`.
   */
  loading?: boolean;
  /** Texte lu pendant le chargement, ajouté au libellé (« en cours » par défaut). */
  loadingLabel?: string;
  children?: ReactNode;
}

export const Button = forwardRef(function Button(
  { as, variant = 'main', size = 'md', block, icon, iconRight, loading = false, loadingLabel = 'en cours', className, children, onClick, ...rest }: ButtonProps,
  ref: Ref<HTMLElement>,
) {
  const Tag = as ?? 'button';
  const iconSize = size === 'hero' ? 22 : 20;
  const glyph = loading ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} /> : null;
  const lead = glyph && size === 'hero' ? <span className="fx-btn__bubble">{glyph}</span> : glyph;
  const guard = (e: MouseEvent<HTMLElement>) => {
    if (loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <Tag
      ref={ref}
      className={cx('fx-btn', `fx-btn--${variant}`, size !== 'md' && `fx-btn--${size}`, block && 'fx-btn--block', className)}
      {...(Tag === 'button' ? { type: rest.type ?? 'button' } : {})}
      {...rest}
      aria-busy={loading || undefined}
      onClick={guard}
    >
      {lead}
      {children}
      {loading ? <span className="fx-vh">{`, ${loadingLabel}`}</span> : null}
      {iconRight && !loading ? <Icon name={iconRight} size={iconSize} /> : null}
    </Tag>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Obligatoire : nom lu par les lecteurs d'écran (« Filtres », « Retour »). */
  label: string;
  size?: number;
}

/** Bouton rond à pictogramme seul ; cible tactile 44 px. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 20, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx('fx-ib', className)} aria-label={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
});

export interface SendButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label?: string;
  /** Envoi en cours : indicateur et `aria-busy`. */
  loading?: boolean;
}

/** Bouton d'envoi d'un message. */
export const SendButton = forwardRef<HTMLButtonElement, SendButtonProps>(function SendButton(
  { label = 'Envoyer', loading = false, className, type = 'button', onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('fx-send', className)}
      aria-label={loading ? `${label}, en cours` : label}
      aria-busy={loading || undefined}
      {...rest}
      onClick={(e) => {
        if (loading) e.preventDefault();
        else onClick?.(e);
      }}
    >
      {loading ? <Spinner size={20} /> : <Icon name="arrowRight" />}
    </button>
  );
});

/** Lien « Retour » avec chevron, visible sur ordinateur uniquement. */
export const BackLink = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function BackLink(
  { className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx('fx-backl', className)} {...rest}>
      <Icon name="chevronLeft" size={18} />
      {children}
    </button>
  );
});
