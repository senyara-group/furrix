/** Adresses de l'espace garde : `#/garde?…`. Module léger, partagé sans charger la page (Messages, accueil). */
export type GardeView = 'recherche' | 'fiche' | 'demander' | 'suivi' | 'paiement' | 'annuler' | 'probleme' | 'conversation' | 'mes-gardes' | 'profil';
export type GardeParams = { vue?: GardeView; gardien?: string; demande?: string; proprio?: string };
export function gardeHref(p: GardeParams = {}) {
  const q = new URLSearchParams();
  if (p.vue && p.vue !== 'recherche') q.set('vue', p.vue);
  if (p.gardien) q.set('gardien', p.gardien);
  if (p.demande) q.set('demande', p.demande);
  if (p.proprio) q.set('proprio', p.proprio);
  const s = q.toString();
  return `#/garde${s ? `?${s}` : ''}`;
}
/** Conversation entre un propriétaire et un gardien, vue par l'un ou l'autre. */
export const chatHref = (owner: string, sitter: string) => gardeHref({ vue: 'conversation', proprio: owner, gardien: sitter });
export const views: readonly GardeView[] = ['recherche', 'fiche', 'demander', 'suivi', 'paiement', 'annuler', 'probleme', 'conversation', 'mes-gardes', 'profil'];
