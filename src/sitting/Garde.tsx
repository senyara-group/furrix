import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, EmptyState, FurrixScope, Loading, Page } from '../design-system';
import type { PetRow } from '../types/database';
import type { FurrixClient } from '../services/supabaseClient';
import { usePhoneBar } from '../app/phoneBar';
import { getSitter, listMySittings } from './service';
import { nameOf } from './format';
import { gardeHref, views, type GardeParams, type GardeView } from './links';
import { SearchView, useCriteria } from './Search';
import { RequestForm, SitterFiche } from './Sitter';
import { CancelView, PaymentView, ProblemView, SittingView } from './Sitting';
import { SittingChat } from './Chat';
import { MySittings, SitterProfileForm } from './Account';
import type { MySitting, SitterResult } from './types';
import './garde.css';

function useGardeParams(): GardeParams & { vue: GardeView } {
  const read = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const [params, setParams] = useState(read);
  useEffect(() => {
    const update = () => setParams(read());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const raw = params.get('vue') ?? '';
  const gardien = params.get('gardien') ?? undefined, demande = params.get('demande') ?? undefined, proprio = params.get('proprio') ?? undefined;
  const vue: GardeView = (views as readonly string[]).includes(raw) ? raw as GardeView : demande ? 'suivi' : gardien ? 'fiche' : 'recherche';
  return { vue, gardien, demande, proprio };
}
const go = (p: GardeParams) => { window.location.hash = gardeHref(p); };
/** Actualisation légère d'une demande : la réponse de l'autre personne s'affiche sans recharger la page. */
const REFRESH = 15_000;

function SitterSpace({ client, pets, sitterId, vue, cached, criteria }: {
  client: FurrixClient; pets: PetRow[]; sitterId: string; vue: GardeView; cached: SitterResult | null; criteria: ReturnType<typeof useCriteria>[0];
}) {
  const [sitter, setSitter] = useState<SitterResult | null | undefined>(cached?.sitter_id === sitterId ? cached : undefined);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (sitter) return;
    let current = true; setFailed(false);
    void getSitter(client, sitterId, criteria.place ?? undefined, criteria.service).then((s) => { if (current) setSitter(s); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sitterId, attempt]);
  const name = sitter ? nameOf(sitter.name) : '';
  const back = useCallback(() => { if (vue === 'demander') go({ vue: 'fiche', gardien: sitterId }); else go({}); }, [vue, sitterId]);
  usePhoneBar(useMemo(() => sitter ? { title: vue === 'demander' ? 'Ta demande' : name, back: { label: vue === 'demander' ? `Fiche de ${name}` : 'Résultats', onClick: back } } : null, [sitter, name, vue, back]));
  if (failed) return <Alert tone="err" title="Cette fiche n’a pas pu être chargée." actions={<Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((a) => a + 1)}>Réessayer</Button>} />;
  if (sitter === undefined) return <Loading label="Chargement de la fiche…" />;
  if (sitter === null) return <EmptyState icon="search" title="Gardien indisponible" action={<Button as="a" href={gardeHref()} variant="out" size="sm">Voir les gardiens</Button>}>
    Ce profil n’existe plus ou ne reçoit plus de demandes.
  </EmptyState>;
  if (vue === 'demander') return <RequestForm client={client} sitter={sitter} pets={pets} criteria={criteria} onBack={back}
    onSent={(r) => go({ vue: 'suivi', demande: r.id })} />;
  return <SitterFiche client={client} sitter={sitter} service={criteria.service} onBack={back} onAsk={() => go({ vue: 'demander', gardien: sitterId })}
    onWrite={() => go({ vue: 'conversation', gardien: sitterId, proprio: undefined })} />;
}

function SittingSpace({ client, id, vue }: { client: FurrixClient; id: string; vue: GardeView }) {
  const [sitting, setSitting] = useState<MySitting | null | undefined>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true; setFailed(false);
    const load = () => listMySittings(client, id).then((list) => { if (current) setSitting(list[0] ?? null); });
    load().catch(() => { if (current) setFailed(true); });
    const tick = () => { if (!document.hidden) void load().catch(() => {}); };
    const timer = window.setInterval(tick, REFRESH);
    return () => { current = false; window.clearInterval(timer); };
  }, [client, id, attempt]);
  const titles: Partial<Record<GardeView, string>> = { suivi: 'Ma garde', paiement: 'Paiement', annuler: 'Annuler', probleme: 'Signaler' };
  const back = useCallback(() => go(vue === 'suivi' ? { vue: 'mes-gardes' } : { vue: 'suivi', demande: id }), [vue, id]);
  usePhoneBar(useMemo(() => sitting ? { title: titles[vue] ?? 'Ma garde', back: { label: vue === 'suivi' ? 'Mes gardes' : 'Retour à la garde', onClick: back } } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sitting?.id, vue, back]));
  if (failed) return <Alert tone="err" title="Cette garde n’a pas pu être chargée." actions={<Button variant="out" size="sm" icon="retry" onClick={() => setAttempt((a) => a + 1)}>Réessayer</Button>} />;
  if (sitting === undefined) return <Loading label="Chargement de la garde…" />;
  if (sitting === null) return <EmptyState icon="homeDoor" title="Garde introuvable" action={<Button as="a" href={gardeHref({ vue: 'mes-gardes' })} variant="out" size="sm">Mes gardes</Button>}>
    Cette demande n’existe pas ou ne te concerne pas.
  </EmptyState>;
  const update = (next: MySitting) => setSitting(next);
  if (vue === 'paiement' && sitting.role === 'owner' && sitting.status === 'accepted') return <PaymentView client={client} s={sitting} />;
  if (vue === 'annuler' && sitting.status === 'confirmed' && new Date(sitting.ends_at).getTime() > Date.now()) return <CancelView client={client} s={sitting} onChange={update} />;
  if (vue === 'probleme') return <ProblemView client={client} s={sitting} onChange={update} />;
  return <SittingView key={sitting.id + sitting.status} client={client} s={sitting} onChange={update} />;
}

/** Espace garde (parcours 2) : rechercher, demander, répondre, payer (design seul), suivre, annuler, signaler. */
export default function GardeArea({ client, ownerId, pets }: { client: FurrixClient; ownerId: string; pets: PetRow[] }) {
  const params = useGardeParams();
  const [criteria, setCriteria] = useCriteria(pets);
  const [opened, setOpened] = useState<SitterResult | null>(null);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [params.vue, params.gardien, params.demande]);
  const back = useCallback(() => go({}), []);
  const listTitle = params.vue === 'mes-gardes' ? 'Mes gardes' : params.vue === 'profil' ? 'Profil de gardien' : params.vue === 'conversation' ? 'Conversation' : null;
  usePhoneBar(useMemo(() => listTitle ? { title: listTitle, back: { label: 'Faire garder', onClick: back } } : null, [listTitle, back]));

  let content;
  if (params.vue === 'mes-gardes') content = <MySittings client={client} />;
  else if (params.vue === 'profil') content = <SitterProfileForm client={client} userId={ownerId} />;
  else if (params.vue === 'conversation' && params.gardien) content = <SittingChat key={`${params.proprio ?? ownerId}:${params.gardien}`} client={client} me={ownerId} owner={params.proprio ?? ownerId} sitter={params.gardien} />;
  else if (params.demande) content = <SittingSpace key={params.demande} client={client} id={params.demande} vue={params.vue} />;
  else if (params.gardien) content = <SitterSpace key={params.gardien} client={client} pets={pets} sitterId={params.gardien} vue={params.vue} cached={opened} criteria={criteria} />;
  else content = <SearchView client={client} pets={pets} criteria={criteria} setCriteria={setCriteria}
    onOpen={(s) => { setOpened(s); go({ vue: 'fiche', gardien: s.sitter_id }); }} />;
  return <FurrixScope className="gd-root"><Page>{content}</Page></FurrixScope>;
}
