// src/screens/CommitmentsScreen.tsx
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountLinkField } from '../components/AccountLinkField';
import { CurrencyChip } from '../components/CurrencyChip';
import { Icon } from '../components/Icon';
import { Amount, BtnLabel, BubbleText, Card, CategoryChip, Eyebrow, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { BrandBadge } from '../components/BrandBadge';
import { BRAND_SUGGESTIONS, matchBrand } from '../components/BrandLogo';
import { getActiveCurrencies } from '../db/currencyRepo';
import { listFxRates } from '../db/fxRepo';
import { DEFAULT_EXPENSE_ID } from '../data/categories';

import { currentMonthKey } from '../lib/budget';
import { computeCommitmentRecord } from '../lib/commitmentRecord';
import { occurrenceMyr, type Commitment, type CommitmentKind, type CommitmentOccurrence } from '../lib/commitments';
import { BASE_CURRENCY, decimalsFor } from '../lib/currency';
import { rateFor, ratesFromCache } from '../lib/fx';
import { formatTimelineDateHeader, shortDate } from '../lib/dates';
import { todayISO } from '../lib/duplicates';
import { currencyPrefix, fmtMoney } from '../lib/format';
import { RECEIVABLE_CLS } from '../lib/networth';
import { confirmAction } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { colors, numFont, radius, shadowCard, uiFont } from '../theme';

const GREEN = '#1f8a5b';
const RED = '#c5402f';
const AMBER = '#a3791f';

function statusColor(o: CommitmentOccurrence, overdue: boolean, colorTheme: ReturnType<typeof useThemeColors>): string {
  if (o.status === 'paid') return GREEN;
  if (o.status === 'late') return AMBER;
  if (o.status === 'skipped') return colorTheme.ink3;
  return overdue ? RED : colorTheme.ink3;
}

function statusLabel(o: CommitmentOccurrence, overdue: boolean, isZh: boolean): string {
  if (o.status === 'paid') return isZh ? '已按时支付' : 'Paid';
  if (o.status === 'late') return isZh ? '已逾期支付' : 'Paid late';
  if (o.status === 'skipped') return isZh ? '已跳过' : 'Skipped';
  return overdue ? (isZh ? '已逾期' : 'Overdue') : (isZh ? '待支付' : 'Upcoming');
}

interface DateGroup {
  date: string;
  occurrences: CommitmentOccurrence[];
  totalMyr: number;
}

function addMonthsKey(mk: string, delta: number): string {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The recurring commitments screen with a sleek timeline view, month-to-month navigation,
 * accurate due-date grouping, brand logos, daily subtotals, and comprehensive recurring management.
 */
export function CommitmentsScreen({ onBack, embedded }: { onBack: () => void; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, formatMonthLabel, isZh } = useLanguage();
  const {
    commitments,
    commitmentOccurrences,
    accounts,
    payCommitment,
    unpayCommitment,
    skipCommitment,
    deleteCommitmentEntry,
    previewCommitmentMatch,
  } = useAppData();
  const dc = useDisplayCurrency();

  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([BASE_CURRENCY]);
  const [rates, setRates] = useState<Record<string, number>>({});

  const reloadCurrencies = React.useCallback(async () => {
    const [active, fx] = await Promise.all([getActiveCurrencies(), listFxRates()]);
    setActiveCurrencies(active);
    setRates(ratesFromCache(fx));
  }, []);

  React.useEffect(() => {
    reloadCurrencies();
  }, [reloadCurrencies]);

  const today = useMemo(() => todayISO(), []);
  const curMonth = useMemo(() => currentMonthKey(new Date()), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(curMonth);
  const isCurrentMonth = selectedMonth === curMonth;

  const [editing, setEditing] = useState<Commitment | 'new' | null>(null);
  const [actionsFor, setActionsFor] = useState<CommitmentOccurrence | null>(null);

  const commitmentById = useMemo(() => new Map(commitments.map((c) => [c.id, c])), [commitments]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id as string, a])), [accounts]);

  // Occurrences belonging to the selected month
  const monthOccurrences = useMemo(() => {
    return commitmentOccurrences
      .filter((o) => o.month === selectedMonth)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  }, [commitmentOccurrences, selectedMonth]);

  const [paidOverdueIds, setPaidOverdueIds] = useState<Set<string>>(new Set());

  // Overdue occurrences (scheduled or recently settled in this session with due date before today)
  const overdue = useMemo(
    () =>
      commitmentOccurrences
        .filter((o) => (o.status === 'scheduled' || paidOverdueIds.has(o.id)) && o.dueDate < today)
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),
    [commitmentOccurrences, today, paidOverdueIds]
  );
  const overdueIds = useMemo(() => new Set(overdue.map((o) => o.id)), [overdue]);

  // Group occurrences by due date
  const groupOccurrencesByDate = (occs: CommitmentOccurrence[]): DateGroup[] => {
    const map = new Map<string, CommitmentOccurrence[]>();
    for (const o of occs) {
      const list = map.get(o.dueDate) ?? [];
      list.push(o);
      map.set(o.dueDate, list);
    }
    const groups: DateGroup[] = [];
    for (const [date, items] of map.entries()) {
      const totalMyr = items.reduce((s, o) => {
        const c = commitmentById.get(o.commitmentId);
        const fx = o.fxRate ?? (c && c.currency !== BASE_CURRENCY ? rateFor(rates, c.currency) : 1) ?? 1;
        return s + occurrenceMyr(o.amount, fx);
      }, 0);
      groups.push({ date, occurrences: items, totalMyr });
    }
    return groups.sort((a, b) => (a.date < b.date ? -1 : 1));
  };

  const monthGroups = useMemo(
    () => groupOccurrencesByDate(monthOccurrences),
    [monthOccurrences, commitmentById, rates]
  );
  const overdueGroups = useMemo(() => groupOccurrencesByDate(overdue), [overdue, commitmentById, rates]);

  // Displayed occurrences for total and unpaid counts
  const displayedOccurrences = useMemo(() => {
    if (isCurrentMonth) {
      const nonOverdueInMonth = monthOccurrences.filter((o) => !overdueIds.has(o.id));
      return [...overdue, ...nonOverdueInMonth];
    }
    return monthOccurrences;
  }, [isCurrentMonth, monthOccurrences, overdue, overdueIds]);

  const monthTotal = useMemo(() => {
    return displayedOccurrences.reduce((s, o) => {
      const c = commitmentById.get(o.commitmentId);
      const fx = o.fxRate ?? (c && c.currency !== BASE_CURRENCY ? rateFor(rates, c.currency) : 1) ?? 1;
      return s + occurrenceMyr(o.amount, fx);
    }, 0);
  }, [displayedOccurrences, commitmentById, rates]);

  const unpaidCount = useMemo(() => {
    return displayedOccurrences.filter((o) => o.status === 'scheduled').length;
  }, [displayedOccurrences]);

  const record = useMemo(() => computeCommitmentRecord(commitmentOccurrences), [commitmentOccurrences]);

  const handleToggle = async (o: CommitmentOccurrence) => {
    if (o.status === 'paid' || o.status === 'late') {
      const doUnpay = async () => {
        setPaidOverdueIds((prev) => {
          const next = new Set(prev);
          next.delete(o.id);
          return next;
        });
        await unpayCommitment(o.id);
      };
      if (o.txnCreated) {
        confirmAction(
          isZh ? '撤销此笔支付？' : 'Undo this payment?',
          isZh ? '这将删除由此自动创建的交易记录，并恢复账户扣款余额。' : 'This removes the transaction it created and restores the account balance it moved.',
          isZh ? '撤销' : 'Undo',
          doUnpay
        );
      } else {
        await doUnpay();
      }
      return;
    }
    if (o.status !== 'scheduled') return;

    const doPay = async () => {
      if (o.dueDate < today) {
        setPaidOverdueIds((prev) => new Set(prev).add(o.id));
      }
      await payCommitment(o.id);
    };

    const match = previewCommitmentMatch(o.id);
    const c = commitmentById.get(o.commitmentId);
    if (match && c) {
      confirmAction(
        isZh ? '检测到匹配交易' : 'Found a matching transaction',
        isZh
          ? `在 ${shortDate(match.date ?? match.createdAt)} 发现 ${match.merchantRaw || c.label} · ${fmtMoney(match.nativeAmount ?? match.amount, match.currency)}。是否关联至此账单，而不是创建新流水？`
          : `${match.merchantRaw || c.label} · ${fmtMoney(match.nativeAmount ?? match.amount, match.currency)} on ${shortDate(match.date ?? match.createdAt)}. Link it to this bill instead of logging a new one?`,
        isZh ? '关联交易' : 'Link it',
        doPay
      );
    } else {
      await doPay();
    }
  };

  const confirmDeleteCommitment = (commitmentId: string, fromMonth?: string) => {
    const c = commitmentById.get(commitmentId);
    if (!c) return;
    const targetMonth = fromMonth ?? selectedMonth;
    confirmAction(
      isZh ? '删除定期项目？' : 'Delete recurring payment?',
      isZh
        ? `从 ${formatMonthLabel(targetMonth, true)} 起停止并删除“${c.label}”的后续所有待办？该月之前的历史记录将继续完整保留。`
        : `Remove "${c.label}" from ${formatMonthLabel(targetMonth, true)} onwards? This removes occurrences for ${formatMonthLabel(targetMonth, true)} and all future months, while keeping all prior history intact.`,
      isZh ? '删除' : 'Delete',
      async () => {
        await deleteCommitmentEntry(c.id, targetMonth);
      }
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar
            title={isZh ? '定期支出与定投' : 'Recurring commitments'}
            onBack={onBack}
            right={
              <Pressable
                onPress={() => setEditing('new')}
                hitSlop={8}
                accessibilityLabel="Add a recurring commitment"
                style={[styles.addCircleBtn, { backgroundColor: theme.accent }]}
              >
                <Icon name="plus" size={15} color="#ffffff" stroke={2.8} />
              </Pressable>
            }
          />
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 36 }} showsVerticalScrollIndicator={false}>
        {commitments.length === 0 ? (
          <>
            <PipSays expr="idle">
              <BubbleText>
                {isZh
                  ? '设置定期账单或每月定投，我会在此处提醒您并生成待办清单。'
                  : 'Set up a bill or a monthly investment and I will remind you and keep the timeline here.'}
              </BubbleText>
            </PipSays>
            <Card style={{ padding: 26, alignItems: 'center', marginTop: 14 }}>
              <Text style={[styles.emptyTitle, { color: colorTheme.ink }]}>{isZh ? '暂无定期项目' : 'Nothing set up yet'}</Text>
              <Text style={[styles.emptySub, { color: colorTheme.ink2 }]}>
                {isZh
                  ? '车贷、房租、话费套餐、流媒体订阅或每月固定定投 — 添加一次即可按期打勾完成。'
                  : 'Click the button to add new commitment.'}
              </Text>
              <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
                <PrimaryButton onPress={() => setEditing('new')} height={48}>
                  <Icon name="plus" size={17} color="#fff" stroke={2.4} />
                  <BtnLabel>{isZh ? '添加定期项目' : 'Add a commitment'}</BtnLabel>
                </PrimaryButton>
              </View>
            </Card>
          </>
        ) : (
          <>
            {/* Month Navigator */}
            <View style={styles.monthNav}>
              <Pressable
                onPress={() => setSelectedMonth((prev) => addMonthsKey(prev, -1))}
                style={[styles.monthNavBtn, { backgroundColor: colorTheme.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                hitSlop={8}
              >
                <Icon name="chevronLeft" size={16} color={colorTheme.ink} stroke={2.4} />
              </Pressable>
              <Text style={[styles.monthLabel, { color: colorTheme.ink }]}>
                {formatMonthLabel(selectedMonth, true)}
              </Text>
              <Pressable
                onPress={() => setSelectedMonth((prev) => addMonthsKey(prev, 1))}
                style={[styles.monthNavBtn, { backgroundColor: colorTheme.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                hitSlop={8}
              >
                <Icon name="chevronRight" size={16} color={colorTheme.ink} stroke={2.4} />
              </Pressable>
            </View>

            {/* Top Summary Card */}
            <Card style={styles.totalCard}>
              <Eyebrow>
                {unpaidCount === 0
                  ? (isZh ? '该月已全部付清' : 'All caught up')
                  : (isZh ? `${unpaidCount} 项待付` : `${unpaidCount} due ${isCurrentMonth ? 'this month' : 'in month'}`)}
              </Eyebrow>
              <Amount value={dc.convert(monthTotal)} currency={dc.code} size={28} weight={700} color={RED} />
              {record.total > 0 && (
                <Text style={[styles.recordLine, { color: colorTheme.ink2 }]}>
                  {isZh
                    ? `按时支付率 ${Math.round(record.onTimeRatio * 100)}%（${record.onTime} / ${record.total}）`
                    : `Paid on time ${Math.round(record.onTimeRatio * 100)}% (${record.onTime} of ${record.total})`}
                </Text>
              )}
            </Card>

            {/* Overdue Section (If any and on current month) */}
            {isCurrentMonth && overdue.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <View style={styles.overdueHeaderRow}>
                  <Text style={[styles.sectionLabel, { color: RED }]}>{isZh ? '已逾期' : 'Overdue'}</Text>
                  <Text style={[styles.overdueBadge, { color: RED, backgroundColor: 'rgba(197, 64, 47, 0.1)' }]}>
                    {overdue.length}
                  </Text>
                </View>
                {overdueGroups.map((group) => (
                  <TimelineDateGroup
                    key={`overdue-${group.date}`}
                    group={group}
                    today={today}
                    isZh={isZh}
                    isOverdueSection
                    commitmentById={commitmentById}
                    accountById={accountById}
                    overdueIds={overdueIds}
                    onToggle={handleToggle}
                    onOpenActions={setActionsFor}
                    onDelete={confirmDeleteCommitment}
                  />
                ))}
              </View>
            )}

            {/* Month Timeline */}
            <View style={{ marginTop: isCurrentMonth && overdue.length > 0 ? 16 : 22 }}>
              {monthGroups.length === 0 ? (
                <Card style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={[styles.emptySub, { color: colorTheme.ink2 }]}>
                    {isZh
                      ? `在 ${formatMonthLabel(selectedMonth, true)} 暂无定期项目。`
                      : `No commitments scheduled for ${formatMonthLabel(selectedMonth, true)}.`}
                  </Text>
                </Card>
              ) : (
                monthGroups.map((group) => (
                  <TimelineDateGroup
                    key={group.date}
                    group={group}
                    today={today}
                    isZh={isZh}
                    isOverdueSection={false}
                    commitmentById={commitmentById}
                    accountById={accountById}
                    overdueIds={overdueIds}
                    onToggle={handleToggle}
                    onOpenActions={setActionsFor}
                    onDelete={confirmDeleteCommitment}
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <CommitmentActionsSheet
        occurrence={actionsFor}
        commitment={actionsFor ? commitmentById.get(actionsFor.commitmentId) ?? null : null}
        onClose={() => setActionsFor(null)}
        onSkip={async () => {
          if (actionsFor) await skipCommitment(actionsFor.id);
          setActionsFor(null);
        }}
        onEdit={(c) => {
          setActionsFor(null);
          setEditing(c);
        }}
      />

      <CommitmentEditorModal
        target={editing}
        accounts={accounts}
        activeCurrencies={activeCurrencies}
        rates={rates}
        onCurrencyActivated={reloadCurrencies}
        visible={editing !== null}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

/** Renders one date group with the timeline rail, date header, daily total, and card rows */
function TimelineDateGroup({
  group,
  today,
  isZh,
  isOverdueSection,
  commitmentById,
  accountById,
  overdueIds,
  onToggle,
  onOpenActions,
  onDelete,
}: {
  group: DateGroup;
  today: string;
  isZh: boolean;
  isOverdueSection: boolean;
  commitmentById: Map<string, Commitment>;
  accountById: Map<string, any>;
  overdueIds: Set<string>;
  onToggle: (o: CommitmentOccurrence) => void;
  onOpenActions: (o: CommitmentOccurrence) => void;
  onDelete: (commitmentId: string, fromMonth?: string) => void;
}) {
  const colorTheme = useThemeColors();
  const dc = useDisplayCurrency();

  return (
    <View style={styles.timelineSection}>
      {/* Left Timeline Rail Column */}
      <View style={styles.timelineRailCol}>
        <View
          style={[
            styles.timelineNode,
            {
              borderColor: isOverdueSection ? RED : colorTheme.line,
              backgroundColor: colorTheme.bg,
            },
          ]}
        >
          <View
            style={[
              styles.timelineInnerDot,
              { backgroundColor: isOverdueSection ? RED : colorTheme.line },
            ]}
          />
        </View>
        <View style={[styles.timelineLine, { backgroundColor: colorTheme.line2 }]} />
      </View>

      {/* Right Timeline Content Area */}
      <View style={styles.timelineContentArea}>
        {/* Date Header Row */}
        <View style={styles.dateHeaderRow}>
          <Text style={[styles.dateHeaderText, { color: isOverdueSection ? RED : colorTheme.ink }]}>
            {formatTimelineDateHeader(group.date, today, isZh)}
          </Text>
          <Text style={[styles.dateHeaderTotal, { color: colorTheme.ink3 }]}>
            {fmtMoney(dc.convert(group.totalMyr), dc.code)}
          </Text>
        </View>

        {/* Commitment Cards */}
        <View style={[styles.cardGroup, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
          {group.occurrences.map((o, idx) => (
            <OccurrenceRow
              key={o.id}
              occurrence={o}
              commitment={commitmentById.get(o.commitmentId)}
              accountById={accountById}
              overdue={overdueIds.has(o.id)}
              divider={idx > 0}
              onToggle={() => onToggle(o)}
              onOpenActions={() => onOpenActions(o)}
              onDelete={() => onDelete(o.commitmentId, o.month)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function OccurrenceRow({
  occurrence,
  commitment,
  accountById,
  overdue,
  divider,
  onToggle,
  onOpenActions,
  onDelete,
}: {
  occurrence: CommitmentOccurrence;
  commitment: Commitment | undefined;
  accountById: Map<string, any>;
  overdue: boolean;
  divider: boolean;
  onToggle: () => void;
  onOpenActions: () => void;
  onDelete: () => void;
}) {
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const checked = occurrence.status === 'paid' || occurrence.status === 'late';
  const brand = matchBrand(commitment?.label);

  const targetAcct = commitment?.toAccountId ? accountById.get(commitment.toAccountId) : null;
  const subtitleSuffix =
    targetAcct && commitment?.kind === 'expense' && targetAcct.kind === 'liability'
      ? ` · ${isZh ? '抵扣' : 'Pays down'} ${targetAcct.name}`
      : targetAcct && commitment?.kind === 'investment'
      ? ` · ${isZh ? '转入' : 'Into'} ${targetAcct.name}`
      : '';

  return (
    <Pressable
      onPress={onOpenActions}
      style={({ pressed }) => [
        styles.row,
        divider && [styles.divider, { borderTopColor: colorTheme.line2 }],
        pressed && { backgroundColor: colorTheme.surface2 },
        checked && { opacity: 0.6 },
      ]}
    >
      {/* Checkbox (taps toggle paid/unpaid) */}
      <Pressable
        onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
        hitSlop={10}
        accessibilityLabel={checked ? 'Mark unpaid' : 'Mark paid'}
        style={[
          styles.checkbox,
          {
            borderColor: checked ? GREEN : colorTheme.line,
            backgroundColor: checked ? GREEN : 'transparent',
          },
        ]}
      >
        {checked && <Icon name="check" size={11} color="#ffffff" stroke={2.8} />}
      </Pressable>

      {/* Brand Logo or Category Icon Fallback */}
      <BrandBadge
        brand={brand}
        size={38}
        rad={10}
        fallbackLabel={commitment?.label}
        fallbackIcon={commitment?.kind === 'investment' ? 'trending' : 'receipt'}
      />

      {/* Subscription Name and Frequency Subtitle */}
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <Text
          style={[
            styles.rowLabel,
            { color: colorTheme.ink },
            checked && styles.strikethrough,
          ]}
          numberOfLines={1}
        >
          {commitment?.label ?? (isZh ? '定期项目' : 'Commitment')}
          {commitment?.kind === 'investment' ? ' · DCA' : ''}
        </Text>
        <Text style={[styles.rowSub, { color: statusColor(occurrence, overdue, colorTheme) }]} numberOfLines={1}>
          {statusLabel(occurrence, overdue, isZh)}{subtitleSuffix}
        </Text>
      </View>

      {/* Amount in Red/Coral Accent (dimmed when paid) */}
      <Text style={[
        styles.occurrenceAmount,
        { color: checked ? colorTheme.ink3 : RED },
        checked && styles.strikethrough,
      ]}>
        {fmtMoney(occurrence.paidAmount ?? occurrence.amount, commitment?.currency ?? BASE_CURRENCY)}
      </Text>

      {/* Delete / Action Icon Button */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onDelete();
        }}
        hitSlop={8}
        accessibilityLabel="Delete commitment"
        style={styles.trashBtn}
      >
        <Icon name="trash" size={15} color={colorTheme.ink3} />
      </Pressable>
    </Pressable>
  );
}

function CommitmentActionsSheet({
  occurrence,
  commitment,
  onClose,
  onSkip,
  onEdit,
}: {
  occurrence: CommitmentOccurrence | null;
  commitment: Commitment | null;
  onClose: () => void;
  onSkip: () => void;
  onEdit: (c: Commitment) => void;
}) {
  const insets = useSafeAreaInsets();
  const colorTheme = useThemeColors();
  const { formatMonthLabel, isZh } = useLanguage();
  const { archiveCommitmentEntry, deleteCommitmentEntry, payCommitment, unpayCommitment } = useAppData();
  if (!occurrence || !commitment) return <Modal visible={false} transparent />;

  const isPaid = occurrence.status === 'paid' || occurrence.status === 'late';

  const confirmDelete = () => {
    confirmAction(
      isZh ? '删除定期项目？' : 'Delete recurring payment?',
      isZh
        ? `从 ${formatMonthLabel(occurrence.month, true)} 起停止并删除“${commitment.label}”的后续所有待办？该月之前的历史记录将继续完整保留。`
        : `Remove "${commitment.label}" from ${formatMonthLabel(occurrence.month, true)} onwards? This removes occurrences for ${formatMonthLabel(occurrence.month, true)} and all future months, while keeping all prior history intact.`,
      isZh ? '删除' : 'Delete',
      async () => {
        await deleteCommitmentEntry(commitment.id, occurrence.month);
        onClose();
      }
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetAvoider} pointerEvents="box-none">
        <View style={[styles.sheetCard, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <Text style={[styles.sheetTitle, { color: colorTheme.ink }]}>{commitment.label}</Text>

          {isPaid ? (
            <ActionRow
              icon="x"
              label={isZh ? '撤销支付标记' : 'Mark as unpaid'}
              onPress={async () => {
                await unpayCommitment(occurrence.id);
                onClose();
              }}
            />
          ) : (
            <ActionRow
              icon="check"
              label={isZh ? '标记为已支付' : 'Mark as paid'}
              onPress={async () => {
                await payCommitment(occurrence.id);
                onClose();
              }}
            />
          )}

          <ActionRow icon="pencil" label={isZh ? '编辑' : 'Edit'} onPress={() => onEdit(commitment)} />
          {occurrence.status === 'scheduled' && (
            <ActionRow icon="x" label={isZh ? '跳过本期' : 'Skip this occurrence'} onPress={onSkip} />
          )}
          <ActionRow
            icon="clock"
            label={isZh ? '归档（停止后续生成）' : 'Archive (stop future occurrences)'}
            onPress={async () => {
              await archiveCommitmentEntry(commitment.id);
              onClose();
            }}
          />
          <ActionRow icon="trash" label={isZh ? '删除' : 'Delete'} danger onPress={confirmDelete} />
        </View>
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const colorTheme = useThemeColors();
  const color = danger ? '#b3261e' : colorTheme.ink;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colorTheme.surface2 }]}>
      <Icon name={icon} size={18} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Create or edit a recurring commitment. `target` is `'new'`, a `Commitment`, or `null` (closed). */
function CommitmentEditorModal({
  target,
  accounts,
  activeCurrencies,
  rates,
  onCurrencyActivated,
  visible,
  onClose,
}: {
  target: Commitment | 'new' | null;
  accounts: { id: string; name: string; kind: string; cls: string; archived: boolean; symbol?: string | null; ticker?: string | null; quantity?: number | null; cost?: number | null; sub?: string | null; icon?: string | null }[];
  activeCurrencies: string[];
  rates: Record<string, number>;
  onCurrencyActivated: (code: string) => void;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { categories, addCommitmentEntry, updateCommitmentEntry } = useAppData();

  const editingExisting = target && target !== 'new' ? target : null;

  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<CommitmentKind>('expense');
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<string>(BASE_CURRENCY);
  const [dueDayText, setDueDayText] = useState('1');
  const [categoryId, setCategoryId] = useState<string>(DEFAULT_EXPENSE_ID);
  const [fromAccountId, setFromAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);

  const key = editingExisting?.id ?? (target === 'new' ? 'new' : null);
  React.useEffect(() => {
    if (target === 'new') {
      setLabel('');
      setKind('expense');
      setAmountText('');
      setCurrency(BASE_CURRENCY);
      setDueDayText('1');
      setCategoryId(DEFAULT_EXPENSE_ID);
      setFromAccountId(accounts.find((a) => !a.archived && a.kind === 'asset' && a.cls !== RECEIVABLE_CLS)?.id ?? null);
      setToAccountId(null);
    } else if (editingExisting) {
      setLabel(editingExisting.label);
      setKind(editingExisting.kind);
      setCurrency(editingExisting.currency ?? BASE_CURRENCY);
      const dec = decimalsFor(editingExisting.currency ?? BASE_CURRENCY);
      setAmountText(dec === 0 ? String(Math.round(editingExisting.amount)) : editingExisting.amount.toFixed(dec));
      setDueDayText(String(editingExisting.dueDay));
      setCategoryId(editingExisting.categoryId ?? DEFAULT_EXPENSE_ID);
      setFromAccountId(editingExisting.fromAccountId);
      setToAccountId(editingExisting.toAccountId);
    }
  }, [key]);

  if (!visible) return <Modal visible={false} transparent />;

  const expenseCategories = categories.filter((c) => c.kind === 'expense');
  const investmentAccounts = accounts.filter((a) => !a.archived && a.cls === 'investments');
  const fromAccounts = accounts.filter((a) => !a.archived && a.kind === 'asset' && a.cls !== RECEIVABLE_CLS);
  const liabilityAccounts = accounts.filter((a) => !a.archived && a.kind === 'liability');

  const amount = Math.max(0, Number(amountText.replace(/[^0-9.]/g, '')) || 0);
  const dueDay = Math.min(31, Math.max(1, parseInt(dueDayText, 10) || 1));
  const canSave = label.trim().length > 0 && amount > 0 && (kind === 'expense' || toAccountId !== null);

  const save = async () => {
    if (!canSave) return;
    if (editingExisting) {
      await updateCommitmentEntry(editingExisting.id, {
        label: label.trim(),
        amount,
        dueDay,
        categoryId: kind === 'investment' ? null : categoryId,
        fromAccountId,
        toAccountId,
      });
    } else {
      await addCommitmentEntry({
        label: label.trim(),
        kind,
        amount,
        dueDay,
        categoryId,
        fromAccountId,
        toAccountId,
        currency,
      });
    }
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.sheetAvoider}
        pointerEvents="box-none"
      >
        <View style={[styles.sheetCard, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colorTheme.ink }]}>
              {editingExisting
                ? (isZh ? '编辑定期项目' : 'Edit commitment')
                : (isZh ? '新建定期支出 / 定投' : 'New recurring commitment')}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!editingExisting && (
              <>
                <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '类型' : 'Type'}</Text>
                <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
                  {(['expense', 'investment'] as CommitmentKind[]).map((k) => {
                    const on = kind === k;
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setKind(k)}
                        style={[styles.toggleBtn, on && { backgroundColor: colorTheme.surface }]}
                      >
                        <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && { color: colorTheme.ink }]}>
                          {k === 'expense' ? (isZh ? '定期账单' : 'Bill') : (isZh ? '定期定投 (DCA)' : 'Investment (DCA)')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={[styles.fieldLabel, { color: colorTheme.ink2, marginTop: 16 }]}>
              {kind === 'investment'
                ? (isZh ? '定投名称（例如“标普500 定投”）' : 'Name (e.g. "S&P 500 DCA")')
                : (isZh ? '账单名称（例如“Apple One”、“ChatGPT Plus”）' : 'Name (e.g. "Apple One", "Netflix", "Maxis")')}
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder={kind === 'investment' ? (isZh ? '每月定投项目' : 'Monthly investment') : (isZh ? '账单名称' : 'Bill name')}
              placeholderTextColor={colorTheme.ink3}
              style={[styles.textInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
            />

            {/* Brand suggestion chips — shown when name field has ≥1 char */}
            {label.trim().length > 0 && (() => {
              const q = label.toLowerCase();
              const hits = BRAND_SUGGESTIONS.filter((s) => s.label.toLowerCase().includes(q));
              if (hits.length === 0) return null;
              return (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                  style={{ marginTop: 8, marginHorizontal: -4 }}
                  contentContainerStyle={{ paddingHorizontal: 4, gap: 8, flexDirection: 'row' }}
                >
                  {hits.slice(0, 12).map((s, i) => (
                    <Pressable
                      key={`${s.key}-${i}`}
                      onPress={() => setLabel(s.label)}
                      style={[styles.brandChip, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}
                    >
                      <BrandBadge brand={s.key} size={28} rad={7} fallbackLabel={s.label} />
                      <Text style={[styles.brandChipLabel, { color: colorTheme.ink }]} numberOfLines={1}>
                        {s.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              );
            })()}


            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '金额' : 'Amount'}</Text>
                <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                  {!editingExisting ? (
                    <CurrencyChip
                      value={currency}
                      active={activeCurrencies}
                      onChange={setCurrency}
                      onActivated={onCurrencyActivated}
                    />
                  ) : (
                    <Text style={[styles.rmPrefix, { color: colorTheme.ink2 }]}>{currencyPrefix(currency)}</Text>
                  )}
                  <TextInput
                    value={amountText}
                    onChangeText={(t) => setAmountText(decimalsFor(currency) === 0 ? t.replace(/[^0-9]/g, '') : t)}
                    keyboardType={decimalsFor(currency) === 0 ? 'number-pad' : 'decimal-pad'}
                    selectTextOnFocus
                    style={[styles.amountInput, { color: colorTheme.ink }]}
                  />
                </View>
                {currency !== BASE_CURRENCY && rateFor(rates, currency) != null && (
                  <Text style={[styles.fxHint, { color: colorTheme.ink3 }]}>≈ {fmtMoney(amount * (rateFor(rates, currency) ?? 1), BASE_CURRENCY)}</Text>
                )}
              </View>
              <View style={{ width: 100 }}>
                <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '每月到期日' : 'Due day'}</Text>
                <TextInput
                  value={dueDayText}
                  onChangeText={setDueDayText}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  style={[styles.textInput, { color: colorTheme.ink, backgroundColor: colorTheme.surface, borderColor: colorTheme.line, textAlign: 'center' }]}
                />
              </View>
            </View>

            {/* Pay from is on the top */}
            <View style={{ marginTop: 18 }}>
              <AccountLinkField
                accounts={fromAccounts as any}
                selectedId={fromAccountId}
                onSelect={setFromAccountId}
                label={isZh ? '扣款账户' : 'Pay from'}
              />
            </View>

            {kind === 'expense' && (
              <>
                <Text style={[styles.fieldLabel, { color: colorTheme.ink2, marginTop: 18 }]}>{isZh ? '支出分类' : 'Category'}</Text>
                <View style={styles.grid}>
                  {expenseCategories.map((c) => (
                    <View key={c.id} style={styles.gridCell}>
                      <CategoryChip category={c} selected={categoryId === c.id} suggested={false} onPress={() => setCategoryId(c.id)} />
                    </View>
                  ))}
                </View>

                {/* Reduce liability is on the bottom */}
                <View style={{ marginTop: 18 }}>
                  <AccountLinkField
                    accounts={liabilityAccounts as any}
                    selectedId={toAccountId}
                    onSelect={setToAccountId}
                    label={isZh ? '抵扣负债账户（分期还款可选，如车贷/房贷）' : 'Reduce liability account (optional, e.g. car/mortgage loan)'}
                    infoEntry="reduce_liability"
                  />
                </View>
              </>
            )}

            {kind === 'investment' && (
              <View style={{ marginTop: 18 }}>
                <AccountLinkField
                  accounts={investmentAccounts as any}
                  selectedId={toAccountId}
                  onSelect={setToAccountId}
                  label={isZh ? '转入投资账户' : 'Invest into'}
                  required
                  emptyCreateLabel={isZh ? '创建投资账户' : 'Create investment account'}
                  createAccountInitialKind="asset"
                  createAccountInitialClass="investments"
                />
              </View>
            )}

            <View style={{ marginTop: 20 }}>
              <PrimaryButton onPress={save} height={52} disabled={!canSave}>
                <Icon name="check" size={18} color="#fff" stroke={2.4} />
                <BtnLabel>{editingExisting ? (isZh ? '保存修改' : 'Save changes') : (isZh ? '添加定期项目' : 'Add commitment')}</BtnLabel>
              </PrimaryButton>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 2,
    marginBottom: 8,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  monthLabel: {
    fontFamily: uiFont(700),
    fontSize: 16,
    minWidth: 140,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  totalCard: { padding: 16, marginTop: 10 },
  recordLine: { fontFamily: uiFont(500), fontSize: 12, marginTop: 4 },
  sectionLabel: { fontFamily: uiFont(700), fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4 },
  overdueHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginLeft: 2 },
  overdueBadge: { fontFamily: uiFont(700), fontSize: 11, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17 },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, marginTop: 6, textAlign: 'center', lineHeight: 19 },

  addCircleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Timeline Styles */
  timelineSection: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineRailCol: {
    width: 22,
    alignItems: 'center',
    marginRight: 8,
  },
  timelineNode: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
    zIndex: 2,
  },
  timelineInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timelineLine: {
    width: 1.5,
    flex: 1,
    marginTop: 2,
    marginBottom: -16,
  },
  timelineContentArea: {
    flex: 1,
    minWidth: 0,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
    paddingRight: 4,
  },
  dateHeaderText: {
    fontFamily: uiFont(700),
    fontSize: 13.5,
    letterSpacing: 0.2,
  },
  dateHeaderTotal: {
    fontFamily: numFont(600),
    fontSize: 12.5,
  },
  cardGroup: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },

  divider: { borderTopWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLabel: { fontFamily: uiFont(700), fontSize: 14.5 },
  rowSub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 2 },
  occurrenceAmount: { fontFamily: numFont(700), fontSize: 15 },
  trashBtn: { padding: 4 },
  strikethrough: { textDecorationLine: 'line-through' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheetAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { flex: 1, fontFamily: uiFont(700), fontSize: 18 },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  actionText: { fontFamily: uiFont(600), fontSize: 15 },

  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  textInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, fontFamily: uiFont(600), fontSize: 15 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 4 },
  rmPrefix: { fontFamily: numFont(600), fontSize: 16 },
  amountInput: { flex: 1, paddingVertical: 9, fontFamily: numFont(700), fontSize: 18 },
  fxHint: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 4, marginLeft: 2 },

  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  brandChipLabel: { fontFamily: uiFont(600), fontSize: 13 },


  toggle: { flexDirection: 'row', borderRadius: 999, padding: 4, borderWidth: 1 },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleText: { fontFamily: uiFont(600), fontSize: 13 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  gridCell: {},
});
