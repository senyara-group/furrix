export type AppEntry = 'product' | 'legacy' | 'mvp' | 'platform-check' | 'home-preview' | 'unavailable';

/** Les anciennes interfaces ne sont accessibles que dans un environnement de développement. */
export function resolveAppEntry(mode: string | undefined, development: boolean): AppEntry {
  if (!mode || mode === 'auth' || mode === 'app') return 'product';
  if (mode === 'legacy' || mode === 'mvp') return development ? mode : 'product';
  if (mode === 'platform-check') return 'platform-check';
  if (mode === 'home-preview') return development ? 'home-preview' : 'unavailable';
  return 'unavailable';
}
