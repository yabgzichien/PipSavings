import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { FadeIn } from './Motion';
import { Pip } from './Pip';
import { Body, Caption } from './ui';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { useLanguage } from '../i18n';
import { radius, spacing } from '../theme';
import { duration } from '../theme/motion';

const CARD_HEIGHT = 320;

export function AskPipChatBubble({
  role,
  text,
  children,
}: {
  role: 'user' | 'assistant';
  text: string;
  children?: React.ReactNode;
}) {
  const accent = useAccent();
  const colors = useThemeColors();
  const mine = role === 'user';

  return (
    <FadeIn duration={duration.enter} offset={8} style={mine ? styles.rowMine : styles.rowPip}>
      {!mine ? <Pip size={28} expr="idle" /> : null}
      <View
        style={[
          styles.bubble,
          mine
            ? {
                backgroundColor: accent.accent,
                borderBottomRightRadius: radius.sm,
              }
            : {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                borderWidth: StyleSheet.hairlineWidth,
                borderBottomLeftRadius: radius.sm,
              },
        ]}
      >
        {text ? (
          <Body color={mine ? '#fff' : colors.ink} style={styles.copy}>
            {text}
          </Body>
        ) : null}
        {children ? <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.bg }]}>{children}</View> : null}
      </View>
    </FadeIn>
  );
}

export function AskPipTypingBubble() {
  const colors = useThemeColors();
  const { t } = useLanguage();
  const reduced = useReducedMotion();

  return (
    <FadeIn duration={duration.micro} offset={6} style={styles.rowPip}>
      <Pip size={28} expr="idle" />
      <View
        style={[
          styles.bubble,
          styles.typingBubble,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
        accessibilityRole="text"
        accessibilityLabel={t('askPipTyping')}
      >
        {reduced ? (
          <Caption color={colors.ink2}>···</Caption>
        ) : (
          <View style={styles.dots}>
            <TypingDot delay={0} color={colors.ink2} />
            <TypingDot delay={duration.micro} color={colors.ink2} />
            <TypingDot delay={duration.base} color={colors.ink2} />
          </View>
        )}
      </View>
    </FadeIn>
  );
}

function TypingDot({ delay, color }: { delay: number; color: string }) {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: duration.base,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0.35,
          duration: duration.base,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, v]);

  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity: v }]} />;
}

const styles = StyleSheet.create({
  rowMine: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingLeft: spacing.xl,
  },
  rowPip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  bubble: {
    maxWidth: '100%',
    flexShrink: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  copy: { flexShrink: 1 },
  card: {
    height: CARD_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  typingBubble: {
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 56,
    alignItems: 'center',
  },
  dots: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs },
  dot: { width: spacing.sm, height: spacing.sm, borderRadius: 999 },
});
