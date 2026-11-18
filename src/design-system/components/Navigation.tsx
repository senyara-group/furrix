import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { linkProps, useFurrix } from '../provider';
import { cx } from '../utils';
import { IconButton } from './Button';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: IconName;
}

/** Navigation de référence : à adapter aux routes de l'app. */
export const defaultNav: NavItem[] = [
  { id: 'accueil', label: 'Accueil', href: '/', icon: 'home' },
  { id: 'rencontres', label: 'Rencontres', href: '/rencontres', icon: 'pin' },
  { id: 'garde', label: 'Garde', href: '/garde', icon: 'homeDoor' },
  { id: 'services', label: 'Services', href: '/services', icon: 'calendar' },
  { id: 'messages', label: 'Messages', href: '/messages', icon: 'message' },
];

/** Mot-symbole Furrix, point final coquelicot. */
export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  const { linkComponent: Link } = useFurrix();
  return (
    <Link className={cx('fx-logo', className)} {...linkProps(Link, href)} aria-label="Furrix, accueil">
      furrix<span>.</span>
    </Link>
  );
}

export interface SiteHeaderProps {
  items: NavItem[];
  current?: string;
  right?: ReactNode;
  className?: string;
}

/** En-tête ordinateur (72 px). */
export function SiteHeader({ items, current, right, className }: SiteHeaderProps) {
  const { linkComponent: Link } = useFurrix();
  return (
    <header className={cx('fx-site', className)}>
      <Logo />
      <nav className="fx-nav" aria-label="Navigation principale">
        {items.map((it) => (
          <Link key={it.id} className="fx-nav__link" aria-current={it.id === current ? 'page' : undefined} {...linkProps(Link, it.href)}>
            {it.label}
          </Link>
        ))}
      </nav>
      {right ? <div className="fx-site__right">{right}</div> : null}
    </header>
  );
}

/** Bouton fantôme de l'en-tête (« Messages »). */
export function HeaderAction({ icon, children, onClick }: { icon?: IconName; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className="fx-ghost" onClick={onClick}>
      {icon ? <Icon name={icon} size={20} /> : null}
      {children}
    </button>
  );
}

export interface PhoneBarProps {
  title: ReactNode;
  /** `p` quand la page affiche déjà son propre `h1` (un seul titre principal par écran). */
  titleAs?: 'h1' | 'p';
  back?: { label?: string; onClick?: () => void };
  actions?: ReactNode;
  className?: string;
}

/** Barre du haut sur téléphone. */
export function PhoneBar({ title, titleAs: TitleTag = 'h1', back, actions, className }: PhoneBarProps) {
  return (
    <div className={cx('fx-phonebar', className)}>
      {back ? <IconButton icon="chevronLeft" label={back.label ?? 'Retour'} onClick={back.onClick} /> : null}
      <TitleTag className="fx-phonebar__title">{title}</TitleTag>
      {actions ? <div className="fx-phonebar__actions">{actions}</div> : null}
    </div>
  );
}

/** Barre d'onglets du bas sur téléphone (80 px, zone sûre comprise). */
export function TabBar({ items, current, label = 'Navigation principale', className }: { items: NavItem[]; current?: string; label?: string; className?: string }) {
  const { linkComponent: Link } = useFurrix();
  return (
    <nav className={cx('fx-tabbar', className)} aria-label={label}>
      {items.map((it) => (
        <Link key={it.id} className="fx-tab" aria-current={it.id === current ? 'page' : undefined} {...linkProps(Link, it.href)}>
          <span className="fx-tab__icon">{it.icon ? <Icon name={it.icon} size={22} /> : null}</span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export interface AppShellProps {
  nav: NavItem[];
  current?: string;
  /** Titre de la barre téléphone. */
  title: ReactNode;
  /** Voir `PhoneBar` : `p` si chaque page a son propre `h1`. */
  phoneTitleAs?: PhoneBarProps['titleAs'];
  back?: PhoneBarProps['back'];
  phoneActions?: ReactNode;
  headerRight?: ReactNode;
  /** Masque les onglets (conversation, paiement). */
  hideTabs?: boolean;
  /** Onglets du téléphone, si différents de `nav` (5 au plus). */
  tabs?: NavItem[];
  /** Nom de la navigation du téléphone, distinct de celui de l'en-tête quand les deux coexistent. */
  tabsLabel?: string;
  /** Attributs de la zone de contenu (`id`, `tabIndex` pour y placer le focus…). */
  mainProps?: HTMLAttributes<HTMLElement>;
  scrollRef?: Ref<HTMLElement>;
  children: ReactNode;
  className?: string;
}

/** Structure de l'app : en-tête (ordinateur) ou barre + onglets (téléphone), contenu qui défile dedans. */
export function AppShell({ nav, current, title, phoneTitleAs, back, phoneActions, headerRight, hideTabs, tabs, tabsLabel, mainProps, scrollRef, children, className }: AppShellProps) {
  return (
    <div className={cx('fx-root fx-shell', hideTabs && 'fx-shell--notabs', className)}>
      <SiteHeader items={nav} current={current} right={headerRight} />
      <PhoneBar title={title} titleAs={phoneTitleAs} back={back} actions={phoneActions} />
      <main {...mainProps} className={cx('fx-shell__vp', mainProps?.className)} ref={scrollRef}>{children}</main>
      {hideTabs ? null : <TabBar items={tabs ?? nav} current={current} label={tabsLabel} />}
    </div>
  );
}
