import type { StepState, Status } from '../design-system';
import type { MySitting, SitterKind, SitterOutdoor, SittingService } from './types';

export const serviceLabel: Record<SittingService, string> = {
  chez_gardien: 'Chez le gardien', domicile: 'À domicile', visite: 'Visites', promenade: 'Promenades',
};
/** « garde chez soi », « garde à domicile »… (sous-titre d'une fiche). */
export const serviceShort: Record<SittingService, string> = {
  chez_gardien: 'garde chez soi', domicile: 'garde à domicile', visite: 'visites à domicile', promenade: 'promenades',
};
export const unitLabel: Record<SittingService, [string, string]> = {
  chez_gardien: ['nuit', 'nuits'], domicile: ['nuit', 'nuits'], visite: ['visite', 'visites'], promenade: ['promenade', 'promenades'],
};
export const SERVICES: SittingService[] = ['chez_gardien', 'domicile', 'visite', 'promenade'];
export const kindLabel: Record<SitterKind, string> = { particulier: 'Particulier', professionnel: 'Professionnel' };
export const outdoorLabel: Record<SitterOutdoor, string> = { jardin_clos: 'Jardin clos', jardin: 'Jardin', sans_jardin: 'Sans jardin' };
export const speciesPlural: Record<string, string> = {
  chien: 'Chiens', chat: 'Chats', lapin: 'Lapins', oiseau: 'Oiseaux', reptile: 'Reptiles', rongeur: 'Rongeurs', cheval: 'Chevaux', ferme: 'Animaux de ferme',
};
export const speciesLabel: Record<string, string> = {
  chien: 'Chien', chat: 'Chat', lapin: 'Lapin', oiseau: 'Oiseau', reptile: 'Reptile', rongeur: 'Rongeur', cheval: 'Cheval', ferme: 'Animal de ferme',
};

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const euroShort = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
/** 2000 → « 20,00 € » */
export const money = (cents: number) => euro.format(cents / 100);
/** 2000 → « 20 € » ; 1250 → « 12,50 € » */
export const price = (cents: number) => cents % 100 ? euro.format(cents / 100) : euroShort.format(cents / 100);
export const units = (service: SittingService, n: number) => `${n} ${unitLabel[service][n > 1 ? 1 : 0]}`;
export const initial = (name?: string | null) => (name?.trim() || '?').charAt(0).toUpperCase();
export const nameOf = (name?: string | null, fallback = 'Le gardien') => name?.trim() || fallback;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', o);
const hourOf = (d: Date) => d.getMinutes() ? `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()} h`;
/** « Ven. 21 nov., 18 h » */
export const when = (iso: string) => { const d = new Date(iso); return `${cap(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d))}, ${hourOf(d)}`; };
/** « Ven. 21 nov., 18 h → dim. 23 nov., 18 h » */
export const period = (from: string, to: string) => `${when(from)} → ${when(to).charAt(0).toLowerCase()}${when(to).slice(1)}`;
/** « Ven. 21 → dim. 23 nov. » */
export const shortPeriod = (from: string, to: string) => {
  const a = new Date(from), b = new Date(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const left = cap(fmt(sameMonth ? { weekday: 'short', day: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }).format(a));
  return `${left} → ${fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(b)}`;
};
/** « lun. 10 nov., 18:42 » */
export const stamp = (iso: string) => fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const clock = (iso: string) => fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
/** Nuits (garde de nuit) ou jours (une visite, une promenade par jour), comme la base, à l'heure de Paris. */
export function countUnits(service: SittingService, from: string, to: string) {
  const day = (iso: string) => { const [y = 0, m = 1, d = 1] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)).split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400_000; };
  const diff = day(to) - day(from);
  return service === 'chez_gardien' || service === 'domicile' ? Math.max(1, diff) : diff + 1;
}

/** Où en est la garde : phase lisible, à partir du statut et des dates. */
export type Phase = 'pending' | 'withdrawn' | 'declined' | 'expired' | 'accepted' | 'booked' | 'ongoing' | 'done' | 'cancelled';
export function phaseOf(s: Pick<MySitting, 'status' | 'starts_at' | 'ends_at'>, now = Date.now()): Phase {
  if (s.status !== 'confirmed') return s.status;
  if (now >= new Date(s.ends_at).getTime()) return 'done';
  return now >= new Date(s.starts_at).getTime() ? 'ongoing' : 'booked';
}
const STEPS = ['Demande', 'Accord', 'Paiement', 'Garde', 'Terminée'];
const reachedOf: Record<Phase, [number, boolean?]> = {
  pending: [1], withdrawn: [1, true], declined: [1, true], expired: [1, true], accepted: [2], booked: [3], ongoing: [3], done: [5], cancelled: [3, true],
};
export const stepsOf = (phase: Phase) => {
  const [reached, stopped] = reachedOf[phase];
  return STEPS.map((label, i): { label: string; state: StepState } => ({ label, state: i < reached ? 'done' : i === reached ? (stopped ? 'stop' : 'now') : 'todo' }));
};
export function statusOf(phase: Phase, role: 'owner' | 'sitter', other: string, cancelledByMe?: boolean): { status: Status; label: string } {
  switch (phase) {
    case 'pending': return role === 'owner' ? { status: 'wait', label: `En attente de ${other}` } : { status: 'todo', label: 'À toi de répondre' };
    case 'withdrawn': return { status: 'stop', label: 'Retirée' };
    case 'declined': return { status: 'stop', label: 'Refusée' };
    case 'expired': return { status: 'stop', label: 'Expirée sans réponse' };
    case 'accepted': return role === 'owner' ? { status: 'todo', label: 'Acceptée · paiement à faire' } : { status: 'wait', label: `Acceptée · paiement de ${other} attendu` };
    case 'booked': return { status: 'ok', label: 'Réservée' };
    case 'ongoing': return { status: 'ok', label: 'Garde en cours' };
    case 'done': return { status: 'ok', label: 'Terminée' };
    case 'cancelled': return { status: 'stop', label: cancelledByMe ? 'Annulée par toi' : `Annulée par ${other}` };
  }
}
