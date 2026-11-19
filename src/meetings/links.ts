/** Adresses de la page Messages : `#/messages?match=…&vue=…`. Module léger, partagé sans charger la page. */
export type View = 'conversation' | 'proposer' | 'rencontre' | 'annuler' | 'signaler' | 'terminer';
export const views: readonly View[] = ['conversation', 'proposer', 'rencontre', 'annuler', 'signaler', 'terminer'];
export const messagesHref = (match?: string, view?: View) => `#/messages${match ? `?match=${match}${view && view !== 'conversation' ? `&vue=${view}` : ''}` : ''}`;
