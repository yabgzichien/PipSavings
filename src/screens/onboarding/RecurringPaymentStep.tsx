// src/screens/onboarding/RecurringPaymentStep.tsx
// Step 3 of the setup wizard: one simplified recurring-payment form, deliberately missing
// the account-linking and investment-kind options CommitmentEditorModal offers  those
// assume accounts already exist, which a fresh install doesn't have yet.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AddCategoryModal } from '../../components/AddCategoryModal';
import { Icon } from '../../components/Icon';
import { FadeIn } from '../../components/Motion';
import { BtnLabel, CategoryChip, Eyebrow, PrimaryButton } from '../../components/ui';
import { DEFAULT_EXPENSE_ID } from '../../data/categories';
import { useLanguage } from '../../i18n';
import { currencyPrefix } from '../../lib/format';
import * as haptics from '../../lib/haptics';
import { useAccent } from '../../state/accent';
import { useThemeColors } from '../../state/colorScheme';
import { useDisplayCurrency } from '../../state/useDisplayCurrency';
import { useAppData } from '../../state/store';
import { numFont, radius, spacing, uiFont } from '../../theme';

export function RecurringPaymentStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const dc = useDisplayCurrency();
  const { t } = useLanguage();
  const { categories, addCommitmentEntry } = useAppData();
  const expenseCats = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);

  const [label, setLabel] = useState('');
  const [amountText, setAmountText] = useState('');
  const [dueDayText, setDueDayText] = useState('1');
  const [categoryId, setCategoryId] = useState(DEFAULT_EXPENSE_ID);
  const [addedCount, setAddedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

  const amount = Math.max(0, parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0);
  const dueDay = Math.min(31, Math.max(1, parseInt(dueDayText, 10) || 1));
  const canAdd = label.trim().length > 0 && amount > 0 && !busy;

  const add = async () => {
    if (!canAdd) return;
    haptics.commit();
    setBusy(true);
    try {
      await addCommitmentEntry({ label: label.trim(), kind: 'expense', amount, dueDay, categoryId, currency: dc.code });
      setAddedCount((n) => n + 1);
      setLabel('');
      setAmountText('');
      setDueDayText('1');
      setCategoryId(DEFAULT_EXPENSE_ID);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
      <Eyebrow style={{ marginBottom: spacing.sm }}>{t('wizardRecurringSubtitle')}</Eyebrow>

      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder={t('wizardRecurringPlaceholder')}
        placeholderTextColor={colorTheme.ink3}
        style={[styles.input, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2, color: colorTheme.ink }]}
      />

      <View style={styles.row2}>
        <View style={[styles.amountCard, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
          <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(dc.code)}</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colorTheme.ink3}
            style={[styles.amountInput, { color: colorTheme.ink }]}
          />
        </View>
        <View style={[styles.dueDayCard, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
          <Text style={[styles.dueDayLabel, { color: colorTheme.ink2 }]}>{t('wizardDueDay')}</Text>
          <TextInput
            value={dueDayText}
            onChangeText={setDueDayText}
            keyboardType="number-pad"
            style={[styles.dueDayInput, { color: colorTheme.ink }]}
            maxLength={2}
          />
        </View>
      </View>

      <Eyebrow style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>{t('category')}</Eyebrow>
      <View style={styles.grid}>
        {expenseCats.map((c) => (
          <View key={c.id} style={styles.gridCell}>
            <CategoryChip category={c} selected={categoryId === c.id} suggested={false} onPress={() => setCategoryId(c.id)} />
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => setAddingCategory(true)}
        style={[styles.addCatRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}
      >
        <Icon name="plus" size={16} color={theme.accent} stroke={2.2} />
        <Text style={[styles.addCatText, { color: theme.accent }]}>{t('wizardNewCategory')}</Text>
      </Pressable>

      {addedCount > 0 && (
        // Keyed on the count so every subsequent add replays the confirmation, rather than
        // silently changing a number on a banner that is already sitting there.
        <FadeIn
          key={addedCount}
          style={[styles.addedBanner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}
          offset={6}
        >
          <Icon name="check" size={15} color={theme.onTint} stroke={2.4} />
          <Text style={[styles.addedText, { color: theme.onTint }]}>
            {addedCount === 1
              ? t('wizardAddedConfirmOne')
              : t('wizardAddedConfirmMany', { count: addedCount })}
          </Text>
        </FadeIn>
      )}

      <View style={styles.footer}>
        <PrimaryButton onPress={() => void add()} disabled={!canAdd}>
          <BtnLabel>{addedCount > 0 ? t('wizardAddAnother') : t('wizardAddBtn')}</BtnLabel>
          <Icon name="plus" size={18} color="#fff" stroke={2.2} />
        </PrimaryButton>
        <Pressable
          onPress={() => {
            haptics.tap();
            addedCount > 0 ? onNext() : onSkip();
          }}
          style={({ pressed }) => [styles.skipBtn, pressed && styles.skipPressed]}
        >
          <Text style={[styles.skipText, { color: colorTheme.ink2 }]}>
            {addedCount > 0 ? t('wizardContinue') : t('wizardSkipForNow')}
          </Text>
        </Pressable>
      </View>

      <AddCategoryModal
        visible={addingCategory}
        kind="expense"
        onClose={() => setAddingCategory(false)}
        onCreated={(id) => {
          setCategoryId(id);
          setAddingCategory(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 14, fontFamily: uiFont(600), fontSize: 15 },
  row2: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  amountCard: { flex: 1.4, minWidth: 0, flexDirection: 'row', alignItems: 'center', padding: spacing.base, gap: 8, borderRadius: radius.md, borderWidth: 1 },
  rm: { fontFamily: numFont(600), fontSize: 18 },
  // minWidth: 0 overrides the browser's implicit min-width on <input> (RN Web renders TextInput
  // to one), which otherwise refuses to shrink below its intrinsic content width even with
  // flex: 1  the exact bug that let this field visually overlap dueDayInput next to it.
  amountInput: { flex: 1, minWidth: 0, fontFamily: numFont(700), fontSize: 22, padding: 0 },
  dueDayCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  dueDayLabel: { fontFamily: uiFont(600), fontSize: 11 },
  dueDayInput: { width: 40, fontFamily: numFont(700), fontSize: 22, textAlign: 'center', padding: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  addCatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed' },
  addCatText: { fontFamily: uiFont(600), fontSize: 13.5 },
  addedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, marginTop: spacing.sm },
  addedText: { fontFamily: uiFont(600), fontSize: 13 },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipPressed: { opacity: 0.55 },
  skipText: { fontFamily: uiFont(600), fontSize: 13.5 },
});
