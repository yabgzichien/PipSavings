import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditTransactionModal } from '../components/EditTransactionModal';
import { TripPickerModal } from '../components/TripPickerModal';
import { Icon } from '../components/Icon';
import { TransactionFilterModal } from '../components/TransactionFilterModal';
import { Amount, Card, CatBadge, IconButton, TopBar } from '../components/ui';
import { BrandBadge } from '../components/BrandBadge';
import { matchBrand } from '../components/BrandLogo';
import { txnMonthKey } from '../lib/budget';
import { isValidIsoDate, monthLabel, shortDate } from '../lib/dates';
import { fmtMoney } from '../lib/format';
import { confirmAction } from '../lib/platformAlert';
import { sheetOpenFromModalState, useReportSheetOpen } from '../lib/askPip/sheetOpen';
import { outstanding } from '../lib/split';
import { expenseIdsFromSelection, reassignedFromOtherTrips, type Trip } from '../lib/trips';
import type { Category, Transaction } from '../lib/types';
import type { AccentTheme } from '../state/accent';
import { useAccent, useSignedUp } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency, type DisplayCurrency } from '../state/useDisplayCurrency';
import { useLanguage } from '../i18n';
import { useAppData } from '../state/store';
import { radius, shadowCard, shadowToggle, uiFont, type StructuralColors } from '../theme';
import { TripGlyph } from '../components/TripBadge';

/** The date used to sort/bucket a transaction: its own date, else when it was logged. */
function txnDateOnly(t: Transaction): string {
  return (t.date ?? t.createdAt).slice(0, 10);
}

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null };

/** How long typing has to pause before the whole ledger is re-filtered. Long enough that a
 *  normal typing cadence runs the filter once instead of once per letter, short enough that
 *  the list still feels like it is answering the keystroke. */
const SEARCH_DEBOUNCE_MS = 180;

interface Section {
  key: string;
  label: string;
  data: Transaction[];
}

interface OwedInfo {
  owed: number;
  gross: number;
}

export type TxnTypeFilter = 'all' | 'expense' | 'income';

/**
 * One ledger row. Split out and memoised because the list is virtualised now: re-rendering the
 * handful of on-screen rows on every keystroke is the whole point of windowing, and an inline
 * arrow function per row would defeat it.
 *
 * The card chrome (surface, side borders, rounded first/last corners) lives on the row rather
 * than on a wrapping `Card`, since a virtualised list has nowhere to hang a wrapper. The rows
 * are opaque and flush, so the group still reads as a single card.
 */
/** One ledger row, shared with TripDetailScreen so a trip's transaction list looks and behaves
 *  exactly like the main ledger's — same brand-logo/category-badge fallback, same "owed" chip,
 *  same tap-to-edit affordance. */
export const TxnRow = React.memo(function TxnRow({
  dc,
  txn,
  cat,
  owed,
  trip,
  onOpenTrip,
  first,
  last,
  selectMode,
  isSel,
  theme,
  colorTheme,
  onPress,
  onLongPress,
}: {
  txn: Transaction;
  cat: Category;
  owed: OwedInfo | undefined;
  trip?: Trip | null;
  onOpenTrip?: (tripId: string) => void;
  dc: DisplayCurrency;
  first: boolean;
  last: boolean;
  selectMode: boolean;
  isSel: boolean;
  theme: AccentTheme;
  colorTheme: StructuralColors;
  onPress: (t: Transaction) => void;
  onLongPress: (id: string) => void;
}) {
  const { t, tCat, formatShortDate, isZh } = useLanguage();
  const signedUp = useSignedUp();
  const income = txn.type === 'income';
  const transfer = txn.type === 'transfer';
  const catLabel = tCat(cat);
  const description = txn.remark?.trim() || (txn.merchantRaw && txn.merchantRaw !== cat.label ? txn.merchantRaw : '');
  const brand = matchBrand(txn.merchantRaw) || matchBrand(txn.remark);
  return (
    <Pressable
      onPress={() => onPress(txn)}
      onLongPress={() => onLongPress(txn.id)}
      delayLongPress={250}
      style={({ pressed }) => [
        styles.row,
        styles.rowChrome,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 },
        first && styles.rowFirst,
        last && styles.rowLast,
        !first && styles.divider,
        (pressed || isSel) && { backgroundColor: colorTheme.surface2 },
      ]}
    >
      {selectMode && (
        <View style={[styles.checkbox, { borderColor: colorTheme.line }, isSel && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
          {isSel && <Icon name="check" size={13} color={theme.onAccent} stroke={2.6} />}
        </View>
      )}
      {brand ? (
        <BrandBadge brand={brand} size={40} rad={11} />
      ) : (
        <CatBadge category={cat} size={40} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.merchant, { color: colorTheme.ink }]} numberOfLines={1}>
          {transfer ? (isZh ? '转账' : 'Transfer') : catLabel}
        </Text>
        <Text style={[styles.sub, { color: colorTheme.ink2 }]} numberOfLines={1}>
          {description ? `${description} · ` : ''}
          {formatShortDate(txn.date ?? txn.createdAt)}
        </Text>
        {(trip || owed) && (
          <View style={styles.chipRow}>
            {trip && (
              <Pressable
                disabled={!onOpenTrip || selectMode}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onOpenTrip?.(trip.id);
                }}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.tripChip,
                  { backgroundColor: theme.accentTint },
                  pressed && onOpenTrip && !selectMode && { opacity: 0.7 },
                ]}
                accessibilityRole={onOpenTrip && !selectMode ? 'button' : undefined}
                accessibilityLabel={`${t('tripsTitle')}: ${trip.name}`}
              >
                <TripGlyph trip={trip} size={11} color={theme.accentInk} />
                <Text style={[styles.tripChipText, { color: theme.onTint }]} numberOfLines={1}>
                  {trip.name}
                </Text>
              </Pressable>
            )}
            {/* A split row shows only the payer's share, which reads as a suspiciously
                cheap dinner without this. */}
            {owed && (
              <View style={[styles.owedChip, { backgroundColor: theme.accentTint }]}>
                <Icon name="gift" size={10} color={theme.accentInk} />
                <Text style={[styles.owedChipText, { color: theme.onTint }]}>
                  {isZh
                    ? `待收 ${fmtMoney(dc.convert(owed.owed), dc.code)} · 共 ${fmtMoney(dc.convert(owed.gross), dc.code)}`
                    : `${fmtMoney(dc.convert(owed.owed), dc.code)} owed · split of ${fmtMoney(dc.convert(owed.gross), dc.code)}`}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      <Amount value={txn.nativeAmount ?? txn.amount} currency={txn.currency} size={15} weight={600} color={income ? signedUp : transfer ? colorTheme.ink2 : colorTheme.ink} />
      {!selectMode && <Icon name="pencil" size={15} color={colorTheme.ink3} />}
    </Pressable>
  );
});

export function AllTransactionsScreen({
  onBack,
  filterCategoryId,
  onClearFilter,
  onOpenOwed,
  onOpenTrips,
  onOpenTrip,
  embedded,
  onSheetOpenChange,
  initialQuery = '',
  initialType = 'all',
  initialMonths = [],
  initialDateFrom = '',
  initialDateTo = '',
}: {
  onBack: () => void;
  filterCategoryId?: string | null;
  onClearFilter: () => void;
  onOpenOwed: () => void;
  /** Opens the Trips list. Trips has no bottom-nav tab of its own — this compact header chip
   *  is its only entry point from Activity. */
  onOpenTrips: () => void;
  /** Opens the detail view for a specific trip directly. */
  onOpenTrip?: (tripId: string) => void;
  embedded?: boolean;
  onSheetOpenChange?: (open: boolean) => void;
  initialQuery?: string;
  initialType?: TxnTypeFilter;
  initialMonths?: string[];
  initialDateFrom?: string;
  initialDateTo?: string;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, tCat, formatMonthLabel, isZh } = useLanguage();
  const { transactions, categories, catById, removeMany, setTransactionsTrip, splits, shares, openShares, trips } = useAppData();

  const tripById = useMemo(() => {
    const map = new Map<string, Trip>();
    for (const t of trips) map.set(t.id, t);
    return map;
  }, [trips]);

  // `search` is what the box shows and must update on the keystroke; `query` is what the
  // ledger is filtered against and lags it by a beat. Filtering thousands of rows on every
  // letter is what made the keyboard feel like it was catching up.
  const [search, setSearch] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => {
    if (search === query) return;
    const id = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, query]);

  const [monthFilter, setMonthFilter] = useState<Set<string>>(new Set(initialMonths));
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [filterOpen, setFilterOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TxnTypeFilter>(initialType);

  /** txnId -> what is still owed on that bill, so a small row can explain itself. */
  const owedByTxn = useMemo(() => {
    const openBySplit: Record<string, number> = {};
    for (const s of shares) {
      if (s.status !== 'open') continue;
      openBySplit[s.splitId] = (openBySplit[s.splitId] ?? 0) + outstanding(s);
    }
    const map: Record<string, { owed: number; gross: number }> = {};
    for (const split of splits) {
      const owed = openBySplit[split.id] ?? 0;
      if (owed > 0) map[split.txnId] = { owed, gross: split.gross };
    }
    return map;
  }, [splits, shares]);

  const owedTotal = useMemo(() => openShares.reduce((s, x) => s + x.outstanding, 0), [openShares]);

  const [editing, setEditing] = useState<Transaction | null>(null);
  useReportSheetOpen(sheetOpenFromModalState(null, editing), onSheetOpenChange);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const selectedExpenseIds = useMemo(
    () => expenseIdsFromSelection(transactions, selected),
    [transactions, selected]
  );

  const filtered = !!filterCategoryId;
  const filterCat = filterCategoryId ? catById[filterCategoryId] ?? fallback : null;

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const mk = txnMonthKey(t);
      if (mk) set.add(mk);
    }
    return [...set].sort().reverse();
  }, [transactions]);

  const validFrom = isValidIsoDate(dateFrom) ? dateFrom : null;
  const validTo = isValidIsoDate(dateTo) ? dateTo : null;
  const advancedActive = monthFilter.size > 0 || catFilter.size > 0 || !!validFrom || !!validTo;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasMonthFilter = monthFilter.size > 0;
    const hasCatFilter = catFilter.size > 0;

    return transactions.filter((t) => {
      if (typeFilter === 'expense' && t.type !== 'expense') return false;
      if (typeFilter === 'income' && t.type !== 'income') return false;
      if (filtered && (t.categoryId ?? 'other') !== filterCategoryId) return false;
      if (hasMonthFilter) {
        const mk = txnMonthKey(t);
        if (!mk || !monthFilter.has(mk)) return false;
      }
      if (hasCatFilter && !catFilter.has(t.categoryId ?? 'other')) return false;
      if (validFrom || validTo) {
        const d = txnDateOnly(t);
        if (validFrom && d < validFrom) return false;
        if (validTo && d > validTo) return false;
      }
      if (q) {
        const cat = catById[t.categoryId ?? 'other'] ?? fallback;
        const trip = t.tripId ? tripById.get(t.tripId) : null;
        const matches =
          (t.merchantRaw ?? '').toLowerCase().includes(q) ||
          (t.remark ?? '').toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q) ||
          (trip?.name ?? '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, filterCategoryId, filtered, monthFilter, catFilter, validFrom, validTo, query, catById, tripById]);

  /** `shown`, sorted newest-first and bucketed into month sections for the sectioned list. */
  const sections = useMemo<Section[]>(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of shown) {
      const mk = txnMonthKey(t) ?? '';
      let arr = groups.get(mk);
      if (!arr) {
        arr = [];
        groups.set(mk, arr);
      }
      arr.push(t);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        const dateA = a.date ?? a.createdAt;
        const dateB = b.date ?? b.createdAt;
        if (dateB !== dateA) return dateB > dateA ? 1 : -1;
        return b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0;
      });
    }
    const keys = [...groups.keys()].sort((a, b) => (a && b ? (b > a ? 1 : b < a ? -1 : 0) : a ? -1 : 1));
    // `key` is the section's React key, so the undated bucket needs a real one, not ''.
    return keys.map((k) => ({ key: k || 'no-date', label: k ? formatMonthLabel(k, true) : (isZh ? '无日期' : 'No date'), data: groups.get(k)! }));
  }, [shown, formatMonthLabel, isZh]);

  const INITIAL_VISIBLE_SECTIONS = 6;
  const [visibleSectionCount, setVisibleSectionCount] = useState(INITIAL_VISIBLE_SECTIONS);

  useEffect(() => {
    setVisibleSectionCount(INITIAL_VISIBLE_SECTIONS);
  }, [shown]);

  const displayedSections = useMemo(() => {
    if (sections.length <= visibleSectionCount) return sections;
    return sections.slice(0, visibleSectionCount);
  }, [sections, visibleSectionCount]);

  const handleEndReached = useCallback(() => {
    setVisibleSectionCount((prev) => (prev < sections.length ? prev + 6 : prev));
  }, [sections.length]);

  const toggleMonth = (m: string) =>
    setMonthFilter((prev) => { const next = new Set(prev); next.has(m) ? next.delete(m) : next.add(m); return next; });
  const toggleCat = (id: string) =>
    setCatFilter((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const clearAdvancedFilters = () => {
    setMonthFilter(new Set());
    setCatFilter(new Set());
    setDateFrom('');
    setDateTo('');
  };

  const dc = useDisplayCurrency();
  const filterTotal = useMemo(
    () => shown.reduce((s, t) => s + dc.convertTxn(t), 0),
    [shown, dc]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const cancelSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const deleteSelected = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    confirmAction(
      t('delete'),
      isZh ? `确定删除选中的 ${ids.length} 笔交易吗？此操作无法撤销。` : `Remove ${ids.length} transaction${ids.length === 1 ? '' : 's'}? This can’t be undone.`,
      t('delete'),
      async () => {
        await removeMany(ids);
        cancelSelect();
      }
    );
  };
  const attachSelectedToTrip = async (tripId: string | null) => {
    const ids = selectedExpenseIds;
    if (ids.length === 0) return;
    const apply = async () => {
      await setTransactionsTrip(ids, tripId);
      setTripPickerOpen(false);
      cancelSelect();
    };
    // Same rule as the trip screen's own picker: taking rows out of a trip they already belong
    // to is allowed, but never silent. Clearing the trip (null) takes nothing from anyone else.
    const tripName = tripId ? trips.find((trip) => trip.id === tripId)?.name ?? '' : '';
    const reassignCount = tripId ? reassignedFromOtherTrips(transactions, ids, tripId) : 0;
    if (reassignCount === 0) {
      await apply();
      return;
    }
    confirmAction(
      t('moveToTripConfirmTitle', { trip: tripName }),
      t('moveToTripConfirmBody', { n: reassignCount, trip: tripName }),
      t('moveToTripConfirmAction'),
      apply
    );
  };
  // Stable across renders so `TxnRow`'s memo actually holds while the user types or scrolls.
  const onRowPress = useCallback(
    (t: Transaction) => {
      if (selectMode) toggleSelect(t.id);
      else setEditing(t);
    },
    [selectMode]
  );
  const onRowLongPress = useCallback((id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  }, []);

  const keyExtractor = useCallback((t: Transaction) => t.id, []);
  const renderItem = useCallback(
    ({ item, index, section }: { item: Transaction; index: number; section: Section }) => (
      <TxnRow
        txn={item}
        cat={catById[item.categoryId ?? 'other'] ?? fallback}
        owed={owedByTxn[item.id]}
        trip={item.tripId ? tripById.get(item.tripId) ?? null : null}
        onOpenTrip={onOpenTrip}
        dc={dc}
        first={index === 0}
        last={index === section.data.length - 1}
        selectMode={selectMode}
        isSel={selected.has(item.id)}
        theme={theme}
        colorTheme={colorTheme}
        onPress={onRowPress}
        onLongPress={onRowLongPress}
      />
    ),
    [catById, owedByTxn, tripById, onOpenTrip, dc.code, dc.rates, selectMode, selected, theme, colorTheme, onRowPress, onRowLongPress] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <Text style={[styles.monthHeader, { color: colorTheme.ink2 }]}>{section.label}</Text>
    ),
    [colorTheme]
  );
  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  const listHeader = (
    <>
      {advancedActive && !selectMode && (
        <Pressable onPress={clearAdvancedFilters} style={[styles.filterChip, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <Icon name="filter" size={16} color={colorTheme.ink2} />
          <Text style={[styles.filterText, { color: colorTheme.ink }]}>
            {[
              monthFilter.size > 0 ? (isZh ? `${monthFilter.size} 个月份` : `${monthFilter.size} month${monthFilter.size === 1 ? '' : 's'}`) : null,
              catFilter.size > 0 ? (isZh ? `${catFilter.size} 个分类` : `${catFilter.size} categor${catFilter.size === 1 ? 'y' : 'ies'}`) : null,
              validFrom || validTo ? (isZh ? '日期范围' : 'date range') : null,
              query.trim() ? `“${query.trim()}”` : null,
            ]
              .filter(Boolean)
              .join(' · ')} · {fmtMoney(filterTotal, dc.code)}
          </Text>
          <View style={[styles.clearPill, { backgroundColor: colorTheme.surface2 }]}>
            <Icon name="x" size={12} color={colorTheme.ink2} />
            <Text style={[styles.clearText, { color: colorTheme.ink2 }]}>{t('clear')}</Text>
          </View>
        </Pressable>
      )}

      {filtered && !selectMode && (
        <Pressable onPress={onClearFilter} style={[styles.filterChip, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {filterCat && <CatBadge category={filterCat} size={28} rad={8} />}
          <Text style={[styles.filterText, { color: colorTheme.ink }]}>
            {shown.length} {filterCat ? tCat(filterCat) : ''} · {fmtMoney(filterTotal, dc.code)}
          </Text>
          <View style={[styles.clearPill, { backgroundColor: colorTheme.surface2 }]}>
            <Icon name="x" size={12} color={colorTheme.ink2} />
            <Text style={[styles.clearText, { color: colorTheme.ink2 }]}>{t('clear')}</Text>
          </View>
        </Pressable>
      )}

      {!selectMode && (
        <View style={[styles.typeFilterTabs, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
          {(['all', 'expense', 'income'] as const).map((filter) => {
            const active = typeFilter === filter;
            const label =
              filter === 'all'
                ? (isZh ? '全部' : 'All')
                : filter === 'expense'
                ? (isZh ? '支出' : 'Expenses')
                : (isZh ? '收入' : 'Income');
            return (
              <Pressable
                key={filter}
                onPress={() => setTypeFilter(filter)}
                style={[
                  styles.typeFilterTab,
                  active && [styles.typeFilterTabActive, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }],
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text
                  style={[
                    styles.typeFilterTabText,
                    { color: colorTheme.ink2 },
                    active && [styles.typeFilterTabTextActive, { color: colorTheme.ink }],
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {shown.length > 0 && (
        <>
          {owedTotal > 0 && !selectMode && (
            <Pressable onPress={onOpenOwed} style={[styles.owedBanner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Icon name="gift" size={18} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.owedTitle, { color: colorTheme.ink }]}>
                  {isZh
                    ? `待收回 ${fmtMoney(dc.convert(owedTotal), dc.code)}`
                    : `${fmtMoney(dc.convert(owedTotal), dc.code)} owed to you`}
                </Text>
                <Text style={[styles.owedSub, { color: colorTheme.ink2 }]}>
                  {isZh ? `来自 ${openShares.length} 笔分摊账单` : `From ${openShares.length} shared ${openShares.length === 1 ? 'bill' : 'bills'}`}
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
            </Pressable>
          )}

          <Text style={[styles.countLine, { color: colorTheme.ink2 }]}>
            {selectMode
              ? (isZh ? '点击以选择' : 'Tap to select')
              : (isZh ? `共 ${shown.length} 条记录 · 点击编辑，长按多选` : `${shown.length} record${shown.length === 1 ? '' : 's'} · tap to edit, long-press to select`)}
          </Text>
        </>
      )}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: embedded ? 0 : insets.top + 4 }}>
        {selectMode ? (
          <View style={styles.selectBar}>
            <IconButton name="x" onPress={cancelSelect} size={19} />
            <Text style={[styles.selectTitle, { color: colorTheme.ink }]}>
              {isZh ? `已选择 ${selected.size} 项` : `${selected.size} selected`}
            </Text>
            <Pressable onPress={() => setTripPickerOpen(true)} hitSlop={8} style={styles.tripAction} disabled={selectedExpenseIds.length === 0} accessibilityRole="button" accessibilityLabel={t('addToTrip')}>
              <Icon name="pin" size={19} color={selectedExpenseIds.length === 0 ? colorTheme.ink3 : theme.accent} />
            </Pressable>
            <Pressable onPress={deleteSelected} hitSlop={8} style={styles.delAction} disabled={selected.size === 0}>
              <Icon name="trash" size={20} color={selected.size === 0 ? colorTheme.ink3 : '#b3261e'} />
            </Pressable>
          </View>
        ) : (
          !embedded && (
          <TopBar
            title={filtered ? (filterCat ? tCat(filterCat) : (isZh ? '已筛选' : 'Filtered')) : t('allTransactionsTitle')}
            onBack={onBack}
            right={
              <View style={styles.headerActions}>
                <Pressable
                  onPress={onOpenTrips}
                  style={({ pressed }) => [styles.tripsChip, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, pressed && { backgroundColor: colorTheme.surface2 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('tripsTitle')}
                >
                  <Icon name="pin" size={15} color={colorTheme.ink2} />
                  <Text style={[styles.tripsChipText, { color: colorTheme.ink }]}>{t('tripsTitle')}</Text>
                </Pressable>
                <View>
                  <IconButton name="filter" onPress={() => setFilterOpen(true)} size={18} accessibilityLabel="Filter transactions" />
                  {advancedActive && <View style={[styles.filterDot, { backgroundColor: theme.accent, borderColor: colorTheme.bg }]} />}
                </View>
              </View>
            }
          />
          )
        )}
      </View>

      {!selectMode && (
        <View style={[styles.searchRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, marginHorizontal: 18 }]}>
          <Icon name="search" size={16} color={colorTheme.ink3} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchTransactionsPlaceholder')}
            placeholderTextColor={colorTheme.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colorTheme.ink }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Icon name="x" size={15} color={colorTheme.ink3} />
            </Pressable>
          )}
        </View>
      )}

      {/* Windowed, so opening this screen with two years of imported history mounts the rows
          you can see rather than all of them. */}
      <SectionList
        sections={displayedSections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <Card style={{ padding: 26, alignItems: 'center' }}>
            <Text style={[styles.emptyTitle, { color: colorTheme.ink }]}>
              {filtered || advancedActive || query.trim() || typeFilter !== 'all' ? (isZh ? '没有匹配的交易' : 'No matching transactions') : (isZh ? '暂无交易记录' : 'No transactions yet')}
            </Text>
            <Text style={[styles.emptySub, { color: colorTheme.ink2 }]}>
              {filtered || advancedActive || query.trim() || typeFilter !== 'all' ? (isZh ? '尝试清除筛选条件或搜索词。' : 'Try clearing a filter or the search.') : (isZh ? '点击“记账”开始添加收支。' : 'Tap Add to scan a receipt or a statement.')}
            </Text>
          </Card>
        }
        extraData={selected}
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
      />

      <EditTransactionModal txn={editing} onClose={() => setEditing(null)} />
      <TripPickerModal
        visible={tripPickerOpen}
        onClose={() => setTripPickerOpen(false)}
        onSelect={(tripId) => { void attachSelectedToTrip(tripId); }}
      />
      <TransactionFilterModal
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        months={availableMonths}
        categories={categories}
        selectedMonths={monthFilter}
        selectedCategories={catFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onToggleMonth={toggleMonth}
        onToggleCategory={toggleCat}
        onChangeDateFrom={setDateFrom}
        onChangeDateTo={setDateTo}
        onClear={clearAdvancedFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  selectBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 6 },
  selectTitle: { flex: 1, fontFamily: uiFont(700), fontSize: 18 },
  delAction: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tripAction: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripsChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  tripsChipText: { fontFamily: uiFont(700), fontSize: 13 },
  filterDot: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 999, borderWidth: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 13, marginTop: 10 },
  searchInput: { flex: 1, fontFamily: uiFont(600), fontSize: 14, paddingVertical: 11 },
  sectionGap: { height: 16 },
  monthHeader: { fontFamily: uiFont(700), fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginLeft: 2 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  filterText: { flex: 1, fontFamily: uiFont(600), fontSize: 13.5 },
  clearPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  clearText: { fontFamily: uiFont(600), fontSize: 12 },
  typeFilterTabs: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 3,
    marginBottom: 14,
  },
  typeFilterTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeFilterTabActive: {
    ...shadowToggle,
  },
  typeFilterTabText: {
    fontFamily: uiFont(600),
    fontSize: 13.5,
  },
  typeFilterTabTextActive: {
    fontFamily: uiFont(700),
  },
  countLine: { fontFamily: uiFont(500), fontSize: 12.5, marginBottom: 10, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 },
  // The `Card` that used to wrap each month's rows, redrawn per row so the list can window.
  // Every row carries the shadow: they are opaque and flush, so each one covers the one above
  // it and only the group's outer edge is left casting.
  rowChrome: { borderLeftWidth: 1, borderRightWidth: 1, ...shadowCard },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  divider: { borderTopWidth: 1 },
  merchant: { fontFamily: uiFont(600), fontSize: 14.5 },
  sub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 1 },
  owedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  owedTitle: { fontFamily: uiFont(700), fontSize: 14 },
  owedSub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 1 },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  tripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: 160,
  },
  tripChipText: { fontFamily: uiFont(600), fontSize: 10.5, flexShrink: 1 },
  owedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  owedChipText: { fontFamily: uiFont(600), fontSize: 10.5 },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17 },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, marginTop: 6, textAlign: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
