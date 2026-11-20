import { useEffect, useState } from 'react';
import type { FurrixClient } from '../services/supabaseClient';
import { fetchAccountOverview, type AccountOverview } from './accountOverview';
import type { SavedProfile } from '../account/service';
import type { PetRow } from '../types/database';

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
  return { ...state, saveProfile: (profile: SavedProfile) => {
    if (profile.id !== userId) return;
    setResult(current => current.owner !== userId || !current.data ? current : {
      ...current, data: { ...current.data, profile: { name: profile.name, city: profile.city } },
    });
  }, retry: () => setAttempt((value) => value + 1), retirePet: (id: string) => {
    setResult(current => current.owner !== userId || !current.data ? current : { ...current, data: { ...current.data, pets: current.data.pets.filter(p => p.id !== id) } });
  }, savePet: (pet: PetRow) => {
    if (pet.owner_id !== userId) return;
    setResult((current) => {
      if (current.owner !== userId || !current.data) return current;
      const exists = current.data.pets.some((item) => item.id === pet.id);
      return { ...current, data: { ...current.data, pets: exists ? current.data.pets.map((item) => item.id === pet.id ? pet : item) : [...current.data.pets, pet] } };
    });
  } };
}
