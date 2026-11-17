import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../utils';
import { Text } from './Text';

export type Status = 'draft' | 'wait' | 'todo' | 'ok' | 'stop' | 'alert';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: Status;
  /** Toujours écrire le mot (« En attente de Sam ») : jamais la couleur seule. */
  children: ReactNode;
}

export function StatusBadge({ status, className, children, ...rest }: StatusBadgeProps) {
  return (
    <span className={cx('fx-status', `fx-status--${status}`, className)} {...rest}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  kind?: 'goal' | 'pro';
}

export function Tag({ kind, className, ...rest }: TagProps) {
  return <span className={cx('fx-tag', kind && `fx-tag--${kind}`, className)} {...rest} />;
}

export type AlertTone = 'info' | 'ok' | 'warn' | 'err';
const alertIcon: Record<AlertTone, IconName> = { info: 'info', ok: 'check', warn: 'warning', err: 'xCircle' };

export interface AlertProps {
  tone: AlertTone;
  /** Le fait (« La demande n'est pas partie »). */
  title: ReactNode;
  /** La suite (« Réessaie l'envoi »). */
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Alert({ tone, title, children, actions, className }: AlertProps) {
  return (
    <div className={cx('fx-alert', `fx-alert--${tone}`, className)} role={tone === 'err' ? 'alert' : 'status'}>
      <span className="fx-alert__icon"><Icon name={alertIcon[tone]} size={22} /></span>
      <div className="fx-alert__body">
        <p className="fx-alert__title">{title}</p>
        {children ? <p className="fx-alert__text">{children}</p> : null}
        {actions ? <div className="fx-alert__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Alerte flottante en haut de l'écran ; l'appelant gère l'affichage. */
export function Toast({ className, ...props }: AlertProps) {
  return <Alert {...props} className={cx('fx-toast', className)} />;
}

export function Note({ icon = 'info', children, className }: { icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <div className={cx('fx-note', className)}>
      <Icon name={icon} size={18} />
      <span>{children}</span>
    </div>
  );
}

export interface EmptyStateProps {
  icon: IconName;
  title: ReactNode;
  children?: ReactNode;
  /** Un `Button` `out` `sm`. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cx('fx-empty', className)}>
      <span className="fx-empty__icon"><Icon name={icon} size={28} /></span>
      <Text variant="h2">{title}</Text>
      {children ? <Text variant="body">{children}</Text> : null}
      {action}
    </div>
  );
}

/** Indicateur de chargement décoratif ; le texte d'état est porté par le composant parent. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <span className={cx('fx-spinner', className)} style={{ width: size, height: size }} aria-hidden="true" />;
}

export interface LoadingProps {
  /** Ce qui se charge (« Chargement des profils… »). */
  label: ReactNode;
  className?: string;
}

/** État de chargement d'une zone, annoncé poliment aux lecteurs d'écran. */
export function Loading({ label, className }: LoadingProps) {
  return (
    <div className={cx('fx-loading', className)} role="status" aria-live="polite">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}
