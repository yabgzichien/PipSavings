// src/components/QuickAddField.tsx
// The natural-language entry field on the add hub. Owns only its own text and submit gesture;
// all parsing, routing, and error text come from the parent (AddFlow), which owns the flow.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from './Icon';
import { InfoButton } from './InfoButton';
import { Caption, Eyebrow, Label } from './ui';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import {
  extractLabelFromQuickAdd,
  getQuickAddRecommendations,
  loadStoredFrequencies,
  recordQuickAddSubmission,
} from '../lib/recommendations';
import { radius, spacing, uiFont } from '../theme';

export function QuickAddField({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (text: string) => void;
  /** True while the parent is parsing. Disables submit and swaps the hint for a status line. */
  busy: boolean;
  /** A message from the parent's last attempt, e.g. no amount found. Null when clear. */
  error: string | null;
}) {
  const { t, isZh } = useLanguage();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { transactions } = useAppData();
  const [text, setText] = useState('');
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadStoredFrequencies().then((res) => {
      setCustomCounts(res.quickAdd);
    });
  }, []);

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  const recommendations = useMemo(
    () => getQuickAddRecommendations(transactions, text, isZh, customCounts),
    [transactions, text, isZh, customCounts]
  );

  const submit = () => {
    if (!canSubmit) return;
    const label = extractLabelFromQuickAdd(trimmed);
    if (label) {
      void recordQuickAddSubmission(trimmed);
      setCustomCounts((prev) => ({
        ...prev,
        [label.toLowerCase()]: (prev[label.toLowerCase()] || 0) + 1,
      }));
    }
    onSubmit(trimmed);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.eyebrowRow}>
        <Eyebrow>{t('quickAddLabel')}</Eyebrow>
        <InfoButton entry="quick_add" />
      </View>
      <View style={[styles.row, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          editable={!busy}
          placeholder={t('quickAddPlaceholder')}
          placeholderTextColor={colorTheme.ink3}
          style={[styles.input, { color: colorTheme.ink }]}
        />
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          hitSlop={6}
          style={[
            styles.submit,
            { backgroundColor: canSubmit ? theme.accentInk : colorTheme.surface2 },
          ]}
        >
          <Icon name="check" size={17} color={canSubmit ? theme.onAccent : colorTheme.ink3} stroke={2.4} />
        </Pressable>
      </View>
      {recommendations.length > 0 && !busy && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={styles.chipRow}
          contentContainerStyle={styles.chipContent}
        >
          {recommendations.map((item, i) => (
            <Pressable
              key={`${item}-${i}`}
              onPress={() => {
                setText(`${item} `);
                inputRef.current?.focus();
              }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: colorTheme.surface,
                  borderColor: colorTheme.line,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={item}
            >
              <Label weight={500} color={colorTheme.ink}>{item}</Label>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {busy ? (
        <Caption color={colorTheme.ink2} style={styles.hint}>{t('quickAddThinking')}</Caption>
      ) : error ? (
        <Caption color={colorTheme.red} style={styles.hint}>{error}</Caption>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: uiFont(600), fontSize: 15, paddingVertical: 12 },
  submit: { width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipRow: { marginTop: spacing.sm },
  chipContent: { gap: spacing.xs, paddingHorizontal: 0, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { marginTop: 6, marginLeft: 2 },
});
