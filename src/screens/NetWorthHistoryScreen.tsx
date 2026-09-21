// src/screens/NetWorthHistoryScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { NetWorthHistoryChart } from '../components/NetWorthHistoryChart';
import { ProBadge } from '../components/ProUi';
import { Amount, Body, Caption, Card, Label, Title, TopBar } from '../components/ui';
import { listFxRates } from '../db/fxRepo';
import { ratesFromCache } from '../lib/fx';
import { fmtMoney } from '../lib/format';
import {
  chartDataSparsity,
  demoNetWorthSeries,
  shiftWindowEnd,
  sliceSeriesWindow,
  type HistoryRange,
} from '../lib/netWorthChart';
import { classValuesAsOf, monthsWithData, netWorthSeries, type NetWorthPoint } from '../lib/networth';
import { rankClassMovers, type ClassMover } from '../lib/netWorthPresentation';
import { useAccent, useSignedUp } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useLanguage } from '../i18n';
import { useAppData } from '../state/store';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { radius, spacing, type as typeScale, uiFont } from '../theme';

interface Row extends NetWorthPoint {
  delta: number | null;
}

const RANGE_OPTIONS: HistoryRange[] = ['3m', '12m', 'all'];

function formatClassLabel(cls: string, isZh: boolean, fallbackLabel: string): string {
  if (!isZh) return fallbackLabel;
  switch (cls) {
    case 'cash': return '现金与银行';
    case 'investments': return '投资资产';
    case 'illiquid': return '非流动资产';
    case 'receivable': return '别人欠我';
    case 'mortgage': return '房贷';
    case 'personal': return '个人贷款';
    case 'credit_card': return '信用卡';
    case 'pay_later': return '先买后付';
    case 'car': return '车贷';
    default: return fallbackLabel;
  }
}

export function NetWorthHistoryScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const signedUp = useSignedUp();
  const colorTheme = useThemeColors();
  const { t, formatMonthLabel, isZh } = useLanguage();
  const { accounts, balanceEntries } = useAppData();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();
  const dc = useDisplayCurrency();
  const [search, setSearch] = useState('');
  const [rates, setRates] = useState<Record<string, number>>({});
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [range, setRange] = useState<HistoryRange>('12m');
  const [windowEnd, setWindowEnd] = useState<string | null>(null);

  useEffect(() => {
    listFxRates().then((fx) => setRates(ratesFromCache(fx)));
  }, []);

  const monthKeys = useMemo(() => monthsWithData(balanceEntries), [balanceEntries]);
  const realSeries = useMemo(
    () => netWorthSeries(accounts, balanceEntries, monthKeys, rates),
    [accounts, balanceEntries, monthKeys, rates]
  );
  const demoSeries = useMemo(() => demoNetWorthSeries(new Date()), []);

  // Free users (and Pro users with nothing recorded yet) scrub the demo; Pro with data sees theirs.
  const showingDemo = !isPro || realSeries.length === 0;
  const fullSeries = showingDemo ? demoSeries : realSeries;
  const fullKeys = useMemo(() => fullSeries.map((p) => p.monthKey), [fullSeries]);

  // Keep windowEnd on the newest month until the user shifts it.
  useEffect(() => {
    if (fullKeys.length === 0) {
      setWindowEnd(null);
      return;
    }
    setWindowEnd((prev) => (prev && fullKeys.includes(prev) ? prev : fullKeys[fullKeys.length - 1]));
  }, [fullKeys]);

  const chartSeries = useMemo(
    () => sliceSeriesWindow(fullSeries, range, range === 'all' ? null : windowEnd),
    [fullSeries, range, windowEnd]
  );

  const sparsity = useMemo(
    () => chartDataSparsity(showingDemo ? [] : realSeries),
    [showingDemo, realSeries]
  );
  // Nudge only for Pro users looking at their own thin history — the demo is already rich.
  const showSparseNudge = !showingDemo && sparsity.kind !== 'ok';
  // A single month is a point, not a chart — hide the plot until there's a second reading.
  const showChart = showingDemo || sparsity.kind !== 'empty';

  const formatAxisLabel = useCallback(
    (monthKey: string) => formatMonthLabel(monthKey, false),
    [formatMonthLabel]
  );

  const onSelectIndex = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  useEffect(() => {
    if (chartSeries.length > 0) setSelectedIndex(chartSeries.length - 1);
    else setSelectedIndex(-1);
  }, [showingDemo, range, windowEnd, chartSeries.length]);

  const selected = chartSeries[selectedIndex] ?? null;
  const prevPoint = selectedIndex > 0 ? chartSeries[selectedIndex - 1] : null;
  const selectedDelta = selected && prevPoint ? selected.net - prevPoint.net : null;

  const movers: ClassMover[] = useMemo(() => {
    if (showingDemo || !selected || !prevPoint) return [];
    const asActive = accounts.map((a) => (a.archived ? { ...a, archived: false } : a));
    const current = classValuesAsOf(accounts, balanceEntries, selected.monthKey, rates);
    const previous = classValuesAsOf(accounts, balanceEntries, prevPoint.monthKey, rates);
    return rankClassMovers(asActive, current, previous).slice(0, 4);
  }, [showingDemo, selected, prevPoint, accounts, balanceEntries, rates]);

  const requestPro = useCallback(() => {
    openPaywall('networth_history', 'networth');
  }, [openPaywall]);

  const rangeLabel = useCallback(
    (r: HistoryRange) => {
      switch (r) {
        case '3m': return t('historyRange3m');
        case '12m': return t('historyRange12m');
        case 'all': return t('historyRangeAll');
      }
    },
    [t]
  );

  const canShiftEarlier =
    range !== 'all' && windowEnd != null && fullKeys.length > 0 && windowEnd !== fullKeys[0];
  const canShiftLater =
    range !== 'all' &&
    windowEnd != null &&
    fullKeys.length > 0 &&
    windowEnd !== fullKeys[fullKeys.length - 1];

  const windowCaption = useMemo(() => {
    if (chartSeries.length === 0) return '';
    if (chartSeries.length === 1) return formatMonthLabel(chartSeries[0].monthKey, true);
    const first = formatMonthLabel(chartSeries[0].monthKey, true);
    const last = formatMonthLabel(chartSeries[chartSeries.length - 1].monthKey, true);
    return `${first} – ${last}`;
  }, [chartSeries, formatMonthLabel]);

  // Newest first for the list.
  const rows: Row[] = useMemo(
    () => realSeries.map((p, i) => ({ ...p, delta: i > 0 ? p.net - realSeries[i - 1].net : null })).reverse(),
    [realSeries]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => formatMonthLabel(r.monthKey, true).toLowerCase().includes(q));
  }, [rows, search, formatMonthLabel]);

  const sections = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of shown) {
      const year = r.monthKey.slice(0, 4);
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(r);
    }
    return [...groups.entries()].map(([year, items]) => ({ year, items }));
  }, [shown]);

  const searching = search.trim().length > 0;
  const displayNet = selected ? dc.convert(selected.net) : 0;
  const displayDelta = selectedDelta != null ? dc.convert(selectedDelta) : null;
  const monthsLabel =
    rows.length === 1
      ? t('historyMonthSingular')
      : t('historyMonthPlural', { count: rows.length });

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + spacing.xs }}>
        <TopBar title={t('historyTitle')} onBack={onBack} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {showingDemo && (
          <View style={[styles.demoBanner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Label weight={700} color={theme.onTint}>
                {t('historyDemoBanner')}
              </Label>
              <Caption color={colorTheme.ink2}>{t('historyDemoBody')}</Caption>
            </View>
            {!isPro && <ProBadge locked />}
          </View>
        )}

        {showSparseNudge && (
          <View style={[styles.sparseBanner, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
            <Icon name="clock" size={20} color={theme.accent} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Label weight={700} color={colorTheme.ink}>
                {sparsity.kind === 'empty' ? t('historyEmptyTitle') : t('historySparseTitle')}
              </Label>
              <Caption color={colorTheme.ink2}>
                {sparsity.kind === 'empty' ? t('historyEmptyBody') : t('historySparseBody')}
              </Caption>
            </View>
          </View>
        )}

        {showChart && (
          <>
            <View style={styles.rangeRow}>
              {RANGE_OPTIONS.map((r) => {
                const on = range === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => {
                      setRange(r);
                      if (r !== 'all' && fullKeys.length > 0) {
                        setWindowEnd(fullKeys[fullKeys.length - 1]);
                      }
                    }}
                    style={[
                      styles.rangeChip,
                      {
                        backgroundColor: on ? theme.accent : colorTheme.surface2,
                        borderColor: on ? theme.accent : colorTheme.line,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={rangeLabel(r)}
                  >
                    <Label weight={700} color={on ? theme.onAccent : colorTheme.ink2}>
                      {rangeLabel(r)}
                    </Label>
                  </Pressable>
                );
              })}
            </View>

            {range !== 'all' && fullKeys.length > 0 && (
              <View style={styles.windowRow}>
                <Pressable
                  onPress={() => {
                    if (!windowEnd || !canShiftEarlier) return;
                    setWindowEnd(shiftWindowEnd(fullKeys, windowEnd, -1));
                  }}
                  disabled={!canShiftEarlier}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('historyWindowEarlier')}
                  style={[styles.windowBtn, !canShiftEarlier && styles.windowBtnDisabled]}
                >
                  <Icon name="chevronLeft" size={16} color={canShiftEarlier ? colorTheme.ink : colorTheme.ink3} />
                </Pressable>
                <Caption color={colorTheme.ink2} style={styles.windowCaption}>
                  {windowCaption}
                </Caption>
                <Pressable
                  onPress={() => {
                    if (!windowEnd || !canShiftLater) return;
                    setWindowEnd(shiftWindowEnd(fullKeys, windowEnd, 1));
                  }}
                  disabled={!canShiftLater}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('historyWindowLater')}
                  style={[styles.windowBtn, !canShiftLater && styles.windowBtnDisabled]}
                >
                  <Icon name="chevronRight" size={16} color={canShiftLater ? colorTheme.ink : colorTheme.ink3} />
                </Pressable>
              </View>
            )}

            {chartSeries.length > 0 && (
              <NetWorthHistoryChart
                series={chartSeries}
                selectedIndex={selectedIndex < 0 ? chartSeries.length - 1 : selectedIndex}
                onSelectIndex={onSelectIndex}
                formatAxisLabel={formatAxisLabel}
              />
            )}
          </>
        )}

        {showChart && selected && (
          <Card style={styles.drilldown}>
            <View style={styles.drillHeader}>
              <View style={{ flex: 1 }}>
                <Caption color={colorTheme.ink2}>{formatMonthLabel(selected.monthKey, true)}</Caption>
                <Amount
                  value={displayNet}
                  currency={dc.code}
                  size={typeScale.title}
                  weight={700}
                  color={displayNet < 0 ? colorTheme.red : colorTheme.ink}
                />
                {displayDelta != null && (
                  <Label
                    weight={700}
                    color={displayDelta >= 0 ? signedUp : colorTheme.red}
                    style={{ marginTop: spacing.xs }}
                  >
                    {displayDelta >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(displayDelta), dc.code)}{' '}
                    {t('historyVsPrevMonth')}
                  </Label>
                )}
              </View>
              {!selected.measured && !showingDemo && (
                <Caption color={colorTheme.ink3} style={{ maxWidth: 120, textAlign: 'right' }}>
                  {t('historyCarriedForward')}
                </Caption>
              )}
            </View>

            {dc.code !== 'MYR' && (
              <Caption color={colorTheme.ink3} style={{ marginTop: spacing.sm }}>
                {t('historyFxTodayRate', { code: dc.code })}
              </Caption>
            )}

            {showingDemo ? (
              <Pressable
                onPress={requestPro}
                style={[styles.unlockBtn, { backgroundColor: theme.accent }]}
                accessibilityRole="button"
                accessibilityLabel={t('historyUnlock')}
              >
                <Body weight={700} color={theme.onAccent}>
                  {t('historyUnlock')}
                </Body>
              </Pressable>
            ) : movers.length > 0 ? (
              <View style={[styles.movers, { borderTopColor: colorTheme.line }]}>
                <Caption color={colorTheme.ink2} style={{ marginBottom: spacing.sm }}>
                  {t('historyWhatChanged')}
                </Caption>
                {movers.map((mover) => {
                  const up = mover.delta >= 0;
                  return (
                    <View key={mover.cls} style={styles.moverRow}>
                      <Body>{formatClassLabel(mover.cls, isZh, mover.label)}</Body>
                      <Label weight={700} color={up ? signedUp : colorTheme.red}>
                        {up ? '+' : '−'}
                        {fmtMoney(dc.convert(Math.abs(mover.delta)), dc.code)}
                      </Label>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Card>
        )}

        {isPro && rows.length > 0 && (
          <>
            <View
              style={[
                styles.searchRow,
                { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, marginTop: spacing.lg },
              ]}
            >
              <Icon name="search" size={16} color={colorTheme.ink3} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('historySearchPlaceholder')}
                placeholderTextColor={colorTheme.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.searchInput, { color: colorTheme.ink, fontSize: typeScale.body }]}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Icon name="x" size={15} color={colorTheme.ink3} />
                </Pressable>
              )}
            </View>

            {shown.length === 0 ? (
              <Card style={{ padding: spacing.lg, alignItems: 'center', marginTop: spacing.md }}>
                <Title>{t('historyNoMatch')}</Title>
                <Body color={colorTheme.ink2} style={{ textAlign: 'center', marginTop: spacing.xs }}>
                  {t('historyNoMatchBody')}
                </Body>
              </Card>
            ) : (
              <>
                {!searching && (
                  <Caption color={colorTheme.ink2} style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
                    {monthsLabel}
                  </Caption>
                )}
                {sections.map((section) => (
                  <View key={section.year} style={{ marginBottom: spacing.base }}>
                    <Label weight={700} color={colorTheme.ink2} style={{ marginBottom: spacing.sm }}>
                      {isZh ? `${section.year}年` : section.year}
                    </Label>
                    <Card style={{ overflow: 'hidden' }}>
                      {section.items.map((r, i) => {
                        const up = (r.delta ?? 0) >= 0;
                        const active = selected?.monthKey === r.monthKey;
                        return (
                          <Pressable
                            key={r.monthKey}
                            onPress={() => {
                              const idx = chartSeries.findIndex((p) => p.monthKey === r.monthKey);
                              if (idx >= 0) {
                                setSelectedIndex(idx);
                                return;
                              }
                              // Month outside the window: jump the window end to that month.
                              setWindowEnd(r.monthKey);
                              if (range === 'all') setRange('12m');
                            }}
                            style={[
                              styles.row,
                              i > 0 && styles.divider,
                              i > 0 && { borderTopColor: colorTheme.line2 },
                              active && { backgroundColor: theme.accentTint },
                            ]}
                          >
                            <View style={{ flex: 1 }}>
                              <Body weight={700}>{formatMonthLabel(r.monthKey, true)}</Body>
                              {r.delta !== null && (
                                <Label
                                  weight={700}
                                  color={up ? signedUp : colorTheme.red}
                                  style={{ marginTop: spacing.xs }}
                                >
                                  {up ? '▲' : '▼'} {fmtMoney(dc.convert(Math.abs(r.delta)), dc.code)}{' '}
                                  {t('historyVsPrevMonth')}
                                </Label>
                              )}
                              {!r.measured && (
                                <Caption color={colorTheme.ink3} style={{ marginTop: spacing.xs }}>
                                  {t('historyCarriedForward')}
                                </Caption>
                              )}
                            </View>
                            <Amount
                              value={dc.convert(r.net)}
                              currency={dc.code}
                              size={typeScale.body}
                              weight={700}
                              color={r.net < 0 ? colorTheme.red : colorTheme.ink}
                            />
                          </Pressable>
                        );
                      })}
                    </Card>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {isPro && rows.length === 0 && (
          <Card style={{ padding: spacing.lg, alignItems: 'center', marginTop: spacing.md }}>
            <Icon name="clock" size={36} color={theme.accent} />
            <Title style={{ marginTop: spacing.sm }}>{t('historyNoDataYet')}</Title>
            <Body color={colorTheme.ink2} style={{ textAlign: 'center', marginTop: spacing.xs }}>
              {t('historyNoDataBody')}
            </Body>
          </Card>
        )}

        {!isPro && (
          <Pressable onPress={requestPro} style={styles.listTeaser} accessibilityRole="button">
            <Caption color={colorTheme.ink2}>{t('historyListTeaser')}</Caption>
            <ProBadge locked />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sparseBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  rangeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  windowBtn: {
    padding: spacing.sm,
  },
  windowBtnDisabled: {
    opacity: 0.4,
  },
  windowCaption: {
    flex: 1,
    textAlign: 'center',
  },
  drilldown: { padding: spacing.md, marginBottom: spacing.sm },
  drillHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  unlockBtn: {
    marginTop: spacing.md,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  movers: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, gap: spacing.sm },
  moverRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontFamily: uiFont(600), paddingVertical: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: 1 },
  listTeaser: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
