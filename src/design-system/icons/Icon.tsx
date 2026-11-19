import type { ReactElement, SVGProps } from 'react';

/** Pictogrammes au trait (2 px, bouts arrondis), dessinés sur une grille de 24. */
const paths = {
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  pin: <><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  message: <path d="M4 5h16v11H9l-5 4z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8v.1" /></>,
  walk: <><circle cx="13" cy="4.5" r="1.8" /><path d="M9 21l2.5-7 3 3V21M8 11l3-3.5 4 1.5 2 3.5M11.5 14l-1-4" /></>,
  home: <><path d="M3 11.5L12 4l9 7.5" /><path d="M5.5 10v10h13V10" /></>,
  /** Maison avec porte : variante « active » (onglet Garde). */
  homeDoor: <><path d="M3 11.5L12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-5h4v5" /></>,
  send: <path d="M4 12l16-8-6 16-2.5-6.5z" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  warning: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.2v.1" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  retry: <><path d="M19 8a7.5 7.5 0 1 0 .8 6" /><path d="M19.5 3.5V8H15" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
  paperclip: <path d="M19 11.5l-7 7a4.5 4.5 0 0 1-6.4-6.4l7.5-7.5a3 3 0 0 1 4.2 4.2l-7.4 7.4a1.5 1.5 0 0 1-2.1-2.1L14.5 7.5" />,
  block: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
  xCircle: <><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  image: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" /></>,
  paw: <><circle cx="7" cy="10" r="1.8" /><circle cx="11" cy="6.5" r="1.8" /><circle cx="15.5" cy="7" r="1.8" /><circle cx="18" cy="11" r="1.8" /><path d="M8.5 17c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5c0 1.6-1.4 2.5-4 2.5s-4-.9-4-2.5z" /></>,
  stethoscope: <><path d="M6 4v5a4 4 0 0 0 8 0V4" /><path d="M10 13v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></>,
  video: <><rect x="3" y="6.5" width="13" height="11" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3" /></>,
  cards: <><rect x="6" y="3.5" width="12" height="17" rx="2.5" /><path d="M3 7v10M21 7v10" /></>,
  cardsDone: <><rect x="6" y="3.5" width="12" height="17" rx="2.5" /><path d="M9.5 12.5l2 2 3.5-4" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
} satisfies Record<string, ReactElement>;

/** Pictogrammes pleins. */
const filled = {
  heartFill: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof paths | keyof typeof filled;

export const iconNames = [...Object.keys(paths), ...Object.keys(filled)] as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Taille en px (20 par défaut, 22 dans la barre d'onglets). */
  size?: number;
  strokeWidth?: number;
  /** À fournir seulement si le pictogramme porte seul un sens. */
  title?: string;
}

export function Icon({ name, size = 20, strokeWidth = 2, title, ...rest }: IconProps) {
  const isFilled = name in filled;
  const body = isFilled ? filled[name as keyof typeof filled] : paths[name as keyof typeof paths];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFilled ? 'currentColor' : 'none'}
      stroke={isFilled ? undefined : 'currentColor'}
      strokeWidth={isFilled ? undefined : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}
