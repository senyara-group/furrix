import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../utils';

export interface ToggleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** État choisi (posé dans `aria-pressed`). */
  pressed?: boolean;
}

/** Une puce à bascule isolée (filtre). */
export function Chip({ pressed = false, className, type = 'button', ...rest }: ToggleProps) {
  return <button type={type} className={cx('fx-chip', className)} aria-pressed={pressed} {...rest} />;
}

/** Un grand bouton de choix à bascule. */
export function Option({ pressed = false, className, type = 'button', ...rest }: ToggleProps) {
  return <button type={type} className={cx('fx-opt', className)} aria-pressed={pressed} {...rest} />;
}

export interface ChoiceOption<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: IconName;
  disabled?: boolean;
}

interface ChoiceBase<V extends string> {
  options: ChoiceOption<V>[];
  className?: string;
  'aria-label'?: string;
}
interface SingleChoice<V extends string> extends ChoiceBase<V> {
  multiple?: false;
  value: V | null;
  onChange: (value: V) => void;
}
interface MultipleChoice<V extends string> extends ChoiceBase<V> {
  multiple: true;
  value: V[];
  onChange: (value: V[]) => void;
}
export type ChoiceGroupProps<V extends string = string> = SingleChoice<V> | MultipleChoice<V>;

function useChoice<V extends string>(p: ChoiceGroupProps<V>) {
  const isOn = (v: V) => (p.multiple ? p.value.includes(v) : p.value === v);
  const pick = (v: V) => {
    if (p.multiple) p.onChange(p.value.includes(v) ? p.value.filter((x) => x !== v) : [...p.value, v]);
    else p.onChange(v);
  };
  return { isOn, pick };
}

/** Filtres en puces sur une ligne qui défile, choix simple ou multiple. */
export function ChipGroup<V extends string>(props: ChoiceGroupProps<V>) {
  const { isOn, pick } = useChoice(props);
  return (
    <div className={cx('fx-chips', props.className)} role="group" aria-label={props['aria-label']}>
      {props.options.map((o) => (
        <Chip key={o.value} pressed={isOn(o.value)} disabled={o.disabled} onClick={() => pick(o.value)}>{o.label}</Chip>
      ))}
    </div>
  );
}

/** Grandes cartes de choix. */
export function OptionGroup<V extends string>(props: ChoiceGroupProps<V>) {
  const { isOn, pick } = useChoice(props);
  return (
    <div className={cx('fx-opts', props.className)} role="group" aria-label={props['aria-label']}>
      {props.options.map((o) => (
        <Option key={o.value} pressed={isOn(o.value)} disabled={o.disabled} onClick={() => pick(o.value)}>{o.label}</Option>
      ))}
    </div>
  );
}

/** Grille de créneaux horaires. */
export function SlotGrid<V extends string>(props: ChoiceGroupProps<V>) {
  const { isOn, pick } = useChoice(props);
  return (
    <div className={cx('fx-slots', props.className)} role="group" aria-label={props['aria-label']}>
      {props.options.map((o) => (
        <Option key={o.value} pressed={isOn(o.value)} disabled={o.disabled} className="fx-num" onClick={() => pick(o.value)}>{o.label}</Option>
      ))}
    </div>
  );
}

export interface SegmentedProps<V extends string = string> {
  options: ChoiceOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Occupe toute la largeur. */
  fill?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Bascule entre 2 à 4 vues (liste / carte). */
export function Segmented<V extends string>({ options, value, onChange, fill, className, ...rest }: SegmentedProps<V>) {
  return (
    <div className={cx('fx-seg', fill && 'fx-seg--fill', className)} role="group" aria-label={rest['aria-label']}>
      {options.map((o) => (
        <button key={o.value} type="button" className="fx-seg__btn" aria-pressed={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} size={18} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
