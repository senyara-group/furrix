import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';

export type StepState = 'done' | 'now' | 'todo' | 'stop';

const stepSr: Record<StepState, string> = {
  done: ' : terminé',
  now: ' : en cours',
  todo: ' : à venir',
  stop: ' : interrompu',
};

export interface StepsProps {
  steps: Array<{ label: string; state?: StepState }>;
  label?: string;
  className?: string;
}

/** Avancement d'une demande (Demande → Réponse → Paiement → Garde). */
export function Steps({ steps, label = 'Étapes', className }: StepsProps) {
  return (
    <ol className={cx('fx-steps', className)} aria-label={label}>
      {steps.map((s) => {
        const state = s.state ?? 'todo';
        return (
          <li key={s.label} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="fx-steps__bar" />
            <span>{s.label}</span>
            <span className="fx-vh">{stepSr[state]}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Récapitulatif (liste de définitions) ; contient des `RecapRow`. */
export function Recap({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx('fx-recap', className)}>{children}</dl>;
}

export interface RecapRowProps {
  label: ReactNode;
  value: ReactNode;
  total?: boolean;
  /** Montant non décidé : écrire « à définir », jamais un chiffre inventé. */
  open?: boolean;
}

export function RecapRow({ label, value, total, open }: RecapRowProps) {
  return (
    <div className={cx('fx-recap__row', total && 'fx-recap__row--total', open && 'fx-recap__row--open')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Faits clés en grille de trois (six au plus). */
export function Facts({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <div className={cx('fx-facts', className)}>
      {items.map((it) => (
        <div className="fx-fact" key={it.label}>
          <span className="fx-t-kicker">{it.label}</span>
          <b>{it.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Journal daté, du plus récent au plus ancien ; contient des `LogItem`. */
export function Log({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cx('fx-log', className)}>{children}</ol>;
}

export function LogItem({ time, children, media }: { time: ReactNode; children: ReactNode; media?: ReactNode }) {
  return (
    <li>
      <span className="fx-log__time">{time}</span>
      <div>
        <p className="fx-t-body">{children}</p>
        {media ? <div className="fx-log__media">{media}</div> : null}
      </div>
    </li>
  );
}

/** Points vérifiés, avec une coche. */
export function CheckList({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cx('fx-checklist', className)}>
      {items.map((it, i) => (
        <li key={i}>
          <Icon name="check" size={18} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
