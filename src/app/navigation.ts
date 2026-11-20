import { defaultNav, type NavItem } from '../design-system';

export const destinations = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'plus', label: 'Plus' },
  { id: 'rencontres', label: 'Rencontres' },
  { id: 'garde', label: 'Garde' },
  { id: 'services', label: 'Services' },
  { id: 'messages', label: 'Messages' },
  { id: 'animaux', label: 'Mes animaux' },
  { id: 'compte', label: 'Mon compte' },
  { id: 'animaux-perdus', label: 'Animaux perdus' },
  { id: 'notifications', label: 'Notifications' },
] as const;

/** En-tête ordinateur (maquette « Plein air ») : Messages et le compte sont à droite, hors de cette liste. */
const inHeader: readonly string[] = ['accueil', 'rencontres', 'garde', 'services', 'animaux-perdus'];
export const headerNav: NavItem[] = destinations
  .filter(({ id }) => inHeader.includes(id))
  .map(({ id, label }) => ({ id, label, href: `#/${id}` }));

/** Cinq onglets téléphone ; les destinations personnelles sont réunies dans Plus. */
export const tabNav: NavItem[] = [
  ...defaultNav.filter((item) => item.id !== 'accueil').map((item) => ({ ...item, href: `#/${item.id}` })),
  { id: 'plus', label: 'Plus', href: '#/plus', icon: 'more' },
];
export const moreNav: NavItem[] = destinations
  .filter(({ id }) => ['accueil', 'notifications', 'animaux-perdus', 'animaux', 'compte'].includes(id))
  .map(({ id, label }) => ({ id, label, href: `#/${id}` }));

export type AppRoute = typeof destinations[number]['id'];
export function routeFromHash(hash: string): AppRoute {
  const candidate = hash.replace(/^#\//, '').split('?')[0];
  return destinations.find((item) => item.id === candidate)?.id ?? 'accueil';
}
