import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ native: true, finished: null as null | (() => void), remove: vi.fn(), open: vi.fn() }));
vi.mock('@capacitor/core', async (original) => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => state.native } };
});
vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: state.open,
    addListener: vi.fn(async (_event: string, cb: () => void) => { state.finished = cb; return { remove: state.remove }; }),
  },
}));

import { openSecureBrowser } from './secureBrowser';

afterEach(() => { vi.clearAllMocks(); state.finished = null; });

describe('navigateur sécurisé', () => {
  it('ouvre le navigateur système (SFSafariViewController / Custom Tabs) et signale sa fermeture une fois', async () => {
    const closed = vi.fn();
    await openSecureBrowser('https://connect.stripe.com/x', closed);
    expect(state.open).toHaveBeenCalledWith({ url: 'https://connect.stripe.com/x', presentationStyle: 'fullscreen' });
    state.finished!();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(state.remove).toHaveBeenCalledTimes(1);
  });

  it('retire l’écoute si l’ouverture échoue', async () => {
    state.open.mockRejectedValueOnce(new Error('indisponible'));
    await expect(openSecureBrowser('https://connect.stripe.com/x', () => {})).rejects.toThrow();
    expect(state.remove).toHaveBeenCalledTimes(1);
  });
});
