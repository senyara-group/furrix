import { defaultNav, type NavItem } from '../design-system';

export const destinations = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'rencontres', label: 'Rencontres' },
  { id: 'garde', label: 'Garde' },
  { id: 'services', label: 'Services' },
  { id: 'messages', label: 'Messages' },
  { id: 'animaux', label: 'Mes animaux' },
  { id: 'compte', label: 'Mon compte' },
  { id: 'animaux-perdus', label: 'Animaux perdus' },
] as const;

/** En-tête ordinateur (maquette « Plein air ») : Messages et le compte sont à droite, hors de cette liste. */
const inHeader: readonly string[] = ['accueil', 'rencontres', 'garde', 'services', 'animaux-perdus'];
export const headerNav: NavItem[] = destinations
  .filter(({ id }) => inHeader.includes(id))
  .map(({ id, label }) => ({ id, label, href: `#/${id}` }));

/** Onglets téléphone : ceux du design system (mêmes libellés et pictogrammes), en routes de l'app. */
export const tabNav: NavItem[] = defaultNav.map((item) => ({ ...item, href: `#/${item.id}` }));

export type AppRoute = typeof destinations[number]['id'];
export function routeFromHash(hash: string): AppRoute {
  const candidate = hash.replace(/^#\//, '').split('?')[0];
  return destinations.find((item) => item.id === candidate)?.id ?? 'accueil';
}
