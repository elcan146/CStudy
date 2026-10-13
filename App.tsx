import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  NativeModules,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

// The JS half of safe-area-context always loads — the native view manager is
// what may be missing in older APKs. Only wire it up when it actually exists,
// otherwise RNCSafeAreaProvider crashes at render.
const FallbackProvider = ({ children }: { children?: React.ReactNode }) => (
  <View style={{ flex: 1 }}>{children}</View>
);
let SafeAreaProvider: React.ComponentType<{
  children?: React.ReactNode;
}> = FallbackProvider;
// Fallback inset ladder:
// 1. react-native-safe-area-context when its native view manager exists
// 2. our own screen-state module's getSystemInsets() (added later — absent
//    in older APKs, so it may return null)
// 3. heuristic: screen/window diff (non-edge-to-edge) or a 48dp floor that
//    covers the Android 3-button nav bar
const statusBarH = RNStatusBar.currentHeight ?? 24;
const navGuess = Math.max(
  0,
  Dimensions.get('screen').height -
    Dimensions.get('window').height -
    statusBarH
);
let useSafeAreaInsets: () => { top: number; bottom: number } = () => {
  const m = getSystemInsets();
  if (m) return { top: m.top, bottom: Math.max(m.bottom, 8) };
  return { top: statusBarH, bottom: Math.max(48, navGuess) };
};
if (NativeModules.RNCSafeAreaContext) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ctx = require('react-native-safe-area-context');
  SafeAreaProvider = ctx.SafeAreaProvider;
  useSafeAreaInsets = ctx.useSafeAreaInsets;
}

// 'light' = light-colored buttons over dark content, 'dark' = the reverse
function applyNavBarTheme(isDark: boolean) {
  setSystemNavBarStyle(isDark ? 'light' : 'dark');
}
import { StatusBar } from 'expo-status-bar';

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStudyStore } from './src/studyStore';
import { useFocusTracker } from './src/useFocusTracker';
import { getSystemInsets, setSystemNavBarStyle } from './src/screenState';
import { useTheme, Accent } from './src/theme';
import {
  addSessionNotificationListener,
  dismissContinuePrompt,
  dismissSessionNotification,
  setupSessionNotifications,
  showContinuePrompt,
  upsertSessionNotification,
} from './src/sessionNotifications';
import { FocusScreen } from './src/screens/FocusScreen';
import { ScheduleScreen } from './src/screens/ScheduleScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const TABS = [
  { label: 'Focus', icon: 'play-circle-outline' },
  { label: 'Schedule', icon: 'calendar-outline' },
  { label: 'History', icon: 'time-outline' },
  { label: 'Settings', icon: 'options-outline' },
] as const;

const SCREENS = [FocusScreen, ScheduleScreen, HistoryScreen, SettingsScreen];

/** Instagram-style launch splash — logo on black until store hydration +
 * minimum hold, then zooms/fades away. */
function SplashOverlay({ onDone }: { onDone: () => void }) {
  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const startedAt = Date.now();
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Logo breathes in while the splash is held
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 6,
      bounciness: 10,
    }).start();

    const finish = () => {
      if (finished) return;
      finished = true;
      const hold = Math.max(0, 1100 - (Date.now() - startedAt));
      timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fade, {
            toValue: 0,
            duration: 380,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 380,
            useNativeDriver: true,
          }),
        ]).start(() => onDone());
      }, hold);
    };

    if (useStudyStore.persist.hasHydrated()) {
      finish();
    } else {
      const unsub = useStudyStore.persist.onFinishHydration(finish);
      const fallback = setTimeout(finish, 3000);
      return () => {
        unsub();
        clearTimeout(fallback);
        if (timer) clearTimeout(timer);
      };
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [fade, scale, onDone]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.splash, { opacity: fade }]}
      pointerEvents="none"
    >
      <Animated.Image
        source={require('./assets/icon.jpg')}
        style={[styles.splashLogo, { transform: [{ scale }] }]}
      />
    </Animated.View>
  );
}

function App() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toggleTheme = useStudyStore((s) => s.toggleTheme);
  const isSessionActive = useStudyStore((s) => s.isSessionActive);
  const sessionStartTime = useStudyStore((s) => s.sessionStartTime);
  const endSession = useStudyStore((s) => s.endSession);

  const [tab, setTab] = useState(0);
  const [splash, setSplash] = useState(true);
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Stable page elements — tab changes re-render App but must not re-render
  // all four screens (calendar/charts are expensive)
  const pages = useMemo(
    () =>
      SCREENS.map((Screen, i) => (
        <View key={i} style={{ width }}>
          <Screen />
        </View>
      )),
    [width]
  );

  const barWidth = width - 28;
  const tabW = barWidth / TABS.length;
  const indicatorX = scrollX.interpolate({
    inputRange: TABS.map((_, i) => i * width),
    outputRange: TABS.map((_, i) => i * tabW),
    extrapolate: 'clamp',
  });
  const scales = TABS.map((_, i) =>
    scrollX.interpolate({
      inputRange: [(i - 1) * width, i * width, (i + 1) * width],
      outputRange: [1, 1.12, 1],
      extrapolate: 'clamp',
    })
  );

  // Lock phone -> session starts, unlock -> session ends and time is credited
  useFocusTracker({ autoTrackOnBackground: true });

  const goToTab = (next: number) => {
    const clamped = Math.max(0, Math.min(TABS.length - 1, next));
    if (clamped === tab) return;
    Haptics.selectionAsync();
    setTab(clamped);
    pagerRef.current?.scrollTo({ x: clamped * width, animated: true });
  };

  useEffect(() => {
    setupSessionNotifications();
  }, []);

  // System nav bar follows the app theme (light icons on dark, dark on light)
  useEffect(() => {
    applyNavBarTheme(theme.isDark);
  }, [theme.isDark]);

  // Notification action buttons: end session / continue / done (forfeit bonus)
  useEffect(
    () =>
      addSessionNotificationListener({
        onEndSession: () => endSession(),
        onContinueSession: () => {
          useStudyStore.getState().armSession();
          dismissContinuePrompt();
        },
        onDoneSession: () => {
          const s = useStudyStore.getState();
          s.revokeSessionDiscounts(s.lastSessionResult);
          dismissContinuePrompt();
        },
      }),
    [endSession]
  );

  // Post the "wish to continue?" prompt when a session finishes
  const wasSessionActive = useRef(false);
  useEffect(() => {
    if (wasSessionActive.current && !isSessionActive) {
      const result = useStudyStore.getState().lastSessionResult;
      if (result && result.elapsedMs > 0) {
        showContinuePrompt(result.elapsedMs);
      }
    }
    wasSessionActive.current = isSessionActive;
  }, [isSessionActive]);

  // Keeps the ongoing notification alive and ticking while a session runs
  useEffect(() => {
    if (!isSessionActive || sessionStartTime == null) {
      dismissSessionNotification();
      return;
    }
    upsertSessionNotification(Date.now() - sessionStartTime);
    const id = setInterval(
      () => upsertSessionNotification(Date.now() - sessionStartTime),
      60000
    );
    return () => clearInterval(id);
  }, [isSessionActive, sessionStartTime]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top,
        },
      ]}
    >
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />

      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            toggleTheme();
          }}
          hitSlop={8}
        >
          <Ionicons
            name={theme.isDark ? 'sunny-outline' : 'moon-outline'}
            size={20}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.content}
        onScroll={(e) => scrollX.setValue(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        decelerationRate="fast"
        overScrollMode="never"
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== tab) {
            Haptics.selectionAsync();
            setTab(i);
          }
        }}
      >
        {pages}
      </ScrollView>

      <View
        style={[
          styles.tabDock,
          {
            backgroundColor: theme.background,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View
          style={[
            styles.tabBar,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Animated.View
            style={[
              styles.tabIndicator,
              {
                width: tabW - 10,
                backgroundColor: Accent.blue + '1f',
                transform: [{ translateX: indicatorX }],
              },
            ]}
          />
          {TABS.map((t, i) => {
            const activeOpacity = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [0, 1, 0],
              extrapolate: 'clamp',
            });
            return (
              <TouchableOpacity
                key={t.label}
                style={styles.tabItem}
                onPress={() => goToTab(i)}
                activeOpacity={0.7}
              >
                <Animated.View
                  style={[
                    styles.tabContent,
                    { transform: [{ scale: scales[i] }] },
                  ]}
                >
                  <Ionicons name={t.icon} size={21} color={theme.textMuted} />
                  <Text style={[styles.tabLabel, { color: theme.textMuted }]}>
                    {t.label}
                  </Text>
                  <Animated.View
                    style={[
                      styles.tabActiveLayer,
                      { opacity: activeOpacity },
                    ]}
                  >
                    <Ionicons name={t.icon} size={21} color={Accent.blue} />
                    <Text style={[styles.tabLabel, { color: Accent.blue }]}>
                      {t.label}
                    </Text>
                  </Animated.View>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {splash && <SplashOverlay onDone={() => setSplash(false)} />}
    </View>
  );
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  splashLogo: {
    width: 104,
    height: 104,
    borderRadius: 24,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  content: { flex: 1 },
  tabDock: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 62,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  tabIndicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 5,
    borderRadius: 16,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabContent: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabActiveLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
