import type { ElementType, HTMLAttributes } from 'react';
import { cx } from '../utils';

export type TextVariant =
  | 'display' | 'h1' | 'bar-title' | 'h2' | 'h3' | 'use-title' | 'name' | 'row-name' | 'card-name' | 'match-title'
  | 'body' | 'body-sm' | 'label' | 'kicker' | 'eyebrow' | 'caption';

const defaultTag: Partial<Record<TextVariant, ElementType>> = {
  display: 'h1',
  h1: 'h1',
  'bar-title': 'h1',
  h2: 'h2',
  h3: 'h3',
  'match-title': 'h2',
};

export interface TextProps extends HTMLAttributes<HTMLElement> {
  /** Rôle typographique (voir tokens : Bricolage pour les titres, Figtree pour le texte). */
  variant?: TextVariant;
  /** Balise rendue ; par défaut déduite du rôle (`h1`, `h2`, `p`…). */
  as?: ElementType;
  tone?: 'ink' | 'soft' | 'muted';
  /** Chiffres à chasse fixe (prix, heures). */
  tabular?: boolean;
}

export function Text({ variant = 'body', as, tone, tabular, className, ...rest }: TextProps) {
  const Tag = as ?? defaultTag[variant] ?? 'p';
  return <Tag className={cx(`fx-t-${variant}`, tone && `fx-c-${tone}`, tabular && 'fx-num', className)} {...rest} />;
}
