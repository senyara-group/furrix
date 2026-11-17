/**
 * Design system Furrix « Plein air » — point d'entrée unique.
 *
 *   import './design-system/styles';          // une fois, à la racine
 *   import { Button, Card } from './design-system';
 *
 * Source de référence : artefact « Furrix — Plein air » (voir AGENT.md).
 */
export { tokens, vars } from './tokens/tokens';
export { cx, space, cssVars, type SpaceStep, type PhotoSource } from './utils';
export { getPlatform, isNative, initPlatform, setHapticsHandler, haptic, type Platform, type HapticKind } from './platform';
export { FurrixProvider, useFurrix } from './provider';
export { useMediaQuery, useBreakpoint, DESKTOP_QUERY } from './hooks';
export { Icon, iconNames, type IconName, type IconProps } from './icons/Icon';

export * from './components/Text';
export * from './components/Button';
export * from './components/Selection';
export * from './components/Form';
export * from './components/Feedback';
export * from './components/Layout';
export * from './components/Data';
export * from './components/People';
export * from './components/Cards';
export * from './components/Navigation';
export * from './components/Chat';
export * from './components/Map';
export * from './components/Swipe';
