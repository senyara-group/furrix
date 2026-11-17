/**
 * Détection de plateforme sans dépendre de @capacitor/core :
 * seul l'objet global `window.Capacitor` (injecté par le conteneur natif) est lu.
 */
export type Platform = 'web' | 'ios' | 'android';
export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

interface CapacitorGlobal {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
}

const cap = (): CapacitorGlobal | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

export function getPlatform(): Platform {
  const p = cap()?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
}

export function isNative(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

/** Pose `data-platform` et `data-native` sur `<html>` (utilisés par styles/native.css). */
export function initPlatform(root: HTMLElement = document.documentElement): void {
  root.dataset.platform = getPlatform();
  root.dataset.native = String(isNative());
}

let handler: ((kind: HapticKind) => void | Promise<void>) | null = null;

/** Branche un retour haptique (ex. @capacitor/haptics). Facultatif. */
export function setHapticsHandler(fn: ((kind: HapticKind) => void | Promise<void>) | null): void {
  handler = fn;
}

export function haptic(kind: HapticKind = 'light'): void {
  try {
    void handler?.(kind);
  } catch {
    /* le retour haptique n'est jamais bloquant */
  }
}
