import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isValidIsoDate } from '../lib/dates';
import type { Category } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';
import { CategoryChip } from './ui';

/** Month + category + date-range filters for the all-transactions list. Search lives inline
 *  on the screen itself, so this sheet only covers the filters that need more than a keystroke. */
export function TransactionFilterModal({
  visible,
  onClose,
  months,
  categories,
  selectedMonths,
  selectedCategories,
  dateFrom,
  dateTo,
  onToggleMonth,
  onToggleCategory,
  onChangeDateFrom,
  onChangeDateTo,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  months: string[];
  categories: Category[];
  selectedMonths: Set<string>;
  selectedCategories: Set<string>;
  dateFrom: string;
  dateTo: string;
  onToggleMonth: (monthKey: string) => void;
  onToggleCategory: (categoryId: string) => void;
  onChangeDateFrom: (value: string) => void;
  onChangeDateTo: (value: string) => void;
  onClear: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { formatMonthLabel, isZh } = useLanguage();

  const fromInvalid = dateFrom.length > 0 && !isValidIsoDate(dateFrom);
  const toInvalid = dateTo.length > 0 && !isValidIsoDate(dateTo);
  const activeCount = selectedMonths.size + selectedCategories.size + (isValidIsoDate(dateFrom) ? 1 : 0) + (isValidIsoDate(dateTo) ? 1 : 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.sheetAvoider}
        pointerEvents="box-none"
      >
        <View style={[styles.sheetCard, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <View style={styles.head}>
          <Text style={[styles.title, { color: colorTheme.ink }]}>{isZh ? '筛选交易明细' : 'Filter transactions'}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Icon name="x" size={20} color={colorTheme.ink2} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
          {months.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colorTheme.ink2 }]}>{isZh ? '月份' : 'Month'}</Text>
              <View style={styles.chipRow}>
                {months.map((m) => {
                  const on = selectedMonths.has(m);
                  return (
                    <Pressable
                      key={m}
                      onPress={() => onToggleMonth(m)}
                      style={[
                        styles.monthChip,
                        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
                        on && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                      ]}
                    >
                      <Text style={[styles.monthChipText, { color: on ? theme.onTint : colorTheme.ink }]}>
                        {formatMonthLabel(m, false)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Text style={[styles.sectionLabel, { color: colorTheme.ink2 }]}>{isZh ? '分类' : 'Category'}</Text>
          <View style={styles.grid}>
            {categories.map((c) => (
              <View key={c.id} style={styles.gridCell}>
                <CategoryChip category={c} selected={selectedCategories.has(c.id)} suggested={false} onPress={() => onToggleCategory(c.id)} />
              </View>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colorTheme.ink2 }]}>{isZh ? '日期范围' : 'Date range'}</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <TextInput
                value={dateFrom}
                onChangeText={onChangeDateFrom}
                placeholder={isZh ? '起始 · YYYY-MM-DD' : 'From · YYYY-MM-DD'}
                placeholderTextColor={colorTheme.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.dateInput,
                  { color: colorTheme.ink, backgroundColor: colorTheme.surface2, borderColor: fromInvalid ? '#b3261e' : colorTheme.line },
                ]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                value={dateTo}
                onChangeText={onChangeDateTo}
                placeholder={isZh ? '截止 · YYYY-MM-DD' : 'To · YYYY-MM-DD'}
                placeholderTextColor={colorTheme.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.dateInput,
                  { color: colorTheme.ink, backgroundColor: colorTheme.surface2, borderColor: toInvalid ? '#b3261e' : colorTheme.line },
                ]}
              />
            </View>
          </View>
          {(fromInvalid || toInvalid) && <Text style={styles.dateHint}>{isZh ? '请输入正确的 YYYY-MM-DD 格式。' : 'Use the YYYY-MM-DD format.'}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={onClear} hitSlop={8} disabled={activeCount === 0} style={{ opacity: activeCount === 0 ? 0.4 : 1 }}>
            <Text style={[styles.clearText, { color: colorTheme.ink2 }]}>{isZh ? '清空筛选' : 'Clear all'}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={[styles.doneBtn, { backgroundColor: theme.accentInk }]}>
            <Text style={[styles.doneText, { color: theme.onAccent }]}>{isZh ? '显示结果' : 'Show results'}</Text>
          </Pressable>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheetAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10, maxHeight: '90%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { flex: 1, fontFamily: uiFont(700), fontSize: 18 },
  sectionLabel: { fontFamily: uiFont(700), fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  monthChipText: { fontFamily: uiFont(600), fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateInput: { fontFamily: uiFont(600), fontSize: 13.5, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 12 },
  dateHint: { fontFamily: uiFont(500), fontSize: 11.5, color: '#b3261e', marginTop: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, gap: 14 },
  clearText: { fontFamily: uiFont(600), fontSize: 13.5 },
  doneBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: radius.sm },
  doneText: { fontFamily: uiFont(700), fontSize: 14.5 },
});
