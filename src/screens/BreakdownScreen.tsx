import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { PieChart } from '../components/PieChart';
import { TripMonthSection } from '../components/TripMonthSection';
import { Amount, Card, CatBadge, Eyebrow, TopBar, ValueToggle, type ValueMode } from '../components/ui';
import { catColorsForHue } from '../lib/catColors';
import { resolveCategoryPresentation } from '../lib/categoryPresentation';
import { currentMonthKey, txnMonthKey } from '../lib/budget';
import { monthName } from '../lib/dates';
import { fmtMoney } from '../lib/format';
import { categoryComparisons, hasComparisonData } from '../lib/recap';
import type { Category, TxnType } from '../lib/types';
import { useAppData } from '../state/store';
import { useAccent, useSignedUp } from '../state/accent';
import { useResolvedScheme, useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useLanguage } from '../i18n';
import { shadowToggle, uiFont } from '../theme';
import { ReviewCheckInToast } from '../components/ReviewCheckInToast';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null };

export function BreakdownScreen({
  onBack,
  onOpenCategory,
  onOpenTrip,
}: {
  onBack: () => void;
  onOpenCategory: (categoryId: string) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const signedUp = useSignedUp();
  const colorTheme = useThemeColors();
  const scheme = useResolvedScheme();
  const { t, tCat, formatMonthLabel, isZh } = useLanguage();
  const { transactions, catById, markTaskDone } = useAppData();
  const dc = useDisplayCurrency();
  const [kind, setKind] = useState<TxnType>('expense');
  const [mode, setMode] = useState<ValueMode>('amount');

  const monthTxns = useMemo(() => {
    const cur = currentMonthKey();
    return transactions.filter((t) => t.type === kind && txnMonthKey(t) === cur);
  }, [transactions, kind]);
  const total = useMemo(() => monthTxns.reduce((s, t) => s + dc.convertTxn(t), 0), [monthTxns, dc]);

  const breakdown = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const t of monthTxns) {
      const id = t.categoryId ?? (kind === 'income' ? 'income' : 'other');
      byCat[id] = (byCat[id] ?? 0) + dc.convertTxn(t);
    }
    return Object.entries(byCat)
      .map(([catId, amt]) => ({ catId, amt }))
      .sort((a, b) => b.amt - a.amt);
  }, [monthTxns, kind, dc]);

  // Same resolution the badges beside each slice use, so a recoloured category is recoloured in
  // the chart too rather than only in its row.
  const pieData = breakdown.map((b) => ({
    value: b.amt,
    color: catColorsForHue(resolveCategoryPresentation(catById[b.catId] ?? fallback).hue, scheme === 'dark').solid,
  }));

  // You versus your own last month (docs/ui-engagement-plan.md Step 5, §2.6). Expense-only,
  // matching spentByCategory; only shown once real history exists on both sides.
  const cur = currentMonthKey();
  const showComparisons = kind === 'expense' && hasComparisonData(transactions, cur);
  const comparisonByCat = useMemo(() => {
    if (kind !== 'expense') return {};
    const out: Record<string, number> = {};
    for (const c of categoryComparisons(transactions, cur)) out[c.catId] = c.previous;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, kind]);

  const screenTitle = kind === 'expense'
    ? (isZh ? '支出去向' : 'Where it goes')
    : (isZh ? '收入来源' : 'Where it comes from');

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <ReviewCheckInToast />
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar
          title={screenTitle}
          onBack={onBack}
          right={<ValueToggle mode={mode} onChange={setMode} currency={dc.code} />}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        {/* kind toggle */}
        <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
          {(['expense', 'income'] as TxnType[]).map((k) => {
            const on = kind === k;
            return (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.toggleBtn, on && [styles.toggleBtnOn, { backgroundColor: colorTheme.surface }]]}>
                <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && { color: colorTheme.ink }]}>
                  {k === 'expense' ? (isZh ? '支出' : 'Spending') : (isZh ? '收入' : 'Income')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {breakdown.length === 0 ? (
          <Card style={{ padding: 26, alignItems: 'center' }}>
            <Text style={[styles.emptyTitle, { color: colorTheme.ink }]}>
              {isZh ? '本月暂无记录' : 'Nothing this month'}
            </Text>
            <Text style={[styles.emptySub, { color: colorTheme.ink2 }]}>
              {isZh ? `本月尚无${kind === 'expense' ? '支出' : '收入'}记录。` : `No ${kind === 'expense' ? 'spending' : 'income'} recorded for ${monthName()}.`}
            </Text>
          </Card>
        ) : (
          <>
            <View style={styles.pieWrap}>
              <PieChart data={pieData} size={210} thickness={34} />
              <View style={[styles.pieCenter, { pointerEvents: 'none' }]}>
                <Text style={[styles.pieEyebrow, { color: colorTheme.ink2 }]}>
                  {isZh ? `${new Date().getMonth() + 1}月` : monthName()}
                </Text>
                <Amount value={total} currency={dc.code} size={22} weight={700} color={kind === 'income' ? signedUp : colorTheme.ink} />
              </View>
            </View>

            {/* Trips sit above the categories, not inside them: a trip is a second, orthogonal
                grouping over the same rows, so a RM 30 Grab is still counted under Transport
                below. Expense-only — a trip has no income side. */}
            {kind === 'expense' && (
              <TripMonthSection
                monthKey={cur}
                monthExpenseTotal={total}
                onOpenTrip={onOpenTrip}
                heading={<Eyebrow style={{ marginTop: 18, marginBottom: 10 }}>{t('tripsThisMonth')}</Eyebrow>}
              />
            )}

            <Eyebrow style={{ marginTop: 18, marginBottom: 10 }}>
              {isZh ? '所有分类 · 点击查看' : 'All categories · tap to view'}
            </Eyebrow>
            <Card style={{ overflow: 'hidden' }}>
              {breakdown.map((b, i) => {
                const cat = catById[b.catId] ?? fallback;
                const pctNum = total > 0 ? Math.round((b.amt / total) * 100) : 0;
                const amountText = fmtMoney(b.amt, dc.code);
                const primary = mode === 'amount' ? amountText : `${pctNum}%`;
                const secondary = mode === 'amount' ? `${pctNum}%` : amountText;
                return (
                  <Pressable
                    key={b.catId}
                    onPress={() => {
                      void markTaskDone('breakdown');
                      onOpenCategory(b.catId);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }],
                      pressed && { backgroundColor: colorTheme.surface2 },
                    ]}
                  >
                    <CatBadge category={cat} size={38} />
                    <Text style={[styles.label, { color: colorTheme.ink }]} numberOfLines={1}>
                      {tCat(cat)}
                    </Text>
                    <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                      <Text style={[styles.primary, { color: colorTheme.ink }]}>{primary}</Text>
                      <Text style={[styles.secondary, { color: colorTheme.ink2 }]}>{secondary}</Text>
                      {showComparisons && b.catId in comparisonByCat && (
                        <Text style={[styles.compare, { color: colorTheme.ink3 }]}>
                          {isZh
                            ? `上月 ${fmtMoney(dc.convert(comparisonByCat[b.catId]), dc.code)}`
                            : `Last month ${fmtMoney(dc.convert(comparisonByCat[b.catId]), dc.code)}`}
                        </Text>
                      )}
                    </View>
                    <Icon name="chevronRight" size={15} color={colorTheme.ink3} />
                  </Pressable>
                );
              })}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toggle: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
  },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14 },
  toggleTextOn: {},
  pieWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  pieCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pieEyebrow: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 11 },
  divider: { borderTopWidth: 1 },
  label: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5 },
  primary: { fontFamily: uiFont(700), fontSize: 14.5 },
  secondary: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 1 },
  compare: { fontFamily: uiFont(500), fontSize: 10, marginTop: 1 },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17 },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, marginTop: 6, textAlign: 'center' },
});
