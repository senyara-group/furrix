import { describe, expect, it } from 'vitest';
import { resolveAppEntry } from './entry';

describe('entrée publique de l’application', () => {
  it('affiche le nouveau parcours sans variable de sélection', () => {
    expect(resolveAppEntry(undefined, false)).toBe('product');
    expect(resolveAppEntry('', false)).toBe('product');
    expect(resolveAppEntry('auth', false)).toBe('product');
  });
  it('ne publie plus les anciennes démonstrations même avec une ancienne configuration', () => {
    expect(resolveAppEntry('mvp', false)).toBe('product');
    expect(resolveAppEntry('legacy', false)).toBe('product');
    expect(resolveAppEntry('mvp', true)).toBe('mvp');
    expect(resolveAppEntry('legacy', true)).toBe('legacy');
  });
  it('ne permet pas à un aperçu de contourner la session en production', () => {
    expect(resolveAppEntry('home-preview', false)).toBe('unavailable');
    expect(resolveAppEntry('home-preview', true)).toBe('home-preview');
    expect(resolveAppEntry('typo', false)).toBe('unavailable');
    expect(resolveAppEntry('platform-check', false)).toBe('platform-check');
  });
});
