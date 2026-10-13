import {
  calculateActiveDaysCount,
  calculateBaseDailyTargetMs,
  createInitialDailyTargets,
  getRemainingActiveDaysInWeek,
  getNextActiveDay,
  calculateNormalOverstudyDiscountMs,
  calculateExtraStudyDiscountPerRemainingDayMs,
  calculateDeficitPenaltyPerDayMs,
  applyDiscountToTarget,
  isDifferentCalendarWeek,
  getMondayOfWeek,
  formatDateKey,
} from '../rulesEngine';
import { MS_PER_MINUTE, MS_PER_HOUR } from '../constants';
import { DayOfWeek } from '../types';

describe('Study Tracker Rules Engine', () => {
  describe('Initial Weekly Setup Math', () => {
    it('calculates active days correctly with default weekend rest days [0, 6]', () => {
      const restDays: DayOfWeek[] = [0, 6]; // Sun, Sat
      expect(calculateActiveDaysCount(restDays)).toBe(5);
    });

    it('calculates active days with 1 rest day (e.g. Sunday)', () => {
      const restDays: DayOfWeek[] = [0];
      expect(calculateActiveDaysCount(restDays)).toBe(6);
    });

    it('clamps to at least 1 active day if all 7 days are provided as rest days', () => {
      const restDays: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
      expect(calculateActiveDaysCount(restDays)).toBe(1);
    });

    it('calculates base daily target in ms correctly', () => {
      // 25 hours across 5 active days = 5 hours/day = 18,000,000 ms
      const restDays: DayOfWeek[] = [0, 6];
      const targetMs = calculateBaseDailyTargetMs(25, restDays);
      expect(targetMs).toBe(5 * MS_PER_HOUR);
      expect(targetMs).toBe(18000000);
    });

    it('creates initial daily targets assigning 0 to rest days and base target to active days', () => {
      const restDays: DayOfWeek[] = [0, 6]; // Sunday and Saturday
      const targets = createInitialDailyTargets(20, restDays); // 20 hours / 5 days = 4 hours = 14,400,000 ms

      expect(targets[0]).toBe(0); // Sun
      expect(targets[6]).toBe(0); // Sat
      expect(targets[1]).toBe(4 * MS_PER_HOUR); // Mon
      expect(targets[2]).toBe(4 * MS_PER_HOUR); // Tue
      expect(targets[3]).toBe(4 * MS_PER_HOUR); // Wed
      expect(targets[4]).toBe(4 * MS_PER_HOUR); // Thu
      expect(targets[5]).toBe(4 * MS_PER_HOUR); // Fri
    });
  });

  describe('Remaining Active Days and Next Active Day Calculation', () => {
    it('returns remaining active days in the current week starting from Monday', () => {
      const restDays: DayOfWeek[] = [0, 6]; // Rest on Sun (0), Sat (6)
      // On Tuesday (2), remaining days of the week are Wed (3), Thu (4), Fri (5), Sat (6), Sun (0)
      // Active remaining days should be [3, 4, 5]
      const remaining = getRemainingActiveDaysInWeek(2, restDays);
      expect(remaining).toEqual([3, 4, 5]);
    });

    it('returns empty array if today is Friday and Sat/Sun are rest days', () => {
      const restDays: DayOfWeek[] = [0, 6];
      const remaining = getRemainingActiveDaysInWeek(5, restDays);
      expect(remaining).toEqual([]);
    });

    it('finds next active day correctly, skipping rest days', () => {
      const restDays: DayOfWeek[] = [0, 6]; // Sat & Sun rest
      // Next active after Friday (5) wraps to Monday (1)
      expect(getNextActiveDay(5, restDays)).toBe(1);
      // Next active after Tuesday (2) is Wednesday (3)
      expect(getNextActiveDay(2, restDays)).toBe(3);
    });
  });

  describe('The Penalty System (Deficit Distribution)', () => {
    it('distributes deficit evenly across remaining active days', () => {
      // Deficit of 60 minutes (3,600,000 ms) with 3 remaining active days
      const deficitMs = 60 * MS_PER_MINUTE;
      const remainingDays: DayOfWeek[] = [3, 4, 5];
      const penaltyPerDay = calculateDeficitPenaltyPerDayMs(deficitMs, remainingDays);
      expect(penaltyPerDay).toBe(20 * MS_PER_MINUTE); // 20 mins per day
    });

    it('returns 0 penalty if deficit is 0 or negative', () => {
      expect(calculateDeficitPenaltyPerDayMs(0, [3, 4])).toBe(0);
      expect(calculateDeficitPenaltyPerDayMs(-5000, [3, 4])).toBe(0);
    });

    it('returns 0 penalty if no active days remain in the week', () => {
      expect(calculateDeficitPenaltyPerDayMs(60 * MS_PER_MINUTE, [])).toBe(0);
    });
  });

  describe('Normal Overstudy Discount Tiers (Rule C)', () => {
    it('awards 0 discount for less than 30 minutes overstudy', () => {
      expect(calculateNormalOverstudyDiscountMs(29 * MS_PER_MINUTE)).toBe(0);
    });

    it('awards 10 minutes discount for 30-59 minutes overstudy', () => {
      expect(calculateNormalOverstudyDiscountMs(30 * MS_PER_MINUTE)).toBe(10 * MS_PER_MINUTE);
      expect(calculateNormalOverstudyDiscountMs(45 * MS_PER_MINUTE)).toBe(10 * MS_PER_MINUTE);
      expect(calculateNormalOverstudyDiscountMs(59 * MS_PER_MINUTE)).toBe(10 * MS_PER_MINUTE);
    });

    it('awards 20 minutes discount for 60-119 minutes overstudy', () => {
      expect(calculateNormalOverstudyDiscountMs(60 * MS_PER_MINUTE)).toBe(20 * MS_PER_MINUTE);
      expect(calculateNormalOverstudyDiscountMs(90 * MS_PER_MINUTE)).toBe(20 * MS_PER_MINUTE);
      expect(calculateNormalOverstudyDiscountMs(119 * MS_PER_MINUTE)).toBe(20 * MS_PER_MINUTE);
    });

    it('awards 30 minutes discount for 120+ minutes overstudy', () => {
      expect(calculateNormalOverstudyDiscountMs(120 * MS_PER_MINUTE)).toBe(30 * MS_PER_MINUTE);
      expect(calculateNormalOverstudyDiscountMs(180 * MS_PER_MINUTE)).toBe(30 * MS_PER_MINUTE);
    });
  });

  describe('Extra Study Discount Tiers (Rule D)', () => {
    it('awards 0 discount for less than 60 minutes extra study', () => {
      expect(calculateExtraStudyDiscountPerRemainingDayMs(59 * MS_PER_MINUTE)).toBe(0);
    });

    it('awards 3 minutes discount per remaining day for 60-119 minutes extra', () => {
      expect(calculateExtraStudyDiscountPerRemainingDayMs(60 * MS_PER_MINUTE)).toBe(3 * MS_PER_MINUTE);
      expect(calculateExtraStudyDiscountPerRemainingDayMs(100 * MS_PER_MINUTE)).toBe(3 * MS_PER_MINUTE);
      expect(calculateExtraStudyDiscountPerRemainingDayMs(119 * MS_PER_MINUTE)).toBe(3 * MS_PER_MINUTE);
    });

    it('awards 6 minutes discount per remaining day for 120-179 minutes extra', () => {
      expect(calculateExtraStudyDiscountPerRemainingDayMs(120 * MS_PER_MINUTE)).toBe(6 * MS_PER_MINUTE);
      expect(calculateExtraStudyDiscountPerRemainingDayMs(150 * MS_PER_MINUTE)).toBe(6 * MS_PER_MINUTE);
      expect(calculateExtraStudyDiscountPerRemainingDayMs(179 * MS_PER_MINUTE)).toBe(6 * MS_PER_MINUTE);
    });

    it('awards 9 minutes discount per remaining day for 180+ minutes extra', () => {
      expect(calculateExtraStudyDiscountPerRemainingDayMs(180 * MS_PER_MINUTE)).toBe(9 * MS_PER_MINUTE);
      expect(calculateExtraStudyDiscountPerRemainingDayMs(240 * MS_PER_MINUTE)).toBe(9 * MS_PER_MINUTE);
    });
  });

  describe('Discount Floor Clamping', () => {
    it('clamps daily target to a floor of 0 ms', () => {
      const currentTarget = 15 * MS_PER_MINUTE; // 15 mins
      const discount = 30 * MS_PER_MINUTE; // 30 mins discount
      expect(applyDiscountToTarget(currentTarget, discount, 0)).toBe(0);
    });

    it('subtracts cleanly when target exceeds discount', () => {
      const currentTarget = 60 * MS_PER_MINUTE;
      const discount = 20 * MS_PER_MINUTE;
      expect(applyDiscountToTarget(currentTarget, discount, 0)).toBe(40 * MS_PER_MINUTE);
    });
  });

  describe('Calendar Week Boundary Detection', () => {
    it('detects same week correctly', () => {
      // 2026-10-12 is Monday, 2026-10-16 is Friday
      expect(isDifferentCalendarWeek('2026-10-12', '2026-10-16')).toBe(false);
    });

    it('detects different week when crossing Sunday to Monday', () => {
      // 2026-10-18 is Sunday, 2026-10-19 is next Monday
      expect(isDifferentCalendarWeek('2026-10-18', '2026-10-19')).toBe(true);
    });

    it('finds Monday 00:00:00 of the week accurately', () => {
      const d = new Date(2026, 9, 14, 15, 30); // Wednesday, Oct 14, 2026
      const monday = getMondayOfWeek(d);
      expect(formatDateKey(monday)).toBe('2026-10-12');
      expect(monday.getDay()).toBe(1); // Monday
    });
  });
});
