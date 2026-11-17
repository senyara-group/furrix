import { useState } from 'react';
import type { PetRow } from '../types/database';

/** Identifiant uniquement, propre au compte et à cet onglet. Toujours revalidé contre ses animaux. */
export function useActivePet(ownerId: string, pets: PetRow[]) {
  const key = `furrix:active-pet:${ownerId}`;
  const [selection, setSelection] = useState<{ owner: string; id: string | null }>(() => {
    try { return { owner: ownerId, id: sessionStorage.getItem(key) }; } catch { return { owner: ownerId, id: null }; }
  });
  const active = pets.find((pet) => pet.owner_id === ownerId && selection.owner === ownerId && pet.id === selection.id) ?? pets.find((pet) => pet.owner_id === ownerId);
  return { active, select: (id: string) => {
    if (!pets.some((pet) => pet.id === id && pet.owner_id === ownerId)) return;
    setSelection({ owner: ownerId, id }); try { sessionStorage.setItem(key, id); } catch { /* Choix utilisable sans stockage local. */ }
  } };
}
