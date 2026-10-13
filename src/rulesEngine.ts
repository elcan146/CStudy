import {
  DayOfWeek,
  DailyTargetsMap,
} from './types';
import {
  MS_PER_MINUTE,
  MS_PER_HOUR,
  WEEK_DAYS_SEQUENCE,
  NORMAL_OVERSTUDY_TIERS,
  EXTRA_STUDY_TIERS,
  MIN_DAILY_TARGET_FLOOR_MS,
} from './constants';

/**
 * Returns the Date representing Monday at 00:00:00.000 (local time) of the given date's week.
 * In JavaScript, getDay() returns 0 for Sunday, 1 for Monday, etc.
 *
 * @param date Reference date.
 * @returns Date instance pointing to Monday 00:00:00.000.
 */
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Number of days to subtract to reach Monday:
  // Mon (1) -> 0
  // Tue (2) -> 1
  // ...
  // Sat (6) -> 5
  // Sun (0) -> 6
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

/**
 * Formats a Date object into a canonical local date key: "YYYY-MM-DD".
 * Avoids UTC timezone conversion shifts.
 *
 * @param date Reference date.
 * @returns String in YYYY-MM-DD format.
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a "YYYY-MM-DD" local date string into a Date instance at local midnight.
 *
 * @param dateKey Date key string.
 * @returns Date object at 00:00:00.000 local time.
 */
export function parseDateKey(dateKey: string): Date {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid date key format: ${dateKey}. Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return d;
}

/**
 * Checks if two date keys belong to different calendar weeks (weeks starting on Monday).
 *
 * @param dateKeyA First date key.
 * @param dateKeyB Second date key.
 * @returns True if they are in different calendar weeks.
 */
export function isDifferentCalendarWeek(dateKeyA: string, dateKeyB: string): boolean {
  const mondayA = getMondayOfWeek(parseDateKey(dateKeyA)).getTime();
  const mondayB = getMondayOfWeek(parseDateKey(dateKeyB)).getTime();
  return mondayA !== mondayB;
}

/**
 * Calculates the number of active study days in a week given the rest days.
 * Clamps to at least 1 active day to prevent division by zero.
 *
 * @param restDays Array of rest days (0 = Sun, 6 = Sat).
 * @returns Number of active days (between 1 and 7).
 */
export function calculateActiveDaysCount(restDays: DayOfWeek[]): number {
  const uniqueRestDays = new Set(restDays);
  const activeCount = 7 - uniqueRestDays.size;
  return Math.max(1, activeCount);
}

/**
 * Calculates the base daily study target in milliseconds for active days.
 * Formula: (weeklyTargetHours * 3,600,000) / activeDays
 *
 * @param weeklyTargetHours Total weekly study goal in hours.
 * @param restDays Array of rest days.
 * @returns Milliseconds allocated per active day (rounded to nearest ms).
 */
export function calculateBaseDailyTargetMs(
  weeklyTargetHours: number,
  restDays: DayOfWeek[]
): number {
  if (weeklyTargetHours <= 0) return 0;
  const activeDays = calculateActiveDaysCount(restDays);
  const totalWeeklyMs = weeklyTargetHours * MS_PER_HOUR;
  return Math.round(totalWeeklyMs / activeDays);
}

/**
 * Constructs the initial daily target map for all 7 days of the week.
 * Non-rest days receive the base target; rest days receive 0.
 *
 * @param weeklyTargetHours Total weekly study goal in hours.
 * @param restDays Array of rest days.
 * @returns DailyTargetsMap with targets for day 0 through 6.
 */
export function createInitialDailyTargets(
  weeklyTargetHours: number,
  restDays: DayOfWeek[]
): DailyTargetsMap {
  const baseTarget = calculateBaseDailyTargetMs(weeklyTargetHours, restDays);
  const restSet = new Set(restDays);

  const targets: Partial<DailyTargetsMap> = {};
  for (let d = 0; d < 7; d++) {
    const day = d as DayOfWeek;
    targets[day] = restSet.has(day) ? 0 : baseTarget;
  }
  return targets as DailyTargetsMap;
}

/**
 * Returns all active days remaining in the current calendar week strictly after the specified day.
 * The week runs Monday (1) -> Tuesday (2) -> ... -> Saturday (6) -> Sunday (0).
 *
 * @param currentDay The reference day of week.
 * @param restDays List of rest days.
 * @returns Array of active DayOfWeek occurring later in the same week.
 */
export function getRemainingActiveDaysInWeek(
  currentDay: DayOfWeek,
  restDays: DayOfWeek[]
): DayOfWeek[] {
  const restSet = new Set(restDays);
  const currentIndex = WEEK_DAYS_SEQUENCE.indexOf(currentDay);

  if (currentIndex === -1 || currentIndex === WEEK_DAYS_SEQUENCE.length - 1) {
    // Current day is the last day of the week (Sunday) or not found: no days remain in this week.
    return [];
  }

  const remainingDays = WEEK_DAYS_SEQUENCE.slice(currentIndex + 1);
  return remainingDays.filter((day) => !restSet.has(day));
}

/**
 * Finds the immediate next active study day after currentDay.
 * Looks ahead within the current week first; if current day is the last active day
 * of the week, wraps to the first active day of the week.
 *
 * @param currentDay The reference day of week.
 * @param restDays List of rest days.
 * @returns The next active DayOfWeek or null if all 7 days are rest days.
 */
export function getNextActiveDay(
  currentDay: DayOfWeek,
  restDays: DayOfWeek[]
): DayOfWeek | null {
  const restSet = new Set(restDays);
  if (restSet.size >= 7) return null;

  const currentIndex = WEEK_DAYS_SEQUENCE.indexOf(currentDay);
  // Search the rest of the current week first
  for (let i = currentIndex + 1; i < WEEK_DAYS_SEQUENCE.length; i++) {
    const day = WEEK_DAYS_SEQUENCE[i];
    if (!restSet.has(day)) {
      return day;
    }
  }

  // Wrap around to the start of the week (Monday onwards)
  for (let i = 0; i <= currentIndex; i++) {
    const day = WEEK_DAYS_SEQUENCE[i];
    if (!restSet.has(day)) {
      return day;
    }
  }

  return null;
}

/**
 * Calculates the discount (in milliseconds) to subtract from tomorrow's target
 * based on the minutes exceeded during a normal study session.
 *
 * Rules:
 *  - 30-59 mins over: Subtract 10 mins (600,000 ms)
 *  - 60-119 mins over: Subtract 20 mins (1,200,000 ms)
 *  - 120+ mins over: Subtract 30 mins (1,800,000 ms)
 *
 * @param overstudyMs Total milliseconds studied beyond the daily target.
 * @returns Discount in milliseconds.
 */
export function calculateNormalOverstudyDiscountMs(overstudyMs: number): number {
  if (overstudyMs <= 0) return 0;
  const overstudyMinutes = Math.floor(overstudyMs / MS_PER_MINUTE);

  for (const tier of NORMAL_OVERSTUDY_TIERS) {
    if (
      overstudyMinutes >= tier.minOverstudyMinutes &&
      overstudyMinutes <= tier.maxOverstudyMinutes
    ) {
      return tier.discountMinutes * MS_PER_MINUTE;
    }
  }

  return 0;
}

/**
 * Calculates the discount (in milliseconds) to subtract from ALL remaining active days
 * in the week based on extra study time logged in isExtraStudyMode.
 *
 * Rules:
 *  - 60-119 mins extra: Subtract 3 mins (180,000 ms) per remaining day
 *  - 120-179 mins extra: Subtract 6 mins (360,000 ms) per remaining day
 *  - 180+ mins extra: Subtract 9 mins (540,000 ms) per remaining day
 *
 * @param extraStudiedMs Total extra study time logged today in milliseconds.
 * @returns Discount in milliseconds per remaining active day.
 */
export function calculateExtraStudyDiscountPerRemainingDayMs(extraStudiedMs: number): number {
  if (extraStudiedMs <= 0) return 0;
  const extraMinutes = Math.floor(extraStudiedMs / MS_PER_MINUTE);

  for (const tier of EXTRA_STUDY_TIERS) {
    if (
      extraMinutes >= tier.minExtraMinutes &&
      extraMinutes <= tier.maxExtraMinutes
    ) {
      return tier.discountMinutesPerRemainingDay * MS_PER_MINUTE;
    }
  }

  return 0;
}

/**
 * Distributes an uncompleted study deficit evenly across remaining active days of the week.
 *
 * @param deficitMs Deficit time in milliseconds (target - studied).
 * @param remainingActiveDays Array of active days left in the week.
 * @returns Penalty in milliseconds to add to each remaining day.
 */
export function calculateDeficitPenaltyPerDayMs(
  deficitMs: number,
  remainingActiveDays: DayOfWeek[]
): number {
  if (deficitMs <= 0 || remainingActiveDays.length === 0) {
    return 0;
  }
  return Math.round(deficitMs / remainingActiveDays.length);
}

/**
 * Safely applies a discount to a target duration, ensuring the target
 * never falls below the configured floor (0 ms).
 *
 * @param currentTargetMs Current target in milliseconds.
 * @param discountMs Discount to deduct in milliseconds.
 * @param floorMs Minimum allowable floor (defaults to MIN_DAILY_TARGET_FLOOR_MS = 0).
 * @returns Resulting target in milliseconds.
 */
export function applyDiscountToTarget(
  currentTargetMs: number,
  discountMs: number,
  floorMs: number = MIN_DAILY_TARGET_FLOOR_MS
): number {
  return Math.max(floorMs, currentTargetMs - discountMs);
}

/**
 * A date counts as a rest day when its weekday is configured as a rest day
 * OR when that specific calendar date was marked as a rest date.
 */
export function isRestOnDate(
  date: Date,
  restDays: DayOfWeek[],
  restDates: string[]
): boolean {
  return (
    restDays.includes(date.getDay() as DayOfWeek) ||
    restDates.includes(formatDateKey(date))
  );
}

/**
 * Builds the daily target map for the specific week containing `weekStart`.
 * Unlike createInitialDailyTargets, a weekday is inactive for this week when
 * its specific date is a configured rest weekday or a marked rest date.
 */
export function createWeekDailyTargets(
  weeklyTargetHours: number,
  restDays: DayOfWeek[],
  restDates: string[],
  weekStart: Date
): DailyTargetsMap {
  const targets: Partial<DailyTargetsMap> = {};
  const active: DayOfWeek[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dow = d.getDay() as DayOfWeek;
    if (isRestOnDate(d, restDays, restDates)) {
      targets[dow] = 0;
    } else {
      active.push(dow);
    }
  }
  const base =
    weeklyTargetHours > 0
      ? Math.round((weeklyTargetHours * MS_PER_HOUR) / Math.max(1, active.length))
      : 0;
  for (const dow of active) targets[dow] = base;
  return targets as DailyTargetsMap;
}

/**
 * Active days remaining after `from` within the same calendar week,
 * skipping both rest weekdays and marked rest dates.
 */
export function remainingActiveDaysInWeek(
  from: Date,
  restDays: DayOfWeek[],
  restDates: string[]
): DayOfWeek[] {
  const out: DayOfWeek[] = [];
  const weekStart = getMondayOfWeek(from).getTime();
  for (let i = 1; i <= 6; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    if (getMondayOfWeek(d).getTime() !== weekStart) break;
    if (!isRestOnDate(d, restDays, restDates)) {
      out.push(d.getDay() as DayOfWeek);
    }
  }
  return out;
}

/**
 * The next day after `from` that is not a rest weekday or marked rest date,
 * searching up to a week ahead. Returns that date's day-of-week.
 */
export function nextActiveDay(
  from: Date,
  restDays: DayOfWeek[],
  restDates: string[]
): DayOfWeek | null {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    if (!isRestOnDate(d, restDays, restDates)) {
      return d.getDay() as DayOfWeek;
    }
  }
  return null;
}
