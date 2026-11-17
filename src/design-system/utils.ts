import type { CSSProperties } from 'react';

/** Assemble des classes CSS en ignorant les valeurs vides. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}

/** Pas d'espacement disponibles (échelle de 4 px). */
export type SpaceStep = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 14 | 18;

/** Référence CSS d'un pas d'espacement : `space(4)` → `var(--fx-space-4)`. */
export const space = (n: SpaceStep): string => `var(--fx-space-${n})`;

/** Autorise les propriétés personnalisées (`--fx-…`) dans un objet `style`. */
export const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars as CSSProperties;

/** Photo utilisée par les cartes : `position` cadre l'image (`object-position`). */
export interface PhotoSource {
  src: string;
  alt?: string;
  position?: string;
}
