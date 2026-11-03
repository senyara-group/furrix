// Client Supabase unique — importer partout depuis ce fichier.
// Implémentation typée dans src/services/supabaseClient.ts :
// - `supabase` vaut null en mode démonstration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absentes) ;
// - toute clé serveur (service_role / sb_secret_) est refusée au démarrage.
export { supabase, isSupabaseConfigured } from '../services/supabaseClient.ts';
