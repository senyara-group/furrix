import { createContext, useContext, useEffect, type ElementType, type ReactNode } from 'react';
import { initPlatform } from './platform';

interface FurrixContextValue {
  /** Composant de lien du routeur (`Link`), ou `'a'`. */
  linkComponent: ElementType;
}

const FurrixContext = createContext<FurrixContextValue>({ linkComponent: 'a' });

/** À monter une seule fois à la racine : détecte la plateforme et fournit le composant de lien. */
export function FurrixProvider({ children, linkComponent = 'a' }: { children: ReactNode; linkComponent?: ElementType }) {
  useEffect(() => {
    initPlatform();
  }, []);
  return <FurrixContext.Provider value={{ linkComponent }}>{children}</FurrixContext.Provider>;
}

export const useFurrix = () => useContext(FurrixContext);

/** `href` pour une balise `<a>`, `href` + `to` pour un `Link` de routeur. */
export function linkProps(Link: ElementType, href: string): { href: string; to?: string } {
  return typeof Link === 'string' ? { href } : { href, to: href };
}
