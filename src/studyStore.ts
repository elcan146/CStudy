import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DayOfWeek,
  DailyTargetsMap,
  SessionResult,
  RolloverSummary,
  StudyTrackerStore,
  StudyTrackerState,
  StudySessionRecord,
} from './types';
import {
  DEFAULT_WEEKLY_TARGET_HOURS,
  STUDY_TRACKER_STORAGE_KEY,
  MIN_DAILY_TARGET_FLOOR_MS,
  MS_PER_MINUTE,
} from './constants';
import {
  getMondayOfWeek,
  formatDateKey,
  parseDateKey,
  isDifferentCalendarWeek,
  isRestOnDate,
  createWeekDailyTargets,
  remainingActiveDaysInWeek,
  nextActiveDay,
  calculateNormalOverstudyDiscountMs,
  calculateExtraStudyDiscountPerRemainingDayMs,
  calculateDeficitPenaltyPerDayMs,
  applyDiscountToTarget,
} from './rulesEngine';

/**
 * Robust storage adapter with fallback to memory if AsyncStorage is unavailable
 * (e.g. during headless Jest testing, Node CLI runs, or SSR).
 */
const memoryStorageMap = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
        return await AsyncStorage.getItem(name);
      }
    } catch {
      // Fallback below
    }
    return memoryStorageMap.get(name) ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
        await AsyncStorage.setItem(name, value);
        return;
      }
    } catch {
      // Fallback below
    }
    memoryStorageMap.set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      if (AsyncStorage && typeof AsyncStorage.removeItem === 'function') {
        await AsyncStorage.removeItem(name);
        return;
      }
    } catch {
      // Fallback below
    }
    memoryStorageMap.delete(name);
  },
};

/**
 * Weekday rest days only count while the "every week" mode is enabled.
 * In one-by-one mode only the explicit restDates apply.
 */
function effectiveRestDays(state: {
  weeklyRestMode: boolean;
  restDays: DayOfWeek[];
}): DayOfWeek[] {
  return state.weeklyRestMode ? state.restDays : [];
}

/**
 * Creates the initial default state.
 */
function createDefaultInitialState(): StudyTrackerState {
  const now = new Date();
  const currentWeekStart = getMondayOfWeek(now).getTime();
  const lastLoginDate = formatDateKey(now);
  const initialDailyTargets = createWeekDailyTargets(
    DEFAULT_WEEKLY_TARGET_HOURS,
    [],
    [],
    getMondayOfWeek(now)
  );

  return {
    currentWeekStart,
    weeklyTargetHours: DEFAULT_WEEKLY_TARGET_HOURS,
    restDays: [],
    restDates: [],
    weeklyRestMode: false,
    dailyTargets: initialDailyTargets,
    todayStudiedMs: 0,
    todayExtraStudiedMs: 0,
    isExtraStudyMode: false,
    sessionStartTime: null,
    lastLoginDate,
    normalDiscountAppliedTodayMs: 0,
    extraDiscountAppliedPerRemainingDayTodayMs: 0,
    isSessionActive: false,
    isSessionArmed: false,
    lastSessionResult: null,
    history: [],
    isDarkTheme: true,
  };
}

/**
 * Zustand store implementation for Study Tracker.
 */
export const useStudyStore = create<StudyTrackerStore>()(
  persist(
    (set, get) => ({
      ...createDefaultInitialState(),

      /**
       * Initial weekly setup or reconfiguration.
       * Calculates active days and assigns the initial base target to all non-rest days.
       */
      setupWeek: (weeklyTargetHours: number, restDays: DayOfWeek[]) => {
        const now = new Date();
        const currentWeekStart = getMondayOfWeek(now).getTime();
        const lastLoginDate = formatDateKey(now);
        const dailyTargets = createWeekDailyTargets(
          weeklyTargetHours,
          effectiveRestDays({ weeklyRestMode: get().weeklyRestMode, restDays }),
          get().restDates,
          getMondayOfWeek(now)
        );

        set({
          currentWeekStart,
          weeklyTargetHours,
          restDays: [...restDays],
          dailyTargets,
          todayStudiedMs: 0,
          todayExtraStudiedMs: 0,
          isExtraStudyMode: false,
          sessionStartTime: null,
          lastLoginDate,
          normalDiscountAppliedTodayMs: 0,
          extraDiscountAppliedPerRemainingDayTodayMs: 0,
          isSessionActive: false,
          isSessionArmed: false,
          lastSessionResult: null,
        });
      },

      toggleRestDate: (dateKey: string) => {
        const state = get();
        const restDates = state.restDates.includes(dateKey)
          ? state.restDates.filter((k) => k !== dateKey)
          : [...state.restDates, dateKey].sort();
        set({
          restDates,
          // Recompute this week's split when the marked date is inside it
          ...(isDifferentCalendarWeek(dateKey, state.lastLoginDate)
            ? {}
            : {
                dailyTargets: createWeekDailyTargets(
                  state.weeklyTargetHours,
                  effectiveRestDays(state),
                  restDates,
                  new Date(state.currentWeekStart)
                ),
              }),
        });
      },

      toggleRestDay: (day: DayOfWeek) => {
        const state = get();
        const restDays = state.restDays.includes(day)
          ? state.restDays.filter((d) => d !== day)
          : [...state.restDays, day].sort();
        set({
          restDays,
          dailyTargets: createWeekDailyTargets(
            state.weeklyTargetHours,
            effectiveRestDays({ weeklyRestMode: state.weeklyRestMode, restDays }),
            state.restDates,
            new Date(state.currentWeekStart)
          ),
        });
      },

      setWeeklyTarget: (hours: number) => {
        const state = get();
        set({
          weeklyTargetHours: hours,
          dailyTargets: createWeekDailyTargets(
            hours,
            effectiveRestDays(state),
            state.restDates,
            new Date(state.currentWeekStart)
          ),
        });
      },

      setWeeklyRestMode: (enabled: boolean) => {
        const state = get();
        set({
          weeklyRestMode: enabled,
          // Turning the mode on/off changes which days rest this week,
          // so the weekly split has to be recomputed
          dailyTargets: createWeekDailyTargets(
            state.weeklyTargetHours,
            enabled ? state.restDays : [],
            state.restDates,
            new Date(state.currentWeekStart)
          ),
        });
      },

      armSession: () => {
        set({ isSessionArmed: true });
      },

      disarmSession: () => {
        set({ isSessionArmed: false });
      },

      /**
       * Forfeits the discounts a session earned — adds them back to the
       * targets they were deducted from (end-of-session "done" choice).
       */
      revokeSessionDiscounts: (result: SessionResult | null) => {
        const state = get();
        if (!result) return;
        const updatedDailyTargets: DailyTargetsMap = { ...state.dailyTargets };

        if (result.normalOverstudyDiscountAppliedMs > 0) {
          const next = nextActiveDay(
            new Date(),
            effectiveRestDays(state),
            state.restDates
          );
          if (next !== null) {
            updatedDailyTargets[next] =
              (updatedDailyTargets[next] ?? 0) +
              result.normalOverstudyDiscountAppliedMs;
          }
        }

        if (result.extraDiscountAppliedPerRemainingDayMs > 0) {
          for (const day of remainingActiveDaysInWeek(
            new Date(),
            effectiveRestDays(state),
            state.restDates
          )) {
            updatedDailyTargets[day] =
              (updatedDailyTargets[day] ?? 0) +
              result.extraDiscountAppliedPerRemainingDayMs;
          }
        }

        set({
          dailyTargets: updatedDailyTargets,
          normalDiscountAppliedTodayMs: Math.max(
            0,
            state.normalDiscountAppliedTodayMs -
              result.normalOverstudyDiscountAppliedMs
          ),
          extraDiscountAppliedPerRemainingDayTodayMs: Math.max(
            0,
            state.extraDiscountAppliedPerRemainingDayTodayMs -
              result.extraDiscountAppliedPerRemainingDayMs
          ),
          lastSessionResult: null,
        });
      },

      /**
       * Records the start of a study session by saving Date.now() as sessionStartTime.
       * Invoked when the app goes into the background (phone locked) or when user explicitly starts.
       */
      startSession: (timestamp?: number) => {
        const startTime = timestamp ?? Date.now();
        // Check new day rollover first to ensure counters are accurate
        get().checkNewDayAndRollover(startTime);

        // If today's quota is already met — or it's a rest day — this session
        // counts as extra study
        const fresh = get();
        const dayOfWeek = new Date(startTime).getDay() as DayOfWeek;
        const todayTarget = fresh.dailyTargets[dayOfWeek] ?? 0;
        const isRestDay = isRestOnDate(
          new Date(startTime),
          effectiveRestDays(fresh),
          fresh.restDates
        );
        const isQuotaMet =
          isRestDay || (todayTarget > 0 && fresh.todayStudiedMs >= todayTarget);

        set({
          sessionStartTime: startTime,
          isSessionActive: true,
          isExtraStudyMode: isQuotaMet,
          // The arm is consumed — a later lock won't auto-start a session
          isSessionArmed: false,
        });
      },

      /**
       * Ends the current study session upon returning to active/foreground.
       * Calculates elapsedTime = Date.now() - sessionStartTime, updates today's study totals,
       * clears sessionStartTime, and applies tiered discounts based on normal or extra study modes.
       */
      endSession: (timestamp?: number): SessionResult | null => {
        const state = get();
        if (!state.sessionStartTime) {
          return null;
        }

        const endTime = timestamp ?? Date.now();
        const elapsedTime = Math.max(0, endTime - state.sessionStartTime);

        // Run rollover check before crediting time in case midnight passed
        state.checkNewDayAndRollover(endTime);
        const freshState = get();

        const todayDate = new Date(endTime);
        const currentDayOfWeek = todayDate.getDay() as DayOfWeek;
        const currentDailyTarget = freshState.dailyTargets[currentDayOfWeek] ?? 0;

        let updatedTodayStudiedMs = freshState.todayStudiedMs;
        let updatedTodayExtraStudiedMs = freshState.todayExtraStudiedMs;
        const updatedDailyTargets: DailyTargetsMap = { ...freshState.dailyTargets };

        let normalDiscountApplied = 0;
        let extraDiscountAppliedPerDay = 0;
        let newNormalDiscountAppliedToday = freshState.normalDiscountAppliedTodayMs;
        let newExtraDiscountAppliedToday = freshState.extraDiscountAppliedPerRemainingDayTodayMs;

        if (freshState.isExtraStudyMode) {
          // Extra study mode: record time in todayExtraStudiedMs
          updatedTodayExtraStudiedMs += elapsedTime;

          // Calculate multi-day discount tier based on cumulative extra study today
          const tierDiscountPerDayMs = calculateExtraStudyDiscountPerRemainingDayMs(
            updatedTodayExtraStudiedMs
          );
          // Calculate incremental discount to prevent double-discounting across sessions
          const incrementalDiscount = Math.max(
            0,
            tierDiscountPerDayMs - freshState.extraDiscountAppliedPerRemainingDayTodayMs
          );

          if (incrementalDiscount > 0) {
            const remainingActiveDays = remainingActiveDaysInWeek(
              todayDate,
              effectiveRestDays(freshState),
              freshState.restDates
            );

            // Deduct incremental discount from all remaining active days in the current week
            for (const day of remainingActiveDays) {
              updatedDailyTargets[day] = applyDiscountToTarget(
                updatedDailyTargets[day],
                incrementalDiscount
              );
            }

            extraDiscountAppliedPerDay = incrementalDiscount;
            newExtraDiscountAppliedToday = tierDiscountPerDayMs;
          }
        } else {
          // Normal study mode: record time in todayStudiedMs
          updatedTodayStudiedMs += elapsedTime;

          // Check if user has exceeded their daily target
          if (updatedTodayStudiedMs > currentDailyTarget) {
            const overstudyMs = updatedTodayStudiedMs - currentDailyTarget;
            const tierDiscountTomorrowMs = calculateNormalOverstudyDiscountMs(overstudyMs);

            // Calculate incremental discount for idempotency
            const incrementalDiscount = Math.max(
              0,
              tierDiscountTomorrowMs - freshState.normalDiscountAppliedTodayMs
            );

            if (incrementalDiscount > 0) {
              const next = nextActiveDay(
                todayDate,
                effectiveRestDays(freshState),
                freshState.restDates
              );
              if (next !== null) {
                // Apply discount to tomorrow / next active day (floored at 0 ms)
                updatedDailyTargets[next] = applyDiscountToTarget(
                  updatedDailyTargets[next],
                  incrementalDiscount
                );
                normalDiscountApplied = incrementalDiscount;
                newNormalDiscountAppliedToday = tierDiscountTomorrowMs;
              }
            }
          }
        }

        // Target reached check
        const targetMet = updatedTodayStudiedMs >= currentDailyTarget;

        const record: StudySessionRecord | null =
          elapsedTime > 0
            ? {
                id: `${endTime.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
                timestamp: endTime,
                durationMs: elapsedTime,
                isExtraStudy: freshState.isExtraStudyMode,
                dateKey: formatDateKey(todayDate),
              }
            : null;

        const result: SessionResult = {
          elapsedMs: elapsedTime,
          isExtraStudy: freshState.isExtraStudyMode,
          todayStudiedMs: updatedTodayStudiedMs,
          todayExtraStudiedMs: updatedTodayExtraStudiedMs,
          dailyTargetMs: currentDailyTarget,
          targetMet,
          normalOverstudyDiscountAppliedMs: normalDiscountApplied,
          extraDiscountAppliedPerRemainingDayMs: extraDiscountAppliedPerDay,
        };

        set({
          todayStudiedMs: updatedTodayStudiedMs,
          todayExtraStudiedMs: updatedTodayExtraStudiedMs,
          dailyTargets: updatedDailyTargets,
          normalDiscountAppliedTodayMs: newNormalDiscountAppliedToday,
          extraDiscountAppliedPerRemainingDayTodayMs: newExtraDiscountAppliedToday,
          sessionStartTime: null,
          isSessionActive: false,
          // Once the quota is met, further sessions count as extra study
          isExtraStudyMode: targetMet,
          lastSessionResult: result,
          history: record ? [record, ...freshState.history] : freshState.history,
        });

        return result;
      },

      /**
       * Cancels an active session without adding any elapsed time.
       */
      cancelSession: () => {
        set({
          sessionStartTime: null,
          isSessionActive: false,
        });
      },

      /**
       * Toggles or sets the extra study mode.
       * Typically invoked after reaching the daily target.
       */
      setExtraStudyMode: (enabled?: boolean) => {
        const current = get().isExtraStudyMode;
        const nextValue = enabled !== undefined ? enabled : !current;
        set({ isExtraStudyMode: nextValue });
      },

      /**
       * The Penalty & New Day Engine.
       * Runs on foreground or session check to detect if calendar dates have shifted.
       *
       * If a day passes and todayStudiedMs < dailyTarget:
       *  - deficitMs = dailyTarget - todayStudiedMs
       *  - Distributes deficitMs evenly across remaining active days in the current week.
       * If a new week boundary is crossed:
       *  - Resets daily targets cleanly to base setup targets.
       */
      checkNewDayAndRollover: (currentTimestamp?: number): RolloverSummary | null => {
        const state = get();
        const now = currentTimestamp ? new Date(currentTimestamp) : new Date();
        const currentDateKey = formatDateKey(now);

        // If still on the same calendar day, no rollover needed
        if (currentDateKey === state.lastLoginDate) {
          return null;
        }

        const isNewWeek = isDifferentCalendarWeek(state.lastLoginDate, currentDateKey);
        const lastDate = parseDateKey(state.lastLoginDate);
        const closedDayOfWeek = lastDate.getDay() as DayOfWeek;
        const newDayOfWeek = now.getDay() as DayOfWeek;

        if (isNewWeek) {
          // Clean reset when crossing into a new calendar week (Monday 00:00:00)
          const newWeekStart = getMondayOfWeek(now).getTime();
          const cleanDailyTargets = createWeekDailyTargets(
            state.weeklyTargetHours,
            effectiveRestDays(state),
            state.restDates,
            getMondayOfWeek(now)
          );

          set({
            currentWeekStart: newWeekStart,
            dailyTargets: cleanDailyTargets,
            todayStudiedMs: 0,
            todayExtraStudiedMs: 0,
            isExtraStudyMode: false,
            lastLoginDate: currentDateKey,
            normalDiscountAppliedTodayMs: 0,
            extraDiscountAppliedPerRemainingDayTodayMs: 0,
          });

          return {
            closedDate: state.lastLoginDate,
            closedDayOfWeek,
            newDate: currentDateKey,
            newDayOfWeek,
            isNewWeek: true,
            deficitMs: 0,
            penalizedDays: [],
            penaltyPerDayMs: 0,
          };
        }

        // Same week: Evaluate yesterday's deficit
        const wasClosedDayRest = isRestOnDate(
          lastDate,
          effectiveRestDays(state),
          state.restDates
        );
        const closedDayTarget = state.dailyTargets[closedDayOfWeek] ?? 0;
        let deficitMs = 0;
        let penaltyPerDayMs = 0;
        let remainingActiveDays: DayOfWeek[] = [];
        const updatedDailyTargets: DailyTargetsMap = { ...state.dailyTargets };

        if (!wasClosedDayRest && state.todayStudiedMs < closedDayTarget) {
          deficitMs = closedDayTarget - state.todayStudiedMs;
          remainingActiveDays = remainingActiveDaysInWeek(
            lastDate,
            effectiveRestDays(state),
            state.restDates
          );

          if (remainingActiveDays.length > 0) {
            penaltyPerDayMs = calculateDeficitPenaltyPerDayMs(deficitMs, remainingActiveDays);

            // Distribute deficitMs evenly across remaining active days
            for (const day of remainingActiveDays) {
              updatedDailyTargets[day] = (updatedDailyTargets[day] ?? 0) + penaltyPerDayMs;
            }
          }
        }

        // Reset daily counters for the new day
        set({
          dailyTargets: updatedDailyTargets,
          todayStudiedMs: 0,
          todayExtraStudiedMs: 0,
          isExtraStudyMode: false,
          lastLoginDate: currentDateKey,
          normalDiscountAppliedTodayMs: 0,
          extraDiscountAppliedPerRemainingDayTodayMs: 0,
        });

        return {
          closedDate: state.lastLoginDate,
          closedDayOfWeek,
          newDate: currentDateKey,
          newDayOfWeek,
          isNewWeek: false,
          deficitMs,
          penalizedDays: remainingActiveDays,
          penaltyPerDayMs,
        };
      },

      /**
       * Manually updates a daily target (clamped to floor of 0 ms).
       */
      setDailyTarget: (day: DayOfWeek, targetMs: number) => {
        const clampedTarget = Math.max(MIN_DAILY_TARGET_FLOOR_MS, targetMs);
        set((prev) => ({
          dailyTargets: {
            ...prev.dailyTargets,
            [day]: clampedTarget,
          },
        }));
      },

      /**
       * Resets the entire store to default initial configuration.
       */
      resetStore: () => {
        set(createDefaultInitialState());
      },

      toggleTheme: () => {
        set((prev) => ({ isDarkTheme: !prev.isDarkTheme }));
      },

      clearHistory: () => {
        set({ history: [] });
      },

      /**
       * Simulates a session that started `minutes` ago and ends now.
       */
      simulateStudy: (minutes: number): SessionResult | null => {
        const ms = minutes * MS_PER_MINUTE;
        get().startSession(Date.now() - ms);
        return get().endSession();
      },

      /**
       * Pretends the current day closed `deficitMinutes` short of its target,
       * then runs the rollover so penalties land on the remaining active days.
       */
      simulateDayRollover: (deficitMinutes: number = 60): RolloverSummary | null => {
        const state = get();
        const dayOfWeek = new Date().getDay() as DayOfWeek;
        const todayTarget = state.dailyTargets[dayOfWeek] ?? 0;
        const simulatedStudied = Math.max(
          0,
          todayTarget - deficitMinutes * MS_PER_MINUTE
        );

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        set({
          todayStudiedMs: simulatedStudied,
          lastLoginDate: formatDateKey(yesterday),
        });
        return get().checkNewDayAndRollover();
      },
    }),
    {
      name: STUDY_TRACKER_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      // Partialize state to persist only essential data and exclude transient running flags
      partialize: (state) => ({
        currentWeekStart: state.currentWeekStart,
        weeklyTargetHours: state.weeklyTargetHours,
        restDays: state.restDays,
        restDates: state.restDates,
        weeklyRestMode: state.weeklyRestMode,
        dailyTargets: state.dailyTargets,
        todayStudiedMs: state.todayStudiedMs,
        todayExtraStudiedMs: state.todayExtraStudiedMs,
        isExtraStudyMode: state.isExtraStudyMode,
        sessionStartTime: state.sessionStartTime,
        lastLoginDate: state.lastLoginDate,
        normalDiscountAppliedTodayMs: state.normalDiscountAppliedTodayMs,
        extraDiscountAppliedPerRemainingDayTodayMs:
          state.extraDiscountAppliedPerRemainingDayTodayMs,
        isSessionActive: state.isSessionActive,
        history: state.history,
        isDarkTheme: state.isDarkTheme,
      }),
      version: 2,
      // v2: rest days became per-date (restDates) — drop the old automatic
      // weekday rest list so weekends aren't silently marked off
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Partial<StudyTrackerState>;
        return {
          ...p,
          restDays: p.restDays ?? [],
          restDates: p.restDates ?? [],
          weeklyRestMode: p.weeklyRestMode ?? false,
        };
      },
    }
  )
);
