import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStudyStore } from '../studyStore';
import { WEEK_DAYS_SEQUENCE } from '../constants';
import { formatDateKey, getMondayOfWeek } from '../rulesEngine';
import { DayOfWeek } from '../types';
import { useTheme, Accent } from '../theme';

const SHORT_LABELS: Record<DayOfWeek, string> = {
  0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S',
};

function shortTime(ms: number): string {
  if (ms <= 0) return '0m';
  const h = ms / 3600000;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(ms / 60000)}m`;
}

const TRACK_H = 40;

export function WeekStrip() {
  const theme = useTheme();
  const state = useStudyStore();
  const today = new Date().getDay() as DayOfWeek;

  // Studied ms per day for the current calendar week (Mon -> Sun)
  const studiedByDay = useMemo(() => {
    const monday = getMondayOfWeek(new Date());
    const weekKeys = WEEK_DAYS_SEQUENCE.map((_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return formatDateKey(d);
    });
    const map = new Map<DayOfWeek, number>();
    for (const record of state.history) {
      const idx = weekKeys.indexOf(record.dateKey);
      if (idx === -1) continue;
      const day = WEEK_DAYS_SEQUENCE[idx];
      map.set(day, (map.get(day) ?? 0) + record.durationMs);
    }
    // Live today counters (in case today's session isn't in history yet)
    map.set(
      today,
      Math.max(map.get(today) ?? 0, state.todayStudiedMs + state.todayExtraStudiedMs)
    );
    return map;
  }, [state.history, state.todayStudiedMs, state.todayExtraStudiedMs, today]);

  const weekTotal = useMemo(
    () => [...studiedByDay.values()].reduce((a, b) => a + b, 0),
    [studiedByDay]
  );

  return (
    <View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          This Week
        </Text>
        <Text style={[styles.total, { color: theme.textSecondary }]}>
          {shortTime(weekTotal)} / {state.weeklyTargetHours}h
        </Text>
      </View>

      <View style={styles.row}>
        {WEEK_DAYS_SEQUENCE.map((day, i) => {
          const dateOfDay = new Date(state.currentWeekStart);
          dateOfDay.setDate(dateOfDay.getDate() + i);
          const isRest =
            (state.weeklyRestMode && state.restDays.includes(day)) ||
            state.restDates.includes(formatDateKey(dateOfDay));
          const isToday = day === today;
          const target = state.dailyTargets[day] ?? 0;
          const studied = studiedByDay.get(day) ?? 0;
          const met = !isRest && target > 0 && studied >= target;
          const fraction = isRest
            ? 0
            : target > 0
              ? Math.min(1, studied / target)
              : studied > 0
                ? 1
                : 0;

          const barColor = isRest
            ? 'transparent'
            : met
              ? Accent.green
              : isToday
                ? Accent.blue
                : Accent.indigo;

          return (
            <View key={day} style={styles.col}>
              <Text style={[styles.targetLabel, { color: theme.textMuted }]}>
                {isRest ? 'Rest' : shortTime(target)}
              </Text>
              <View
                style={[
                  styles.track,
                  {
                    backgroundColor: isRest
                      ? 'transparent'
                      : theme.border + '55',
                    borderColor: isToday ? Accent.blue : 'transparent',
                  },
                ]}
              >
                {isRest ? (
                  <Text style={[styles.restMark, { color: Accent.amber }]}>
                    z
                  </Text>
                ) : (
                  <View
                    style={[
                      styles.fill,
                      { height: Math.max(2, TRACK_H * fraction) },
                      { backgroundColor: barColor },
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  {
                    color: isToday ? Accent.blue : theme.textMuted,
                    fontWeight: isToday ? '700' : '500',
                  },
                ]}
              >
                {SHORT_LABELS[day]}
              </Text>
              <Text
                style={[
                  styles.value,
                  {
                    color: met
                      ? Accent.green
                      : isToday
                        ? Accent.blue
                        : theme.textSecondary,
                  },
                ]}
              >
                {isRest ? '-' : shortTime(studied)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 13, fontWeight: '600' },
  total: { fontSize: 11, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  col: { flex: 1, alignItems: 'center' },
  targetLabel: { fontSize: 9, fontWeight: '600', marginBottom: 4 },
  track: {
    height: TRACK_H,
    width: 16,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    borderRadius: 8,
  },
  restMark: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  dayLabel: { fontSize: 10, letterSpacing: 0.3, marginTop: 5 },
  value: { fontSize: 10, fontWeight: '600', marginTop: 1 },
});
