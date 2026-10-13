import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StudySessionRecord } from '../types';
import { formatDateKey, getMondayOfWeek } from '../rulesEngine';
import { useTheme, Accent } from '../theme';

interface HeatmapDay {
  dateKey: string;
  dateLabel: string;
  durationMinutes: number;
  intensityLevel: number;
}

const WEEKS = 26;
const DAY_LABELS = ['M', '', 'W', '', 'F', '', 'S'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const ContributionHeatmap = React.memo(function ContributionHeatmap({
  history,
  todayStudiedMs,
  onDaySelected,
}: {
  history: StudySessionRecord[];
  todayStudiedMs: number;
  onDaySelected?: () => void;
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState<HeatmapDay | null>(null);
  const { width: screenWidth } = useWindowDimensions();

  // Fit all weeks on screen: screen padding + card padding + label column
  const cellSize = Math.max(
    7,
    Math.min(12, Math.floor((screenWidth - 96) / WEEKS) - 2)
  );
  const cellStyle = {
    width: cellSize,
    height: cellSize,
    borderRadius: 2,
    marginVertical: 1,
  };

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of history) {
      map.set(record.dateKey, (map.get(record.dateKey) ?? 0) + record.durationMs);
    }
    map.set(formatDateKey(new Date()), todayStudiedMs);
    return map;
  }, [history, todayStudiedMs]);

  const weeks = useMemo(() => generateGrid(totals), [totals]);
  const activeDays = useMemo(
    () => [...totals.values()].filter((v) => v > 0).length,
    [totals]
  );

  return (
    <View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          Study Consistency
        </Text>
        {selected ? (
          <Text style={[styles.selectedLabel, { color: Accent.blue }]}>
            {selected.dateLabel}: {selected.durationMinutes}m
          </Text>
        ) : (
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
            {activeDays} active days
          </Text>
        )}
      </View>

      <View style={styles.grid}>
        <View style={styles.labelColumn}>
          {DAY_LABELS.map((label, i) => (
            <View key={i} style={[styles.cell, cellStyle]}>
              <Text style={[styles.dayLabel, { color: theme.textMuted }]}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekColumn}>
            {week.map((day) => {
              const isSelected = selected?.dateKey === day.dateKey;
              return (
                <Pressable
                  key={day.dateKey}
                  onPress={() => {
                    setSelected(day);
                    onDaySelected?.();
                  }}
                  style={[
                    styles.cell,
                    cellStyle,
                    {
                      backgroundColor: theme.heatmap[day.intensityLevel],
                      borderColor: isSelected ? Accent.blue : 'transparent',
                    },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>
          Less
        </Text>
        {theme.heatmap.map((color, i) => (
          <View
            key={i}
            style={[styles.legendCell, { backgroundColor: color }]}
          />
        ))}
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>
          More
        </Text>
      </View>
    </View>
  );
});

function generateGrid(totals: Map<string, number>): HeatmapDay[][] {
  const cursor = getMondayOfWeek(new Date());
  cursor.setDate(cursor.getDate() - (WEEKS - 1) * 7);

  const weeks: HeatmapDay[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const week: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const dateKey = formatDateKey(cursor);
      const minutes = Math.floor((totals.get(dateKey) ?? 0) / 60000);
      week.push({
        dateKey,
        dateLabel: `${MONTHS[cursor.getMonth()]} ${cursor.getDate()}`,
        durationMinutes: minutes,
        intensityLevel:
          minutes === 0 ? 0 : minutes < 30 ? 1 : minutes < 60 ? 2 : minutes < 120 ? 3 : 4,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 13, fontWeight: '600' },
  selectedLabel: { fontSize: 11, fontWeight: '700' },
  totalLabel: { fontSize: 11 },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelColumn: { marginRight: 6 },
  weekColumn: { flex: 1, alignItems: 'center' },
  cell: {
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: { fontSize: 8, fontWeight: '700' },
  legend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  legendText: { fontSize: 9 },
  legendCell: { width: 9, height: 9, borderRadius: 2 },
});
