// Shared Pip Pro welcome beat: purchase, trial, promo redeem, and re-subscribe.
// Restore and already-Pro refreshes never mount this.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { payoff } from '../lib/haptics';
import { payoff as playChime } from '../lib/sound';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { spacing } from '../theme';
import { duration as motionDuration, easing as motionEasing } from '../theme/motion';
import { FadeIn } from './Motion';
import { Icon } from './Icon';
import { Pip } from './Pip';
import { Display } from './ui';

export const PRO_WELCOME_HOLD_MS = 2700;
export const PRO_WELCOME_PIP_SIZE = 144;

const PIP_GOLD = '#FAC438';
const PIP_RIM = '#F5B42A';
const PIP_LEAF = '#2aab68';
const PIP_LEAF_DARK = '#1c7a4e';

type SparkKind = 'spark' | 'streak';

type SparkSpec = {
  angle: number;
  dist: number;
  size: number;
  color: string;
  kind: SparkKind;
};

type BurstSpec = {
  left: string;
  top: string;
  delay: number;
  flash: string;
  sparks: SparkSpec[];
};

function sparksAround(colors: string[], count: number, distMin: number, distMax: number): SparkSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2 + 0.14;
    const dist = distMin + ((i * 47) % (distMax - distMin));
    return {
      angle,
      dist,
      size: i % 3 === 0 ? 7 : 5,
      color: colors[i % colors.length],
      kind: i % 4 === 0 ? 'streak' : 'spark',
    };
  });
}

function burstsFor(accent: string): BurstSpec[] {
  return [
    {
      left: '28%',
      top: '26%',
      delay: 40,
      flash: PIP_GOLD,
      sparks: sparksAround([PIP_GOLD, PIP_RIM, accent, PIP_LEAF], 12, 52, 108),
    },
    {
      left: '74%',
      top: '22%',
      delay: 220,
      flash: accent,
      sparks: sparksAround([accent, PIP_GOLD, PIP_LEAF, PIP_RIM], 11, 48, 102),
    },
    {
      left: '50%',
      top: '78%',
      delay: 420,
      flash: PIP_LEAF,
      sparks: sparksAround([PIP_LEAF, PIP_GOLD, PIP_LEAF_DARK, accent], 10, 44, 96),
    },
  ];
}

function FireworkSpark({
  spec,
  delay,
}: {
  spec: SparkSpec;
  delay: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(t, {
      toValue: 1,
      duration: 760,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [delay, t]);

  const dx = Math.cos(spec.angle) * spec.dist;
  const dy = Math.sin(spec.angle) * spec.dist + spec.dist * 0.22;
  const streak = spec.kind === 'streak';

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: streak ? spec.size * 0.38 : spec.size,
        height: streak ? spec.size * 2.6 : spec.size,
        borderRadius: 999,
        backgroundColor: spec.color,
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.62, 1], outputRange: [0, 1, 0.8, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          { scale: t.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0.3, 1.12, 0.18] }) },
          { rotate: `${(spec.angle * 180) / Math.PI + 90}deg` },
        ],
      }}
    />
  );
}

function BurstFlash({ color, delay }: { color: string; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(t, {
      toValue: 1,
      duration: motionDuration.celebrate,
      delay,
      easing: motionEasing.standard,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [delay, t]);

  return (
    <>
      <Animated.View
        style={[
          styles.flashCore,
          {
            backgroundColor: color,
            opacity: t.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.95, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.8] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.flashRing,
          {
            borderColor: color,
            opacity: t.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 0.7, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.2, 2.4] }) }],
          },
        ]}
      />
    </>
  );
}

function ProWelcomeFireworks({ accent }: { accent: string }) {
  const bursts = burstsFor(accent);
  return (
    <View testID="pro-welcome-fireworks" pointerEvents="none" style={styles.fireworks}>
      {bursts.map((burst, bi) => (
        <View key={bi} style={[styles.burst, { left: burst.left, top: burst.top }]}>
          <BurstFlash color={burst.flash} delay={burst.delay} />
          {burst.sparks.map((spark, si) => (
            <FireworkSpark key={si} spec={spark} delay={burst.delay + 40 + si * 14} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function ProWelcome({
  title,
  closeLabel,
  onDone,
}: {
  title: string;
  closeLabel: string;
  onDone: () => void;
}) {
  const colors = useThemeColors();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const finished = useRef(false);
  const pop = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    payoff();
    playChime();
    const timer = setTimeout(finish, PRO_WELCOME_HOLD_MS);
    return () => clearTimeout(timer);
    // Mount-only: the beat fires once per appearance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      pop.setValue(1);
      return;
    }
    const a = Animated.spring(pop, {
      toValue: 1,
      friction: motionEasing.spring.friction,
      tension: 140,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [pop, reducedMotion]);

  return (
    <View testID="pro-welcome" style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: colors.surface, borderColor: colors.line },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="x" size={18} color={colors.ink2} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={styles.stage}>
          {reducedMotion ? null : <ProWelcomeFireworks accent={accent.accent} />}
          <Animated.View
            style={[
              styles.halo,
              { backgroundColor: accent.accentTint, borderColor: accent.accentSoft },
              {
                transform: [
                  { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
                  { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                ],
              },
            ]}
          >
            <Pip size={PRO_WELCOME_PIP_SIZE} expr="proud" celebrate partyHat />
          </Animated.View>
        </View>
        <FadeIn delay={reducedMotion ? 0 : 80} duration={motionDuration.enter} offset={6}>
          <Display style={styles.headline} numberOfLines={2}>
            {title}
          </Display>
        </FadeIn>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fireworks: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  stage: {
    alignItems: 'center',
    height: 380,
    justifyContent: 'center',
    overflow: 'visible',
    width: 380,
  },
  burst: {
    position: 'absolute',
    width: 1,
    height: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashCore: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 999,
  },
  flashRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 44,
    paddingHorizontal: spacing.base,
    zIndex: 2,
  },
  closeBtn: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  pressed: { opacity: 0.78 },
  body: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.base,
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 1,
  },
  halo: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    padding: spacing.md,
    zIndex: 1,
  },
  headline: {
    textAlign: 'center',
  },
});
