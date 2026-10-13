import { AppState, AppStateStatus, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export interface ScreenChange {
  interactive: boolean;
  unlocked: boolean;
}

type Listener = (change: ScreenChange) => void;

export interface SystemInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface ScreenStateNativeModule {
  addListener(
    event: string,
    cb: (event: ScreenChange) => void
  ): { remove: () => void };
  isInteractive(): boolean;
  isUnlocked(): boolean;
  getSystemInsets(): SystemInsets;
}

// The native module only exists in development/production builds.
// In Expo Go it fails to resolve and we fall back to AppState, which
// cannot distinguish a locked screen from switching apps.
let native: ScreenStateNativeModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../modules/screen-state/src/ScreenStateModule');
  native = (mod.default ?? mod) as ScreenStateNativeModule;
} catch {
  native = null;
}

export const hasNativeScreenState =
  native != null && Platform.OS === 'android';

export function isInteractive(): boolean {
  if (hasNativeScreenState && native) {
    try {
      return native.isInteractive();
    } catch {
      // fall through
    }
  }
  return AppState.currentState === 'active';
}

// Real system-bar insets from the window — only exists in builds that
// include this function, so a missing/throwing call returns null.
export function getSystemInsets(): SystemInsets | null {
  if (hasNativeScreenState && native) {
    try {
      const insets = native.getSystemInsets();
      if (insets && typeof insets.bottom === 'number') return insets;
    } catch {
      // older dev client: function not in the binary yet
    }
  }
  return null;
}

export function isUnlocked(): boolean {
  if (hasNativeScreenState && native) {
    try {
      return native.isUnlocked();
    } catch {
      // fall through
    }
  }
  return AppState.currentState === 'active';
}

// expo-navigation-bar's JS entry throws when the native module is absent —
// go through requireOptionalNativeModule, which returns null instead.
const navBarModule =
  requireOptionalNativeModule<{ setStyle?: (s: 'light' | 'dark') => void }>(
    'ExpoNavigationBar'
  );

/**
 * Sets the system navigation-bar button style. 'light' = light buttons
 * (for dark content), 'dark' = dark buttons. No-op on builds without
 * the expo-navigation-bar native module.
 */
export function setSystemNavBarStyle(style: 'light' | 'dark') {
  try {
    navBarModule?.setStyle?.(style);
  } catch {
    // older dev client — keep system colors
  }
}

export function addScreenStateListener(cb: Listener): () => void {
  if (hasNativeScreenState && native) {
    const sub = native.addListener('onScreenState', cb);
    return () => sub.remove();
  }
  const sub = AppState.addEventListener(
    'change',
    (next: AppStateStatus) => {
      if (next === 'active') {
        cb({ interactive: true, unlocked: true });
      } else {
        cb({ interactive: false, unlocked: false });
      }
    }
  );
  return () => sub.remove();
}
