import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStudyStore } from '../studyStore';
import { DayOfWeek, SessionResult } from '../types';
import { GlassCard } from '../components/Glass';
import { ContributionHeatmap } from '../components/ContributionHeatmap';
import { WeekStrip } from '../components/WeekStrip';
import { useTheme, Accent } from '../theme';
import { setSystemNavBarStyle } from '../screenState';
import { formatDateKey } from '../rulesEngine';

const SIZE = 280;
const STROKE = 13;
const RADIUS = (SIZE - STROKE * 2 - 8) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function clock(ms: number) {
  return `${pad(Math.floor(ms / 3600000))}:${pad(
    Math.floor((ms % 3600000) / 60000)
  )}:${pad(Math.floor((ms % 60000) / 1000))}`;
}

function resultMessage(result: SessionResult): string {
  const justMet =
    result.targetMet &&
    !result.isExtraStudy &&
    result.todayStudiedMs - result.elapsedMs < result.dailyTargetMs;
  if (justMet) {
    return 'Daily quota met. Extra study mode is now active.';
  }
  if (result.normalOverstudyDiscountAppliedMs > 0) {
    return `Earned -${result.normalOverstudyDiscountAppliedMs / 60000}m off your next active day`;
  }
  if (result.extraDiscountAppliedPerRemainingDayMs > 0) {
    return `Extra study: -${result.extraDiscountAppliedPerRemainingDayMs / 60000}m off each remaining day`;
  }
  return `Session recorded: ${Math.floor(result.elapsedMs / 60000)}m`;
}

/** Green session banner — springs down into view when it appears. */
function NoticeBanner({ text, onClose }: { text: string; onClose: () => void }) {
  const theme = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 9,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.notice,
        {
          backgroundColor: Accent.green + '1A',
          borderColor: Accent.green + '4D',
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-18, 0],
              }),
            },
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={[styles.noticeText, { color: theme.textPrimary }]}>
        {text}
      </Text>
      <Pressable onPress={onClose} hitSlop={8}>
        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

export function FocusScreen() {
  const theme = useTheme();
  const state = useStudyStore();
  const [liveMs, setLiveMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionResult | null>(null);
  const armed = state.isSessionArmed;
  const wasActive = useRef(false);
  const summaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathe = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  // Session ended (phone unlocked) -> show elapsed summary briefly, then
  // transition back to the main screen
  useEffect(() => {
    if (wasActive.current && !state.isSessionActive) {
      const result = useStudyStore.getState().lastSessionResult;
      if (result && result.elapsedMs > 0) {
        setSummary(result);
        summaryTimer.current = setTimeout(() => setSummary(null), 2500);
      }
    }
    wasActive.current = state.isSessionActive;
    return () => {
      if (summaryTimer.current) clearTimeout(summaryTimer.current);
    };
  }, [state.isSessionActive]);

  // Black session screen -> system nav bar goes dark too; restore theme
  // button style when it closes
  const blackModalVisible = armed || state.isSessionActive || summary != null;
  useEffect(() => {
    setSystemNavBarStyle(
      blackModalVisible || theme.isDark ? 'light' : 'dark'
    );
  }, [blackModalVisible, theme.isDark]);

  // Back in the foreground with no session -> the arm never fired, dismiss it
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (
        next === 'active' &&
        !useStudyStore.getState().isSessionActive
      ) {
        useStudyStore.getState().disarmSession();
      }
    });
    return () => sub.remove();
  }, []);

  // Ticks the displayed timer while a session is running
  useEffect(() => {
    if (!state.isSessionActive || state.sessionStartTime == null) {
      setLiveMs(0);
      return;
    }
    const id = setInterval(
      () => setLiveMs(Date.now() - (state.sessionStartTime ?? Date.now())),
      200
    );
    return () => clearInterval(id);
  }, [state.isSessionActive, state.sessionStartTime]);

  // Ambient breathing glow behind the ring
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    if (state.isSessionActive) {
      loop.start();
    } else {
      loop.stop();
      breathe.setValue(0);
    }
    return () => loop.stop();
  }, [state.isSessionActive, breathe]);

  const dayOfWeek = new Date().getDay() as DayOfWeek;
  const dailyTarget = state.dailyTargets[dayOfWeek] ?? 0;
  const isRestDay =
    (state.weeklyRestMode && state.restDays.includes(dayOfWeek)) ||
    state.restDates.includes(formatDateKey(new Date()));
  const totalMs =
    state.todayStudiedMs +
    state.todayExtraStudiedMs +
    (state.isSessionActive ? liveMs : 0);
  const isQuotaMet = dailyTarget > 0 && totalMs >= dailyTarget;
  const progress = dailyTarget > 0 ? Math.min(1, totalMs / dailyTarget) : 1;
  const ringColor = isQuotaMet ? Accent.amber : Accent.blue;

  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const targetHours = Math.floor(dailyTarget / 3600000);
  const targetMinutes = Math.floor((dailyTarget % 3600000) / 60000);

  const onPressRing = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (state.isSessionActive) {
      const result = state.endSession();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result) setNotice(resultMessage(result));
    } else {
      // Arm focus mode — the session only starts once the phone locks
      state.armSession();
    }
  };

  const cueText = state.isSessionActive
    ? 'Tap to pause'
    : isQuotaMet
      ? 'Tap for extra'
      : 'Tap to start';
  const cueColor = state.isSessionActive
    ? Accent.green
    : isQuotaMet
      ? Accent.amber
      : Accent.blue;
  const contextText = isRestDay
    ? 'Rest Day'
    : isQuotaMet
      ? 'Goal reached'
      : `Goal: ${targetHours}h ${targetMinutes}m`;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {notice && (
        <NoticeBanner text={notice} onClose={() => setNotice(null)} />
      )}

      <Pressable
        onPress={onPressRing}
        onPressIn={() =>
          Animated.spring(pressScale, {
            toValue: 0.93,
            useNativeDriver: true,
            speed: 40,
            bounciness: 6,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(pressScale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 24,
            bounciness: 12,
          }).start()
        }
        style={styles.ringWrap}
      >
        <Animated.View
          style={[
            styles.ringInner,
            { transform: [{ scale: pressScale }] },
          ]}
        >
        {state.isSessionActive && (
          <Animated.View
            style={[
              styles.glow,
              {
                backgroundColor: ringColor + '2E',
                transform: [
                  {
                    scale: breathe.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1.03],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={ringColor}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            strokeLinecap="round"
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={[styles.timeText, { color: theme.textPrimary }]}>
            {`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`}
          </Text>
          <Text style={[styles.cueText, { color: cueColor }]}>{cueText}</Text>
          <Text style={[styles.contextText, { color: theme.textSecondary }]}>
            {contextText}
          </Text>
        </View>
        </Animated.View>
      </Pressable>

      <GlassCard>
        <View style={styles.statRow}>
          <View>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              Studied Today
            </Text>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>
              {hours}h {minutes}m
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              Target
            </Text>
            <Text
              style={[
                styles.statValue,
                { color: isQuotaMet ? Accent.green : theme.textPrimary },
              ]}
            >
              {isRestDay ? 'Rest' : `${targetHours}h ${targetMinutes}m`}
            </Text>
          </View>
        </View>
      </GlassCard>

      <GlassCard>
        <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
          <WeekStrip />
        </View>
      </GlassCard>

      <GlassCard>
        <View style={{ padding: 18 }}>
          <ContributionHeatmap
            history={state.history}
            todayStudiedMs={totalMs}
          />
        </View>
      </GlassCard>

      <View style={{ height: 10 }} />

      <Modal
        visible={armed || state.isSessionActive || summary != null}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          if (armed && !state.isSessionActive) state.disarmSession();
          if (summary) setSummary(null);
        }}
      >
        <Pressable
          style={styles.armedOverlay}
          onPress={() => {
            if (summary) setSummary(null);
            else if (armed && !state.isSessionActive) state.disarmSession();
          }}
        >
          {summary ? (
            <>
              <Text style={styles.armedLabel}>Session complete</Text>
              <Text style={styles.armedTimer}>{clock(summary.elapsedMs)}</Text>
              <Text style={styles.armedText}>
                Check the notification to continue studying
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.armedTimer}>
                {state.isSessionActive ? clock(liveMs) : '00:00:00'}
              </Text>
              <Text style={styles.armedText}>
                {state.isSessionActive
                  ? 'Session running — unlock to stop'
                  : 'Lock the phone to start'}
              </Text>
              <Text style={styles.armedHint}>
                {state.isSessionActive ? '' : 'Tap anywhere to cancel'}
              </Text>
            </>
          )}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 24,
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
  ringWrap: {
    width: SIZE,
    height: SIZE,
    marginTop: 20,
  },
  ringInner: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 255,
    height: 255,
    borderRadius: 255 / 2,
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 38,
    fontWeight: '600',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  cueText: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  contextText: { fontSize: 11, marginTop: 2 },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 17, fontWeight: '600', marginTop: 2 },
  armedOverlay: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  armedLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 8,
  },
  armedTimer: {
    fontSize: 42,
    fontWeight: '600',
    fontFamily: 'monospace',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  armedText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 14,
  },
  armedHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 48,
  },
});
