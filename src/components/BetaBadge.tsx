import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { spacing } from '../theme';
import { Caption } from './ui';

/** Compact “Beta” status pill — shared by home chat toggle and chat resting empty state. */
export function BetaBadge({ compact = false }: { compact?: boolean }) {
  const theme = useAccent();
  const { t } = useLanguage();
  const label = t('askPipBeta');

  return (
    <View
      accessible
      accessibilityLabel={label}
      pointerEvents="none"
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        { backgroundColor: theme.accentSoft },
      ]}
    >
      <Caption
        color={theme.onTint}
        weight={700}
        style={[styles.badgeText, compact && styles.badgeTextCompact]}
      >
        {label}
      </Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeCompact: {
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { letterSpacing: 0.6, textTransform: 'uppercase' },
  badgeTextCompact: { fontSize: 9, lineHeight: 11, letterSpacing: 0.4 },
});
