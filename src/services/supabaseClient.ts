import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export type FurrixClient = SupabaseClient<Database>;

/**
 * Refuse toute clé serveur dans le bundle client : seule la clé publique (anon / publishable)
 * est acceptée. Une clé service_role contournerait RLS et les règles Storage.
 */
export function assertPublicKey(key: string): void {
  if (key.startsWith('sb_secret_')) {
    throw new Error('Clé secrète Supabase détectée dans le client : utiliser la clé publique.');
  }
  const parts = key.split('.');
  if (parts.length === 3 && parts[1]) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as { role?: string };
      if (payload.role && payload.role !== 'anon') {
        throw new Error(`Clé Supabase de rôle « ${payload.role} » refusée dans le client : utiliser la clé anon.`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Clé Supabase')) throw e;
      // Clé non JWT illisible : laissée au serveur, qui la refusera si elle est invalide.
    }
  }
}

export function isPlaceholder(url: string | undefined, key: string | undefined): boolean {
  return !url || !key || url.includes('xxxx') || key.endsWith('...');
}

export function createFurrixClient(url: string | undefined, key: string | undefined): FurrixClient | null {
  if (isPlaceholder(url, key)) return null;
  assertPublicKey(key as string);
  return createClient<Database>(url as string, key as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

/** Client unique de l'application, ou null en mode démonstration (variables VITE_SUPABASE_* absentes). */
export const supabase: FurrixClient | null = createFurrixClient(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
);

export const isSupabaseConfigured = supabase !== null;
