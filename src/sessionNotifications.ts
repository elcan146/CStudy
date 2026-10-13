import { Platform } from 'react-native';

const CHANNEL_ID = 'study-session';
const NOTIFICATION_ID = 'study-session-active';
const PROMPT_ID = 'study-session-prompt';
const CATEGORY_ID = 'study-session-controls';
const PROMPT_CATEGORY_ID = 'study-session-prompt-controls';
const END_SESSION_ACTION = 'END_SESSION';
const CONTINUE_SESSION_ACTION = 'CONTINUE_SESSION';
const DONE_SESSION_ACTION = 'DONE_SESSION';

type NotificationsModule = typeof import('expo-notifications');

// expo-notifications throws at import time inside Expo Go on Android
// (SDK 53+ removed notification support there), so it has to be required
// lazily. In a development/production build it loads normally.
let cached: NotificationsModule | null | undefined;
function notifs(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function sessionNotificationsSupported(): boolean {
  return notifs() != null;
}

let configured = false;

export async function setupSessionNotifications(): Promise<void> {
  if (configured) return;
  const N = notifs();
  if (!N) return;
  configured = true;

  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Study Session',
      importance: N.AndroidImportance.LOW,
    });
  }

  await N.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: END_SESSION_ACTION,
      buttonTitle: 'End Session',
      options: { opensAppToForeground: true },
    },
  ]);

  await N.setNotificationCategoryAsync(PROMPT_CATEGORY_ID, [
    {
      identifier: CONTINUE_SESSION_ACTION,
      buttonTitle: 'Continue Studying',
      options: { opensAppToForeground: true },
    },
    {
      identifier: DONE_SESSION_ACTION,
      buttonTitle: 'Done',
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
}

async function ensurePermission(): Promise<boolean> {
  const N = notifs();
  if (!N) return false;
  const settings = await N.getPermissionsAsync();
  if (settings.granted) return true;
  if (settings.canAskAgain === false) return false;
  const result = await N.requestPermissionsAsync();
  return result.granted;
}

function elapsedLabel(elapsedMs: number): string {
  const h = Math.floor(elapsedMs / 3600000);
  const m = Math.floor((elapsedMs % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Posts (or updates in place) the ongoing session notification.
 * sticky + autoDismiss:false makes it non-swipeable on Android < 14 and
 * persistent-but-dismissible on Android 14+ (OS limitation).
 */
export async function upsertSessionNotification(elapsedMs: number): Promise<void> {
  const N = notifs();
  if (!N) return;
  try {
    await setupSessionNotifications();
    if (!(await ensurePermission())) return;
    await N.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'Focus session running',
        body: `Elapsed ${elapsedLabel(elapsedMs)}`,
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        autoDismiss: false,
      },
      trigger: null,
    });
  } catch {
    // notifications unavailable on this runtime
  }
}

/**
 * Post-session prompt: "do you wish to continue studying?"
 * Continue -> re-arm focus mode. Done -> forfeit the session's bonus.
 */
export async function showContinuePrompt(elapsedMs: number): Promise<void> {
  const N = notifs();
  if (!N) return;
  try {
    await setupSessionNotifications();
    if (!(await ensurePermission())) return;
    await N.scheduleNotificationAsync({
      identifier: PROMPT_ID,
      content: {
        title: 'Session complete',
        body: `You studied ${elapsedLabel(elapsedMs)}. Wish to continue?`,
        categoryIdentifier: PROMPT_CATEGORY_ID,
      },
      trigger: null,
    });
  } catch {
    // notifications unavailable on this runtime
  }
}

export async function dismissContinuePrompt(): Promise<void> {
  const N = notifs();
  if (!N) return;
  try {
    await N.dismissNotificationAsync(PROMPT_ID);
  } catch {
    // ignore
  }
}

export async function dismissSessionNotification(): Promise<void> {
  const N = notifs();
  if (!N) return;
  try {
    await N.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {
    // ignore
  }
}

export function addSessionNotificationListener(handlers: {
  onEndSession?: () => void;
  onContinueSession?: () => void;
  onDoneSession?: () => void;
}): () => void {
  const N = notifs();
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener((response) => {
    if (response.actionIdentifier === END_SESSION_ACTION) {
      handlers.onEndSession?.();
    } else if (response.actionIdentifier === CONTINUE_SESSION_ACTION) {
      handlers.onContinueSession?.();
    } else if (response.actionIdentifier === DONE_SESSION_ACTION) {
      handlers.onDoneSession?.();
    }
  });
  return () => sub.remove();
}
