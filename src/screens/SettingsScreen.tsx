import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HourWheel } from '../components/HourWheel';
import { useStudyStore } from '../studyStore';
import { GlassCard } from '../components/Glass';
import { useTheme, Accent } from '../theme';

export function SettingsScreen() {
  const theme = useTheme();
  const state = useStudyStore();
  const [hours, setHours] = useState(state.weeklyTargetHours);
  const [notice, setNotice] = useState<string | null>(null);

  const activeDays = Math.max(
    1,
    Object.values(state.dailyTargets).filter((t) => t > 0).length
  );
  const baseDailyHours = hours / activeDays;

  const onResetAll = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Reset everything?',
      'This clears your weekly goal, session history, and all progress. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            state.resetStore();
            const fresh = useStudyStore.getState();
            setHours(fresh.weeklyTargetHours);
            setNotice('Everything has been reset to defaults.');
          },
        },
      ]
    );
  };

  // Saves automatically when the finger lifts — no save button needed
  const commitHours = (v: number) => {
    state.setWeeklyTarget(Math.round(v));
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {notice && (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: Accent.green + '1A',
              borderColor: Accent.green + '4D',
            },
          ]}
        >
          <Text style={[styles.noticeText, { color: theme.textPrimary }]}>
            {notice}
          </Text>
          <Pressable onPress={() => setNotice(null)} hitSlop={8}>
            <Text style={{ color: theme.textSecondary, fontSize: 14 }}>✕</Text>
          </Pressable>
        </View>
      )}

      <GlassCard>
        <View style={styles.cardInner}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <Ionicons
                name={state.isDarkTheme ? 'moon' : 'sunny'}
                size={20}
                color={Accent.blue}
              />
              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.heading, { color: theme.textPrimary }]}>
                  OLED Dark Mode
                </Text>
                <Text style={[styles.subtext, { color: theme.textSecondary }]}>
                  {state.isDarkTheme ? 'Deep OLED Black' : 'Studio Light Theme'}
                </Text>
              </View>
            </View>
            <Switch
              value={state.isDarkTheme}
              onValueChange={() => {
                Haptics.selectionAsync();
                state.toggleTheme();
              }}
              thumbColor="#FFFFFF"
              trackColor={{ false: '#3f3f46', true: Accent.blue }}
            />
          </View>
        </View>
      </GlassCard>

      <GlassCard>
        <View style={styles.cardInner}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <Ionicons name="options" size={18} color={Accent.blue} />
              <Text
                style={[
                  styles.heading,
                  { color: theme.textPrimary, marginLeft: 8 },
                ]}
              >
                Weekly Commitment
              </Text>
            </View>
          </View>

          <HourWheel
            value={hours}
            min={5}
            max={50}
            step={1}
            accent={Accent.blue}
            textSecondary={theme.textSecondary}
            borderColor={theme.border + '66'}
            surface={theme.isDark ? '#00000033' : '#00000008'}
            onChange={setHours}
            onCommit={commitHours}
          />

          <Text style={[styles.baseTarget, { color: Accent.blue }]}>
            {baseDailyHours.toFixed(1)} hrs per study day
          </Text>
        </View>
      </GlassCard>

      <GlassCard>
        <View style={styles.cardInner}>
          <Pressable
            onPress={onResetAll}
            style={[styles.outlineButton, { borderColor: Accent.red + '66' }]}
          >
            <Ionicons
              name="trash-outline"
              size={14}
              color={Accent.red}
            />
            <Text
              style={[
                styles.outlineButtonText,
                { color: Accent.red, marginLeft: 6 },
              ]}
            >
              Reset Everything
            </Text>
          </Pressable>
        </View>
      </GlassCard>

      <View style={{ height: 10 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 16,
  },
  notice: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 0.75,
    padding: 12,
  },
  noticeText: { fontSize: 12, flex: 1, marginRight: 8 },
  cardInner: { padding: 18 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: { fontSize: 15, fontWeight: '600' },
  subtext: { fontSize: 12 },
  baseTarget: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
  },
  outlineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.75,
    borderRadius: 10,
    paddingVertical: 9,
  },
  outlineButtonText: { fontSize: 12, fontWeight: '600' },
});
