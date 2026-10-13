import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStudyStore } from '../studyStore';
import { DAY_NAMES, DayOfWeek } from '../types';
import { WEEK_DAYS_SEQUENCE, MS_PER_HOUR, MS_PER_MINUTE } from '../constants';
import { formatDateKey, getMondayOfWeek, parseDateKey } from '../rulesEngine';
import { GlassCard } from '../components/Glass';
import { useTheme, Accent } from '../theme';
import * as Haptics from 'expo-haptics';

const SHORT_LABELS: Record<DayOfWeek, string> = {
  0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S',
};
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const TRACK_H = 104;

function formatTarget(ms: number) {
  return `${Math.floor(ms / MS_PER_HOUR)}h ${Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE)}m`;
}
function formatShort(ms: number) {
  const h = ms / MS_PER_HOUR;
  return h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(ms / MS_PER_MINUTE)}m`;
}
/** A calendar cell that animates when it flips into/out of rest-day state.
 * Memoized so toggling a weekday only re-renders the cells that flip. */
const DayCell = React.memo(function DayCell({
  bg,
  ring,
  numColor,
  label,
  isRest,
  dateKey,
}: {
  bg: string;
  ring: string | null;
  numColor: string;
  label: number;
  isRest: boolean;
  dateKey: string;
}) {
  const restAnim = useRef(new Animated.Value(isRest ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(restAnim, {
        toValue: isRest ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(pop, {
          toValue: 1.18,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.spring(pop, {
          toValue: 1,
          useNativeDriver: true,
          friction: 5,
        }),
      ]),
    ]).start();
  }, [isRest, restAnim, pop]);

  return (
    <Pressable
      onPress={() => Haptics.selectionAsync()}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        useStudyStore.getState().toggleRestDate(dateKey);
      }}
      delayLongPress={350}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.88 : 1 }] }]}
    >
      <Animated.View
        style={[
          styles.calCell,
          {
            backgroundColor: bg,
            borderWidth: ring ? 2 : 0,
            borderColor: ring ?? 'transparent',
            transform: [{ scale: pop }],
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            borderRadius: 10,
            backgroundColor: Accent.amber,
            opacity: restAnim,
          }}
        />
        <Text style={[styles.calDayNum, { color: numColor }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
});

/** Weekday chip in the rest-day editor — springy press, native amber fill. */
const WeekChip = React.memo(function WeekChip({
  on,
  label,
  day,
}: {
  on: boolean;
  label: string;
  day: DayOfWeek;
}) {
  const theme = useTheme();
  // Optimistic local state — the chip flips on touch, not after the
  // store update + full screen re-render lands
  const [localOn, setLocalOn] = useState(on);
  useEffect(() => setLocalOn(on), [on]);
  const fill = useRef(new Animated.Value(on ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: localOn ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [localOn, fill]);

  return (
    <Pressable
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.82,
          useNativeDriver: true,
          speed: 50,
          bounciness: 6,
        }).start();
        Haptics.selectionAsync();
      }}
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 50,
          bounciness: 6,
        }).start()
      }
      onPress={() => {
        setLocalOn((v) => !v);
        useStudyStore.getState().toggleRestDay(day);
      }}
    >
      <Animated.View
        style={[
          styles.restChip,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            transform: [{ scale }],
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 19, backgroundColor: Accent.amber, opacity: fill },
          ]}
        />
        <Text
          style={[
            styles.restChipLabel,
            { color: localOn ? '#1F2937' : theme.textSecondary },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/** Fades + rises a card into view on mount. */
function FadeIn({
  delay = 0,
  children,
}: {
  delay?: number;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay,
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function ScheduleScreen() {
  const theme = useTheme();
  const state = useStudyStore();
  const today = new Date();
  const todayKey = formatDateKey(today);
  const todayIndex = today.getDay() as DayOfWeek;
  const [monthOffset, setMonthOffset] = useState(0);

  // Per-day totals across all history (+ today's live counters)
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of state.history) {
      map.set(r.dateKey, (map.get(r.dateKey) ?? 0) + r.durationMs);
    }
    map.set(
      todayKey,
      (map.get(todayKey) ?? 0) + state.todayStudiedMs + state.todayExtraStudiedMs
    );
    return map;
  }, [state.history, state.todayStudiedMs, state.todayExtraStudiedMs, todayKey]);

  // --- Calendar month ---
  const calAnim = useRef(new Animated.Value(1)).current;
  const dirRef = useRef(1);
  const changeMonth = (dir: number) => {
    Haptics.selectionAsync();
    dirRef.current = dir;
    setMonthOffset((o) => Math.min(0, o + dir));
    calAnim.setValue(0);
    Animated.timing(calAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  };

  const viewedMonth = new Date(
    today.getFullYear(),
    today.getMonth() + monthOffset,
    1
  );
  const monthLabel = MONTH_NAMES[viewedMonth.getMonth()];
  const monthYear = viewedMonth.getFullYear();
  const firstWeekday = (viewedMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(
    viewedMonth.getFullYear(),
    viewedMonth.getMonth() + 1,
    0
  ).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthStats = useMemo(() => {
    let days = 0;
    let ms = 0;
    for (const [key, v] of totals) {
      const [y, m] = key.split('-').map(Number);
      if (
        y === viewedMonth.getFullYear() &&
        m === viewedMonth.getMonth() + 1 &&
        v > 0
      ) {
        days++;
        ms += v;
      }
    }
    return { days, ms };
  }, [totals, viewedMonth]);

  // --- Weekly totals: last 8 weeks ending with the current one ---
  const weeks = useMemo(() => {
    const monday = getMondayOfWeek(today);
    const out: { label: string; studiedMs: number; isCurrent: boolean }[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(monday);
      start.setDate(start.getDate() - w * 7);
      let ms = 0;
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(day.getDate() + d);
        if (day > today && formatDateKey(day) !== todayKey) continue;
        ms += totals.get(formatDateKey(day)) ?? 0;
      }
      out.push({
        label: `${start.getDate()}/${start.getMonth() + 1}`,
        studiedMs: ms,
        isCurrent: w === 0,
      });
    }
    return out;
  }, [totals, todayKey]);

  const weeklyTargetMs = state.weeklyTargetHours * MS_PER_HOUR;
  const chartMax = Math.max(
    weeklyTargetMs,
    ...weeks.map((w) => w.studiedMs),
    MS_PER_HOUR
  );
  const barsAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barsAnim, {
      toValue: 1,
      duration: 700,
      delay: 200,
      useNativeDriver: false,
    }).start();
  }, [barsAnim]);

  // --- Day-of-week pattern ---
  const weekdayAvg = useMemo(() => {
    const sums = new Map<DayOfWeek, number>();
    const dates = new Map<DayOfWeek, Set<string>>();
    for (const r of state.history) {
      const d = new Date(r.timestamp).getDay() as DayOfWeek;
      sums.set(d, (sums.get(d) ?? 0) + r.durationMs);
      if (!dates.has(d)) dates.set(d, new Set());
      dates.get(d)!.add(r.dateKey);
    }
    return WEEK_DAYS_SEQUENCE.map((d) => ({
      day: d,
      avgMs: dates.get(d)?.size ? sums.get(d)! / dates.get(d)!.size : 0,
    }));
  }, [state.history]);
  const maxAvg = Math.max(...weekdayAvg.map((d) => d.avgMs), MS_PER_MINUTE);

  const calShift = calAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20 * dirRef.current, 0],
  });

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ---------- Month calendar ---------- */}
      <FadeIn>
        <GlassCard>
          <View style={styles.cardInner}>
            <View style={styles.calHeader}>
              <View>
                <Text style={[styles.calMonth, { color: theme.textPrimary }]}>
                  {monthLabel}{' '}
                  <Text style={{ color: theme.textMuted, fontWeight: '400' }}>
                    {monthYear}
                  </Text>
                </Text>
                <Text style={[styles.calSub, { color: theme.textMuted }]}>
                  {monthStats.days > 0
                    ? `${monthStats.days} days · ${formatShort(monthStats.ms)} studied`
                    : 'no sessions this month'}
                </Text>
              </View>
              <View style={styles.navRow}>
                <Pressable
                  onPress={() => changeMonth(-1)}
                  style={({ pressed }) => [
                    styles.navBtn,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.card,
                      transform: [{ scale: pressed ? 0.9 : 1 }],
                    },
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={theme.textPrimary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => monthOffset < 0 && changeMonth(1)}
                  style={({ pressed }) => [
                    styles.navBtn,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.card,
                      opacity: monthOffset === 0 ? 0.35 : 1,
                      transform: [{ scale: pressed ? 0.9 : 1 }],
                    },
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.textPrimary}
                  />
                </Pressable>
              </View>
            </View>

            <Animated.View
              style={{ opacity: calAnim, transform: [{ translateX: calShift }] }}
            >
              <View style={styles.weekHeaderRow}>
                {WEEK_DAYS_SEQUENCE.map((d) => (
                  <Text
                    key={d}
                    style={[
                      styles.weekHeaderCell,
                      {
                        color:
                          state.weeklyRestMode && state.restDays.includes(d)
                            ? Accent.amber
                            : theme.textMuted,
                      },
                    ]}
                  >
                    {SHORT_LABELS[d]}
                  </Text>
                ))}
              </View>

              <View style={styles.calGrid}>
                {cells.map((day, i) => {
                  if (day == null)
                    return <View key={`x${i}`} style={styles.calCellWrap} />;
                  const date = new Date(
                    viewedMonth.getFullYear(),
                    viewedMonth.getMonth(),
                    day
                  );
                  const key = formatDateKey(date);
                  const dow = date.getDay() as DayOfWeek;
                  const studied = totals.get(key) ?? 0;
                  const isToday = key === todayKey;
                  const isFuture = date > today;
                  const isRest =
                    state.restDates.includes(key) ||
                    (state.weeklyRestMode && state.restDays.includes(dow));
                  const requirement = state.dailyTargets[dow] ?? 0;

                  // Cell styling rules:
                  //   rest day             -> amber (+ yellow ring if studied)
                  //   studied > target     -> green + yellow ring
                  //   studied >= target    -> green
                  //   studied < 40% target -> red
                  //   studied < target     -> light green
                  //   nothing              -> plain
                  let bg = theme.card;
                  let ring: string | null = null;
                  let numColor = theme.textSecondary;
                  if (isRest) {
                    bg = theme.card; // amber overlays via DayCell restAnim
                    numColor = '#1F2937';
                    if (studied > 0) ring = '#FDE047';
                  } else if (isToday) {
                    // Today stays gray until the requirement is met
                    if (requirement > 0 && studied >= requirement) {
                      bg = Accent.green;
                      numColor = '#FFFFFF';
                      if (studied > requirement) ring = '#FDE047';
                    } else {
                      bg = theme.border + '66';
                      numColor = theme.textSecondary;
                      ring = Accent.blue; // keep the today marker
                    }
                  } else if (studied > 0 && requirement > 0) {
                    if (studied > requirement) {
                      bg = Accent.green;
                      ring = '#FDE047';
                      numColor = '#FFFFFF';
                    } else if (studied >= requirement) {
                      bg = Accent.green;
                      numColor = '#FFFFFF';
                    } else if (studied < requirement * 0.4) {
                      bg = Accent.red;
                      numColor = '#FFFFFF';
                    } else {
                      bg = Accent.green + '59';
                      numColor = theme.isDark ? '#FFFFFF' : '#14532D';
                    }
                  } else if (studied > 0) {
                    // studied on a day with no target (non-rest): treat as over
                    bg = Accent.green;
                    ring = '#FDE047';
                    numColor = '#FFFFFF';
                  }
                  if (isFuture) {
                    bg = 'transparent';
                    numColor = theme.border;
                    ring = null;
                  }

                  return (
                    <View key={key} style={styles.calCellWrap}>
                      <DayCell
                        bg={bg}
                        ring={ring}
                        numColor={numColor}
                        label={day}
                        isRest={isRest}
                        dateKey={key}
                      />
                    </View>
                  );
                })}
              </View>
            </Animated.View>

            {/* legend */}
            <View style={styles.legendCalRow}>
              {(
                [
                  [Accent.amber, 'rest'],
                  [Accent.red, '<40m'],
                  [Accent.green + '59', 'partial'],
                  [Accent.green, 'met'],
                ] as const
              ).map(([c, label]) => (
                <View key={label} style={styles.legendItem}>
                  <View
                    style={[styles.legendSwatch, { backgroundColor: c }]}
                  />
                  <Text
                    style={[styles.legendText, { color: theme.textMuted }]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendSwatch,
                    {
                      backgroundColor: Accent.green,
                      borderWidth: 1.5,
                      borderColor: '#FDE047',
                    },
                  ]}
                />
                <Text style={[styles.legendText, { color: theme.textMuted }]}>
                  over
                </Text>
              </View>
            </View>

            {/* ---------- Rest days manager ---------- */}
            <View
              style={[styles.restListWrap, { borderTopColor: theme.border }]}
            >
              <View style={styles.restHeaderRow}>
                <View style={styles.restHeaderText}>
                  <Text
                    style={[styles.restListTitle, { color: theme.textPrimary }]}
                  >
                    Rest by Week days
                  </Text>
                  <Text
                    style={[styles.modeLabel, { color: theme.textMuted }]}
                  >
                    {state.weeklyRestMode
                      ? 'same days off, every week'
                      : 'mark rest dates one by one'}
                  </Text>
                </View>
                <Switch
                  value={state.weeklyRestMode}
                  onValueChange={(v) => {
                    Haptics.selectionAsync();
                    state.setWeeklyRestMode(v);
                  }}
                  trackColor={{
                    false: theme.border,
                    true: Accent.amber + '88',
                  }}
                  thumbColor={
                    state.weeklyRestMode ? Accent.amber : theme.textMuted
                  }
                />
              </View>

              {state.weeklyRestMode ? (
                <FadeIn key="weekly">
                  <View>
                    <View style={styles.chipsRow}>
                      {WEEK_DAYS_SEQUENCE.map((d) => (
                        <WeekChip
                          key={d}
                          day={d}
                          on={state.restDays.includes(d)}
                          label={SHORT_LABELS[d]}
                        />
                      ))}
                    </View>
                    {state.restDates.length > 0 && (
                      <Text
                        style={[styles.restEmpty, { color: theme.textMuted }]}
                      >
                        + {state.restDates.length} one-off date
                        {state.restDates.length > 1 ? 's' : ''} also active
                      </Text>
                    )}
                  </View>
                </FadeIn>
              ) : (
                <FadeIn key="dates">
                  <View>
                    {state.restDates.length === 0 ? (
                      <Text
                        style={[styles.restEmpty, { color: theme.textMuted }]}
                      >
                        none set — hold a calendar day to add one
                      </Text>
                    ) : (
                      [...state.restDates].sort().map((key) => {
                        const d = parseDateKey(key);
                        return (
                          <View key={key} style={styles.restRow}>
                            <Text
                              style={[
                                styles.restRowLabel,
                                { color: theme.textPrimary },
                              ]}
                            >
                              {d.toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                              {key === todayKey ? '  · today' : ''}
                            </Text>
                            <Switch
                              value={true}
                              onValueChange={() => {
                                Haptics.selectionAsync();
                                state.toggleRestDate(key);
                              }}
                              trackColor={{
                                false: theme.border,
                                true: Accent.amber + '88',
                              }}
                              thumbColor={Accent.amber}
                            />
                          </View>
                        );
                      })
                    )}
                  </View>
                </FadeIn>
              )}
            </View>
          </View>
        </GlassCard>
      </FadeIn>

      {/* ---------- Weekly totals chart ---------- */}
      <FadeIn delay={100}>
        <GlassCard>
          <View style={styles.cardInner}>
            <View style={styles.headerRow}>
              <Text style={[styles.heading, { color: theme.textPrimary }]}>
                Weekly Totals
              </Text>
              <Text style={[styles.total, { color: Accent.blue }]}>
                goal {state.weeklyTargetHours}h/wk
              </Text>
            </View>
            <View style={[styles.chartArea, { height: TRACK_H + 26 }]}>
              {/* dashed goal line aligned to bar track */}
              <View
                style={[
                  styles.goalLine,
                  {
                    bottom: 22 + TRACK_H * (weeklyTargetMs / chartMax),
                    borderColor: Accent.amber,
                  },
                ]}
              />
              <View
                style={[
                  styles.goalChip,
                  {
                    bottom:
                      26 + TRACK_H * (weeklyTargetMs / chartMax),
                    backgroundColor: Accent.amber + '22',
                    borderColor: Accent.amber + '55',
                  },
                ]}
              >
                <Text style={[styles.goalChipText, { color: Accent.amber }]}>
                  {state.weeklyTargetHours}h
                </Text>
              </View>
              <View style={styles.barsRow}>
                {weeks.map((w, i) => {
                  const frac = w.studiedMs / chartMax;
                  const met = w.studiedMs >= weeklyTargetMs;
                  const h = Math.max(4, TRACK_H * frac);
                  return (
                    <View key={i} style={styles.barColumn}>
                      <View style={styles.barTrack}>
                        <Animated.View
                          style={{
                            height: barsAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [4, h],
                            }),
                            width: 22,
                            borderRadius: 6,
                            backgroundColor: met
                              ? Accent.green
                              : w.isCurrent
                                ? Accent.blue
                                : theme.border,
                          }}
                        />
                      </View>
                      <Text
                        style={[
                          styles.barLabel,
                          {
                            color: w.isCurrent ? Accent.blue : theme.textMuted,
                            fontWeight: w.isCurrent ? '700' : '400',
                          },
                        ]}
                      >
                        {w.isCurrent ? 'now' : w.label}
                      </Text>
                      {w.studiedMs > 0 && (
                        <Text
                          style={[
                            styles.barValue,
                            { color: met ? Accent.green : theme.textMuted },
                          ]}
                        >
                          {formatShort(w.studiedMs)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </GlassCard>
      </FadeIn>

      {/* ---------- Day-of-week pattern ---------- */}
      <FadeIn delay={200}>
        <GlassCard>
          <View style={styles.cardInner}>
            <View style={styles.headerRow}>
              <Text style={[styles.heading, { color: theme.textPrimary }]}>
                When You Study
              </Text>
              <Text style={[styles.total, { color: theme.textMuted }]}>
                avg/day
              </Text>
            </View>
            {weekdayAvg.map(({ day, avgMs }, i) => {
              const frac = avgMs / maxAvg;
              return (
                <View key={day} style={styles.patRow}>
                  <Text
                    style={[
                      styles.patDay,
                      {
                        color:
                          day === todayIndex
                            ? Accent.blue
                            : theme.textSecondary,
                        fontWeight: day === todayIndex ? '700' : '500',
                      },
                    ]}
                  >
                    {SHORT_LABELS[day]}
                  </Text>
                  <View
                    style={[
                      styles.patTrack,
                      { backgroundColor: theme.card },
                    ]}
                  >
                    <Animated.View
                      style={{
                        width: barsAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', `${Math.max(3, frac * 100)}%`],
                        }),
                        height: 10,
                        borderRadius: 5,
                        backgroundColor:
                          day === todayIndex ? Accent.blue : Accent.indigo,
                        opacity: avgMs > 0 ? 1 : 0.25,
                      }}
                    />
                  </View>
                  <Text style={[styles.patVal, { color: theme.textMuted }]}>
                    {avgMs > 0 ? formatShort(avgMs) : '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        </GlassCard>
      </FadeIn>

      {/* ---------- Daily allocations ---------- */}
      <FadeIn delay={300}>
        <GlassCard>
          <View style={styles.cardInner}>
            <Text style={[styles.heading, { color: theme.textPrimary }]}>
              Daily Allocations
            </Text>
            {WEEK_DAYS_SEQUENCE.map((day, i) => {
              const dateOfDay = new Date(state.currentWeekStart);
              dateOfDay.setDate(dateOfDay.getDate() + i);
              const isRest =
                (state.weeklyRestMode && state.restDays.includes(day)) ||
                state.restDates.includes(formatDateKey(dateOfDay));
              const isToday = day === todayIndex;
              const target = state.dailyTargets[day] ?? 0;
              return (
                <React.Fragment key={day}>
                  <View style={styles.allocRow}>
                    <View style={styles.allocLeft}>
                      <View
                        style={[
                          styles.allocDot,
                          {
                            backgroundColor: isRest
                              ? Accent.amber
                              : isToday
                                ? Accent.blue
                                : theme.border,
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.allocDay,
                          {
                            color: isToday ? Accent.blue : theme.textPrimary,
                            fontWeight: isToday ? '700' : '400',
                          },
                        ]}
                      >
                        {DAY_NAMES[day]}
                        {isToday ? '  · today' : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.allocPill,
                        {
                          backgroundColor: isRest
                            ? Accent.amber + '1a'
                            : theme.card,
                          borderColor: isRest
                            ? Accent.amber + '44'
                            : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.allocTarget,
                          {
                            color: isRest
                              ? Accent.amber
                              : isToday
                                ? Accent.blue
                                : theme.textPrimary,
                          },
                        ]}
                      >
                        {isRest ? 'Rest' : formatTarget(target)}
                      </Text>
                    </View>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </GlassCard>
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 16,
    paddingBottom: 20,
  },
  cardInner: { padding: 18 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heading: { fontSize: 15, fontWeight: '600' },
  total: { fontSize: 12, fontWeight: '500' },

  // calendar
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  calMonth: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  calSub: { fontSize: 11, marginTop: 3 },
  navRow: { flexDirection: 'row', gap: 8 },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  weekHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCellWrap: { width: `${100 / 7}%`, padding: 2 },
  calCell: {
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayNum: { fontSize: 12, fontWeight: '700' },
  legendCalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 10 },
  holdHint: { fontSize: 10, textAlign: 'center', marginTop: 8 },
  restListWrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  restHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  restHeaderText: { flex: 1 },
  modeLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  restChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restChipLabel: { fontSize: 12, fontWeight: '700' },
  restListTitle: { fontSize: 13, fontWeight: '600' },
  restEmpty: { fontSize: 11, paddingVertical: 4 },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  restRowLabel: { fontSize: 13, fontWeight: '500' },

  // weekly chart
  chartArea: {},
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
  },
  barColumn: { flex: 1, alignItems: 'center' },
  barTrack: {
    height: TRACK_H,
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  barValue: { fontSize: 9, fontWeight: '600', height: 12, marginTop: 2 },
  barLabel: { fontSize: 9 },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  goalChip: {
    position: 'absolute',
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    zIndex: 2,
  },
  goalChipText: { fontSize: 9, fontWeight: '700' },

  // weekday pattern
  patRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  patDay: { width: 20, fontSize: 11 },
  patTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  patVal: { width: 40, fontSize: 11, textAlign: 'right' },

  // allocations
  allocRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  allocLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allocDot: { width: 6, height: 6, borderRadius: 3 },
  allocDay: { fontSize: 13 },
  allocPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  allocTarget: { fontSize: 12, fontWeight: '600' },
});
