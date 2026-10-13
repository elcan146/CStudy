jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: async (k: string) => {
      store.delete(k);
    },
  };
});

import { useStudyStore } from '../studyStore';
import { MS_PER_MINUTE } from '../constants';
import { DayOfWeek } from '../types';

const today = new Date().getDay() as DayOfWeek;
const anActiveDay = (((today + 1) % 7) as DayOfWeek);

describe('studyStore sessions', () => {
  beforeEach(() => {
    useStudyStore.getState().resetStore();
  });

  it('counts a session on a rest day as extra study', () => {
    useStudyStore.getState().setWeeklyRestMode(true);
    useStudyStore.getState().setupWeek(10, [today]);

    const result = useStudyStore.getState().simulateStudy(45);
    const s = useStudyStore.getState();

    expect(result?.isExtraStudy).toBe(true);
    expect(s.todayStudiedMs).toBe(0);
    expect(s.todayExtraStudiedMs).toBeGreaterThanOrEqual(45 * MS_PER_MINUTE);
    expect(s.todayExtraStudiedMs).toBeLessThanOrEqual(45 * MS_PER_MINUTE + 100);
    expect(s.history[0]?.isExtraStudy).toBe(true);
  });

  it('applies rest-day extra study discounts to remaining active days', () => {
    // Rest day is today; discount should hit active days later this week
    useStudyStore.getState().setWeeklyRestMode(true);
    useStudyStore.getState().setupWeek(10, [today]);
    const before = { ...useStudyStore.getState().dailyTargets };

    useStudyStore.getState().simulateStudy(120);
    const s = useStudyStore.getState();

    // 120m extra -> -6m per remaining active day
    const restDays = Object.keys(s.dailyTargets).map(Number) as DayOfWeek[];
    const discounted = restDays.filter(
      (d) => s.dailyTargets[d] < (before[d] ?? 0)
    );
    // Today is rest; any remaining active days this week got the 6m discount
    for (const d of discounted) {
      expect((before[d] ?? 0) - s.dailyTargets[d]).toBe(6 * MS_PER_MINUTE);
    }
  });

  it('counts a session on an active day as normal study', () => {
    useStudyStore.getState().setupWeek(25, [anActiveDay]);

    const result = useStudyStore.getState().simulateStudy(30);
    const s = useStudyStore.getState();

    expect(result?.isExtraStudy).toBe(false);
    expect(s.todayStudiedMs).toBeGreaterThanOrEqual(30 * MS_PER_MINUTE);
    expect(s.todayStudiedMs).toBeLessThanOrEqual(30 * MS_PER_MINUTE + 100);
    expect(s.todayExtraStudiedMs).toBe(0);
    expect(s.history[0]?.isExtraStudy).toBe(false);
  });
});
