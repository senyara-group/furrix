import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  native: true,
  listeners: [] as Array<{ cb: () => void; removed: boolean }>,
  open: vi.fn(),
}));
vi.mock('@capacitor/core', async (original) => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => state.native } };
});
vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: state.open,
    addListener: vi.fn(async (_event: string, cb: () => void) => {
      const entry = { cb, removed: false };
      state.listeners.push(entry);
      return { remove: async () => { entry.removed = true; } };
    }),
  },
}));

import { activeBrowserListeners, openSecureBrowser } from './secureBrowser';

/** Ce que ferait le plugin à la fermeture : prévenir chaque écoute encore enregistrée. */
const finish = () => state.listeners.filter((l) => !l.removed).forEach((l) => l.cb());
const live = () => state.listeners.filter((l) => !l.removed).length;

afterEach(() => { vi.clearAllMocks(); state.listeners = []; });

describe('navigateur sécurisé', () => {
  it('ouvre le navigateur système (SFSafariViewController / Custom Tabs) et signale sa fermeture une fois', async () => {
    const closed = vi.fn();
    await openSecureBrowser('https://connect.stripe.com/x', closed);
    expect(state.open).toHaveBeenCalledWith({ url: 'https://connect.stripe.com/x', presentationStyle: 'fullscreen' });
    finish(); finish();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(live()).toBe(0);
    expect(activeBrowserListeners()).toBe(0);
  });

  it('fermer puis rouvrir ne laisse jamais deux écoutes actives', async () => {
    const first = vi.fn(), second = vi.fn(), third = vi.fn();
    await openSecureBrowser('https://connect.stripe.com/1', first);
    finish();
    await openSecureBrowser('https://connect.stripe.com/2', second);
    expect(live()).toBe(1);
    // Rouverte sans fermeture signalée (événement perdu) : l'écoute précédente est retirée.
    await openSecureBrowser('https://connect.stripe.com/3', third);
    expect(live()).toBe(1);
    finish();
    expect([first.mock.calls.length, second.mock.calls.length, third.mock.calls.length]).toEqual([1, 0, 1]);
    expect(live()).toBe(0);
    expect(activeBrowserListeners()).toBe(0);
  });

  it('retire l’écoute si l’ouverture échoue ou si l’écran la retire', async () => {
    state.open.mockRejectedValueOnce(new Error('indisponible'));
    await expect(openSecureBrowser('https://connect.stripe.com/x', () => {})).rejects.toThrow();
    expect(live()).toBe(0);
    const stop = await openSecureBrowser('https://connect.stripe.com/x', () => {});
    stop();
    expect(live()).toBe(0);
    expect(activeBrowserListeners()).toBe(0);
  });
});
