import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Sun, Dog, LogOut, Menu, X, CalendarDays, PawPrint, Heart, HandHeart, Stethoscope } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { FurrixClient } from '../services/supabaseClient';
import { destinations, routeFromHash } from './navigation';
import { useAccountOverview, type OverviewState } from './useAccountOverview';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-600.css';
import './shell.css';
import PetsWorkspace from '../pets/PetsWorkspace';
import type { ReactNode } from 'react';
import MeetingsArea from '../meetings/MeetingsArea';

const pillars = [
  { route: 'rencontres', label: 'Faire des rencontres', tag: 'Un peu de compagnie', text: 'Des compagnons de balade et de nouveaux amis, pour eux comme pour toi.', icon: Heart, color: 'sky' },
  { route: 'garde', label: 'Trouver une garde', tag: 'Entre de bonnes mains', text: 'Pour une promenade, une visite ou quelques jours loin de la maison.', icon: HandHeart, color: 'park' },
  { route: 'services', label: 'Les bons professionnels', tag: 'Bien les entourer', text: 'Des professionnels pour accompagner la vie de tes animaux.', icon: Stethoscope, color: 'sun' },
] as const;

function Home({ overview }: { overview: OverviewState }) {
  const name = overview.data?.profile.name?.trim().split(/\s+/)[0];
  return <>
    <section className="fx-hero">
      <div><p className="fx-eyebrow"><Sun size={17} aria-hidden /> Le quotidien, en bonne compagnie</p>
        <h1>{name ? `Salut ${name}.` : 'Bienvenue chez toi.'}<br />Et si on prenait<br className="fx-desktop-break" /> l’air ensemble ?</h1>
        <p>De nouvelles rencontres, une garde attentionnée,<br className="fx-desktop-break" /> les bons professionnels. Tout pour eux, près de toi.</p>
        <a className="fx-primary" href="#/animaux">Découvrir mon espace <ArrowRight size={18} aria-hidden /></a>
      </div>
      <div className="fx-park-scene" aria-hidden="true"><div className="fx-sun-disc" /><div className="fx-hill fx-hill-back" /><div className="fx-hill fx-hill-front" /><div className="fx-dog"><Dog size={100} strokeWidth={1.2} /></div><div className="fx-scene-note"><PawPrint size={16} /> Les petits bonheurs sont dehors.</div></div>
    </section>
    <section className="fx-section" aria-labelledby="fx-pillars"><div className="fx-section-heading"><div><p className="fx-eyebrow">À chacun son envie</p><h2 id="fx-pillars">Qu’est-ce qu’on fait aujourd’hui ?</h2></div><span className="fx-stage">Les services se préparent</span></div>
      <div className="fx-pillars">{pillars.map(({ route, label, tag, text, icon: Icon, color }) => <a className={`fx-pillar fx-${color}`} href={`#/${route}`} key={route}>
        <div className="fx-pillar-top"><Icon size={27} strokeWidth={1.6} aria-hidden /><ArrowUpRight size={22} aria-hidden /></div><p className="fx-eyebrow">{tag}</p><h3>{label}</h3><p>{text}</p><span className="fx-small">En préparation</span>
      </a>)}</div>
    </section>
    <section className="fx-lower"><div className="fx-follow"><p className="fx-eyebrow">Le fil de tes aventures</p><h2>À suivre</h2><div className="fx-empty-inline"><CalendarDays size={30} strokeWidth={1.5} aria-hidden /><div><h3>Une page toute neuve.</h3><p>Les rencontres et réservations apparaîtront ici lorsque ces services seront disponibles.</p></div></div></div>
      <div className="fx-animal-note"><PawPrint size={25} aria-hidden /><h2>Et tes compagnons ?</h2><p>{overview.status === 'loading' ? 'Nous retrouvons leurs profils…' : overview.status === 'error' ? 'Leurs profils n’ont pas pu être chargés.' : overview.data?.pets.length ? 'Retrouve les profils de tes animaux dans ton espace.' : 'Leur petite place est déjà réservée. Ajoute leur profil pour faire les présentations.'}</p><a href="#/animaux">Mes animaux <ArrowRight size={17} aria-hidden /></a></div>
    </section>
  </>;
}

export function AppShellView({ overview, retry, email, onSignOut, preview = false, petsContent, meetingsContent, messagesContent }: {
  overview: OverviewState; retry: () => void; email?: string; onSignOut?: () => Promise<boolean>; preview?: boolean; petsContent?: ReactNode; meetingsContent?: ReactNode; messagesContent?: ReactNode;
}) {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const title = useRef<HTMLElement>(null);
  useEffect(() => {
    const readRoute = () => { setRoute(routeFromHash(window.location.hash)); setMobileMenu(false); };
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
  const navigation = (kind: 'desktop' | 'mobile') => <nav aria-label={kind === 'desktop' ? 'Navigation principale' : 'Navigation téléphone'} className={`fx-nav-${kind}`}>
    {destinations.slice(0, kind === 'mobile' ? 5 : destinations.length).map(({ id, label, icon: Icon }) => <a href={`#/${id}`} key={id} aria-current={route === id ? 'page' : undefined}><Icon size={21} strokeWidth={1.7} aria-hidden /><span>{label}</span></a>)}
  </nav>;
  const pending = pillars.find((item) => item.route === route);
  return <div className="furrix-shell">
    {preview && <div className="fx-preview" role="status">Aperçu local de l’interface · sans connexion, sans données de compte</div>}
    <a className="fx-skip" href="#fx-content" onClick={(event) => { event.preventDefault(); title.current?.focus(); title.current?.scrollIntoView({ block: 'start' }); }}>Aller au contenu</a>
    <header className="fx-header"><a className="fx-brand" href="#/accueil" aria-label="Furrix, accueil">furrix<span>●</span></a>{navigation('desktop')}
      <div className="fx-header-end"><span className="fx-greeting">À leurs côtés, chaque jour.</span><button className="fx-menu-toggle" aria-expanded={mobileMenu} aria-controls="fx-mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label={mobileMenu ? 'Fermer le menu' : 'Ouvrir le menu'}>{mobileMenu ? <X aria-hidden /> : <Menu aria-hidden />}</button></div>
    </header>
    {mobileMenu && <nav id="fx-mobile-menu" className="fx-more-menu" aria-label="Menu du compte"><a href="#/animaux">Mes animaux</a><a href="#/compte">Mon compte</a></nav>}
    <main id="fx-content" tabIndex={-1} ref={title}>
      {overview.status === 'error' && <div className="fx-load-error" role="alert">Ton espace n’a pas pu être chargé. <button onClick={retry}>Réessayer</button></div>}
      {route === 'accueil' ? <Home overview={overview} />
        : route === 'rencontres' && meetingsContent ? meetingsContent
        : route === 'messages' && messagesContent ? messagesContent
        : route === 'compte' ? <section className="fx-page"><p className="fx-eyebrow">Ton espace personnel</p><h1>Mon compte</h1><p>Un seul compte pour le web et les applications mobiles.</p><dl><dt>E-mail</dt><dd>{email || (preview ? 'Non affiché dans cet aperçu' : 'Non renseigné')}</dd><dt>Prénom</dt><dd>{overview.data?.profile.name || 'Non renseigné'}</dd><dt>Ville</dt><dd>{overview.data?.profile.city || 'Non renseignée'}</dd></dl>
          <p className="fx-small">L’édition du profil et la gestion des appareils seront ajoutées dans un prochain lot.</p><button className="fx-outline" disabled={!onSignOut || leaving} onClick={() => { void signOut(); }}><LogOut size={18} aria-hidden />{leaving ? 'Déconnexion…' : 'Déconnecter cet appareil'}</button>{error && <p role="alert">{error}</p>}</section>
        : route === 'animaux' && petsContent ? petsContent : route === 'animaux' ? <section className="fx-page"><p className="fx-eyebrow">Ceux qui partagent ta vie</p><h1>Mes animaux</h1>{overview.status === 'loading' ? <p role="status">Chargement des profils…</p>
          : overview.status === 'error' ? <p>Réessaie le chargement de ton espace pour retrouver leurs profils.</p>
          : overview.data?.pets.length ? <div className="fx-pet-list">{overview.data.pets.map((pet) => <article key={pet.id}><PawPrint size={26} aria-hidden /><h2>{pet.name}</h2><p>{pet.species}{pet.breed ? ` · ${pet.breed}` : ''}</p><p>{pet.city || 'Ville non renseignée'}</p></article>)}</div>
          : <div className="fx-empty"><PawPrint size={42} strokeWidth={1.3} aria-hidden /><h2>Chaque aventure commence avec eux.</h2><p>Aucun animal n’est encore associé à cet espace. La création et l’édition des profils arrivent au prochain lot.</p></div>}</section>
        : <section className="fx-page fx-pending"><p className="fx-eyebrow">Bientôt dans ton quartier</p><h1>{pending?.label || 'Tes conversations'}</h1><span className="fx-stage">En préparation</span><p>{pending?.text || 'Tu retrouveras ici les conversations liées à tes matchs, demandes de garde et rendez-vous.'}</p><p>{route === 'rencontres' ? 'Un j’aime, puis un match réciproque : vous pourrez discuter et proposer une rencontre.' : 'Ce service n’est pas encore disponible. Aucune recherche, demande ou réservation n’est envoyée.'}</p><a className="fx-outline" href="#/accueil">Revenir à l’accueil <ArrowRight size={18} aria-hidden /></a></section>}
      <footer className="fx-footer"><span>furrix · Bien ensemble, tout simplement.</span><a href="#/compte">Mon compte</a></footer>
    </main>
    {navigation('mobile')}
  </div>;
}

export default function AppShell({ client, user, onSignOut }: { client: FurrixClient; user: User; onSignOut: () => Promise<boolean> }) {
  const overview = useAccountOverview(client, user.id);
  const petsContent = overview.status === 'ready' && overview.data
    ? <PetsWorkspace key={user.id} client={client} ownerId={user.id} pets={overview.data.pets} onSaved={overview.savePet} reload={overview.retry} /> : undefined;
  const meetingsContent = overview.status === 'ready' && overview.data ? <MeetingsArea key={`${user.id}:discover`} client={client} ownerId={user.id} pets={overview.data.pets} /> : undefined;
  const messagesContent = overview.status === 'ready' && overview.data ? <MeetingsArea key={`${user.id}:matches`} client={client} ownerId={user.id} pets={overview.data.pets} initialTab="matches" /> : undefined;
  return <AppShellView overview={overview} retry={overview.retry} email={user.email} onSignOut={onSignOut} petsContent={petsContent} meetingsContent={meetingsContent} messagesContent={messagesContent} />;
}

export function AppPreview() {
  return <AppShellView overview={{ status: 'ready', data: { profile: { name: null, city: null }, pets: [] } }} retry={() => {}} preview />;
}
