import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { approximateLocation, locationMessage } from './location';

vi.mock('@capacitor/geolocation', () => ({ Geolocation: { requestPermissions: vi.fn(), getCurrentPosition: vi.fn() } }));
beforeEach(() => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it('Android atteint le parcours natif d’activation sans précontrôle bloquant', async () => {
  vi.mocked(Geolocation.requestPermissions).mockRejectedValue({ code: 'OS-PLUG-GLOC-0007' });
  vi.mocked(Geolocation.getCurrentPosition).mockResolvedValue({ coords: { latitude: 50.634, longitude: 3.062 } } as never);
  await expect(approximateLocation()).resolves.toEqual({ latitude: 50.63, longitude: 3.06 });
  expect(Geolocation.requestPermissions).not.toHaveBeenCalled();
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledWith(expect.objectContaining({ enableHighAccuracy: false }));
});

it.each([['OS-PLUG-GLOC-0003', 'denied'], ['OS-PLUG-GLOC-0010', 'timeout'], ['OS-PLUG-GLOC-0009', 'unavailable']])('comprend le refus natif %s et permet une nouvelle demande', async (code, reason) => {
  vi.mocked(Geolocation.getCurrentPosition).mockRejectedValueOnce({ code }).mockResolvedValueOnce({ coords: { latitude: 50.63, longitude: 3.06 } } as never);
  await expect(approximateLocation()).rejects.toMatchObject({ reason });
  await expect(approximateLocation()).resolves.toEqual({ latitude: 50.63, longitude: 3.06 });
});

it('le message ne suppose ni Windows ni la position du champ', () => {
  expect(locationMessage.unavailable).not.toMatch(/windows|ci-dessous/i);
  expect(locationMessage.unavailable).toContain('localisation est activée');
});
