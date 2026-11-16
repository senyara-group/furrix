import { useCallback, useEffect, useRef, useState } from 'react';
import { toDataError } from '../services/errors';
import { replacePetPhoto } from '../services/petPhotoFlow';
import * as petPhotos from '../services/petPhotos';
import * as petsService from '../services/pets';
import type { FurrixClient } from '../services/supabaseClient';
import type { PetRow } from '../types/database';
import type { FieldErrors, PetFormValues } from '../types/pet';
import { validatePetForm } from '../validation/pet';

export type PetStatus = 'idle' | 'loading' | 'ready' | 'error';

export type SaveResult = { ok: boolean; pet: PetRow | null; warning: string | null };

export type UseMyPet = {
  status: PetStatus;
  pet: PetRow | null;
  photoUrl: string | null;
  saving: boolean;
  error: string | null;
  fieldErrors: FieldErrors<keyof PetFormValues>;
  save: (values: PetFormValues, photo?: File | null) => Promise<SaveResult>;
  reload: () => void;
};

/**
 * Profil animal du compte connecté : chargement, création ou édition validée, puis photo facultative.
 * Si la photo échoue, l'animal reste enregistré et un avertissement est renvoyé.
 */
export function useMyPet(client: FurrixClient | null, userId: string | null): UseMyPet {
  const [status, setStatus] = useState<PetStatus>('idle');
  const [pet, setPet] = useState<PetRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof PetFormValues>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const current = useRef<string | null>(userId);
  current.current = userId;

  useEffect(() => {
    setPet(null);
    setError(null);
    setFieldErrors({});
    if (!client || !userId) {
      setStatus('idle');
      return;
    }
    let active = true;
    setStatus('loading');
    petsService
      .fetchMyPet(client, userId)
      .then((row) => {
        if (!active) return;
        setPet(row);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(toDataError(e).message);
        setStatus('error');
      });
    return () => { active = false; };
  }, [client, userId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const save = useCallback(
    async (values: PetFormValues, photo?: File | null): Promise<SaveResult> => {
      setError(null);
      setFieldErrors({});
      const checked = validatePetForm(values);
      if (!checked.ok) {
        setFieldErrors(checked.errors);
        return { ok: false, pet: null, warning: null };
      }
      if (photo) {
        const problem = petPhotos.validatePhotoFile(photo);
        if (problem) {
          setError(problem);
          return { ok: false, pet: null, warning: null };
        }
      }
      if (!client || !userId) {
        setError('Session expirée : reconnecte-toi.');
        return { ok: false, pet: null, warning: null };
      }
      const owner = userId;
      setSaving(true);
      try {
        let saved = pet
          ? await petsService.updatePet(client, pet.id, checked.value)
          : await petsService.createPet(client, owner, checked.value);
        let warning: string | null = null;
        if (photo) {
          const outcome = await replacePetPhoto(client, { userId: owner, pet: saved, file: photo });
          saved = outcome.pet;
          if (outcome.status === 'failed') warning = `Profil enregistré. ${outcome.error.message}`;
        }
        if (current.current === owner) {
          setPet(saved);
          setStatus('ready');
        }
        return { ok: true, pet: saved, warning };
      } catch (e) {
        setError(toDataError(e).message);
        return { ok: false, pet: null, warning: null };
      } finally {
        setSaving(false);
      }
    },
    [client, userId, pet],
  );

  const firstPhoto = pet?.photos?.[0] ?? null;
  const photoUrl = client && firstPhoto ? petPhotos.petPhotoUrl(client, firstPhoto) : null;

  return { status, pet, photoUrl, saving, error, fieldErrors, save, reload };
}
