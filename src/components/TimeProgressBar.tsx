import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { getMeta, setMeta } from '../db/metaRepo';
import * as haptics from '../lib/haptics';
import { parseSeenPct, shouldAnimateTimeProgress } from '../lib/timeProgress';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { platformShadow, spacing } from '../theme';
import { duration as motionDuration, easing as motionEasing } from '../theme/motion';
import { useEasedFrom } from './Motion';
import { Caption } from './ui';

/** Hairline track — ambient, not a KPI. */
const BAR_HEIGHT = 2;

/**
 * Ambient calendar-time progress (month on home, year on calendar).
 * Compact row: bar takes the width, caption sits quiet on the right.
 * Fill + % count up only when today's % differs from last seen.
 */
export function TimeProgressBar({
  percent,
  captionFor,
  storageKey,
  onPress,
  accessibilityLabel,
}: {
  percent: number;
  /** Build caption from the (possibly animating) displayed %. Days-left stays fixed in the parent. */
  captionFor: (displayedPct: number) => string;
  storageKey: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const reducedMotion = useReducedMotion();
  const target = Math.max(0, Math.min(100, Math.round(percent)));

  const [animate, setAnimate] = useState<boolean | null>(null);
  const fill = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    let cancelled = false;
    setAnimate(null);
    void (async () => {
      try {
        const raw = await getMeta(storageKey);
        if (cancelled) return;
        const last = parseSeenPct(raw);
        const should = !reducedMotion && shouldAnimateTimeProgress(last, target);
        if (should) fill.setValue(0);
        else fill.setValue(target);
        setAnimate(should);
        if (last !== target) {
          void setMeta(storageKey, String(target));
        }
      } catch {
        if (cancelled) return;
        fill.setValue(target);
        setAnimate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, target, reducedMotion, fill]);

  useEffect(() => {
    if (animate !== true) return;
    const a = Animated.timing(fill, {
      toValue: target,
      duration: motionDuration.celebrate,
      easing: motionEasing.standard,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [animate, target, fill]);

  const displayedPct = useEasedFrom(
    animate === true ? 0 : target,
    target,
    animate === true ? motionDuration.celebrate : 0,
  );
  const captionPct = animate === true ? Math.round(displayedPct) : target;
  const caption = captionFor(captionPct);

  // Soft fill + whisper of glow — readable, not loud.
  const glow = platformShadow(theme.accent, 0.16, 3, { width: 0, height: 0 }, 0);

  const body = (
    <View style={styles.wrap}>
      <View style={[styles.track, { backgroundColor: colorTheme.line }]}>
        <Animated.View
          style={[
            styles.fill,
            glow,
            {
              width: fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              backgroundColor: theme.accent,
              opacity: 0.5,
            },
          ]}
        />
      </View>
      <Caption color={colorTheme.ink3} style={styles.caption} numberOfLines={1}>
        {caption}
      </Caption>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? caption}
      hitSlop={6}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  track: {
    flex: 1,
    minWidth: 0,
    height: BAR_HEIGHT,
    borderRadius: 999,
    overflow: 'visible',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  caption: {
    flexShrink: 0,
  },
});
