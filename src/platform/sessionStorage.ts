import { Capacitor } from '@capacitor/core';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';

/** Pas de repli vers localStorage si le coffre natif est indisponible. */
export const nativeSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await SecureStorage.get(key, false, false);
    if (value !== null && typeof value !== 'string') throw new Error('Session locale illisible.');
    return value;
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStorage.set(key, value, false, false, KeychainAccess.whenUnlockedThisDeviceOnly);
  },
  async removeItem(key: string): Promise<void> { await SecureStorage.remove(key, false); },
};

export const sessionStorage = Capacitor.isNativePlatform() ? nativeSessionStorage : undefined;
