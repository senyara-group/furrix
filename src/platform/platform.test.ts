import { describe, it, expect, vi } from 'vitest';
import { getAuthRedirect, NATIVE_AUTH_REDIRECT, parseNativeAuthReturn } from './authRedirect';
import { nativeSessionStorage } from './sessionStorage';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  SecureStorage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}));

describe('retours de confirmation', () => {
  it('sépare le schéma natif du retour web, sans chemin fourni par un tiers', () => {
    expect(getAuthRedirect(true, 'https://localhost')).toBe(NATIVE_AUTH_REDIRECT);
    expect(getAuthRedirect(false, 'https://furrix.fr/path')).toBe('https://furrix.fr/#/auth/callback');
    expect(getAuthRedirect(false, 'http://localhost:5173')).toBe('http://localhost:5173/#/auth/callback');
    expect(() => getAuthRedirect(false, 'http://furrix.fr')).toThrow();
    expect(() => getAuthRedirect(false, 'javascript:alert(1)')).toThrow();
  });
  it('ne consomme que le code PKCE du retour exact attendu', () => {
    expect(parseNativeAuthReturn(`${NATIVE_AUTH_REDIRECT}?code=abc`)).toEqual({ code: 'abc' });
    for (const value of ['https://auth/callback?code=a', 'fr.furrix.app://other/callback?code=a',
      'fr.furrix.app://auth/other?code=a', 'fr.furrix.app://auth/callback?code=',
      'fr.furrix.app://auth/callback?code=a&code=b', 'fr.furrix.app://auth/callback#access_token=a',
      'fr.furrix.app://name@auth/callback?code=a', 'invalid']) {
      expect(parseNativeAuthReturn(value)).toBeNull();
    }
    expect(parseNativeAuthReturn(`${NATIVE_AUTH_REDIRECT}?error_code=otp_expired`)).toEqual({ error: true });
  });
});

describe('coffre natif des sessions', () => {
  it('conserve les sessions comme chaînes sans synchronisation iCloud', async () => {
    await nativeSessionStorage.setItem('session', 'value');
    expect(SecureStorage.set).toHaveBeenCalledWith('session', 'value', false, false, 1);
    vi.mocked(SecureStorage.get).mockResolvedValueOnce('value');
    expect(await nativeSessionStorage.getItem('session')).toBe('value');
    await nativeSessionStorage.removeItem('session');
    expect(SecureStorage.remove).toHaveBeenCalledWith('session', false);
  });
  it('ne masque ni corruption ni panne du coffre par un repli non sécurisé', async () => {
    vi.mocked(SecureStorage.get).mockResolvedValueOnce({ unexpected: true });
    await expect(nativeSessionStorage.getItem('session')).rejects.toThrow();
    vi.mocked(SecureStorage.get).mockRejectedValueOnce(new Error('locked'));
    await expect(nativeSessionStorage.getItem('session')).rejects.toThrow('locked');
  });
});
