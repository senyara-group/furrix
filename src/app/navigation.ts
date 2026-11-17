import { House, Heart, HandHeart, Stethoscope, MessageCircle, PawPrint, UserRound } from 'lucide-react';

export const destinations = [
  { id: 'accueil', label: 'Accueil', icon: House },
  { id: 'rencontres', label: 'Rencontres', icon: Heart },
  { id: 'garde', label: 'Garde', icon: HandHeart },
  { id: 'services', label: 'Services', icon: Stethoscope },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'animaux', label: 'Mes animaux', icon: PawPrint },
  { id: 'compte', label: 'Mon compte', icon: UserRound },
] as const;
export type AppRoute = typeof destinations[number]['id'];
export function routeFromHash(hash: string): AppRoute {
  const candidate = hash.replace(/^#\//, '').split('?')[0];
  return destinations.find((item) => item.id === candidate)?.id ?? 'accueil';
}
