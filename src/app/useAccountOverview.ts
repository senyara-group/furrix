import { useEffect, useState } from 'react';
import type { FurrixClient } from '../services/supabaseClient';
import { fetchAccountOverview, type AccountOverview } from './accountOverview';

export type OverviewState = { status: 'loading' | 'ready' | 'error'; data: AccountOverview | null };

export function useAccountOverview(client: FurrixClient, userId: string) {
  const [result, setResult] = useState<OverviewState & { owner: string }>({ owner: userId, status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult({ owner: userId, status: 'loading', data: null });
    void fetchAccountOverview(client, userId).then((data) => {
      if (active) setResult({ owner: userId, status: 'ready', data });
    }).catch(() => {
      if (active) setResult({ owner: userId, status: 'error', data: null });
    });
    return () => { active = false; };
  }, [client, userId, attempt]);
  // Aucune donnée de l'ancien compte, même pendant le rendu précédant le nouvel effet.
  const state: OverviewState = result.owner === userId ? result : { status: 'loading', data: null };
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
