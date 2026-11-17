import { useEffect, useState } from 'react';

export function useMediaQuery(query: string, defaultValue = false): boolean {
  const get = () => (typeof window === 'undefined' || !window.matchMedia ? defaultValue : window.matchMedia(query).matches);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Seuil ordinateur du design system (900 px). */
export const DESKTOP_QUERY = '(min-width: 900px)';

export function useBreakpoint() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  return { isDesktop, isPhone: !isDesktop };
}
