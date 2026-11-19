/** Garde-fous de la compilation beta : ne renvoie jamais les cles dans le rapport. */
export function validateMobileConfig(env) {
  if (env.VITE_FURRIX_APP !== 'app' || env.VITE_PRIVATE_BETA !== 'true' || env.VITE_REGISTRATION_ENABLED !== 'false') throw Error('La compilation mobile doit utiliser l’application, la bêta privée et les inscriptions fermées.');
  let url; try { url = new URL(env.VITE_SUPABASE_URL); } catch { throw Error('Renseigne VITE_SUPABASE_URL dans .env.mobile.local.'); }
  if (url.origin !== 'https://jemikzqgbpaivlujnfgl.supabase.co' || !['','/'].includes(url.pathname) || url.search || url.hash || url.username || url.password) throw Error('Cette version de test doit cibler le projet Supabase DEV Furrix.');
  const key = env.VITE_SUPABASE_ANON_KEY ?? '';
  if (key.startsWith('sb_publishable_') && key.length > 25) return { project: 'jemikzqgbpaivlujnfgl', entry: 'app', privateBeta: true };
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString());
    if (payload.role === 'anon' && payload.ref === 'jemikzqgbpaivlujnfgl') return { project: payload.ref, entry: 'app', privateBeta: true };
  } catch { /* Le rapport ne doit jamais contenir la valeur refusee. */ }
  throw Error('Renseigne une clé publique Supabase DEV (publishable ou anon), jamais une clé serveur.');
}
