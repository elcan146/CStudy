import React from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStudyStore } from '../studyStore';
import { StudySessionRecord } from '../types';
import { GlassBadge, GlassCard } from '../components/Glass';
import { useTheme, Accent } from '../theme';

export function HistoryScreen() {
  const theme = useTheme();
  const history = useStudyStore((s) => s.history);
  const clearHistory = useStudyStore((s) => s.clearHistory);

  const totalMs = history.reduce((sum, r) => sum + r.durationMs, 0);
  const totalHours = Math.floor(totalMs / 3600000);
  const totalMinutes = Math.floor((totalMs % 3600000) / 60000);
  const avgMinutes = history.length
    ? Math.floor(totalMs / history.length / 60000)
    : 0;

  const onClear = () => {
    Haptics.selectionAsync();
    Alert.alert('Clear History', 'Delete all logged sessions?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearHistory();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <GlassCard>
        <View style={styles.cardInner}>
          <View style={styles.headerRow}>
            <Text style={[styles.heading, { color: theme.textPrimary }]}>
              Total Focus
            </Text>
            {history.length > 0 && (
              <TouchableOpacity onPress={onClear} hitSlop={8}>
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.statsRow}>
            <Stat label="Sessions" value={`${history.length}`} theme={theme} />
            <Stat
              label="Total Time"
              value={`${totalHours}h ${totalMinutes}m`}
              theme={theme}
            />
            <Stat label="Avg Session" value={`${avgMinutes}m`} theme={theme} />
          </View>
        </View>
      </GlassCard>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="hourglass-outline"
            size={44}
            color={theme.textMuted}
          />
          <Text style={[styles.emptyText, { color: theme.textPrimary }]}>
            No recorded sessions
          </Text>
        </View>
      ) : (
        <GlassCard style={{ flex: 1 }}>
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6 }}
            ItemSeparatorComponent={() => (
              <View
                style={[styles.separator, { backgroundColor: theme.border }]}
              />
            )}
            renderItem={({ item }) => <SessionRow record={item} theme={theme} />}
          />
        </GlassCard>
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: theme.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

function SessionRow({
  record,
  theme,
}: {
  record: StudySessionRecord;
  theme: ReturnType<typeof useTheme>;
}) {
  const color = record.isExtraStudy ? Accent.amber : Accent.blue;
  const time = new Date(record.timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const durationMin = Math.floor(record.durationMs / 60000);
  const durationSec = Math.floor((record.durationMs % 60000) / 1000);

  return (
    <View style={styles.sessionRow}>
      <View style={styles.sessionLeft}>
        <View style={[styles.iconBubble, { backgroundColor: color + '1F' }]}>
          <Ionicons name="timer-outline" size={16} color={color} />
        </View>
        <View>
          <Text style={[styles.sessionDate, { color: theme.textPrimary }]}>
            {record.dateKey}
          </Text>
          <Text style={[styles.sessionTime, { color: theme.textSecondary }]}>
            {time}
          </Text>
        </View>
      </View>

      <View style={styles.sessionRight}>
        <GlassBadge
          text={record.isExtraStudy ? 'Extra' : 'Normal'}
          color={color}
        />
        <Text style={[styles.sessionDuration, { color: theme.textPrimary }]}>
          {durationMin}m {durationSec}s
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 16,
  },
  cardInner: { padding: 18 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heading: { fontSize: 15, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
    gap: 12,
  },
  emptyText: { fontSize: 14, fontWeight: '500' },
  separator: { height: 0.5, opacity: 0.3 },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sessionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionDate: { fontSize: 13, fontWeight: '600' },
  sessionTime: { fontSize: 11 },
  sessionRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionDuration: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});
