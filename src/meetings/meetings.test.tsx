import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import type { PetRow } from '../types/database';
import type { MatchMessage } from './types';
import { useActivePet } from './useActivePet';
import * as service from './service';
import * as photos from '../pets/privatePhotos';
import { usePetPhotoUrl } from './usePetPhotoUrl';

const owner = fakeSession().user.id;
const pet: PetRow = { id: 'pet-a', owner_id: owner, name: 'Luna', species: 'chien', breed: 'Croisée', age: null, gender: '♀', purpose: 'balade', city: 'Lille', bio: null, photos: [], verified: false, created_at: '' };
const otherPet: PetRow = { ...pet, id: 'pet-b', name: 'Milo' };
const message: MatchMessage = { id: 1, match_id: 'match-1', sender_id: owner, text: 'Bonjour !', created_at: '2026-11-17T12:00:00Z', read: false, request_id: 'request' };
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('animal actif', () => {
  it('revalide la sélection par compte et par liste, sans accepter un animal étranger', () => {
    const { result, rerender } = renderHook(({ id, pets }) => useActivePet(id, pets), { initialProps: { id: owner, pets: [pet, otherPet] } });
    act(() => result.current.select(otherPet.id)); expect(result.current.active?.id).toBe(otherPet.id);
    rerender({ id: owner, pets: [pet] }); expect(result.current.active?.id).toBe(pet.id);
    rerender({ id: 'other', pets: [pet] }); expect(result.current.active).toBeUndefined();
  });
});

describe('requêtes', () => {
  it('ne passe pas de colonnes arbitraires et borne les messages avant le serveur', async () => {
    const fake = createFakeSupabase();
    await expect(service.sendMessage(fake.client, message.match_id, ' ', 'id')).rejects.toThrow(); expect(fake.raw.rpc).not.toHaveBeenCalled();
    fake.raw.rpc.mockResolvedValueOnce({ data: message, error: null });
    await service.sendMessage(fake.client, message.match_id, ' Bonjour ! ', 'request');
    expect(fake.raw.rpc).toHaveBeenCalledWith('send_match_message', { p_match: message.match_id, p_text: 'Bonjour !', p_request: 'request' });
  });
});

describe('photos', () => {
  it('une même photo n’est téléchargée qu’une fois, puis resservie tout de suite', async () => {
    const fake = createFakeSupabase();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() });
    const download = vi.spyOn(photos, 'downloadPrivatePetPhoto').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    const path = 'owner-1/pet-1/photo.jpg';
    const first = renderHook(() => usePetPhotoUrl(fake.client, path));
    const second = renderHook(() => usePetPhotoUrl(fake.client, path));
    await waitFor(() => expect(first.result.current).toBe('blob:photo'));
    await waitFor(() => expect(second.result.current).toBe('blob:photo'));
    first.unmount(); second.unmount();
    const again = renderHook(() => usePetPhotoUrl(fake.client, path));
    expect(again.result.current).toBe('blob:photo');
    expect(download).toHaveBeenCalledTimes(1);
  });
});

describe('messages', () => {
  it('l’actualisation ne demande que les messages plus récents', async () => {
    const fake = createFakeSupabase();
    await service.loadMessages(fake.client, 'match-1', 42);
    expect(fake.calls).toContainEqual({ table: 'messages', op: 'gt', args: ['id', 42] });
    await service.loadMessages(fake.client, 'match-1');
    expect(fake.calls.filter((c) => c.op === 'gt')).toHaveLength(1);
  });
});
