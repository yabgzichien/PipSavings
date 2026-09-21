// src/components/PipUpsellCard.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Translations } from '../i18n/types';
import { useThemeColors } from '../state/colorScheme';
import { useAccent } from '../state/accent';
import { Icon } from './Icon';

export function upsellLines(t: Translations | ((key: string) => string)): string[] {
  if (typeof t === 'function') {
    return [t('upsellLine1'), t('upsellLine2'), t('upsellLine3')];
  }
  return [t.upsellLine1, t.upsellLine2, t.upsellLine3];
}

export function PipUpsellCard({
  line,
  onPress,
  onDismiss,
  t,
}: {
  line: string;
  onPress: () => void;
  onDismiss: () => void;
  t: Translations | ((key: string) => string);
}) {
  const colorTheme = useThemeColors();
  const theme = useAccent();
  const closeLabel = typeof t === 'function' ? t('close') : t.close;

  return (
    <View style={[styles.card, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
      <Pressable onPress={onPress} style={styles.body} accessibilityRole="button">
        <View style={styles.contentRow}>
          <View style={[styles.iconWrap, { backgroundColor: theme.accentTint }]}>
            <Icon name="sparkles" size={15} color={theme.accent} />
          </View>
          <Text style={[styles.line, { color: colorTheme.ink }]}>{line}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onDismiss} style={styles.dismiss} accessibilityRole="button" accessibilityLabel={closeLabel}>
        <Icon name="x" size={14} color={colorTheme.ink3} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  body: { flex: 1 },
  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, fontSize: 13, lineHeight: 18 },
  dismiss: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
