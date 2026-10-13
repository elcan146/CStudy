import { DayOfWeek, NormalDiscountTier, ExtraStudyDiscountTier } from './types';

/** Millisecond conversion factors */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND; // 60,000 ms
export const MS_PER_HOUR = 60 * MS_PER_MINUTE; // 3,600,000 ms

/**
 * Standard weekly sequence of days starting on Monday (1) through Sunday (0).
 * Matches academic and work calendars.
 */
export const WEEK_DAYS_SEQUENCE: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * Tiers for normal overstudy sessions (applied to the next active day).
 *
 * Tier 1: 30–59 minutes over -> 10 minutes discount
 * Tier 2: 60–119 minutes over -> 20 minutes discount
 * Tier 3: 120+ minutes over -> 30 minutes discount
 */
export const NORMAL_OVERSTUDY_TIERS: readonly NormalDiscountTier[] = [
  { minOverstudyMinutes: 30, maxOverstudyMinutes: 59, discountMinutes: 10 },
  { minOverstudyMinutes: 60, maxOverstudyMinutes: 119, discountMinutes: 20 },
  { minOverstudyMinutes: 120, maxOverstudyMinutes: Infinity, discountMinutes: 30 },
] as const;

/**
 * Tiers for extra study sessions (applied to all remaining active days in the current week).
 *
 * Tier 1: 60–119 minutes extra -> 3 minutes discount per remaining day
 * Tier 2: 120–179 minutes extra -> 6 minutes discount per remaining day
 * Tier 3: 180+ minutes extra -> 9 minutes discount per remaining day
 */
export const EXTRA_STUDY_TIERS: readonly ExtraStudyDiscountTier[] = [
  { minExtraMinutes: 60, maxExtraMinutes: 119, discountMinutesPerRemainingDay: 3 },
  { minExtraMinutes: 120, maxExtraMinutes: 179, discountMinutesPerRemainingDay: 6 },
  { minExtraMinutes: 180, maxExtraMinutes: Infinity, discountMinutesPerRemainingDay: 9 },
] as const;

/** Minimum allowed daily study target in milliseconds */
export const MIN_DAILY_TARGET_FLOOR_MS = 0;

/** Default weekly hours if unconfigured */
export const DEFAULT_WEEKLY_TARGET_HOURS = 20;

/** Default rest days: Sunday (0) and Saturday (6) */
export const DEFAULT_REST_DAYS: DayOfWeek[] = [0, 6];

/** Storage key used by Zustand persist middleware */
export const STUDY_TRACKER_STORAGE_KEY = '@study_tracker_state_v1';
