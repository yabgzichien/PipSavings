import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { ProBadge } from './ProUi';

export const TILE_SIZE = 78;

/**
 * One option in the customizer: artwork only, no caption.
 *
 * The label is deliberately absent from the screen and present in `accessibilityLabel` — sighted
 * users compare hats by looking at hats, and screen readers still announce "Straw hat". That only
 * works because each tab crops its thumbnails to the feature being chosen (see THUMB_FRAMES); on
 * an uncropped mascot the differences are too small to pick out at this size.
 */
export function MascotOptionTile({
  svg,
  selected,
  label,
  onPress,
  size = TILE_SIZE,
  requiresPro = false,
}: {
  svg: string;
  selected: boolean;
  label: string;
  onPress: () => void;
  size?: number;
  requiresPro?: boolean;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const radius = Math.round(size * (16 / 78));
  const padding = Math.round(size * (6 / 78));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={requiresPro ? `${label}, Requires Pip Pro` : label}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: selected ? theme.accentTint : colorTheme.surface,
          borderColor: selected ? theme.accent : colorTheme.line2,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={[styles.art, { padding }]} pointerEvents="none">
        <SvgXml xml={svg} width="100%" height="100%" />
      </View>
      {requiresPro ? (
        <View style={styles.proBadge} pointerEvents="none">
          <ProBadge locked />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  art: { width: '100%', height: '100%', padding: 6 },
  proBadge: { position: 'absolute', right: 4, top: 4, transform: [{ scale: 0.72 }] },
});
