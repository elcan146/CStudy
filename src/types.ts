/**
 * Standard JavaScript Day of Week (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 * Aligned with Date.prototype.getDay().
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Human-readable mapping of day indexes to names.
 */
export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/**
 * Target study time allocated for each day of the week in milliseconds.
 * Day keys correspond to DayOfWeek (0 to 6).
 */
export type DailyTargetsMap = Record<DayOfWeek, number>;

/**
 * Breakdown of time studied for each day of the week in milliseconds.
 */
export type DailyStudiedMap = Record<DayOfWeek, number>;

/**
 * Tier definition for normal overstudy discounts (applied to tomorrow/next active day).
 */
export interface NormalDiscountTier {
  minOverstudyMinutes: number;
  maxOverstudyMinutes: number; // inclusive upper bound or Infinity
  discountMinutes: number;
}

/**
 * Tier definition for extra study discounts (applied to all remaining active days of the week).
 */
export interface ExtraStudyDiscountTier {
  minExtraMinutes: number;
  maxExtraMinutes: number; // inclusive upper bound or Infinity
  discountMinutesPerRemainingDay: number;
}

/**
 * A completed focus session, stored newest-first in history.
 */
export interface StudySessionRecord {
  id: string;
  timestamp: number;
  durationMs: number;
  isExtraStudy: boolean;
  dateKey: string;
}

/**
 * Summary result returned when a focus session ends.
 */
export interface SessionResult {
  /** Elapsed focus duration in milliseconds */
  elapsedMs: number;
  /** Whether this session was tracked in extra study mode */
  isExtraStudy: boolean;
  /** Total studied today after this session (ms) */
  todayStudiedMs: number;
  /** Total extra studied today after this session (ms) */
  todayExtraStudiedMs: number;
  /** Current day's target (ms) */
  dailyTargetMs: number;
  /** Whether the daily target was reached or already met */
  targetMet: boolean;
  /** Overstudy discount applied to next active day (ms) if applicable */
  normalOverstudyDiscountAppliedMs: number;
  /** Extra study discount applied to each remaining active day (ms) if applicable */
  extraDiscountAppliedPerRemainingDayMs: number;
}

/**
 * Summary of penalty and discount redistribution when a new day is processed.
 */
export interface RolloverSummary {
  /** The date key of the day being closed (YYYY-MM-DD) */
  closedDate: string;
  /** Day of week of the closed day */
  closedDayOfWeek: DayOfWeek;
  /** The date key of the new current day (YYYY-MM-DD) */
  newDate: string;
  /** Day of week of the new current day */
  newDayOfWeek: DayOfWeek;
  /** Whether a new week boundary (Monday) was crossed */
  isNewWeek: boolean;
  /** Deficit incurred on the closed day (ms) */
  deficitMs: number;
  /** List of remaining active days that received the distributed penalty */
  penalizedDays: DayOfWeek[];
  /** Penalty added to each remaining active day (ms) */
  penaltyPerDayMs: number;
}

/**
 * The persistent state properties managed by the Zustand store.
 */
export interface StudyTrackerState {
  /** Timestamp (epoch ms) of the current week's Monday at 00:00:00 local time */
  currentWeekStart: number;

  /** Total study goal for the week in hours (e.g., 25) */
  weeklyTargetHours: number;

  /**
   * Days where no study is scheduled (e.g., [0, 6] for Sunday & Saturday).
   * Day numbers follow Date.prototype.getDay() (0 = Sunday, 6 = Saturday).
   */
  restDays: DayOfWeek[];

  /**
   * Specific calendar dates marked as rest days via the calendar
   * (YYYY-MM-DD). A date is rest when its weekday is in restDays or its
   * date key appears here.
   */
  restDates: string[];

  /**
   * UI mode for the calendar's rest-day manager: true = pick recurring
   * rest weekdays (every week), false = mark individual dates.
   */
  weeklyRestMode: boolean;

  /**
   * Target study duration for each specific day of the current week in milliseconds.
   * Rest days are set to 0. Active days receive the base target adjusted for penalties/discounts.
   */
  dailyTargets: DailyTargetsMap;

  /** Total study time logged today in normal mode (ms) */
  todayStudiedMs: number;

  /** Total study time logged today in extra study mode after meeting daily target (ms) */
  todayExtraStudiedMs: number;

  /**
   * Toggle flag manually enabled by the user when they have met their daily target
   * and want further sessions to contribute to multi-day discounts.
   */
  isExtraStudyMode: boolean;

  /**
   * Timestamp (epoch ms) recorded when the app transitioned to the background.
   * Null if no session is currently in progress.
   */
  sessionStartTime: number | null;

  /**
   * Local date string (YYYY-MM-DD) when the app last logged in or processed state.
   * Used to detect date transitions across midnight.
   */
  lastLoginDate: string;

  /**
   * Tracks the normal overstudy discount already applied to tomorrow today (ms).
   * Ensures idempotency across multiple session completions on the same day.
   */
  normalDiscountAppliedTodayMs: number;

  /**
   * Tracks the extra study discount already applied per remaining day today (ms).
   * Ensures idempotency across multiple extra-study session completions on the same day.
   */
  extraDiscountAppliedPerRemainingDayTodayMs: number;

  /**
   * Whether a focus tracking session is currently armed/active.
   */
  isSessionActive: boolean;

  /**
   * Whether the user armed focus mode (tapped start) — a session only begins
   * on screen-off while armed. Transient, not persisted.
   */
  isSessionArmed: boolean;

  /**
   * Result of the most recently completed session (for post-session prompts).
   * Transient, not persisted.
   */
  lastSessionResult: SessionResult | null;

  /**
   * Completed focus sessions, newest first.
   */
  history: StudySessionRecord[];

  /**
   * OLED dark theme flag.
   */
  isDarkTheme: boolean;
}

/**
 * Action methods exposed by the Study Tracker Zustand store.
 */
export interface StudyTrackerActions {
  /**
   * Initializes or reconfigures a week's targets and rest days.
   * @param weeklyTargetHours Total hours desired for the week.
   * @param restDays Array of rest days (0 = Sunday, 6 = Saturday).
   */
  setupWeek: (weeklyTargetHours: number, restDays: DayOfWeek[]) => void;

  /**
   * Records the start of a study session (invoked when app enters background or user starts).
   * @param timestamp Optional epoch ms (defaults to Date.now()).
   */
  startSession: (timestamp?: number) => void;

  /**
   * Ends the current study session, calculates elapsed time, updates today's totals,
   * checks for target completion, and applies tiered discounts.
   * @param timestamp Optional epoch ms (defaults to Date.now()).
   * @returns SessionResult or null if no session was active.
   */
  endSession: (timestamp?: number) => SessionResult | null;

  /**
   * Cancels the active session without recording any studied time.
   */
  cancelSession: () => void;

  /**
   * Toggles the "Extra Study Mode" flag.
   * Allowed only after the daily target is reached.
   * @param enabled Optional explicit boolean; toggles if omitted.
   */
  setExtraStudyMode: (enabled?: boolean) => void;

  /**
   * Checks whether the calendar date has changed since lastLoginDate.
   * If a day boundary has passed, calculates deficits for uncompleted active days,
   * distributes penalties across remaining days, resets daily counters, and handles
   * clean resets when crossing into a new week.
   * @param currentTimestamp Optional epoch ms for deterministic testing.
   * @returns RolloverSummary or null if still on the same day.
   */
  checkNewDayAndRollover: (currentTimestamp?: number) => RolloverSummary | null;

  /**
   * Manually adjusts a specific day's target (clamped to floor of 0 ms).
   * @param day Day of week to adjust.
   * @param targetMs New target in milliseconds.
   */
  setDailyTarget: (day: DayOfWeek, targetMs: number) => void;

  /**
   * Arms focus mode — the next screen-off starts a session.
   */
  armSession: () => void;

  /**
   * Disarms focus mode without starting a session.
   */
  disarmSession: () => void;

  /**
   * Removes the discounts earned by a session (forfeit bonus).
   */
  revokeSessionDiscounts: (result: SessionResult | null) => void;

  /**
   * Resets all store values back to default initial state.
   */
  resetStore: () => void;

  /**
   * Toggles a specific calendar date as a rest day (YYYY-MM-DD) and
   * rebalances the current week's target across remaining active days.
   */
  toggleRestDate: (dateKey: string) => void;

  /**
   * Toggles a weekday as a recurring rest day (applies every week) and
   * rebalances the current week's target.
   */
  toggleRestDay: (day: DayOfWeek) => void;

  /**
   * Switches the calendar rest manager between per-date and weekly modes.
   */
  setWeeklyRestMode: (enabled: boolean) => void;

  /**
   * Updates the weekly hour goal and re-splits it across this week's active
   * days — without resetting today's progress like setupWeek does.
   */
  setWeeklyTarget: (hours: number) => void;

  /**
   * Toggles between OLED dark and light themes.
   */
  toggleTheme: () => void;

  /**
   * Deletes all recorded session history.
   */
  clearHistory: () => void;

  /**
   * Simulates a study session that ended `minutes` ago (for testing the rules).
   */
  simulateStudy: (minutes: number) => SessionResult | null;

  /**
   * Simulates a day rollover where the closed day missed its target by
   * `deficitMinutes` (0 = clean day). Returns the rollover summary.
   */
  simulateDayRollover: (deficitMinutes?: number) => RolloverSummary | null;
}

/**
 * Combined Zustand store type containing state properties and action handlers.
 */
export type StudyTrackerStore = StudyTrackerState & StudyTrackerActions;
