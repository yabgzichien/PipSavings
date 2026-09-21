import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditTransactionModal } from '../components/EditTransactionModal';
import { FadeIn } from '../components/Motion';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { Amount, Body, Card, Caption, CatBadge, IconButton, Label, Title, TopBar } from '../components/ui';
import * as haptics from '../lib/haptics';
import { txnMonthKey } from '../lib/budget';
import { catColorsForHue } from '../lib/catColors';
import { resolveCategoryPresentation } from '../lib/categoryPresentation';
import { monthLabel, shortDate } from '../lib/dates';
import { fmtMoney } from '../lib/format';
import { sheetOpenFromModalState, useReportSheetOpen } from '../lib/askPip/sheetOpen';
import type { Category, Transaction } from '../lib/types';
import { EXPENSE_ICONS, INCOME_ICONS, isCustomIcon } from './CategoriesScreen';
import { useAccent, useSignedUp } from '../state/accent';
import { useResolvedScheme, useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { platformShadow, spacing, type as typeScale } from '../theme';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null };

// Rail geometry — fixed per-chip widths so the "scroll the active one into view" math below
// (index * pitch) stays exact regardless of which chip is currently larger/bolder.
const CAT_CHIP_ACTIVE = 48;
const CAT_CHIP_INACTIVE = 36;
const CAT_SLOT = 64;
const CAT_PITCH = CAT_SLOT + spacing.sm;
const MONTH_SLOT = 88;
const MONTH_PITCH = MONTH_SLOT + spacing.sm;
/** How far back the month rail reaches. A fixed trailing window (not `availableMonths`,
 *  which only covers months with data) so a category with a recent gap is still browsable. */
const RAIL_WINDOW_MONTHS = 12;

function todayMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** monthKey +/- n months, e.g. shiftMonth('2026-01', -1) -> '2025-12'. */
function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** x-offset that centers item `index` (of fixed `pitch`/`slot` size) in a `windowWidth` viewport. */
function centerOffset(index: number, pitch: number, slot: number, windowWidth: number): number {
  const itemCenter = spacing.base + index * pitch + slot / 2;
  return Math.max(0, itemCenter - windowWidth / 2);
}

/**
 * Read-only drill-down for one budget category: every transaction logged against it
 * in a given month, plus the count. Reached by tapping a category row on the Home
 * budget card (tapping "Manage" instead still goes to the Budget screen). From here
 * you can rename/re-icon the category, step to another month, or jump to a sibling
 * category without leaving the screen.
 *
 * Category and month switching are two horizontally-scrolling rails (mirroring
 * RecapScreen's month strip) rather than arrow-stepper rows: the category rail rides
 * each category's own hue color, the month rail mirrors Recap's filled-pill treatment.
 */
export function CategoryDetailScreen({
  categoryId,
  onBack,
  embedded,
  onSheetOpenChange,
}: {
  categoryId: string;
  onBack: () => void;
  embedded?: boolean;
  onSheetOpenChange?: (open: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const theme = useAccent();
  const signedUp = useSignedUp();
  const colorTheme = useThemeColors();
  const scheme = useResolvedScheme();
  const isDark = scheme === 'dark';
  const { t, tCat, formatMonthLabel, formatShortDate, isZh } = useLanguage();
  const { transactions, categories, catById, updateCategoryIcon, updateCategoryLabel } = useAppData();
  const dc = useDisplayCurrency();
  const [editing, setEditing] = useState<Transaction | null>(null);
  useReportSheetOpen(sheetOpenFromModalState(null, editing), onSheetOpenChange);
  const [activeId, setActiveId] = useState(categoryId);
  const [monthKey, setMonthKey] = useState(todayMonthKey());

  const [editingMeta, setEditingMeta] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftIcon, setDraftIcon] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const cat = catById[activeId] ?? fallback;
  const iconChoices = cat.kind === 'income' ? INCOME_ICONS : EXPENSE_ICONS;
  const cur = todayMonthKey();

  // Siblings of the same kind, in the app's category order, so the rail steps through
  // a sensible list rather than mixing expense and income categories.
  const siblings = useMemo(() => categories.filter((c) => c.kind === cat.kind), [categories, cat.kind]);
  const siblingIndex = siblings.findIndex((c) => c.id === activeId);

  const monthWindow = useMemo(() => {
    const out: string[] = [];
    for (let i = RAIL_WINDOW_MONTHS - 1; i >= 0; i--) out.push(shiftMonth(cur, -i));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);
  const monthIndex = monthWindow.indexOf(monthKey);

  const catStripRef = useRef<ScrollView>(null);
  const monthStripRef = useRef<ScrollView>(null);

  // Keep the active chip in view whenever the selection changes (including on mount, so a
  // category deep in the list — or a month several taps back — doesn't open off-screen).
  useEffect(() => {
    if (siblingIndex < 0) return;
    catStripRef.current?.scrollTo({ x: centerOffset(siblingIndex, CAT_PITCH, CAT_SLOT, winWidth), animated: true });
  }, [siblingIndex, winWidth]);
  useEffect(() => {
    if (monthIndex < 0) return;
    monthStripRef.current?.scrollTo({ x: centerOffset(monthIndex, MONTH_PITCH, MONTH_SLOT, winWidth), animated: true });
  }, [monthIndex, winWidth]);

  const selectCategory = (id: string) => {
    if (id === activeId) return;
    haptics.tap();
    setEditingMeta(false);
    setActiveId(id);
  };
  const selectMonth = (mk: string) => {
    if (mk === monthKey) return;
    haptics.tap();
    setMonthKey(mk);
  };

  const items = useMemo(() => {
    return transactions
      .filter((t) => (t.categoryId ?? 'other') === activeId && txnMonthKey(t) === monthKey)
      .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt));
  }, [transactions, activeId, monthKey]);
  const total = useMemo(() => items.reduce((s, t) => s + dc.convertTxn(t), 0), [items, dc]);

  // "vs last month" — the same shape as `items`/`total`, shifted one month back, so it works
  // for income categories too (lib/recap.ts's comparisons are expense-only by design).
  const prevMonthKey = useMemo(() => shiftMonth(monthKey, -1), [monthKey]);
  const prevItems = useMemo(
    () => transactions.filter((t) => (t.categoryId ?? 'other') === activeId && txnMonthKey(t) === prevMonthKey),
    [transactions, activeId, prevMonthKey]
  );
  const prevTotal = useMemo(() => prevItems.reduce((s, t) => s + dc.convertTxn(t), 0), [prevItems, dc]);
  const showCompare = prevItems.length > 0;

  const openEditMeta = () => {
    setDraftName(tCat(cat));
    // The icon the user can currently see, not the stored column behind it — otherwise the
    // editor opens on a stale icon and saving writes that stale icon back as an override.
    setDraftIcon(resolveCategoryPresentation(cat, isZh ? 'zh' : 'en').icon);
    setEditingMeta(true);
  };

  const pickCustomIcon = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.5 });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setDraftIcon(a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
    }
  };

  const saveMeta = async () => {
    if (savingMeta) return;
    const trimmed = draftName.trim();
    const shown = resolveCategoryPresentation(cat, isZh ? 'zh' : 'en');
    setSavingMeta(true);
    try {
      if (trimmed && trimmed !== shown.label) await updateCategoryLabel(activeId, trimmed);
      if (draftIcon && draftIcon !== shown.icon) await updateCategoryIcon(activeId, draftIcon);
      setEditingMeta(false);
    } finally {
      setSavingMeta(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar
            title={tCat(cat)}
            onBack={onBack}
            right={<IconButton name="pencil" onPress={openEditMeta} size={17} accessibilityLabel="Edit category" />}
          />
        </View>
      )}

      {/* Category rail: every sibling category, tinted in its own hue, active one enlarged
          with a glowing ring in that same color. */}
      <ScrollView
        ref={catStripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.railScroll}
        contentContainerStyle={styles.catStrip}
      >
        {siblings.map((c) => {
          const on = c.id === activeId;
          const col = catColorsForHue(resolveCategoryPresentation(c).hue, isDark);
          return (
            <Pressable
              key={c.id}
              onPress={() => selectCategory(c.id)}
              style={styles.catSlot}
              accessibilityRole="button"
              accessibilityLabel={tCat(c)}
              accessibilityState={{ selected: on }}
            >
              <View
                style={[
                  styles.catRing,
                  { borderRadius: on ? 18 : 15 },
                  on
                    ? { borderColor: col.solid, ...platformShadow(col.solid, 0.3, 10, { width: 0, height: 3 }, 0) }
                    : { borderColor: 'transparent', opacity: 0.55 },
                ]}
              >
                <CatBadge category={c} size={on ? CAT_CHIP_ACTIVE : CAT_CHIP_INACTIVE} rad={on ? 14 : 11} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Caption color={colorTheme.ink2} style={styles.railCaption}>
        {isZh
          ? `${cat.kind === 'income' ? '收入' : '支出'}分类 ${siblingIndex + 1} / ${siblings.length}`
          : `${siblingIndex + 1} of ${siblings.length} ${cat.kind} categories`}
      </Caption>

      {/* Month rail: same filled-pill treatment as RecapScreen's month strip. */}
      <ScrollView
        ref={monthStripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.railScroll}
        contentContainerStyle={styles.monthStrip}
      >
        {monthWindow.map((mk) => {
          const on = mk === monthKey;
          return (
            <Pressable
              key={mk}
              onPress={() => selectMonth(mk)}
              style={[
                styles.monthChip,
                { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
                on && {
                  backgroundColor: theme.accentInk,
                  borderColor: theme.accentInk,
                  ...platformShadow(theme.accent, 0.28, 10, { width: 0, height: 3 }, 0),
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={formatMonthLabel(mk, false)}
              accessibilityState={{ selected: on }}
            >
              <Label weight={on ? 700 : 500} color={on ? theme.onAccent : colorTheme.ink2}>
                {formatMonthLabel(mk, false)}
              </Label>
            </Pressable>
          );
        })}
      </ScrollView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {editingMeta && (
          <FadeIn>
            <Card style={styles.editPanel}>
              <View style={styles.previewRow}>
                {isCustomIcon(draftIcon) ? (
                  <Image source={{ uri: draftIcon }} style={styles.previewImg} resizeMode="cover" />
                ) : (
                  <CatBadge category={{ ...cat, icon: draftIcon, label: draftName }} size={44} />
                )}
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder={isZh ? '分类名称' : 'Category name'}
                  placeholderTextColor={colorTheme.ink3}
                  style={[styles.input, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink, fontSize: typeScale.body }]}
                  maxLength={22}
                />
              </View>

              <View style={styles.choiceWrap}>
                {iconChoices.map((ic) => {
                  const on = ic === draftIcon;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => setDraftIcon(ic)}
                      style={[styles.iconChoice, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, on && { borderColor: theme.accent, backgroundColor: theme.accentTint }]}
                    >
                      <Icon name={ic} size={20} color={on ? theme.accent : colorTheme.ink2} stroke={1.9} />
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={pickCustomIcon}
                  style={[
                    styles.iconChoice,
                    { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
                    isCustomIcon(draftIcon) && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                    styles.galleryChoice,
                  ]}
                >
                  {isCustomIcon(draftIcon) ? (
                    <Image source={{ uri: draftIcon }} style={styles.galleryPreview} resizeMode="cover" />
                  ) : (
                    <Icon name="image" size={17} color={theme.accent} stroke={2.0} />
                  )}
                  <Caption weight={700} color={theme.accent}>{isZh ? '相册' : 'Gallery'}</Caption>
                </Pressable>
              </View>

              <View style={styles.editActions}>
                <Pressable onPress={() => setEditingMeta(false)} style={styles.editActionBtn} disabled={savingMeta}>
                  <Label weight={700} color={colorTheme.ink2}>{t('cancel')}</Label>
                </Pressable>
                <Pressable onPress={saveMeta} style={styles.editActionBtn} disabled={savingMeta || !draftName.trim()}>
                  <Label weight={700} color={theme.accent}>{savingMeta ? (isZh ? '保存中…' : 'Saving…') : t('save')}</Label>
                </Pressable>
              </View>
            </Card>
          </FadeIn>
        )}

        <FadeIn key={`${activeId}-${monthKey}`}>
          <Card style={styles.hero}>
            <View style={styles.heroTop}>
              <CatBadge category={cat} size={48} />
              <View style={{ flex: 1 }}>
                <Amount value={total} currency={dc.code} size={typeScale.display} weight={700} />
                <Caption color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>
                  {isZh
                    ? `${formatMonthLabel(monthKey, true)} 共 ${items.length} 笔交易`
                    : `${items.length} transaction${items.length === 1 ? '' : 's'} in ${monthLabel(monthKey)}`}
                </Caption>
                {showCompare && (
                  <Caption color={colorTheme.ink3} style={{ marginTop: spacing.xs }}>
                    {isZh ? `上月 · ${fmtMoney(prevTotal, dc.code)}` : `Last month · ${fmtMoney(prevTotal, dc.code)}`}
                  </Caption>
                )}
              </View>
            </View>
          </Card>

          {items.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Pip size={72} expr="curious" float />
              <Title style={{ marginTop: spacing.md }}>{isZh ? '暂无交易记录' : 'Nothing here yet'}</Title>
              <Body color={colorTheme.ink2} style={{ textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 }}>
                {isZh
                  ? `${formatMonthLabel(monthKey, true)} 暂无 ${tCat(cat)} 相关的收支明细。`
                  : `No ${cat.label} transactions logged in ${monthLabel(monthKey)}.`}
              </Body>
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {items.map((t, i) => {
                const income = t.type === 'income';
                const transfer = t.type === 'transfer';
                const description = t.remark?.trim() || (t.merchantRaw && t.merchantRaw !== cat.label ? t.merchantRaw : '');
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setEditing(t)}
                    style={({ pressed }) => [styles.row, i > 0 && styles.divider, i > 0 && { borderTopColor: colorTheme.line2 }, pressed && { backgroundColor: colorTheme.surface2 }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body weight={700} numberOfLines={1}>
                        {transfer ? (isZh ? '转账' : 'Transfer') : description || tCat(cat)}
                      </Body>
                      <Caption color={colorTheme.ink2} style={{ marginTop: spacing.xs }} numberOfLines={1}>
                        {formatShortDate(t.date ?? t.createdAt)}
                      </Caption>
                    </View>
                    <Amount value={t.nativeAmount ?? t.amount} currency={t.currency} size={15} weight={600} color={income ? signedUp : transfer ? colorTheme.ink2 : colorTheme.ink} />
                    <Icon name="pencil" size={15} color={colorTheme.ink3} />
                  </Pressable>
                );
              })}
            </Card>
          )}
        </FadeIn>
      </ScrollView>
      </KeyboardAvoidingView>

      <EditTransactionModal txn={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  railScroll: { flexGrow: 0, flexShrink: 0 },

  catStrip: { paddingHorizontal: spacing.base, paddingTop: spacing.xs, paddingBottom: spacing.xs, gap: spacing.sm, alignItems: 'center' },
  catSlot: { width: CAT_SLOT, alignItems: 'center', justifyContent: 'center' },
  catRing: { padding: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  railCaption: { textAlign: 'center', marginBottom: spacing.sm },

  monthStrip: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  monthChip: { width: MONTH_SLOT, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  hero: { flexDirection: 'row', padding: spacing.base, marginBottom: spacing.md },
  heroTop: { flexDirection: 'row', gap: spacing.md, flex: 1 },

  listCard: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  divider: { borderTopWidth: 1 },

  emptyCard: { padding: spacing.lg, alignItems: 'center' },

  editPanel: { padding: spacing.base, gap: spacing.md, marginBottom: spacing.md },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewImg: { width: 44, height: 44, borderRadius: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  iconChoice: { width: 42, height: 42, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  galleryChoice: { minWidth: 68, flexDirection: 'row', gap: 4, paddingHorizontal: spacing.sm },
  galleryPreview: { width: 22, height: 22, borderRadius: 4 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.base },
  editActionBtn: { paddingVertical: 4, paddingHorizontal: 4 },
});
