import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Alert, Button, Card, Loading, Note, Row, Stack, StatusBadge, Text, type Status } from '../design-system';
import type { FurrixClient } from '../services/supabaseClient';
import { openSecureBrowser } from '../platform/secureBrowser';
import { PayoutError, payoutStatus, startPayout, type PayoutProblem, type PayoutStatus } from './payouts';

const badge: Record<PayoutStatus, { status: Status; label: string }> = {
  not_started: { status: 'draft', label: 'Pas commencée' },
  incomplete: { status: 'todo', label: 'À compléter' },
  pending: { status: 'wait', label: 'Vérification en cours' },
  ready: { status: 'ok', label: 'Complète' },
};
const explain: Record<PayoutStatus, string> = {
  not_started: 'Pour recevoir le paiement de tes gardes, Stripe, notre prestataire de paiement, doit vérifier ton identité et ton compte bancaire. Tu les saisis directement chez Stripe : Furrix ne les voit pas.',
  incomplete: 'Des informations manquent encore chez Stripe. Reprends l’inscription là où tu l’as laissée.',
  pending: 'Stripe vérifie tes informations. Cela peut prendre un peu de temps, et Stripe peut te demander un complément.',
  ready: 'Stripe a activé les paiements et les versements sur ton compte.',
};
const startLabel: Partial<Record<PayoutStatus, string>> = {
  not_started: 'Commencer l’inscription Stripe',
  incomplete: 'Reprendre l’inscription Stripe',
  pending: 'Compléter chez Stripe',
};
const problemText: Record<PayoutProblem | 'browser', { tone: 'info' | 'warn' | 'err'; title: string; text: string; retry: boolean }> = {
  unavailable: { tone: 'info', title: 'Inscription aux versements pas encore disponible', text: 'Le service n’est pas ouvert pour le moment ou ne répond pas. Réessaie plus tard : ce que tu as déjà renseigné chez Stripe est conservé.', retry: true },
  busy: { tone: 'warn', title: 'Préparation déjà en cours', text: 'Ton inscription est en train d’être préparée, peut-être depuis un autre appareil. Patiente une minute, puis réessaie.', retry: true },
  reconciliation_required: { tone: 'warn', title: 'Vérification nécessaire par l’équipe Furrix', text: 'Ton inscription doit être vérifiée par l’équipe avant de continuer. Aucune nouvelle inscription ne sera créée en attendant. Contacte l’équipe Furrix si cela dure.', retry: false },
  forbidden: { tone: 'info', title: 'Inscription non disponible pour ton compte', text: 'Elle est réservée aux gardiens de la bêta ayant publié leur profil, sans suppression de compte en cours.', retry: false },
  unauthorized: { tone: 'warn', title: 'Session expirée', text: 'Reconnecte-toi, puis reviens sur ton profil de gardien.', retry: false },
  network: { tone: 'err', title: 'Pas de connexion', text: 'Vérifie ton réseau, puis réessaie. Ce que tu as déjà renseigné chez Stripe est conservé.', retry: true },
  browser: { tone: 'err', title: 'La page Stripe n’a pas pu s’ouvrir', text: 'Réessaie : un nouveau lien sera préparé.', retry: true },
};
const problemOf = (e: unknown): PayoutProblem => e instanceof PayoutError ? e.problem : 'unavailable';

/**
 * Versements du gardien : état réel de l'inscription Stripe et action pour la commencer ou la reprendre.
 * Le lien Stripe, à usage unique, n'est jamais gardé en mémoire d'écran ni en stockage.
 * Le retour depuis Stripe ne vaut pas inscription terminée : l'état est relu auprès du serveur.
 */
export function PayoutOnboarding({ client, unsaved = false }: {
  client: FurrixClient;
  /** Modifications du profil non enregistrées : sur le web, quitter la page les perdrait. */
  unsaved?: boolean;
}) {
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<PayoutProblem | 'browser' | null>(null);
  /** Vrai après la fermeture du navigateur Stripe, jusqu'à la relecture suivante. */
  const [returned, setReturned] = useState(false);
  const alive = useRef(true);
  const stopListening = useRef<() => void>(() => {});
  useEffect(() => () => { alive.current = false; stopListening.current(); }, []);

  const refresh = useCallback(async () => {
    setChecking(true); setProblem(null);
    try { const next = await payoutStatus(client); if (alive.current) setStatus(next); }
    catch (e) { if (alive.current) setProblem(problemOf(e)); }
    finally { if (alive.current) setChecking(false); }
  }, [client]);
  useEffect(() => { void refresh(); }, [refresh]);
  // Web : retour arrière depuis Stripe avec une page restaurée du cache. L'état est relu, jamais supposé.
  useEffect(() => {
    const restored = (e: PageTransitionEvent) => { if (e.persisted) { setStarting(false); void refresh(); } };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, [refresh]);

  const start = async () => {
    setStarting(true); setProblem(null); setReturned(false);
    let url: string | undefined;
    try {
      const result = await startPayout(client);
      if (!alive.current) return;
      setStatus(result.status);
      url = result.url;
    } catch (e) {
      if (alive.current) { setProblem(problemOf(e)); setStarting(false); }
      return;
    }
    if (!url) { setStarting(false); return; }
    try {
      stopListening.current();
      stopListening.current = await openSecureBrowser(url, () => {
        if (!alive.current) return;
        setReturned(true);
        void refresh();
      });
    } catch {
      if (alive.current) setProblem('browser');
    } finally {
      url = undefined;
      // Sur le web, la page part chez Stripe : l'indicateur reste jusqu'au départ.
      if (alive.current && Capacitor.isNativePlatform()) setStarting(false);
    }
  };

  const native = Capacitor.isNativePlatform();
  const label = status ? startLabel[status] : undefined;
  const blocked = !native && unsaved;
  const p = problem ? problemText[problem] : null;
  return <Card><Stack gap={4}>
    <Row className="gd-payout__head">
      <Text variant="h2">Versements</Text>
      {status && !checking ? <StatusBadge status={badge[status].status}>{badge[status].label}</StatusBadge> : null}
    </Row>
    {checking ? <Loading label={returned ? 'Vérification de ton inscription auprès de Stripe…' : 'Lecture de ton inscription Stripe…'} /> : null}
    {!checking && returned && status ? status === 'ready'
      ? <Alert tone="ok" title="Inscription complète">Stripe a confirmé ton compte de versement.</Alert>
      : <Alert tone="info" title="Inscription pas encore terminée">Revenir de Stripe ne suffit pas : selon Stripe, {status === 'pending' ? 'tes informations sont en cours de vérification' : 'des informations manquent encore'}.</Alert> : null}
    {status && !checking ? <Text variant="body">{explain[status]}</Text> : null}
    {p ? <Alert tone={p.tone} title={p.title} actions={p.retry || problem === 'reconciliation_required'
      ? <Button variant="out" size="sm" icon="retry" onClick={() => { void refresh(); }}>{p.retry ? 'Réessayer' : 'Actualiser'}</Button> : undefined}>{p.text}</Alert> : null}
    {status && !checking ? <Row>
      {label && !(problem && !problemText[problem].retry) ? <Button variant="ink" icon="arrowRight" loading={starting} disabled={blocked} onClick={() => { void start(); }}>{label}</Button> : null}
      {status === 'pending' || status === 'ready' ? <Button variant="quiet" size="sm" icon="retry" onClick={() => { void refresh(); }}>Actualiser</Button> : null}
    </Row> : null}
    {blocked && label ? <p className="fx-hint">Enregistre d’abord tes modifications : la page Stripe s’ouvre à la place de celle-ci.</p> : null}
    {label && !blocked ? <Text variant="body-sm">{native ? 'Stripe s’ouvre dans un navigateur sécurisé. Quand tu as terminé ou veux reprendre plus tard, ferme-le pour revenir ici.' : 'Stripe s’ouvre à la place de cette page, puis te ramène sur ton profil de gardien.'}</Text> : null}
    <Note>Le paiement des gardes n’est pas encore ouvert dans Furrix : la commission et les conditions de versement restent à définir.</Note>
  </Stack></Card>;
}
