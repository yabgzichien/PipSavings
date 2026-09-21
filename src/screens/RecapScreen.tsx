import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { Pip } from '../components/Pip';
import { TripMonthSection } from '../components/TripMonthSection';
import { RecapTransactionsSheet } from '../components/recap/RecapTransactionsSheet';
import { Body, CatBadge, Display, Label, Title } from '../components/ui';
import { RecapStoryModal } from '../components/recap/RecapStoryModal';
import { buildRecapStoryModel } from '../lib/recapStory';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../widget/mascot/config';
import { currentMonthKey, txnMonthKey } from '../lib/budget';
import { fmtMoney, formatCurrencyBreakdown } from '../lib/format';
import { nativeTransactionTotalsByCurrency } from '../lib/bookkeeping';
import { availableMonths, completedRecapComparisons, monthlyRecapSummary, prevMonthKey } from '../lib/recap';
import { netWorthSeries } from '../lib/networth';
import * as haptics from '../lib/haptics';
import type { Category } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useAppData } from '../state/store';
import { useNow } from '../state/useNow';
import { useReducedMotion } from '../state/useReducedMotion';
import { useLanguage } from '../i18n';
import { radius, spacing } from '../theme';
import { ReviewCheckInToast } from '../components/ReviewCheckInToast';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null };

export function RecapScreen({ onBack, onOpenCalendar, onOpenExport, onOpenTrip, onAdd, initialMonth, onMonthChange, initialStoryOpen, onInitialStoryHandled, embedded }: {
  onBack: () => void;
  onOpenCalendar?: (month: string) => void;
  onOpenExport?: (month: string) => void;
  onOpenTrip: (tripId: string) => void;
  onAdd?: () => void;
  initialMonth?: string;
  onMonthChange?: (month: string) => void;
  initialStoryOpen?: boolean;
  onInitialStoryHandled?: () => void;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const colors = useThemeColors();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.25;
  const { t, tCat, formatMonthLabel, isZh } = useLanguage();
  const { transactions, catById, snapshots, accounts, balanceEntries, memory, markTaskDone, widgetMascotConfig = DEFAULT_WIDGET_MASCOT_CONFIG } = useAppData();
  const now = useNow();
  const todayMonth = currentMonthKey(now);
  const reduced = useReducedMotion();
  const dc = useDisplayCurrency();
  const scroll = useRef<ScrollView>(null);
  const [selected, setSelected] = useState(initialMonth ?? todayMonth);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allCategories, setAllCategories] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // undefined = closed; null = all expenses; string = one spending category.
  const [transactionCategory, setTransactionCategory] = useState<string | null | undefined>(undefined);
  const months = useMemo(() => availableMonths(transactions, Object.keys(snapshots), now), [transactions, snapshots, todayMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  const month = months.includes(selected) ? selected : todayMonth;
  const storyModel = useMemo(() => buildRecapStoryModel({ transactions, month, now }), [transactions, month, now]);
  const [storyOpen, setStoryOpen] = useState(false);
  const handledInitialStoryRef = useRef(false);

  useEffect(() => {
    if (!initialStoryOpen) {
      handledInitialStoryRef.current = false;
      return;
    }
    if (!handledInitialStoryRef.current) {
      handledInitialStoryRef.current = true;
      if (storyModel) {
        setStoryOpen(true);
      }
      onInitialStoryHandled?.();
    }
  }, [initialStoryOpen, storyModel, onInitialStoryHandled]);
  const current = month === todayMonth;
  const future = month > todayMonth;
  const summary = useMemo(() => monthlyRecapSummary(transactions, month, dc.convertTxn), [transactions, month, dc.code, dc.rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const comparisons = useMemo(() => completedRecapComparisons(transactions, month, now, dc.convertTxn).slice(0, 2), [transactions, month, todayMonth, dc.code, dc.rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const recordCount = summary.incomeCount + summary.expenseCount;
  const empty = recordCount === 0;
  const allocations = snapshots[month]?.allocations ?? {};
  const budgetIds = Object.keys(allocations);
  const merchantsKnown = Object.keys(memory).length;
  const categoryFor = (id: string): Category => catById[id] ?? { ...fallback, id, label: isZh ? '未分类' : 'Uncategorized' };
  const categoryLabel = (id: string) => catById[id] ? tCat(catById[id]) : (isZh ? '未分类' : 'Uncategorized');
  const money = (amount: number) => fmtMoney(amount, dc.code);
  const signed = (amount: number) => `${amount < 0 ? '− ' : amount > 0 ? '+ ' : ''}${money(Math.abs(amount))}`;
  const incomeOnly = summary.expenseCount === 0 && summary.incomeCount > 0;
  const heroAmount = money(incomeOnly ? summary.income : summary.expenses);
  const nativeExpenses = useMemo(() => nativeTransactionTotalsByCurrency(transactions.filter((txn) => txnMonthKey(txn) === month && txn.type === 'expense')), [transactions, month]);
  const today = `${todayMonth}-${String(now.getDate()).padStart(2, '0')}`;
  const networth = useMemo(() => {
    const eligibleAccounts = accounts.filter((account) => !account.archived);
    const entries = balanceEntries.filter((entry) => entry.asOf <= (current ? today : `${month}-31`));
    if (future || !entries.some((entry) => eligibleAccounts.some((account) => account.id === entry.accountId))) return null;
    const [previous, selectedPoint] = netWorthSeries(eligibleAccounts, entries, [prevMonthKey(month), month], dc.rates);
    const hasPrevious = entries.some((entry) => entry.asOf < `${month}-01` && eligibleAccounts.some((account) => account.id === entry.accountId));
    return { net: dc.convert(selectedPoint.net), delta: hasPrevious ? dc.convert(selectedPoint.net - previous.net) : null };
  }, [accounts, balanceEntries, month, today, dc.code, dc.rates]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void markTaskDone('recap'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onMonthChange?.(month); }, [month, onMonthChange]);

  const chooseMonth = (next: string) => {
    haptics.tap();
    setSelected(next);
    setStoryOpen(false);
    setPickerOpen(false);
    setAllCategories(false);
    setDetailsOpen(false);
    setTransactionCategory(undefined);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const openTransactions = (catId: string | null) => { haptics.tap(); setTransactionCategory(catId); };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ReviewCheckInToast />
      {!embedded && (
        <View style={[styles.nav, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={isZh ? '返回' : 'Back'} style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.surface }]}>
            <Icon name="chevronLeft" size={24} color={colors.ink} />
          </Pressable>
          <Body weight={700} style={styles.navTitle}>{t('monthlyRecap')}</Body>
          <View style={styles.iconButton} />
        </View>
      )}
      <ScrollView ref={scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => { haptics.tap(); setPickerOpen(true); }} accessibilityRole="button" accessibilityLabel={isZh ? '选择月份' : 'Select month'} style={({ pressed }) => [styles.monthPicker, { opacity: pressed ? 0.7 : 1 }]}>
            <Body weight={700}>{formatMonthLabel(month, true)}</Body>
            <Icon name="chevronDown" size={14} color={colors.ink2} />
          </Pressable>
          {current && <Label weight={500} color={colors.ink2}>{isZh ? '截至目前' : 'So far'}</Label>}

        </View>

        <View style={[styles.hero, { backgroundColor: accent.accentTint }]}>
          <View style={styles.intro}>
            <View style={styles.grow}>
              {empty ? <Title color={accent.onTint}>{isZh ? '还没有记录' : 'No entries yet'}</Title> :
                <Label weight={500} color={accent.onTint}>{incomeOnly ? (isZh ? '已记录收入' : 'Recorded income') : (isZh ? '已记录支出' : 'Recorded spending')}</Label>
              }
            </View>
            <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Pip size={36} expr={empty ? 'curious' : 'happy'} />
            </View>
          </View>
          {!empty && (heroAmount.length > (compact ? 11 : 16)
            ? <Title numeric>{heroAmount}</Title>
            : <Display numeric>{heroAmount}</Display>)}
          {empty ? (
            onAdd && <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={isZh ? '添加交易' : 'Add a transaction'} style={({ pressed }) => [styles.addButton, { backgroundColor: accent.accentInk, opacity: pressed ? 0.8 : 1 }]}>
              <Icon name="plus" size={20} color="#fff" />
              <Body weight={700} color="#fff">{isZh ? '添加交易' : 'Add a transaction'}</Body>
            </Pressable>
          ) : incomeOnly || summary.incomeCount === 0 ? (
            <Label weight={500} color={colors.ink2} style={styles.recordNote}>{incomeOnly ? (isZh ? '尚未记录支出' : 'No expenses recorded') : (isZh ? '尚未记录收入' : 'No income recorded')}</Label>
          ) : (
            <View style={[styles.moneyRow, { borderTopColor: accent.accentSoft }, compact && styles.stack]}>
              <View style={styles.grow}>
                <Label weight={500} color={colors.ink2}>{isZh ? '收入' : 'Income'}</Label>
                <Body numeric weight={700}>{money(summary.income)}</Body>
              </View>
              <View style={styles.grow}>
                <Label weight={500} color={colors.ink2}>{isZh ? '净现金流' : 'Net cash flow'}</Label>
                <Body numeric weight={700}>{signed(summary.net)}</Body>
              </View>
            </View>
          )}
        </View>

        {/* Trips this month (placed above Where it went) */}
        <TripMonthSection monthKey={month} monthExpenseTotal={summary.expenses} onOpenTrip={onOpenTrip} cardStyle={styles.tripCard} heading={<View style={styles.tripHeading}><Title>{isZh ? '这个月的旅程' : 'Trips this month'}</Title></View>} />

        {/* Where it went */}
        {summary.expenseCount > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Title>{isZh ? '钱花在哪里' : 'Where it went'}</Title>
              <Pressable onPress={() => openTransactions(null)} accessibilityRole="button" accessibilityLabel={isZh ? '查看全部支出' : 'View all expenses'} style={styles.inlineAction}>
                <Label color={accent.onTint}>{isZh ? '查看全部' : 'View all'}</Label>
                <Icon name="arrowRight" size={16} color={accent.onTint} />
              </Pressable>
            </View>
            <View style={[styles.surface, { backgroundColor: colors.surface }]}>
              {(allCategories ? summary.categories : summary.categories.slice(0, 4)).map((row, i) => {
                const pct = summary.expenses > 0 ? Math.round(row.amount / summary.expenses * 100) : 0;
                return (
                  <Pressable key={row.catId} onPress={() => openTransactions(row.catId)} accessibilityRole="button" accessibilityLabel={isZh ? `查看${categoryLabel(row.catId)}交易` : `View ${categoryLabel(row.catId)} transactions`} style={({ pressed }) => [styles.categoryRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && { backgroundColor: colors.surface2 }]}>
                    <View style={styles.categoryTop}>
                      <CatBadge category={categoryFor(row.catId)} size={36} rad={12} />
                      <View style={styles.grow}>
                        <Body weight={700}>{categoryLabel(row.catId)}</Body>
                      </View>
                      <Body numeric weight={700} style={styles.categoryAmount}>{money(row.amount)}</Body>
                      <Icon name="chevronRight" size={16} color={colors.ink2} />
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: colors.surface2 }]} accessible={false}>
                      <View style={[styles.barFill, { backgroundColor: accent.accent, width: `${Math.max(0, Math.min(100, pct))}%` }]} />
                    </View>
                  </Pressable>
                );
              })}
              {summary.categories.length > 4 && (
                <Pressable onPress={() => setAllCategories(!allCategories)} accessibilityRole="button" accessibilityState={{ expanded: allCategories }} style={[styles.textButton, { borderTopWidth: 1, borderTopColor: colors.line }]}>
                  <Label color={accent.onTint}>{allCategories ? (isZh ? '收起分类' : 'Show fewer categories') : (isZh ? `查看全部 ${summary.categories.length} 个分类` : `View all ${summary.categories.length} categories`)}</Label>
                  <Icon name={allCategories ? 'chevronUp' : 'chevronDown'} size={16} color={accent.onTint} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* What changed */}
        {comparisons.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Title>{isZh ? '这个月的变化' : 'What changed'}</Title>
              <Label weight={500} color={colors.ink2}>{isZh ? `对比 ${formatMonthLabel(prevMonthKey(month), false)} 记录` : `vs. ${formatMonthLabel(prevMonthKey(month), false)} records`}</Label>
            </View>
            <View style={[styles.surface, { backgroundColor: colors.surface }]}>
              {comparisons.map((comparison, i) => (
                <View key={comparison.catId} style={[styles.changeRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                  <CatBadge category={categoryFor(comparison.catId)} size={36} rad={12} />
                  <View style={styles.grow}>
                    <Body weight={700}>{categoryLabel(comparison.catId)}</Body>
                  </View>
                  <Body numeric weight={700} style={styles.categoryAmount}>
                    {isZh ? `${comparison.deltaAbs > 0 ? '多' : '少'} ${money(Math.abs(comparison.deltaAbs))}` : `${money(Math.abs(comparison.deltaAbs))} ${comparison.deltaAbs > 0 ? 'more' : 'less'}`}
                  </Body>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View>
            {(!empty || budgetIds.length > 0 || networth) && (
              <>
                <Pressable onPress={() => { haptics.tap(); setDetailsOpen(!detailsOpen); }} accessibilityRole="button" accessibilityLabel={isZh ? '财务详情' : 'Financial details'} accessibilityState={{ expanded: detailsOpen }} style={styles.detailsToggle}>
                  <Body color={colors.ink2}>{isZh ? '详情' : 'Details'}</Body>
                  <Icon name={detailsOpen ? 'chevronUp' : 'chevronDown'} size={18} color={colors.ink2} />
                </Pressable>
                {detailsOpen && (
                  <View style={[styles.details, { borderTopColor: colors.line }]}>
                    {!empty && <>
                      <View style={styles.budgetRow}>
                        <Body style={styles.grow}>{isZh ? '净现金流' : 'Net cash flow'}</Body>
                        <Body numeric weight={700} style={styles.categoryAmount}>{signed(summary.net)}</Body>
                      </View>
                      <Label weight={500} color={colors.ink2}>{isZh ? `根据 ${recordCount} 笔交易计算。净现金流为收入减支出。` : `Based on ${recordCount} recorded transaction${recordCount === 1 ? '' : 's'}. Net cash flow is income minus expenses.`}</Label>
                      {Object.keys(nativeExpenses).length > 1 && <Label weight={500} color={colors.ink2}>{isZh ? '原币支出：' : 'Original currencies: '}{formatCurrencyBreakdown(nativeExpenses)}</Label>}
                      {merchantsKnown > 0 && <Label weight={500} color={colors.ink2}>{isZh ? `Pip 累计记住了 ${merchantsKnown} 家商家。` : `${merchantsKnown} merchants remembered across your records.`}</Label>}
                    </>}
                    {budgetIds.length > 0 && (
                      <>
                        <Body weight={700}>{isZh ? '预算详情' : 'Budget details'}</Body>
                        {budgetIds.map((id) => {
                          const spent = summary.categories.find((row) => row.catId === id)?.amount ?? 0;
                          const target = dc.convert(allocations[id]);
                          return (
                            <View key={id} style={styles.budgetRow}>
                              <View style={styles.grow}>
                                <Body>{categoryLabel(id)}</Body>
                                <Label weight={500} color={colors.ink2}>{isZh ? `目标 ${money(target)}` : `Target ${money(target)}`}</Label>
                              </View>
                              <View style={styles.budgetAmount}>
                                <Body numeric weight={700}>{money(spent)}</Body>
                                <Label weight={500} color={colors.ink2}>{isZh ? `${spent > target ? '高于' : '低于'}目标 ${money(Math.abs(spent - target))}` : `${money(Math.abs(spent - target))} ${spent > target ? 'over' : 'under'} target`}</Label>
                              </View>
                            </View>
                          );
                        })}
                        <Label weight={500} color={colors.ink2}>{isZh ? '仅显示设置了预算的分类，全部支出见上方。' : 'Only categories with a budget are listed here. All spending is shown above.'}</Label>
                      </>
                    )}
                    {networth && (
                      <View style={styles.networth}>
                        <Body weight={700}>{isZh ? (current ? '当前已记录净资产' : '月末已记录净资产') : (current ? 'Recorded net worth so far' : 'Recorded month-end net worth')}</Body>
                        <Title numeric>{signed(networth.net)}</Title>
                        {networth.delta !== null && <Label weight={500} color={colors.ink2}>{isZh ? `较上月末 ${signed(networth.delta)}` : `${signed(networth.delta)} since last month-end`}</Label>}
                        <Label weight={500} color={colors.ink2}>{isZh ? '根据 Pip 中的账户余额记录计算。' : 'Based on account balances added to Pip.'}</Label>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
            {(!!storyModel || onOpenCalendar || onOpenExport) && (
              <View style={[styles.actions, { borderTopColor: colors.line }]}>
                {storyModel && (
                  <ActionButton
                    icon="sparkles"
                    label={isZh ? '月度故事' : 'Monthly story'}
                    accessibilityLabel={isZh ? '查看月度故事' : 'View monthly story'}
                    onPress={() => setStoryOpen(true)}
                    primary
                  />
                )}
                {onOpenCalendar && <ActionButton icon="calendar" label={isZh ? '日历' : 'Calendar'} accessibilityLabel={isZh ? '查看活动日历' : 'View activity calendar'} onPress={() => onOpenCalendar(month)} />}
                {onOpenExport && <ActionButton icon="download" label={isZh ? '导出' : 'Export'} accessibilityLabel={isZh ? '导出报表' : 'Export statement'} onPress={() => onOpenExport(month)} />}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerOpen(false)} accessibilityRole="button" accessibilityLabel={isZh ? '关闭月份选择' : 'Close month picker'} />
          <View style={[styles.monthSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.base }]} accessibilityViewIsModal>
            <View style={styles.sectionHeading}>
              <Title>{isZh ? '选择月份' : 'Choose a month'}</Title>
              <Pressable onPress={() => setPickerOpen(false)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={isZh ? '关闭' : 'Close'}><Icon name="x" size={22} color={colors.ink} /></Pressable>
            </View>
            <ScrollView>
              {months.map((mk) => <Pressable key={mk} onPress={() => chooseMonth(mk)} accessibilityRole="button" accessibilityLabel={formatMonthLabel(mk, true)} accessibilityState={{ selected: mk === month }} style={({ pressed }) => [styles.monthOption, { backgroundColor: mk === month ? accent.accentTint : pressed ? colors.surface2 : colors.surface }]}>
                <Body weight={mk === month ? 700 : 500}>{formatMonthLabel(mk, true)}</Body>
                {mk === month && <Icon name="check" size={20} color={accent.onTint} />}
              </Pressable>)}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {storyModel && (
        <RecapStoryModal
          visible={storyOpen}
          model={storyModel}
          mascotConfig={widgetMascotConfig}
          onClose={() => setStoryOpen(false)}
        />
      )}
      {transactionCategory !== undefined && <RecapTransactionsSheet month={month} categoryId={transactionCategory} transactions={transactions} categoryFor={categoryFor} onClose={() => setTransactionCategory(undefined)} />}
    </View>
  );
}

function ActionButton({ icon, label, accessibilityLabel, onPress, primary = false }: {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const colors = useThemeColors();
  const accent = useAccent();
  return (
    <Pressable
      onPress={() => { haptics.tap(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.actionButton,
        primary && { backgroundColor: accent.accentTint },
        pressed && { backgroundColor: primary ? accent.accentSoft : colors.surface2 },
      ]}
    >
      <Icon name={icon} size={18} color={primary ? accent.accent : colors.ink2} />
      <Label weight={primary ? 700 : 500} color={primary ? accent.accent : colors.ink2}>{label}</Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  navTitle: { flex: 1, textAlign: 'center' },
  iconButton: { minWidth: 48, minHeight: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.base },
  monthRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  monthPicker: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: spacing.sm, minHeight: 48, paddingVertical: spacing.sm },
  hero: { borderRadius: radius.md, padding: spacing.lg },
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  grow: { flex: 1, minWidth: 0, gap: spacing.xs },
  moneyRow: { flexDirection: 'row', gap: spacing.base, borderTopWidth: 1, paddingTop: spacing.md, marginTop: spacing.md },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  recordNote: { marginTop: spacing.sm },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: spacing.sm, padding: spacing.base, marginTop: spacing.md, borderRadius: radius.sm },
  section: { marginTop: spacing.lg, gap: spacing.md },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  surface: { borderRadius: radius.md, overflow: 'hidden' },
  categoryRow: { padding: spacing.base, gap: spacing.sm },
  categoryTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryAmount: { maxWidth: '42%', textAlign: 'right', flexShrink: 1 },
  barTrack: { height: 4, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  textButton: { minHeight: 48, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base },
  tripHeading: { marginTop: spacing.lg, marginBottom: spacing.sm },
  tripCard: { borderRadius: radius.md, borderWidth: 0, boxShadow: 'none', shadowOpacity: 0, elevation: 0 },
  detailsToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inlineAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, paddingTop: spacing.sm, gap: spacing.md },
  actionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, flex: 1, borderRadius: radius.sm },
  details: { borderTopWidth: 1, paddingVertical: spacing.base, gap: spacing.base },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  budgetAmount: { maxWidth: '50%', alignItems: 'flex-end', gap: spacing.xs },
  networth: { gap: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  monthSheet: { width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '75%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.base },
  monthOption: { minHeight: 56, padding: spacing.base, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
