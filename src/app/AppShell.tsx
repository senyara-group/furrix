import {MessageDraftProvider} from '../meetings/messageDrafts';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Sun, Dog, LogOut, CalendarDays, PawPrint, Heart, HandHeart, Stethoscope } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { FurrixClient } from '../services/supabaseClient';
import { destinations, headerNav, moreNav, routeFromHash, tabNav } from './navigation';
import { useAccountOverview, type OverviewState } from './useAccountOverview';
import { PhoneBarContext, type PhoneBarOverride } from './phoneBar';
import '../design-system/styles';
import './shell.css';
import { Avatar, FurrixScope, HeaderAction, IconButton, Logo, PhoneBar, SiteHeader, TabBar } from '../design-system';
import PetsWorkspace from '../pets/PetsWorkspace';
import AccountArea from '../account/AccountArea';
import { AndroidPushProvider, useAndroidPush } from '../push/PushProvider';
import type { ReactNode } from 'react';
// Rencontres et Messages : chargées à part, pour alléger le démarrage de l'app (préchargées juste après).
const loadRencontres = () => import('../meetings/Rencontres');
const loadMessages = () => import('../meetings/AfterMatch');
const Rencontres = lazy(loadRencontres);
const MessagesArea = lazy(loadMessages);
const pageLoading = <p role="status" className="app-small">Chargement…</p>;
import LostPetsArea from '../lost-pets/LostPetsArea';
import { useLocalAlertUnread } from '../lost-pets/useLocalAlertUnread';

const pillars = [
  { route: 'rencontres', label: 'Faire des rencontres', tag: 'Un peu de compagnie', text: 'Des compagnons de balade et de nouveaux amis, pour eux comme pour toi.', icon: Heart, color: 'sky' },
  { route: 'garde', label: 'Trouver une garde', tag: 'Entre de bonnes mains', text: 'Pour une promenade, une visite ou quelques jours loin de la maison.', icon: HandHeart, color: 'park' },
  { route: 'services', label: 'Les bons professionnels', tag: 'Bien les entourer', text: 'Des professionnels pour accompagner la vie de tes animaux.', icon: Stethoscope, color: 'sun' },
] as const;
const lostPets = { label: 'Animaux perdus', text: 'Tu pourras signaler un animal perdu ou trouvé près de chez toi, et aider à le ramener à la maison.' };

function Home({ overview }: { overview: OverviewState }) {
  const name = overview.data?.profile.name?.trim().split(/\s+/)[0];
  return <>
    <section className="app-local-alert"><a href="#/animaux-perdus">Animaux perdus : consulter les alertes locales ou déclarer une disparition.</a></section>
    <section className="app-hero">
      <div><p className="app-eyebrow"><Sun size={17} aria-hidden /> Le quotidien, en bonne compagnie</p>
        <h1>{name ? `Salut ${name}.` : 'Bienvenue chez toi.'}<br />Et si on prenait<br className="app-desktop-break" /> l’air ensemble ?</h1>
        <p>De nouvelles rencontres, une garde attentionnée,<br className="app-desktop-break" /> les bons professionnels. Tout pour eux, près de toi.</p>
        <a className="app-primary" href="#/animaux">Découvrir mon espace <ArrowRight size={18} aria-hidden /></a>
      </div>
      <div className="app-park-scene" aria-hidden="true"><div className="app-sun-disc" /><div className="app-hill app-hill-back" /><div className="app-hill app-hill-front" /><div className="app-dog"><Dog size={100} strokeWidth={1.2} /></div><div className="app-scene-note"><PawPrint size={16} /> Les petits bonheurs sont dehors.</div></div>
    </section>
    <section className="app-section" aria-labelledby="app-pillars"><div className="app-section-heading"><div><p className="app-eyebrow">À chacun son envie</p><h2 id="app-pillars">Qu’est-ce qu’on fait aujourd’hui ?</h2></div><span className="app-stage">Les services se préparent</span></div>
      <div className="app-pillars">{pillars.map(({ route, label, tag, text, icon: Icon, color }) => <a className={`app-pillar app-${color}`} href={`#/${route}`} key={route}>
        <div className="app-pillar-top"><Icon size={27} strokeWidth={1.6} aria-hidden /><ArrowUpRight size={22} aria-hidden /></div><p className="app-eyebrow">{tag}</p><h3>{label}</h3><p>{text}</p><span className="app-small">En préparation</span>
      </a>)}</div>
    </section>
    <section className="app-lower"><div className="app-follow"><p className="app-eyebrow">Le fil de tes aventures</p><h2>À suivre</h2><div className="app-empty-inline"><CalendarDays size={30} strokeWidth={1.5} aria-hidden /><div><h3>Une page toute neuve.</h3><p>Les rencontres et réservations apparaîtront ici lorsque ces services seront disponibles.</p></div></div></div>
      <div className="app-animal-note"><PawPrint size={25} aria-hidden /><h2>Et tes compagnons ?</h2><p>{overview.status === 'loading' ? 'Nous retrouvons leurs profils…' : overview.status === 'error' ? 'Leurs profils n’ont pas pu être chargés.' : overview.data?.pets.length ? 'Retrouve les profils de tes animaux dans ton espace.' : 'Leur petite place est déjà réservée. Ajoute leur profil pour faire les présentations.'}</p><a href="#/animaux">Mes animaux <ArrowRight size={17} aria-hidden /></a></div>
    </section>
  </>;
}

export function AppShellView({ overview, retry, email, onSignOut, preview = false, petsContent, meetingsContent, messagesContent, accountContent, lostContent, localNotice, notificationUnread = false }: {
  overview: OverviewState; retry: () => void; email?: string; onSignOut?: () => Promise<boolean>; preview?: boolean; petsContent?: ReactNode; meetingsContent?: ReactNode; messagesContent?: ReactNode; accountContent?: ReactNode; lostContent?: ReactNode; localNotice?: ReactNode; notificationUnread?: boolean;
}) {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  const [menuOpen,setMenuOpen]=useState(false);
  const menuToggle=useRef<HTMLElement|null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const [phoneBar, setPhoneBar] = useState<PhoneBarOverride | null>(null);
  const title = useRef<HTMLElement>(null);
  useEffect(() => {
    const readRoute = () => { setRoute(routeFromHash(window.location.hash)); setMenuOpen(false); };
    window.addEventListener('hashchange', readRoute);
    return () => window.removeEventListener('hashchange', readRoute);
  }, []);
  useEffect(() => {
    title.current?.focus();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [route]);
  const signOut = async () => {
    if (!onSignOut || leaving) return;
    setLeaving(true); setError('');
    try { if (!await onSignOut()) setError('La déconnexion n’a pas abouti. Réessaie.'); }
    catch { setError('La déconnexion n’a pas abouti. Réessaie.'); }
    finally { setLeaving(false); }
  };
  const go = (to: string) => { setMenuOpen(false); window.location.hash = `#/${to}`; };
  const toggleMenu=()=>{menuToggle.current=document.activeElement as HTMLElement;setMenuOpen(v=>!v);};
  useEffect(()=>{if(!menuOpen)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMenuOpen(false);menuToggle.current?.focus();}};const outside=(e:PointerEvent)=>{if(!(e.target as HTMLElement).closest('#app-account-menu,[data-account-toggle]'))setMenuOpen(false);};document.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside);};},[menuOpen]);
  const notificationLabel=notificationUnread?'Notifications animaux perdus : non lues':'Notifications animaux perdus';
  const notifications=<IconButton icon="bell" label={notificationLabel} className={notificationUnread?'app-notification-unread':undefined} onClick={()=>go('animaux-perdus?notifications')}/>;
  const menuAction=<span data-account-toggle><IconButton icon="user" label={menuOpen?'Fermer le menu du compte':'Ouvrir le menu du compte'} aria-expanded={menuOpen} aria-controls="app-account-menu" onClick={toggleMenu}/></span>;
  const initial = (overview.data?.profile.name?.trim() || email || '').charAt(0).toUpperCase();
  const isTab = route === 'accueil' || tabNav.some((item) => item.id === route);
  const currentTab = ['animaux-perdus', 'animaux', 'compte'].includes(route) ? 'plus' : route;
  const pending = route === 'animaux-perdus' ? lostPets : pillars.find((item) => item.route === route);
  return <div className="furrix-shell">
    {preview && <div className="app-preview" role="status">Aperçu local de l’interface · sans connexion, sans données de compte</div>}
    <a className="app-skip" href="#app-content" onClick={(event) => { event.preventDefault(); title.current?.focus(); title.current?.scrollIntoView({ block: 'start' }); }}>Aller au contenu</a>
    <FurrixScope><SiteHeader items={headerNav} current={route} homeHref="#/accueil" right={<>
      {notifications}<HeaderAction icon="message" onClick={() => go('messages')}>Messages</HeaderAction>
      <span data-account-toggle>{initial ? <Avatar initials={initial} label="Ouvrir le menu du compte" onClick={toggleMenu}/> : <IconButton icon="user" label="Ouvrir le menu du compte" aria-expanded={menuOpen} aria-controls="app-account-menu" onClick={toggleMenu}/>}</span>
    </>} /></FurrixScope>
    <FurrixScope className="app-phonebar"><PhoneBar titleAs="p" actions={<>{notifications}{menuAction}</>} title={phoneBar?.title ?? (route === 'accueil' ? <Logo href="#/accueil" /> : destinations.find((item) => item.id === route)?.label)}
      back={phoneBar?.back ?? (isTab ? undefined : { label: 'Retour à l’accueil', onClick: () => go('accueil') })} /></FurrixScope>
    {menuOpen&&<FurrixScope><nav onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setMenuOpen(false); }} id="app-account-menu" className="app-account-menu" aria-label="Menu du compte"><a href="#/animaux" aria-current={route==='animaux'?'page':undefined}>Mes animaux</a><a href="#/compte" aria-current={route==='compte'?'page':undefined}>Mon compte</a><a href="#/animaux-perdus" aria-current={route==='animaux-perdus'?'page':undefined}>Animaux perdus</a><a href="#/animaux-perdus?notifications">Notifications animaux perdus</a></nav></FurrixScope>}
    <PhoneBarContext.Provider value={setPhoneBar}><main id="app-content" tabIndex={-1} ref={title}>
      {overview.status === 'error' && <div className="app-load-error" role="alert">Ton espace n’a pas pu être chargé. <button onClick={retry}>Réessayer</button></div>}
      {localNotice}
      {route === 'accueil' ? <Home overview={overview} />
        : route === 'plus' ? <section className="app-page"><h1>Plus</h1><p>Retrouve tes animaux, ton compte et les alertes de ton secteur.</p><nav className="app-more-links" aria-label="Plus de destinations">{moreNav.map((item) => <a className="app-outline" key={item.id} href={item.href}>{item.label}<ArrowRight size={18} aria-hidden /></a>)}</nav></section>
        : route === 'animaux-perdus' && lostContent ? lostContent
        : route === 'rencontres' && meetingsContent ? meetingsContent
        : route === 'messages' && messagesContent ? messagesContent
        : route === 'compte' && accountContent ? accountContent
        : route === 'compte' ? <section className="app-page"><p className="app-eyebrow">Ton espace personnel</p><h1>Mon compte</h1><p>Un seul compte pour le web et les applications mobiles.</p><dl><dt>E-mail</dt><dd>{email || (preview ? 'Non affiché dans cet aperçu' : 'Non renseigné')}</dd><dt>Prénom</dt><dd>{overview.data?.profile.name || 'Non renseigné'}</dd><dt>Ville</dt><dd>{overview.data?.profile.city || 'Non renseignée'}</dd></dl>
          <p className="app-small">{preview ? 'Cet aperçu n’enregistre aucune modification.' : 'Ton profil sera disponible après le chargement de ton espace.'}</p><button className="app-outline" disabled={!onSignOut || leaving} onClick={() => { void signOut(); }}><LogOut size={18} aria-hidden />{leaving ? 'Déconnexion…' : 'Déconnecter cet appareil'}</button>{error && <p role="alert">{error}</p>}</section>
        : route === 'animaux' && petsContent ? petsContent : route === 'animaux' ? <section className="app-page"><p className="app-eyebrow">Ceux qui partagent ta vie</p><h1>Mes animaux</h1>{overview.status === 'loading' ? <p role="status">Chargement des profils…</p>
          : overview.status === 'error' ? <p>Réessaie le chargement de ton espace pour retrouver leurs profils.</p>
          : overview.data?.pets.length ? <div className="app-pet-list">{overview.data.pets.map((pet) => <article key={pet.id}><PawPrint size={26} aria-hidden /><h2>{pet.name}</h2><p>{pet.species}{pet.breed ? ` · ${pet.breed}` : ''}</p><p>{pet.city || 'Ville non renseignée'}</p></article>)}</div>
          : <div className="app-empty"><PawPrint size={42} strokeWidth={1.3} aria-hidden /><h2>Chaque aventure commence avec eux.</h2><p>Aucun animal n’est encore associé à cet espace. La création et l’édition des profils arrivent au prochain lot.</p></div>}</section>
        : <section className="app-page app-pending"><p className="app-eyebrow">Bientôt dans ton quartier</p><h1>{pending?.label || 'Tes conversations'}</h1><span className="app-stage">En préparation</span><p>{pending?.text || 'Tu retrouveras ici les conversations liées à tes matchs, demandes de garde et rendez-vous.'}</p><p>{route === 'rencontres' ? 'Un j’aime, puis un match réciproque : vous pourrez discuter et proposer une rencontre.' : 'Ce service n’est pas encore disponible. Aucune recherche, demande ou réservation n’est envoyée.'}</p><a className="app-outline" href="#/accueil">Revenir à l’accueil <ArrowRight size={18} aria-hidden /></a></section>}
      <footer className="app-footer"><span>furrix · Bien ensemble, tout simplement.</span><a href="#/compte">Mon compte</a></footer>
    </main></PhoneBarContext.Provider>
    <FurrixScope className="app-tabbar"><TabBar items={tabNav} current={currentTab} /></FurrixScope>
  </div>;
}

function AppShellContent({ client, user, onSignOut }: { client: FurrixClient; user: User; onSignOut: () => Promise<boolean> }) {
  const push = useAndroidPush();
  const signOut = async () => { try { await push?.disable(); } catch {} return onSignOut(); };
  const overview = useAccountOverview(client, user.id);
  const unread=useLocalAlertUnread(client,user.id);
  const petsContent = overview.status === 'ready' && overview.data
    ? <PetsWorkspace key={user.id} client={client} ownerId={user.id} pets={overview.data.pets} onSaved={overview.savePet} reload={overview.retry} /> : undefined;
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRencontres().catch(() => {}); void loadMessages().catch(() => {}); }, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  const meetingsContent = overview.status === 'ready' && overview.data ? <Suspense fallback={pageLoading}><Rencontres key={user.id} client={client} ownerId={user.id} pets={overview.data.pets} /></Suspense> : undefined;
  const messagesContent = overview.status === 'ready' && overview.data ? <Suspense fallback={pageLoading}><MessagesArea key={user.id} client={client} ownerId={user.id} /></Suspense> : undefined;
  const accountContent = overview.status === 'ready' && overview.data
    ? <AccountArea key={user.id} client={client} owner={user.id} email={user.email} profile={overview.data.profile} onSaved={overview.saveProfile} onSignOut={signOut} /> : undefined;
  const lostContent = <LostPetsArea key={`${user.id}:lost`} client={client} owner={user.id} pets={overview.data?.pets || []} />;
  return <AppShellView overview={overview} retry={overview.retry} email={user.email} onSignOut={signOut} petsContent={petsContent} meetingsContent={meetingsContent} messagesContent={messagesContent} accountContent={accountContent} lostContent={lostContent} notificationUnread={unread} />;
}

export function AppPreview() {
  return <AppShellView overview={{ status: 'ready', data: { profile: { name: null, city: null }, pets: [] } }} retry={() => {}} preview />;
}

/** Les push Android restent liés à la durée de la session, indépendamment de l’écran ouvert. */
export default function AppShell({client,user,onSignOut}:{client:FurrixClient;user:User;onSignOut:()=>Promise<boolean>}) {
  return <AndroidPushProvider key={user.id} client={client} owner={user.id}><MessageDraftProvider><AppShellContent client={client} user={user} onSignOut={onSignOut}/></MessageDraftProvider></AndroidPushProvider>;
}
