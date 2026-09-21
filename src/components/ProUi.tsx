import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, spacing } from '../theme';
import { Pip } from './Pip';
import { Caption } from './ui';

export function ProBadge({ locked = false }: { locked?: boolean }) {
  const theme = useAccent();
  const accessibilityLabel = locked ? 'Requires Pip Pro' : 'Pip Pro active';

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.badge, { backgroundColor: theme.accentSoft }]}
    >
      <Caption color={theme.onTint} style={styles.badgeText}>PRO</Caption>
    </View>
  );
}

export function ProSurface({
  children,
  style,
  innerStyle,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useAccent();
  const colors = useThemeColors();

  return (
    <View testID={testID} style={[styles.surfaceFrame, style]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Defs>
          <LinearGradient id="pipProEdge" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.accentInk} />
            <Stop offset="0.42" stopColor={theme.accent} />
            <Stop offset="0.72" stopColor={theme.accent} />
            <Stop offset="1" stopColor={theme.accentInk} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx={radius.md} fill="url(#pipProEdge)" />
      </Svg>
      <View style={[styles.surfaceInner, { backgroundColor: colors.surface }, innerStyle]}>
        {children}
      </View>
    </View>
  );
}

export function MascotTierMarker({ isPro, label }: { isPro: boolean; label: string }) {
  const theme = useAccent();
  const colors = useThemeColors();

  return (
    <View
      testID="mascot-tier-marker"
      pointerEvents="none"
      accessible={false}
      style={[
        styles.tierMarker,
        isPro
          ? { backgroundColor: `${theme.accent}26`, borderColor: `${theme.accent}66` }
          : { backgroundColor: `${colors.surface}D9`, borderColor: colors.line },
      ]}
    >
      <Caption weight={700} color={isPro ? theme.onTint : colors.ink2} style={styles.tierMarkerText}>
        {label}
      </Caption>
    </View>
  );
}

export function ProSummaryHeader() {
  const theme = useAccent();
  return (
    <View style={styles.summaryHeader}>
      <ProBadge />
      <View
        testID="pro-summary-mascot"
        style={[styles.summaryMascot, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}
      >
        <Pip size={42} expr="proud" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { letterSpacing: 0.8 },
  tierMarker: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
  },
  tierMarkerText: { letterSpacing: 0.4 },
  surfaceFrame: {
    borderRadius: radius.md,
    padding: 2,
  },
  surfaceInner: {
    borderRadius: radius.md - 2,
    overflow: 'hidden',
  },
  summaryHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryMascot: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 40, justifyContent: 'center', overflow: 'hidden', width: 40 },
});
