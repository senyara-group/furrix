/** Adresses de la page Messages : `#/messages?match=…&vue=…`. Module léger, partagé sans charger la page. */
export type View = 'conversation' | 'proposer' | 'rencontre' | 'annuler' | 'signaler';
export const views: readonly View[] = ['conversation', 'proposer', 'rencontre', 'annuler', 'signaler'];
export const messagesHref = (match?: string, view?: View) => `#/messages${match ? `?match=${match}${view && view !== 'conversation' ? `&vue=${view}` : ''}` : ''}`;
