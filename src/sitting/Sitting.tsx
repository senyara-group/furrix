import { useEffect, useState, type ReactNode } from 'react';
import {
  ActionBar, Alert, Button, Card, CheckList, Icon, ChatThread, DetailLayout, Field, Input, Log, LogItem, MessageBubble, Note, OptionGroup, PageHeader,
  Recap, RecapRow, Row, Separator, Stack, StatusBadge, Steps, SystemMessage, Text, Textarea, Who, type StepState,
} from '../design-system';
import type { FurrixClient } from '../services/supabaseClient';
import { addSittingUpdate, blockSittingContact, listSittingUpdates, reportSitting, updateSittingRequest } from './service';
import { money, nameOf, period, phaseOf, price, serviceLabel, speciesLabel, stamp, statusOf, stepsOf, units, when, type Phase } from './format';
import { SummaryCard } from './Sitter';
import { chatHref, gardeHref } from './links';
import type { MySitting, SittingReportCategory, SittingUpdate } from './types';

const categories: Array<{ value: SittingReportCategory; label: string }> = [
  { value: 'sante', label: 'Santé ou blessure' }, { value: 'non_conforme', label: 'Garde non conforme' },
  { value: 'comportement', label: 'Comportement' }, { value: 'paiement', label: 'Paiement' },
];
const go = (href: string) => { window.location.hash = href; };
const other = (s: MySitting) => nameOf(s.other_name, s.role === 'owner' ? 'Le gardien' : 'Le propriétaire');
const petLine = (s: MySitting) => [speciesLabel[s.pet_species] ?? s.pet_species, s.pet_breed, s.pet_age, s.pet_weight ? `${s.pet_weight.replace(/\s*kg$/i, '')} kg` : null].filter(Boolean).join(' · ');

function Side({ client, s }: { client: FurrixClient; s: MySitting }) {
  const name = other(s);
  const subtitle = s.role === 'owner' ? [s.sitter_kind === 'professionnel' ? 'Professionnel' : 'Particulier', s.sitter_city].filter(Boolean).join(' · ') : `Propriétaire de ${s.pet_name}`;
  const paid = s.status === 'confirmed' || s.status === 'cancelled';
  return <SummaryCard client={client} photo={s.role === 'owner' ? s.sitter_photo : null} name={name} subtitle={subtitle} service={s.service} starts={s.starts_at} ends={s.ends_at} petName={s.pet_name} unitPrice={s.unit_price_cents} count={s.units} paid={paid} />;
}

function StepsCard({ phase, title = 'Où en est la garde' }: { phase: Phase; title?: string }) {
  return <Card calm><Stack gap={3}><Text variant="kicker">{title}</Text><Steps steps={stepsOf(phase)} /></Stack></Card>;
}

/** Ce que reçoit le gardien : son tarif, moins une commission encore à définir. */
function Payout({ s }: { s: MySitting }) {
  return <Card calm><Stack gap={3}><Text variant="kicker">Ce que tu recevras</Text><Recap>
    <RecapRow label={`${units(s.service, s.units)} × ${price(s.unit_price_cents)} (ton tarif)`} value={money(s.units * s.unit_price_cents)} />
    <RecapRow label="Commission Furrix" value="à définir" open />
    <RecapRow label="Versement prévu" value={`${money(s.units * s.unit_price_cents)} − commission`} total />
  </Recap></Stack></Card>;
}

/** Nouvelles de l'animal : le journal du gardien, et sa saisie pendant la garde. */
function News({ client, s, canWrite }: { client: FurrixClient; s: MySitting; canWrite: boolean }) {
  const [items, setItems] = useState<SittingUpdate[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void listSittingUpdates(client, s.id).then((data) => { if (current) setItems(data); }).catch(() => { if (current) setItems([]); });
    return () => { current = false; };
  }, [client, s.id]);
  const send = async () => {
    setBusy(true); setError('');
    try { const saved = await addSittingUpdate(client, s.id, text); setItems((v) => [saved, ...(v ?? [])]); setText(''); }
    catch { setError('La nouvelle n’a pas été envoyée. Réessaie.'); } finally { setBusy(false); }
  };
  return <Card><Stack gap={4}>
    <Text variant="h2">Nouvelles de {s.pet_name}</Text>
    {items === null ? <p className="fx-t-body-sm" role="status">Chargement des nouvelles…</p>
      : items.length ? <Log>{items.map((u) => <LogItem key={u.id} time={<span className="fx-num">{stamp(u.created_at)}</span>}>{u.text}</LogItem>)}</Log>
      : <Text variant="body">{s.role === 'sitter' ? `Pas encore de nouvelles. Une balade, un repas : publie-les ici pour rassurer ${other(s)}.` : `Pas encore de nouvelles. ${other(s)} pourra en publier ici pendant la garde.`}</Text>}
    {canWrite ? <><Separator />
      <Field label={`Donner des nouvelles de ${s.pet_name}`} hint="Une balade, un repas, un moment : le propriétaire les lit ici.">
        <Textarea value={text} maxLength={1000} rows={3} placeholder="Balade d’une heure, elle a bien mangé…" onChange={(e) => setText(e.target.value)} />
      </Field>
      {error ? <Alert tone="err" title={error} /> : null}
      <Row><Button variant="ink" size="sm" icon="send" loading={busy} disabled={!text.trim()} onClick={() => { void send(); }}>Publier</Button></Row>
    </> : <Text variant="body-sm">Journal rédigé par le gardien. La fréquence des nouvelles se convient entre vous.</Text>}
  </Stack></Card>;
}

/** Une demande, côté propriétaire ou gardien, selon son statut (planches « En attente » à « Garde terminée »). */
export function SittingView({ client, s, onChange }: { client: FurrixClient; s: MySitting; onChange: (s: MySitting) => void }) {
  const name = other(s);
  const phase = phaseOf(s);
  const owner = s.role === 'owner';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const run = async (action: 'withdraw' | 'accept' | 'decline') => {
    setBusy(action); setError('');
    try { const saved = await updateSittingRequest(client, s.id, action); onChange({ ...s, ...saved }); }
    catch { setError(action === 'accept' ? 'L’accord n’a pas été enregistré : la demande a peut-être changé, ou ces dates sont déjà prises.' : 'L’action n’a pas été confirmée. Réessaie.'); }
    finally { setBusy(null); }
  };
  const badge = statusOf(phase, s.role, name, s.cancelled_by === (owner ? s.owner_id : s.sitter_id));
  const write = <Button as="a" href={chatHref(s.owner_id, s.sitter_id)} variant="out" icon="message">Écrire à {name}</Button>;
  const search = (label = 'Chercher un autre gardien') => <Button as="a" href={gardeHref()} icon="search">{label}</Button>;
  const problem = <Button as="a" href={gardeHref({ vue: 'probleme', demande: s.id })} variant="danger" icon="flag">Signaler un problème</Button>;
  const report = s.report_id ? <Alert tone="warn" title={`Signalement en cours d’examen (dossier n° ${s.report_id})`} actions={<Button as="a" href={gardeHref({ vue: 'probleme', demande: s.id })} variant="out" size="sm">Voir le signalement</Button>}>
    Ouvert le {stamp(s.report_at!)}. La garde, le paiement et vos échanges restent consultables.</Alert> : null;
  let title: string, body: ReactNode, actions: ReactNode;

  if (owner && phase === 'pending') {
    title = 'Demande envoyée';
    body = <><StepsCard phase={phase} /><Card><Stack><Text variant="h2">{name} a reçu ta demande</Text>
      <Text variant="body">Sa réponse s’affichera ici. Tant que {name} n’a pas accepté, rien n’est réservé ni payé.</Text></Stack></Card></>;
    actions = <ActionBar>{write}<Button variant="danger" loading={busy === 'withdraw'} onClick={() => { void run('withdraw'); }}>Retirer ma demande</Button></ActionBar>;
  } else if (!owner && phase === 'pending') {
    title = 'Demande de garde reçue';
    body = <>
      <Card><Stack gap={4}><Who initials={s.pet_name.charAt(0).toUpperCase()} name={`${s.pet_name} et ${name}`} subtitle={petLine(s)} />
        <Separator /><p className="gd-ln"><b className="fx-num">{period(s.starts_at, s.ends_at)}</b></p>
        <p className="fx-t-body-sm">{units(s.service, s.units)} · {serviceLabel[s.service].toLowerCase()} · {s.pet_name}</p>
        {s.message ? <><Separator /><Text variant="body">« {s.message} »</Text></> : null}</Stack></Card>
      <Payout s={s} />
      <Note>Si tu acceptes, {name} devra payer pour confirmer. Tant que ce n’est pas payé, la garde n’est pas réservée. Refuser est toujours possible, sans justification.</Note>
    </>;
    actions = <ActionBar>
      <Button icon="check" loading={busy === 'accept'} disabled={!!busy} onClick={() => { void run('accept'); }}>Accepter</Button>
      {write}
      <Button variant="danger" loading={busy === 'decline'} disabled={!!busy} onClick={() => { void run('decline'); }}>Refuser</Button>
    </ActionBar>;
  } else if (phase === 'withdrawn') {
    title = 'Demande retirée';
    body = <><StepsCard phase={phase} /><Alert tone="info" title={owner ? 'Ta demande est retirée' : `${name} a retiré sa demande`}>{owner ? `Nous avons prévenu ${name}. Rien n’avait été payé.` : 'Rien n’avait été payé.'}</Alert></>;
    actions = <ActionBar>{owner ? search() : <Button as="a" href={gardeHref({ vue: 'mes-gardes' })} variant="out">Mes gardes</Button>}</ActionBar>;
  } else if (phase === 'declined') {
    title = owner ? `${name} ne peut pas garder ${s.pet_name}` : 'Demande refusée';
    body = <><StepsCard phase={phase} /><Card><Stack><Text variant="h2">{owner ? `${name} n’est pas disponible pour cette garde` : 'Tu as refusé cette demande'}</Text>
      <Text variant="body">{owner ? 'Ce sont des choses qui arrivent : un gardien n’a pas à justifier un refus. Rien n’a été payé.' : `Nous avons prévenu ${name}. Rien n’avait été payé.`}</Text></Stack></Card></>;
    actions = <ActionBar>{owner ? search('Voir tous les gardiens') : <Button as="a" href={gardeHref({ vue: 'mes-gardes' })} variant="out">Mes gardes</Button>}</ActionBar>;
  } else if (phase === 'expired') {
    title = 'Demande expirée';
    body = <><StepsCard phase={phase} /><Alert tone="warn" title={owner ? `${name} n’a pas répondu à temps` : 'Demande expirée'}>La demande a expiré. Rien n’a été réservé ni payé.</Alert></>;
    actions = <ActionBar>{owner ? <>{search()}<Button as="a" href={gardeHref({ vue: 'demander', gardien: s.sitter_id })} variant="out">Renvoyer une demande à {name}</Button></> : null}</ActionBar>;
  } else if (phase === 'accepted' && owner) {
    title = `${name} a accepté ta demande`;
    body = <><StepsCard phase={phase} />
      <Alert tone="ok" title="Ce n’est pas encore une réservation">{name} est d’accord pour garder {s.pet_name}. La réservation sera confirmée après ton paiement ; d’ici là, ces dates ne sont pas bloquées pour toi.</Alert>
      <PaymentPanel s={s} /></>;
    actions = <ActionBar>
      {write}
      <Button variant="quiet" loading={busy === 'withdraw'} onClick={() => { void run('withdraw'); }}>Ne pas donner suite</Button>
    </ActionBar>;
  } else if (phase === 'accepted') {
    title = 'Demande acceptée';
    body = <><StepsCard phase={phase} title="Où en est la demande" /><Alert tone="ok" title="Tu as accepté">Il reste à {name} de payer pour confirmer la réservation. Tant que ce n’est pas payé, ces dates ne sont pas réservées.</Alert><Payout s={s} /></>;
    actions = <ActionBar>{write}</ActionBar>;
  } else if (phase === 'booked') {
    title = 'Réservation confirmée';
    body = <>
      <Alert tone="ok" title={owner ? `C’est réservé : ${name} garde ${s.pet_name}` : `C’est réservé : tu gardes ${s.pet_name}`}>{s.paid_at ? `Paiement reçu le ${stamp(s.paid_at)}. ` : ''}Rendez-vous {when(s.starts_at).toLowerCase()}.</Alert>
      <StepsCard phase={phase} />
      <Card><Stack gap={3}><Text variant="h2">Avant le départ</Text>
        <CheckList items={owner ? ['Convenez du lieu et de l’heure de la remise dans la conversation.', 'Pense à la laisse, à la nourriture et au carnet de santé.']
          : [`Convenez du lieu et de l’heure de la remise avec ${name}.`, `Pendant la garde, tu pourras donner des nouvelles de ${s.pet_name} ici.`]} /></Stack></Card>
      {report}
    </>;
    actions = <ActionBar>{write}<Button as="a" href={gardeHref({ vue: 'annuler', demande: s.id })} variant="danger">Annuler la réservation</Button></ActionBar>;
  } else if (phase === 'ongoing') {
    title = 'Garde en cours';
    body = <><StepsCard phase={phase} />{report}<News client={client} s={s} canWrite={!owner} /></>;
    actions = <ActionBar>{write}{problem}</ActionBar>;
  } else if (phase === 'done') {
    title = 'Garde terminée';
    body = <><StepsCard phase={phase} /><Alert tone="ok" title={owner ? `${s.pet_name} est de retour` : 'Garde terminée'}>Garde terminée le {when(s.ends_at).toLowerCase()}.</Alert>
      {report}<Note>Le moment du versement au gardien et les avis sont encore à définir.</Note><News client={client} s={s} canWrite={!owner && Date.now() < new Date(s.ends_at).getTime() + 86400_000} /></>;
    actions = <ActionBar>{owner ? <Button as="a" href={gardeHref()} icon="homeDoor">Refaire garder {s.pet_name}</Button> : null}{problem}</ActionBar>;
  } else {
    const byMe = s.cancelled_by === (owner ? s.owner_id : s.sitter_id);
    title = 'Réservation annulée';
    body = <><StepsCard phase={phase} /><Alert tone="info" title={byMe ? 'Ta réservation est annulée' : `${name} a annulé la réservation`}>
      {byMe ? `Nous avons prévenu ${name}.` : s.cancel_note ? `« ${s.cancel_note} »` : ''} Le remboursement suit des conditions encore à définir ; son montant et sa date s’afficheront ici.</Alert>{report}</>;
    actions = <ActionBar>{owner ? search() : <Button as="a" href={gardeHref({ vue: 'mes-gardes' })} variant="out">Mes gardes</Button>}</ActionBar>;
  }
  return <section aria-label={title}>
    <PageHeader back={{ label: 'Mes gardes', onClick: () => go(gardeHref({ vue: 'mes-gardes' })) }} title={title} status={<StatusBadge status={badge.status}>{badge.label}</StatusBadge>} showTitleOnPhone />
    <DetailLayout aside={<Side client={client} s={s} />} actions={actions}>
      {error ? <Alert tone="err" title={error} /> : null}
      {body}
    </DetailLayout>
  </section>;
}

/** Paiement (design seul) : aucun prestataire n'est branché ; aucun numéro de carte n'est saisi, enregistré ni envoyé. */
function PaymentPanel({ s }: { s: MySitting }) {
  const total = money(s.units * s.unit_price_cents);
  return <Card className="gd-pay"><Stack gap={5}>
    <div className="gd-pay__head"><Text variant="h2">Paiement</Text><span className="gd-pay__lock"><Icon name="info" size={16} />Bientôt disponible</span></div>
    <Recap>
      <RecapRow label={`${serviceLabel[s.service]} · ${units(s.service, s.units)} × ${price(s.unit_price_cents)}`} value={total} />
      <RecapRow label="Frais de service Furrix" value="à définir" open />
      <RecapRow label="À payer maintenant" value={`${total} + frais`} total />
    </Recap>
    <Stack gap={2}><Text variant="label" as="p">Moyen de paiement</Text>
      <OptionGroup aria-label="Moyen de paiement" value="carte" onChange={() => {}} options={[{ value: 'carte', label: 'Carte bancaire' }, { value: 'autre', label: 'Autres moyens (bientôt)', disabled: true }]} /></Stack>
    <div className="gd-paycard" aria-hidden="true">
      <Icon name="card" size={26} />
      <span className="gd-paycard__num fx-num">•••• •••• •••• ••••</span>
      <span className="gd-paycard__row fx-num"><span>Titulaire de la carte</span><span>MM / AA</span></span>
    </div>
    <fieldset className="gd-card" disabled aria-describedby="gd-pay-soon">
      <legend className="fx-vh">Carte bancaire (bientôt disponible)</legend>
      <Field label="Numéro de carte"><Input className="fx-num" placeholder="1234 1234 1234 1234" inputMode="numeric" autoComplete="off" /></Field>
      <div className="gd-card__row">
        <Field label="Expiration"><Input className="fx-num" placeholder="MM / AA" autoComplete="off" /></Field>
        <Field label="Code de sécurité"><Input className="fx-num" placeholder="123" autoComplete="off" /></Field>
      </div>
      <Field label="Nom sur la carte"><Input placeholder="Prénom Nom" autoComplete="off" /></Field>
    </fieldset>
    <Button variant="ink" icon="card" block disabled aria-describedby="gd-pay-soon">Payer {total} + frais</Button>
    <p id="gd-pay-soon" className="gd-pay__soon">Le paiement en ligne arrive bientôt : rien ne peut être payé ni prélevé pour l’instant, et la garde n’est pas encore réservée. Ce formulaire sera celui du prestataire de paiement retenu ; Furrix ne verra jamais ton numéro de carte.</p>
    <Note>Les conditions d’annulation, avec le montant remboursable selon la date, seront affichées ici avant le paiement.</Note>
  </Stack></Card>;
}

/** Écran Paiement (lien direct) : le même formulaire que sur la demande acceptée. */
export function PaymentView({ client, s }: { client: FurrixClient; s: MySitting }) {
  const name = other(s);
  return <section aria-label="Paiement">
    <PageHeader back={{ label: 'Demande acceptée', onClick: () => go(gardeHref({ vue: 'suivi', demande: s.id })) }} title="Payer pour confirmer" status={<StatusBadge status="todo">Acceptée · paiement à faire</StatusBadge>} showTitleOnPhone />
    <DetailLayout aside={<Side client={client} s={s} />}
      actions={<ActionBar><Button as="a" href={chatHref(s.owner_id, s.sitter_id)} variant="out" icon="message">Écrire à {name}</Button></ActionBar>}>
      <StepsCard phase="accepted" />
      <PaymentPanel s={s} />
    </DetailLayout>
  </section>;
}

/** Annuler une réservation payée (planches « Annuler » et « Réservation annulée »). */
export function CancelView({ client, s, onChange }: { client: FurrixClient; s: MySitting; onChange: (s: MySitting) => void }) {
  const name = other(s);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true); setError('');
    try { const saved = await updateSittingRequest(client, s.id, 'cancel', note); onChange({ ...s, ...saved }); go(gardeHref({ vue: 'suivi', demande: s.id })); }
    catch { setError('L’annulation n’a pas été confirmée. Réessaie.'); } finally { setBusy(false); }
  };
  return <section aria-label="Annuler : confirmation">
    <PageHeader back={{ label: 'Réservation', onClick: () => go(gardeHref({ vue: 'suivi', demande: s.id })) }} title="Annuler la réservation ?" status={<StatusBadge status="ok">Réservée</StatusBadge>} showTitleOnPhone />
    <DetailLayout
      aside={<Card calm><Stack gap={3}><Who initials={name.charAt(0).toUpperCase()} name={name} subtitle={`${units(s.service, s.units)} · ${s.pet_name}`} /><Separator />
        <p className="gd-ln"><b className="fx-num">{period(s.starts_at, s.ends_at)}</b></p><Separator />
        <Recap><RecapRow label="Payé" value={`${money(s.units * s.unit_price_cents)} + frais`} /><RecapRow label="Remboursé" value="selon conditions" open /></Recap></Stack></Card>}
      actions={<ActionBar><Button as="a" href={gardeHref({ vue: 'suivi', demande: s.id })} variant="out">Garder la réservation</Button>
        <Button variant="danger" loading={busy} onClick={() => { void confirm(); }}>Confirmer l’annulation</Button></ActionBar>}>
      {error ? <Alert tone="err" title={error} /> : null}
      <Card><Stack gap={4}><Text variant="h2">Tu es sur le point d’annuler</Text>
        <Text variant="body">La garde {period(s.starts_at, s.ends_at).toLowerCase()} sera libérée et nous préviendrons {name}.</Text>
        <Note>Les conditions d’annulation et de remboursement ne sont pas encore décidées. Le montant remboursé sera affiché, chiffré, avant toute confirmation.</Note>
        <Field label="Raison" optional><Textarea value={note} maxLength={300} rows={3} placeholder={`Pour aider ${name} à comprendre`} onChange={(e) => setNote(e.target.value)} /></Field>
      </Stack></Card>
    </DetailLayout>
  </section>;
}

const disputeSteps = (status:MySitting['report_status']): Array<{ label: string; state: StepState }> => [{ label: 'Signalé', state: 'done' }, { label: 'Examen par Furrix', state: status==='reviewing'?'now':status==='closed'?'done':'todo' }, { label: 'Clôture', state: status==='closed'?'done':'todo' }];

/** Signaler un problème, bloquer, puis suivre le litige (planches « Signaler un problème » et « Litige ouvert »). */
export function ProblemView({ client, s, onChange }: { client: FurrixClient; s: MySitting; onChange: (s: MySitting) => void }) {
  const name = other(s);
  const [category, setCategory] = useState<SittingReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState<'report' | 'block' | null>(null);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const back = { label: 'Retour à la garde', onClick: () => go(gardeHref({ vue: 'suivi', demande: s.id })) };
  if (s.report_id) return <section aria-label="Litige ouvert">
    <PageHeader back={back} title="Litige ouvert" status={<StatusBadge status="alert">{s.report_status==='reviewing'?'En cours d’examen':s.report_status==='closed'?'Dossier clos':'Signalement enregistré'}</StatusBadge>} showTitleOnPhone />
    <DetailLayout aside={<Side client={client} s={s} />} actions={<ActionBar><Button as="a" href={gardeHref({ vue: 'suivi', demande: s.id })} variant="out">Retour à la garde</Button></ActionBar>}>
      <Card calm><Stack gap={3}><Text variant="kicker">Traitement du litige</Text><Steps label="Étapes du litige" steps={disputeSteps(s.report_status)} /></Stack></Card>
      <Card><Stack gap={3}><Text variant="h2">Ton signalement est enregistré</Text>
        <Text variant="body">Dossier n° {s.report_id} ouvert le {stamp(s.report_at!)}. Il est disponible pour l’équipe Furrix, qui peut demander sa version à {name}.</Text>
        <CheckList items={['La garde, le paiement et vos échanges restent consultables.']} />
        <Note>Délai d’examen, suspension éventuelle du versement et issues possibles (remboursement partiel ou total) : encore à définir.</Note>
      </Stack></Card>
      <Note>Ton signalement est enregistré. Aucune réponse de l’équipe n’a encore été publiée ici.</Note>
    </DetailLayout>
  </section>;
  const send = async () => {
    if (!category) { setError('Choisis de quoi il s’agit.'); return; }
    if (details.trim().length < 10) { setError('Décris ce qui s’est passé en quelques mots (10 caractères au moins).'); return; }
    setBusy('report'); setError('');
    try { const saved = await reportSitting(client, s.id, category, details); onChange({ ...s, report_id: saved.id, report_status: saved.status, report_at: saved.created_at }); }
    catch { setError('Ton signalement n’a pas été enregistré. Réessaie.'); } finally { setBusy(null); }
  };
  const block = async () => {
    setBusy('block'); setError('');
    try { await blockSittingContact(client, s.role === 'owner' ? s.sitter_id : s.owner_id); setBlocked(true); }
    catch { setError('Le blocage n’a pas été confirmé. Réessaie.'); } finally { setBusy(null); }
  };
  return <section aria-label="Signaler un problème">
    <PageHeader back={back} title="Signaler un problème" showTitleOnPhone />
    <DetailLayout aside={<Side client={client} s={s} />}
      actions={<ActionBar><Button variant="ink" icon="send" loading={busy === 'report'} disabled={busy === 'block'} onClick={() => { void send(); }}>Envoyer le signalement</Button>
        <Button as="a" href={gardeHref({ vue: 'suivi', demande: s.id })} variant="out">Annuler</Button></ActionBar>}>
      <Alert tone="warn" title={`Urgence pour ${s.pet_name} ?`}>Contacte d’abord un vétérinaire ou les secours. Ce formulaire ne remplace pas une aide immédiate.</Alert>
      {error ? <Alert tone="err" title={error} /> : null}
      <Card calm><Stack gap={4}>
        <Stack gap={2}><Text variant="label" as="p">De quoi s’agit-il ?</Text><OptionGroup aria-label="Catégorie" value={category} onChange={setCategory} options={categories} /></Stack>
        <Field label="Décris ce qui s’est passé"><Textarea value={details} maxLength={2000} rows={4} placeholder={`Dates, faits, échanges avec ${name}…`} onChange={(e) => setDetails(e.target.value)} /></Field>
      </Stack></Card>
      <Card calm><Stack gap={3}><Text variant="h3">Bloquer {name}</Text>
        <Text variant="body">Bloquer coupe la conversation, mais la demande, la réservation et le signalement restent consultables.</Text>
        {blocked ? <Alert tone="ok" title="Blocage effectué">{name} et toi ne pouvez plus vous écrire.</Alert>
          : <Row><Button variant="quiet" icon="block" loading={busy === 'block'} disabled={busy === 'report'} onClick={() => { void block(); }}>Bloquer {name}</Button></Row>}
      </Stack></Card>
    </DetailLayout>
  </section>;
}
