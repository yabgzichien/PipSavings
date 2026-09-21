import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { Translations } from '../i18n/types';
import { useAccent } from '../state/accent';
import { useResolvedScheme, useThemeColors } from '../state/colorScheme';
import { radius, spacing } from '../theme';
import { Icon } from './Icon';
import { Body } from './ui';

const FREE_MEMBERSHIP_ART = require('../../assets/pro/free-starseed.png');
const PRO_MEMBERSHIP_ART = require('../../assets/pro/active-bloom-medal.png');

export function ProMembershipCard({ isPro, onUpgrade, t }: {
  isPro: boolean;
  onUpgrade: () => void;
  t: (key: keyof Translations) => string;
}) {
  const accent = useAccent();
  const colors = useThemeColors();
  const isDark = useResolvedScheme() === 'dark';

  const content = (
    <>
      <Image
        testID="pro-membership-art"
        source={isPro ? PRO_MEMBERSHIP_ART : FREE_MEMBERSHIP_ART}
        style={styles.art}
        resizeMode="contain"
        accessible={false}
        fadeDuration={0}
      />
      <Body weight={700} color={isDark ? colors.ink : accent.accentInk} style={styles.title}>
        {isPro ? t('proMembershipActive') : t('proMembershipUpgrade')}
      </Body>
      {!isPro ? <Icon name="chevronRight" size={19} color={isDark ? colors.ink : accent.accentInk} /> : null}
    </>
  );

  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: isDark ? accent.accentSoft : accent.accentTint },
        isDark && {
          elevation: 3,
          shadowColor: accent.accent,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.24,
          shadowRadius: 12,
        },
      ]}
    >
      {isPro ? (
        <View
          testID="pro-membership-status"
          accessible
          accessibilityLabel={t('proMembershipActive')}
          style={styles.row}
        >
          {content}
        </View>
      ) : (
        <Pressable
          testID="pro-membership-primary"
          accessibilityRole="button"
          accessibilityLabel={t('proMembershipUpgrade')}
          onPress={onUpgrade}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          {content}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  art: { height: 48, width: 48 },
  title: { flex: 1 },
  pressed: { opacity: 0.78 },
});
