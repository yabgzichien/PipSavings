import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { catColorsForHue } from '../lib/catColors';
import { useResolvedScheme } from '../state/colorScheme';
import { uiFont } from '../theme';

/** A friend's monogram on their own hue. Pair with `uniqueMonograms` so two "C"s never meet. */
export function FriendAvatar({ monogram, hue, size = 34 }: { monogram: string; hue: number; size?: number }) {
  const isDark = useResolvedScheme() === 'dark';
  const col = catColorsForHue(hue, isDark);
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: col.bg }]}>
      <Text style={[styles.text, { color: col.fg, fontSize: Math.round(size * 0.38) }]} numberOfLines={1}>
        {monogram}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: uiFont(700) },
});
