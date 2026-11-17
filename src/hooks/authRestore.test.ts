import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeSupabase, fakeSession } from '../test/fakeSupabase';
import { useAuth } from './useAuth';

describe('restauration de session et événement concurrent', () => {
  it('ne rétablit pas une session ancienne après un événement de déconnexion', async () => {
    const fake = createFakeSupabase();
    let finish!: (value: any) => void;
    fake.auth.getSession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useAuth(fake.client));
    act(() => fake.emitAuth('SIGNED_OUT', null));
    await act(async () => { finish({ data: { session: fakeSession() }, error: null }); });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.session).toBeNull();
  });
  it('ne remplace pas une connexion récente par une restauration vide', async () => {
    const fake = createFakeSupabase();
    let finish!: (value: any) => void;
    fake.auth.getSession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useAuth(fake.client));
    act(() => fake.emitAuth('SIGNED_IN', fakeSession()));
    await act(async () => { finish({ data: { session: null }, error: null }); });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
  });
});
