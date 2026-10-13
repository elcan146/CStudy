import React, { useRef } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';

const ITEM_H = 46;
const VISIBLE = 3; // selected row sits in the middle
const WHEEL_H = ITEM_H * VISIBLE;

/**
 * Alarm-clock drum picker: flick up/down, rows snap to the center band.
 * Row scale/opacity track the scroll offset on the native thread so the
 * wheel feels like a physical drum, not a list that jumps.
 */
export function HourWheel({
  value,
  min,
  max,
  step,
  accent,
  textSecondary,
  borderColor,
  surface,
  onChange,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  accent: string;
  textSecondary: string;
  borderColor: string;
  surface: string;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const hours: number[] = [];
  for (let h = min; h <= max; h += step) hours.push(h);

  const initialIdx = Math.max(0, Math.round((value - min) / step));
  const selRef = useRef(initialIdx);
  const lastTick = useRef(0);
  const lastY = useRef(initialIdx * ITEM_H);
  const committed = useRef(hours[initialIdx]);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollY = useRef(new Animated.Value(initialIdx * ITEM_H)).current;

  const indexFromY = (y: number) =>
    Math.max(0, Math.min(hours.length - 1, Math.round(y / ITEM_H)));

  const commitAtY = (y: number) => {
    const i = indexFromY(y);
    if (i !== selRef.current) {
      selRef.current = i;
      onChange(hours[i]);
    }
    if (hours[i] !== committed.current) {
      committed.current = hours[i];
      Vibration.vibrate(30); // firm thunk when it locks onto a new value
      onCommit(hours[i]);
    }
  };

  // the wheel can still be gliding/snapping when the finger lifts —
  // wait for it to actually rest before committing
  const commitWhenRest = () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commitAtY(lastY.current), 220);
  };

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        lastY.current = e.nativeEvent.contentOffset.y;
        const i = indexFromY(lastY.current);
        if (i !== selRef.current) {
          selRef.current = i;
          const now = Date.now();
          if (now - lastTick.current > 35) {
            lastTick.current = now;
            Vibration.vibrate(6);
          }
          onChange(hours[i]);
        }
      },
    }
  );

  return (
    <View style={[styles.wrap, { backgroundColor: surface }]}>
      {/* center selection band */}
      <View
        pointerEvents="none"
        style={[
          styles.band,
          {
            top: ITEM_H,
            height: ITEM_H,
            borderColor,
          },
        ]}
      />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        snapToAlignment="start"
        decelerationRate="fast"
        contentOffset={{ x: 0, y: selRef.current * ITEM_H }}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() =>
          commitTimer.current && clearTimeout(commitTimer.current)
        }
        onMomentumScrollBegin={() =>
          commitTimer.current && clearTimeout(commitTimer.current)
        }
        onMomentumScrollEnd={(e) =>
          commitAtY(e.nativeEvent.contentOffset.y)
        }
        onScrollEndDrag={(e) => {
          const v = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(v) < 0.1) commitWhenRest();
        }}
      >
        {hours.map((item, index) => {
          const inputRange = [
            (index - 1) * ITEM_H,
            index * ITEM_H,
            (index + 1) * ITEM_H,
          ];
          const scale = scrollY.interpolate({
            inputRange,
            outputRange: [0.62, 1, 0.62],
            extrapolate: 'clamp',
          });
          const opacity = scrollY.interpolate({
            inputRange,
            outputRange: [0.28, 1, 0.28],
            extrapolate: 'clamp',
          });
          // accent layer fades in exactly as the row crosses center —
          // driven by the scroll offset, so color tracks your finger
          const accentOn = scrollY.interpolate({
            inputRange,
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={item}
              style={[
                styles.row,
                { height: ITEM_H, transform: [{ scale }], opacity },
              ]}
            >
              <Text
                style={[
                  styles.rowText,
                  { color: textSecondary, fontWeight: '500' },
                ]}
              >
                {item} hours
              </Text>
              <Animated.Text
                style={[
                  styles.rowText,
                  styles.accentLayer,
                  { color: accent, fontWeight: '800', opacity: accentOn },
                ]}
              >
                {item} hours
              </Animated.Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: WHEEL_H,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 10,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  accentLayer: {
    position: 'absolute',
  },
});
