// Client Supabase simulé pour les tests : aucune requête réseau.
// Chaque appel est enregistré ; les réponses sont programmées par test.
import { vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { FurrixClient } from '../services/supabaseClient';

type Result = { data: unknown; error: unknown };
type Call = { table: string; op: string; args: unknown[] };

export function fakeSession(userId = '11111111-1111-4111-8111-111111111111'): Session {
  return {
    access_token: 'jwt',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  } as Session;
}

export function createFakeSupabase() {
  const calls: Call[] = [];
  const queue: (Result | (() => Result))[] = [];
  let authListener: ((event: string, session: Session | null) => void) | null = null;

  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit']) {
      b[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return b;
      };
    }
    const settle = (op: string) => () => {
      calls.push({ table, op, args: [] });
      const next = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(typeof next === 'function' ? next() : next);
    };
    b.single = settle('single');
    b.maybeSingle = settle('maybeSingle');
    return b;
  };

  const bucket = {
    upload: vi.fn(async (_path: string, _file: unknown, _opts: unknown) => ({ data: { path: _path }, error: null as unknown })),
    remove: vi.fn(async (_paths: string[]) => ({ data: [], error: null as unknown })),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/pet-photos/${path}` } })),
  };

  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null as Session | null }, error: null as unknown })),
    signUp: vi.fn(async (_c: unknown) => ({ data: { session: null as Session | null, user: null }, error: null as unknown })),
    signInWithPassword: vi.fn(async (_c: unknown) => ({ data: { session: fakeSession() as Session | null, user: null }, error: null as unknown })),
    signOut: vi.fn(async () => ({ error: null as unknown })),
    unsubscribe: vi.fn(),
    onAuthStateChange: vi.fn((cb: (event: string, session: Session | null) => void) => {
      authListener = cb;
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    }),
  };

  const client = {
    auth,
    from: vi.fn((table: string) => builder(table)),
    storage: { from: vi.fn((_bucket: string) => bucket) },
  };

  return {
    client: client as unknown as FurrixClient,
    raw: client,
    auth,
    bucket,
    calls,
    /** Programme la prochaine réponse PostgREST (single / maybeSingle) ; une fonction est évaluée à l'appel. */
    respond(result: Result | (() => Result)) {
      queue.push(result);
    },
    /** Chemin du dernier objet téléversé. */
    lastUploadedPath(): string | undefined {
      const calls = bucket.upload.mock.calls;
      return calls[calls.length - 1]?.[0];
    },
    emitAuth(event: string, session: Session | null) {
      authListener?.(event, session);
    },
  };
}
