import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';
import { compactAmt, fmtMoney } from '../lib/format';
import type { Transaction } from '../lib/types';
import { daysLeftInYear, yearProgressPct } from '../lib/dates';
import { YEAR_PROGRESS_SEEN_KEY, yearProgressCaption } from '../lib/timeProgress';
import { TimeProgressBar } from '../components/TimeProgressBar';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency, type DisplayCurrency } from '../state/useDisplayCurrency';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { colors, numFont, platformShadow, shadowCard, spacing, uiFont } from '../theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMonths(ym: { year: number; month: number }, delta: number) {
  const d = new Date(ym.year, ym.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthKeyFrom(ym: { year: number; month: number }): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}

/** Build a grid of weeks (each week = 7 cells, Mon-first; null = outside month). */
function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  // Convert to Mon-first offset (Mon=0 … Sun=6)
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const total = startOffset + daysInMonth;
  const weeks: (number | null)[][] = [];
  let day = 1;
  for (let week = 0; week < Math.ceil(total / 7); week++) {
    const row: (number | null)[] = [];
    for (let col = 0; col < 7; col++) {
      const cellIndex = week * 7 + col;
      if (cellIndex < startOffset || day > daysInMonth) {
        row.push(null);
      } else {
        row.push(day++);
      }
    }
    weeks.push(row);
  }
  return weeks;
}

/** YYYY-MM-DD for a given year/month/day. */
function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The effective date of a transaction: `date` if present, else `createdAt` truncated. */
function txnDate(t: Transaction): string {
  if (t.date) return t.date.slice(0, 10);
  return t.createdAt.slice(0, 10);
}

interface DayData {
  income: number;
  expense: number;
  net: number;
  txns: Transaction[];
}

interface MonthData {
  totalIncome: number;
  totalExpense: number;
  byDay: Record<string, DayData>;
}

function computeMonthData(transactions: Transaction[], year: number, month: number, dc: DisplayCurrency): MonthData {
  const mk = monthKeyFrom({ year, month });
  let totalIncome = 0;
  let totalExpense = 0;
  const byDay: Record<string, DayData> = {};

  for (const t of transactions) {
    const d = txnDate(t);
    if (!d.startsWith(mk)) continue;
    const dayStr = d; // full YYYY-MM-DD
    if (!byDay[dayStr]) byDay[dayStr] = { income: 0, expense: 0, net: 0, txns: [] };
    byDay[dayStr].txns.push(t);
    const val = dc.convertTxn(t);
    if (t.type === 'income') {
      byDay[dayStr].income += val;
      totalIncome += val;
    } else if (t.type === 'expense') {
      byDay[dayStr].expense += val;
      totalExpense += val;
    }
    byDay[dayStr].net = byDay[dayStr].income - byDay[dayStr].expense;
  }
  return { totalIncome, totalExpense, byDay };
}



const WEEKDAY_LABELS_EN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAY_LABELS_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const FULL_WEEKDAY_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FULL_WEEKDAY_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_SHORT_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const YEAR_WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const YEAR_WEEKDAY_LABELS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

interface YearCell {
  day: number;
  month: number;
  year: number;
  inMonth: boolean;
  iso: string;
}

/** Sun-first 6-row (42-cell) grid for a mini month, including dimmed spillover days. */
function buildYearGrid(year: number, month: number): YearCell[] {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: YearCell[] = [];
  for (let i = 0; i < firstDow; i++) {
    const d = daysInPrevMonth - firstDow + 1 + i;
    cells.push({ day: d, month: prevMonth, year: prevYear, inMonth: false, iso: toIsoDate(prevYear, prevMonth, d) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month, year, inMonth: true, iso: toIsoDate(year, month, d) });
  }
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ day: nextDay, month: nextMonth, year: nextYear, inMonth: false, iso: toIsoDate(nextYear, nextMonth, nextDay) });
    nextDay++;
  }
  return cells;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCards({ income, expense }: { income: number; expense: number }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const dc = useDisplayCurrency();
  return (
    <View style={styles.summaryRow}>
      <View
        style={[
          styles.summaryCard,
          styles.summaryCardIncome,
          { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2, borderTopColor: theme.accent },
        ]}
      >
        <View style={styles.summaryDotRow}>
          <View style={[styles.summaryDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.summaryLabel, { color: colorTheme.ink2 }]}>{isZh ? '收入' : 'INCOME'}</Text>
        </View>
        <Text style={[styles.summaryAmount, { color: colorTheme.ink }]}>{fmtMoney(income, dc.code)}</Text>
      </View>
      <View
        style={[
          styles.summaryCard,
          styles.summaryCardExpense,
          { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2, borderTopColor: colorTheme.red },
        ]}
      >
        <View style={styles.summaryDotRow}>
          <View style={[styles.summaryDot, { backgroundColor: colorTheme.red }]} />
          <Text style={[styles.summaryLabel, { color: colorTheme.ink2 }]}>{isZh ? '支出' : 'EXPENSE'}</Text>
        </View>
        <Text style={[styles.summaryAmount, { color: colorTheme.red }]}>{fmtMoney(expense, dc.code)}</Text>
      </View>
    </View>
  );
}

function MiniMonth({
  year,
  month,
  todayIso,
  selectedIso,
  onSelectDay,
}: {
  year: number;
  month: number;
  todayIso: string;
  selectedIso: string;
  onSelectDay: (year: number, month: number, day: number) => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const weeks = useMemo(() => {
    const cells = buildYearGrid(year, month);
    const rows: YearCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month]);

  const monthTitle = isZh ? MONTHS_SHORT_ZH[month - 1] : MONTHS_SHORT_EN[month - 1];
  const weekdayLabels = isZh ? YEAR_WEEKDAY_LABELS_ZH : YEAR_WEEKDAY_LABELS;

  return (
    <View style={styles.miniMonth}>
      <Text style={[styles.miniMonthTitle, { color: colorTheme.ink }]}>{monthTitle}</Text>
      <View style={styles.miniWeekdayRow}>
        {weekdayLabels.map((w, i) => (
          <Text key={i} style={[styles.miniWeekdayLabel, { color: colorTheme.ink3 }]}>{w}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.miniWeekRow}>
          {week.map((cell, ci) => {
            const isToday = cell.iso === todayIso;
            const isSelected = cell.iso === selectedIso;
            return (
              <Pressable
                key={ci}
                style={styles.miniCell}
                onPress={() => onSelectDay(cell.year, cell.month, cell.day)}
                accessibilityRole="button"
                accessibilityLabel={cell.iso}
              >
                <View
                  style={[
                    styles.miniCellDot,
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.accent },
                    isSelected && { backgroundColor: theme.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.miniCellText,
                      { color: cell.inMonth ? colorTheme.ink : colorTheme.ink3 },
                      !cell.inMonth && styles.miniCellTextDim,
                      isSelected && styles.miniCellTextSelected,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function YearBlock({
  year,
  todayIso,
  selectedIso,
  onSelectDay,
  showYearProgress,
}: {
  year: number;
  todayIso: string;
  selectedIso: string;
  onSelectDay: (year: number, month: number, day: number) => void;
  showYearProgress?: boolean;
}) {
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const yearPct = yearProgressPct(new Date());
  const yearDaysLeft = daysLeftInYear(new Date());

  return (
    <View style={styles.yearBlock}>
      <Text
        style={[
          styles.yearBlockTitle,
          { color: colorTheme.ink, marginBottom: showYearProgress ? 8 : 16 },
        ]}
      >
        {isZh ? `${year}年` : year}
      </Text>
      {showYearProgress ? (
        <View style={styles.yearProgressWrap}>
          <TimeProgressBar
            percent={yearPct}
            storageKey={YEAR_PROGRESS_SEEN_KEY}
            captionFor={(pct) => yearProgressCaption(yearDaysLeft, pct, isZh)}
            accessibilityLabel={isZh ? '今年进度' : 'Year progress'}
          />
        </View>
      ) : null}
      <View style={styles.yearBlockGrid}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <View key={m} style={styles.yearBlockItem}>
            <MiniMonth
              year={year}
              month={m}
              todayIso={todayIso}
              selectedIso={selectedIso}
              onSelectDay={onSelectDay}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const INITIAL_YEARS_BEFORE = 5;
const INITIAL_YEARS_AFTER = 5;
const EXTEND_BY = 3;

function InfiniteYearScroll({
  currentYear,
  todayIso,
  selectedIso,
  onSelectDay,
}: {
  currentYear: number;
  todayIso: string;
  selectedIso: string;
  onSelectDay: (year: number, month: number, day: number) => void;
}) {
  const [years, setYears] = useState<number[]>(() =>
    Array.from(
      { length: INITIAL_YEARS_BEFORE + 1 + INITIAL_YEARS_AFTER },
      (_, i) => currentYear - INITIAL_YEARS_BEFORE + i,
    ),
  );

  const listRef = useRef<FlatList<number>>(null);

  // Scroll to current year on first mount
  const initialIndex = INITIAL_YEARS_BEFORE;

  const handleEndReached = useCallback(() => {
    setYears((prev) => {
      const lastYear = prev[prev.length - 1];
      const addition = Array.from({ length: EXTEND_BY }, (_, i) => lastYear + i + 1);
      return [...prev, ...addition];
    });
  }, []);

  const handleStartReached = useCallback(() => {
    setYears((prev) => {
      const firstYear = prev[0];
      const addition = Array.from({ length: EXTEND_BY }, (_, i) => firstYear - EXTEND_BY + i);
      return [...addition, ...prev];
    });
  }, []);

  const renderItem = useCallback(
    ({ item: year }: { item: number }) => (
      <YearBlock
        year={year}
        todayIso={todayIso}
        selectedIso={selectedIso}
        onSelectDay={onSelectDay}
        showYearProgress={year === currentYear}
      />
    ),
    [todayIso, selectedIso, onSelectDay, currentYear],
  );

  const keyExtractor = useCallback((year: number) => String(year), []);

  return (
    <FlatList
      ref={listRef}
      data={years}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      initialScrollIndex={initialIndex}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.3}
      onStartReached={handleStartReached}
      onStartReachedThreshold={0.3}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.infiniteScrollContent}
    />
  );
}

function DayCell({
  day,
  dayData,
  checkInKind,
  selected,
  isToday,
  onPress,
}: {
  day: number | null;
  dayData: DayData | null;
  checkInKind?: string;
  selected: boolean;
  isToday: boolean;
  onPress: (day: number) => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const dc = useDisplayCurrency();
  if (day === null) return <View style={styles.cellEmpty} />;

  const hasIncome = dayData && dayData.income > 0;
  const hasExpense = dayData && dayData.expense > 0;
  const net = dayData ? dayData.net : 0;
  const netPositive = net >= 0;
  const isNoSpendCheckIn = !hasIncome && !hasExpense && Boolean(checkInKind);

  return (
    <Pressable
      style={[
        styles.cell,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 },
        selected && { backgroundColor: theme.accent, borderColor: theme.accent },
        isToday && !selected && [styles.cellToday, { borderColor: theme.accent }],
        hasIncome && !hasExpense && [styles.cellIncomeOnly, { borderColor: theme.accentSoft }],
        hasExpense && !hasIncome && styles.cellExpenseOnly,
        isNoSpendCheckIn && !selected && { borderColor: theme.accentSoft, backgroundColor: colorTheme.surface },
      ]}
      onPress={() => onPress(day)}
      accessibilityRole="button"
      accessibilityLabel={`Day ${day}`}
    >
      <Text style={[styles.cellDay, { color: colorTheme.ink }, selected && styles.cellDaySelected]}>
        {day}
      </Text>
      {isNoSpendCheckIn && (
        <View style={{ alignItems: 'center', marginTop: 2 }}>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={selected ? '#fff' : theme.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <Path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </Svg>
          <Text
            numberOfLines={1}
            style={[styles.cellIncome, { color: selected ? '#fff' : theme.accent, fontSize: 8.5, marginTop: 1 }]}
          >
            0
          </Text>
        </View>
      )}
      {hasIncome && (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.cellIncome, { color: theme.accentInk }]}
        >
          {compactAmt(dayData!.income, dc.code)}
        </Text>
      )}
      {hasExpense && (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.cellExpense, { color: colorTheme.red }]}
        >
          {compactAmt(dayData!.expense, dc.code)}
        </Text>
      )}
      {(hasIncome || hasExpense) && (
        <View style={[styles.cellNet, { backgroundColor: netPositive ? theme.accentSoft : '#fce8e6' }]}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.cellNetText, { color: netPositive ? theme.accentInk : colorTheme.red }]}
          >
            {netPositive ? '+' : '−'}{compactAmt(Math.abs(net), dc.code)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function DayTransactionList({
  year, month, day, dayData,
}: {
  year: number; month: number; day: number; dayData: DayData | null;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh, tCat, t } = useLanguage();
  const { catById, checkIns } = useAppData();
  const dc = useDisplayCurrency();
  // e.g. "Tue, May 26"
  const d = new Date(year, month - 1, day);
  const weekdayIdx = (d.getDay() + 6) % 7; // Mon-first
  const dateLabel = isZh
    ? `${month}月${day}日 · ${FULL_WEEKDAY_ZH[weekdayIdx]}`
    : `${FULL_WEEKDAY_EN[weekdayIdx]}, ${MONTHS_SHORT_EN[month - 1]} ${day}`;

  const iso = toIsoDate(year, month, day);
  const checkInKind = checkIns ? checkIns[iso] : undefined;

  return (
    <View style={styles.daySection}>
      <Text style={[styles.daySectionTitle, { color: colorTheme.ink }]}>{dateLabel}</Text>
      {!dayData || dayData.txns.length === 0 ? (
        <View style={[styles.emptyDay, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
          {checkInKind ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                <Path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
              </Svg>
              <Text style={[styles.emptyDayText, { color: theme.accent, fontFamily: uiFont(600) }]}>
                {t('checkedInNoSpend')} · {compactAmt(0, dc.code)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.emptyDayText, { color: colorTheme.ink2 }]}>{isZh ? '暂无交易记录' : 'No transactions'}</Text>
          )}
        </View>
      ) : (
        <View style={[styles.txnList, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
          {dayData.txns.map((t) => (
            <View key={t.id} style={[styles.txnRow, { borderBottomColor: colorTheme.line2 }]}>
              <View style={styles.txnLeft}>
                <View
                  style={[
                    styles.txnDot,
                    { backgroundColor: t.type === 'income' ? theme.accent : t.type === 'transfer' ? colorTheme.ink3 : colorTheme.red },
                  ]}
                />
                <Text style={[styles.txnMerchant, { color: colorTheme.ink }]} numberOfLines={1}>
                  {t.merchantRaw ||
                    (t.categoryId ? tCat(catById[t.categoryId]) : null) ||
                    (t.type === 'income' ? (isZh ? '收入' : 'Income') : t.type === 'transfer' ? (isZh ? '转账' : 'Transfer') : (isZh ? '支出' : 'Expense'))}
                </Text>
              </View>
              <Text
                style={[
                  styles.txnAmount,
                  { color: t.type === 'income' ? theme.accentInk : t.type === 'transfer' ? colorTheme.ink2 : colorTheme.red },
                ]}
              >
                {t.type === 'income' ? '+' : t.type === 'transfer' ? '→' : '−'} {fmtMoney(t.nativeAmount ?? t.amount, t.currency)}
              </Text>
            </View>
          ))}
          {/* Net for the day */}
          <View style={[styles.dayNetRow, { backgroundColor: colorTheme.surface2 }]}>
            <Text style={[styles.dayNetLabel, { color: colorTheme.ink2 }]}>{isZh ? '结余' : 'Net'}</Text>
            <Text style={[styles.dayNetVal, { color: dayData.net >= 0 ? theme.accentInk : colorTheme.red }]}>
              {dayData.net >= 0 ? '+' : '−'} {fmtMoney(Math.abs(dayData.net), dc.code)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function CalendarScreen({
  onBack,
  initialMonth,
  onAdd,
  embedded,
}: {
  onBack: () => void;
  initialMonth?: string;
  onAdd: () => void;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const dc = useDisplayCurrency();
  const { formatMonthLabel, isZh } = useLanguage();
  const { transactions, checkIns } = useAppData();
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');

  // Initialise to the passed month or the current month
  const initYM = useMemo(() => {
    if (initialMonth) {
      const m = initialMonth.match(/^(\d{4})-(\d{2})$/);
      if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, [initialMonth]);

  const [ym, setYm] = useState(initYM);
  const today = new Date();

  const monthData = useMemo(
    () => computeMonthData(transactions, ym.year, ym.month, dc),
    [transactions, ym, dc]
  );
  const grid = useMemo(() => buildCalendarGrid(ym.year, ym.month), [ym]);

  const [selectedDay, setSelectedDay] = useState<number>(() => {
    // Default to today if in this month, else day 1
    if (today.getFullYear() === ym.year && today.getMonth() + 1 === ym.month) {
      return today.getDate();
    }
    return 1;
  });

  const selectedIso = toIsoDate(ym.year, ym.month, selectedDay);
  const selectedDayData = monthData.byDay[selectedIso] ?? null;

  const isCurrentMonth = today.getFullYear() === ym.year && today.getMonth() + 1 === ym.month;
  const todayIso = toIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const handleSelectFromYear = (year: number, month: number, day: number) => {
    setYm({ year, month });
    setSelectedDay(day);
    setViewMode('month');
  };

  const weekdayLabels = isZh ? WEEKDAY_LABELS_ZH : WEEKDAY_LABELS_EN;

  return (
    <View style={[styles.root, { paddingTop: embedded ? 0 : insets.top, backgroundColor: colorTheme.bg }]}>
      {/* ── Nav bar ── */}
      {!embedded && (
      <View style={styles.nav}>
        <Pressable onPress={onBack} style={[styles.navBtn, { backgroundColor: colorTheme.surface }]} accessibilityRole="button" accessibilityLabel="Back">
          <Svg width={10} height={17} viewBox="0 0 10 17" fill="none">
            <Path d="M8.5 1.5L1.5 8.5l7 7" stroke={colorTheme.ink2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Text style={[styles.navTitle, { color: colorTheme.ink }]}>{isZh ? '收支日历' : 'Cash Flow Calendar'}</Text>
        <Pressable
          onPress={() => setViewMode((v) => (v === 'month' ? 'year' : 'month'))}
          style={[styles.navBtn, { backgroundColor: colorTheme.surface }]}
          accessibilityRole="button"
          accessibilityLabel={viewMode === 'month' ? 'Switch to year view' : 'Switch to month view'}
        >
          {viewMode === 'month' ? (
            <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <Path d="M1 1H7V7H1V1Z" stroke={colorTheme.ink2} strokeWidth={1.4} strokeLinejoin="round" />
              <Path d="M9 1H15V7H9V1Z" stroke={colorTheme.ink2} strokeWidth={1.4} strokeLinejoin="round" />
              <Path d="M1 9H7V15H1V9Z" stroke={colorTheme.ink2} strokeWidth={1.4} strokeLinejoin="round" />
              <Path d="M9 9H15V15H9V9Z" stroke={colorTheme.ink2} strokeWidth={1.4} strokeLinejoin="round" />
            </Svg>
          ) : (
            <Svg width={15} height={16} viewBox="0 0 15 16" fill="none">
              <Path d="M1 3.5C1 2.67 1.67 2 2.5 2h10c.83 0 1.5.67 1.5 1.5v10c0 .83-.67 1.5-1.5 1.5h-10C1.67 15 1 14.33 1 13.5v-10Z" stroke={colorTheme.ink2} strokeWidth={1.4} />
              <Path d="M1 6h13M5 1v2M10 1v2" stroke={colorTheme.ink2} strokeWidth={1.4} strokeLinecap="round" />
            </Svg>
          )}
        </Pressable>
      </View>
      )}

      {viewMode === 'month' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
          {/* ── Month navigator ── */}
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => setYm((prev) => addMonths(prev, -1))}
              style={[styles.monthNavBtn, { backgroundColor: colorTheme.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
                <Path d="M7 1L1 7l6 6" stroke={colorTheme.ink2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
            <Text style={[styles.monthLabel, { color: colorTheme.ink }]}>{formatMonthLabel(monthKeyFrom(ym))}</Text>
            <Pressable
              onPress={() => setYm((prev) => addMonths(prev, 1))}
              style={[styles.monthNavBtn, { backgroundColor: colorTheme.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
                <Path d="M1 1l6 6-6 6" stroke={colorTheme.ink2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </View>

          {/* ── Summary cards ── */}
          <SummaryCards income={monthData.totalIncome} expense={monthData.totalExpense} />

          {/* ── Weekday header ── */}
          <View style={styles.weekdayHeader}>
            {weekdayLabels.map((w) => (
              <Text key={w} style={[styles.weekdayLabel, { color: colorTheme.ink2 }]}>{w}</Text>
            ))}
          </View>

          {/* ── Calendar grid ── */}
          <View style={styles.calGrid}>
            {grid.map((week, wi) => (
              <View key={wi} style={styles.calWeek}>
                {week.map((day, di) => {
                  const iso = day ? toIsoDate(ym.year, ym.month, day) : null;
                  const dayData = iso ? (monthData.byDay[iso] ?? null) : null;
                  const checkInKind = iso && checkIns ? checkIns[iso] : undefined;
                  const isTodayCell = isCurrentMonth && day === today.getDate();
                  return (
                    <DayCell
                      key={di}
                      day={day}
                      dayData={dayData}
                      checkInKind={checkInKind}
                      selected={day === selectedDay}
                      isToday={isTodayCell}
                      onPress={(d) => setSelectedDay(d)}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          {/* ── Selected day transactions ── */}
          <DayTransactionList
            year={ym.year}
            month={ym.month}
            day={selectedDay}
            dayData={selectedDayData}
          />
        </ScrollView>
      ) : (
        /* ── Infinite year scroll ── */
        <InfiniteYearScroll
          currentYear={ym.year}
          todayIso={todayIso}
          selectedIso={selectedIso}
          onSelectDay={handleSelectFromYear}
        />
      )}

      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 20, backgroundColor: theme.accent, ...platformShadow(theme.accent, 0.34, 14, { width: 0, height: 6 }, 6) },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add a transaction"
      >
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Line x1={12} y1={5} x2={12} y2={19} stroke={colors.onAccent} strokeWidth={2.4} strokeLinecap="round" />
          <Line x1={5} y1={12} x2={19} y2={12} stroke={colors.onAccent} strokeWidth={2.4} strokeLinecap="round" />
        </Svg>
      </Pressable>
    </View>
  );
}


// ── Styles ────────────────────────────────────────────────────────────────────

const CELL_INCOME_BG = '#e8f5ee';
const CELL_EXPENSE_BG = '#fce8e6';

const styles = StyleSheet.create({
  root: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // nav
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: uiFont(700),
    fontSize: 16,
  },
  // month navigator
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  monthLabel: {
    fontFamily: uiFont(700),
    fontSize: 15,
    minWidth: 130,
    textAlign: 'center',
  },

  // summary cards
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    ...shadowCard,
  },
  summaryCardIncome: { borderTopWidth: 3 },
  summaryCardExpense: { borderTopWidth: 3 },
  summaryDotRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  summaryDot: { width: 6, height: 6, borderRadius: 3 },
  summaryLabel: {
    fontFamily: uiFont(700),
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  summaryAmount: {
    fontFamily: numFont(700),
    fontSize: 16,
  },

  // weekday header
  weekdayHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: uiFont(700),
    fontSize: 11,
    letterSpacing: 0.6,
  },

  // calendar grid
  calGrid: { paddingHorizontal: 10, gap: 4 },
  calWeek: { flexDirection: 'row', gap: 4 },

  // cells
  cell: {
    flex: 1,
    minHeight: 62,
    borderRadius: 12,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 5,
    paddingHorizontal: 2,
    borderWidth: 1,
    gap: 1,
  },
  cellEmpty: { flex: 1, minHeight: 62 },
  cellIncomeOnly: { backgroundColor: CELL_INCOME_BG },
  cellExpenseOnly: { backgroundColor: CELL_EXPENSE_BG, borderColor: '#f5ceca' },
  cellToday: { borderWidth: 1.5 },
  cellDay: {
    fontFamily: uiFont(600),
    fontSize: 12,
    lineHeight: 16,
  },
  cellDaySelected: { color: '#fff', fontFamily: uiFont(700) },
  cellIncome: {
    fontFamily: numFont(600),
    fontSize: 11,
    lineHeight: 12,
  },
  cellExpense: {
    fontFamily: numFont(600),
    fontSize: 11,
    lineHeight: 12,
  },
  cellNet: {
    marginTop: 2,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
    maxWidth: '100%',
  },
  cellNetText: {
    fontFamily: numFont(700),
    fontSize: 11,
    lineHeight: 11,
  },

  // day section
  daySection: {
    marginTop: 18,
    marginHorizontal: 16,
  },
  daySectionTitle: {
    fontFamily: uiFont(700),
    fontSize: 14,
    marginBottom: 10,
  },
  emptyDay: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 28,
    alignItems: 'center',
    ...shadowCard,
  },
  emptyDayText: {
    fontFamily: uiFont(500),
    fontSize: 13.5,
  },
  txnList: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadowCard,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  txnLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  txnDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  txnMerchant: {
    fontFamily: uiFont(500),
    fontSize: 13,
    flex: 1,
  },
  txnAmount: {
    fontFamily: numFont(700),
    fontSize: 13,
    marginLeft: 10,
  },
  dayNetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dayNetLabel: {
    fontFamily: uiFont(700),
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  dayNetVal: {
    fontFamily: numFont(700),
    fontSize: 14,
  },


  // ── Infinite year scroll ──
  infiniteScrollContent: {
    paddingBottom: 40,
  },
  yearBlock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  yearBlockTitle: {
    fontFamily: uiFont(700),
    fontSize: 36,
    letterSpacing: -0.5,
    marginTop: 8,
  },
  yearProgressWrap: {
    marginBottom: spacing.sm,
  },
  yearBlockGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  yearBlockItem: {
    width: '33.33%',
    paddingHorizontal: 4,
    paddingBottom: 20,
  },

  // ── Mini month (year view) ──
  miniMonth: {
    paddingHorizontal: 2,
  },
  miniMonthTitle: {
    fontFamily: uiFont(700),
    fontSize: 14,
    marginBottom: 6,
    textAlign: 'left',
  },
  miniWeekdayRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  miniWeekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: uiFont(600),
    fontSize: 9,
  },
  miniWeekRow: {
    flexDirection: 'row',
  },
  miniCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCellDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCellText: {
    fontFamily: numFont(500),
    fontSize: 10.5,
  },
  miniCellTextDim: {
    opacity: 0.35,
  },
  miniCellTextSelected: {
    color: '#fff',
    fontFamily: numFont(700),
  },
});
