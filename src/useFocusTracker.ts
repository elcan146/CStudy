import { useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { useStudyStore } from './studyStore';
import {
  addScreenStateListener,
  isInteractive,
  isUnlocked,
} from './screenState';
import { SessionResult, RolloverSummary, DayOfWeek } from './types';

export interface UseFocusTrackerOptions {
  /**
   * If true, tracking automatically begins whenever the app transitions into the background.
   * If false, the session must be explicitly armed/started before locking.
   * Defaults to true.
   */
  autoTrackOnBackground?: boolean;

  /**
   * Callback fired when a session finishes and time is credited.
   */
  onSessionEnd?: (result: SessionResult) => void;

  /**
   * Callback fired when a calendar day or week rollover occurs.
   */
  onRollover?: (summary: RolloverSummary) => void;
}

/**
 * Custom React Native hook for managing study focus sessions via AppState timestamp diffing.
 */
export function useFocusTracker(options: UseFocusTrackerOptions = {}) {
  const { autoTrackOnBackground = true, onSessionEnd, onRollover } = options;

  // Store selectors
  const isSessionActive = useStudyStore((state) => state.isSessionActive);
  const isSessionArmed = useStudyStore((state) => state.isSessionArmed);
  const sessionStartTime = useStudyStore((state) => state.sessionStartTime);
  const todayStudiedMs = useStudyStore((state) => state.todayStudiedMs);
  const todayExtraStudiedMs = useStudyStore((state) => state.todayExtraStudiedMs);
  const isExtraStudyMode = useStudyStore((state) => state.isExtraStudyMode);
  const dailyTargets = useStudyStore((state) => state.dailyTargets);
  const weeklyTargetHours = useStudyStore((state) => state.weeklyTargetHours);
  const restDays = useStudyStore((state) => state.restDays);

  // Store actions
  const startSession = useStudyStore((state) => state.startSession);
  const endSession = useStudyStore((state) => state.endSession);
  const cancelSession = useStudyStore((state) => state.cancelSession);
  const setExtraStudyMode = useStudyStore((state) => state.setExtraStudyMode);
  const checkNewDayAndRollover = useStudyStore((state) => state.checkNewDayAndRollover);
  const setupWeek = useStudyStore((state) => state.setupWeek);

  // Calculate today's target based on current day of week
  const todayDayOfWeek = (new Date().getDay()) as DayOfWeek;
  const currentDailyTargetMs = dailyTargets[todayDayOfWeek] ?? 0;
  const isTargetMet = todayStudiedMs >= currentDailyTargetMs;

  /**
   * Check for day boundary shifts whenever component mounts.
   */
  useEffect(() => {
    const summary = checkNewDayAndRollover();
    if (summary && onRollover) {
      onRollover(summary);
    }
  }, [checkNewDayAndRollover, onRollover]);

  /**
   * Screen-state listener. With the native module (dev/production builds) this
   * fires on real screen off / unlock events, so switching to another app does
   * NOT count as study time. In Expo Go it degrades to AppState behavior.
   *
   * Broadcasts can be dropped while the process is dozing, so every foreground
   * transition additionally reconciles against the actual screen/lock state.
   */
  useEffect(() => {
    const finishSession = () => {
      const rolloverSummary = checkNewDayAndRollover();
      if (rolloverSummary && onRollover) {
        onRollover(rolloverSummary);
      }
      if (autoTrackOnBackground) {
        const sessionResult = endSession();
        if (sessionResult && onSessionEnd) {
          onSessionEnd(sessionResult);
        }
      }
    };

    const reconcile = () => {
      if (!isInteractive()) {
        if (autoTrackOnBackground && isSessionArmed && !isSessionActive) {
          startSession();
        }
        return;
      }
      if (isUnlocked()) {
        finishSession();
      }
    };

    const removeScreenListener = addScreenStateListener(
      ({ interactive, unlocked }) => {
        // Phone locked / screen off -> session starts only if the user armed it
        if (!interactive) {
          if (autoTrackOnBackground && isSessionArmed && !isSessionActive) {
            startSession();
          }
          return;
        }
        // Screen on but lockscreen still up -> keep studying, ignore the peek
        if (unlocked) {
          finishSession();
        }
      }
    );

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') reconcile();
    });

    // Cold start: no 'change' event fires for the initial 'active' state, so a
    // session persisted mid-flight would sit unresolved. Reconcile once now.
    if (AppState.currentState === 'active') reconcile();

    return () => {
      removeScreenListener();
      appSub.remove();
    };
  }, [
    autoTrackOnBackground,
    isSessionActive,
    isSessionArmed,
    startSession,
    endSession,
    checkNewDayAndRollover,
    onSessionEnd,
    onRollover,
  ]);

  /**
   * Manual trigger to start a focus session.
   */
  const handleStartSession = useCallback(() => {
    startSession();
  }, [startSession]);

  /**
   * Manual trigger to complete a focus session.
   */
  const handleEndSession = useCallback(() => {
    const result = endSession();
    if (result && onSessionEnd) {
      onSessionEnd(result);
    }
    return result;
  }, [endSession, onSessionEnd]);

  /**
   * Manual trigger to abort/cancel an in-progress session.
   */
  const handleCancelSession = useCallback(() => {
    cancelSession();
  }, [cancelSession]);

  /**
   * Toggles extra study mode.
   */
  const handleToggleExtraStudy = useCallback(
    (enabled?: boolean) => {
      setExtraStudyMode(enabled);
    },
    [setExtraStudyMode]
  );

  return {
    // Current status
    isSessionActive,
    sessionStartTime,
    isExtraStudyMode,
    isTargetMet,

    // Metrics
    todayStudiedMs,
    todayExtraStudiedMs,
    currentDailyTargetMs,
    dailyTargets,
    weeklyTargetHours,
    restDays,

    // Actions
    startStudySession: handleStartSession,
    stopStudySession: handleEndSession,
    cancelStudySession: handleCancelSession,
    toggleExtraStudyMode: handleToggleExtraStudy,
    setupWeek,
    checkRollover: checkNewDayAndRollover,
  };
}
