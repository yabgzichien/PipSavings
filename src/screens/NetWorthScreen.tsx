// src/screens/NetWorthScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddAccountModal } from '../components/AddAccountModal';
import { MoveFundsSheet } from '../components/MoveFundsSheet';
import { AddDebtModal } from '../components/AddDebtModal';
import { SettleSheet } from '../components/SettleSheet';
import { Icon, type IconName } from '../components/Icon';
import { ProBadge } from '../components/ProUi';
import { CalcBadge } from '../components/CalcBadge';
import { InstitutionBadge } from '../components/InstitutionBadge';
import { BrandBadge } from '../components/BrandBadge';
import { matchBrand, matchCrypto } from '../components/BrandLogo';
import { InstitutionField } from '../components/InstitutionField';
import { BalanceScanScreen } from './BalanceScanScreen';
import { ScanBalanceButton } from '../components/ScanBalanceButton';
import { TickerSearchModal } from '../components/TickerSearchModal';
import { InfoButton } from '../components/InfoButton';
import { Amount, Body, BtnLabel, Caption, Card, Display, Eyebrow, Label, PrimaryButton, Title, type ValueMode } from '../components/ui';
import { refreshFxRates } from '../db/currencyRepo';
import { listFxRates } from '../db/fxRepo';
import { shortDate } from '../lib/dates';
import { BASE_CURRENCY, round2 } from '../lib/currency';
import { cleanCalcInput, evaluateExpression } from '../lib/calc';
import { decimalsFor } from '../lib/currencies';
import { currencyPrefix, fmt, fmtMoney, formatCurrencyBreakdown } from '../lib/format';
import { rateFor, ratesFromCache, isStale, staleLabel } from '../lib/fx';
import { matchInstitution } from '../lib/institutions';
import { tap } from '../lib/haptics';
import { useModalHandoff } from '../lib/modalHandoff';
import { confirmAction } from '../lib/platformAlert';
import { sheetOpenFromModalState, useReportSheetOpen } from '../lib/askPip/sheetOpen';
import { shareSplitMessage } from '../lib/shareText';
import { buildBillReminder } from '../lib/splitMessage';
import type { OpenShare } from '../lib/split';
import {
  CLASS_BY_ID,
  RECEIVABLE_CLS,
  accountValueAsOf,
  classesFor,
  groupByClass,
  netWorth,
  netWorthSeries,
  nativeAccountTotalsByCurrency,
  toMyrValues,
  type ClassGroup,
} from '../lib/networth';
import { canMoveCash, isCashAccount } from '../lib/moveFunds';
import { netWorthFreshness, rankClassMovers, type ClassMover } from '../lib/netWorthPresentation';
import { useDisplayCurrency, type DisplayCurrency } from '../state/useDisplayCurrency';
import { groupHoldings, holdingProfit, isHolding, subFromType, toQuantityUnitPrice, typeFromSub, type HoldingGroup, type TickerResult } from '../lib/prices';
import { todayISO } from '../lib/duplicates';
import { searchInvestments } from '../prices';
import type { Account, BalanceEntry, PriceQuote } from '../lib/types';
import { useAppData } from '../state/store';
import { useAccent, useSignedUp } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { numFont, radius, shadowToggle, spacing, uiFont } from '../theme';

const RED2 = '#c5402f';
function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const RED = '#c5402f';
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const fmtPx = (n: number): string => (n >= 1000 ? fmt(n) : String(Math.round(n * 100) / 100));

function formatClassLabel(cls: string, isZh: boolean, fallbackLabel: string): string {
  if (!isZh) return fallbackLabel;
  switch (cls) {
    case 'cash': return '现金与银行';
    case 'bank': return '银行账户';
    case 'investments': return '投资资产';
    case 'illiquid': return '非流动资产';
    case 'credit': return '信用卡';
    case 'loans': return '借贷债务';
    default: return fallbackLabel;
  }
}

/**
 * The quiet "≈ SGD x, rate 12 Aug" hint under an account whose own currency differs from the
 * one totals are shown in. It reads the display currency rather than always MYR: the whole
 * point of the hint is to tell the user what this balance is worth in the money the rest of
 * the screen is denominated in, which is `dc.code`, not necessarily ringgit.
 */
function fxSubtitle(currency: string, myrValue: number, fxAsOf: Record<string, string>, dc: DisplayCurrency): string {
  const asOf = fxAsOf[currency];
  const stale = asOf && isStale(asOf) ? `, ${staleLabel(asOf)}` : '';
  return `≈ ${fmtMoney(dc.convert(myrValue), dc.code)}${stale}`;
}

/** Ticker badge style + label by holding sub-type (and Bursa vs US for stocks). */
function badgeFor(sub: string, symbol: string): { bg: string; clr: string; lbl: string } {
  if (sub === 'crypto') return { bg: '#f0f0ff', clr: '#4a4ad8', lbl: 'Crypto' };
  if (sub === 'commodity') return { bg: '#fdf6e8', clr: '#7a6200', lbl: 'Gold' };
  return symbol.endsWith('.KL') ? { bg: '#eff7f4', clr: '#1c6b48', lbl: 'BM' } : { bg: '#fff8ee', clr: '#b86a00', lbl: 'US' };
}

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function NetWorthScreen({
  onOpenHistory,
  onOpenOwed,
  embedded,
  onSheetOpenChange,
}: {
  onBack: () => void;
  onOpenHistory: () => void;
  onOpenOwed?: () => void;
  embedded?: boolean;
  onSheetOpenChange?: (open: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const { isPro } = useEntitlement();
  const { accounts, balanceEntries, accountValues, prices, pricesAsOf, refreshPrices, openShares, deleteDirectDebt, settleShare } = useAppData();
  const { request: requestMoveSheet, onDismiss: onAccountSheetDismissed } = useModalHandoff();
  const [adding, setAdding] = useState(false);
  const [addingDebt, setAddingDebt] = useState(false);
  const [settlingDebt, setSettlingDebt] = useState<OpenShare | null>(null);
  const [presetCoin, setPresetCoin] = useState<TickerResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  useReportSheetOpen(sheetOpenFromModalState(settlingDebt, editingId), onSheetOpenChange);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveFromId, setMoveFromId] = useState<string | null>(null);
  const [groupSymbol, setGroupSymbol] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const profitMode: ValueMode = 'amount';
  const [expandedClasses, setExpandedClasses] = useState<string[]>([]);
  const [showBalanceReview, setShowBalanceReview] = useState(false);
  // Cached FX rates (code → MYR rate) and each rate's own cache timestamp (code → asOf), for
  // converting native account balances into MYR and showing a staleness hint. Loaded once on
  // mount; empty until then, so a MYR-only user's screen renders exactly as before this load
  // resolves (`toMyrValues`/`netWorthSeries` both default a missing rate to "MYR only").
  const [rates, setRates] = useState<Record<string, number>>({});
  const [fxAsOf, setFxAsOf] = useState<Record<string, string>>({});

  const hasHoldings = useMemo(() => accounts.some(isHolding), [accounts]);

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      if (hasHoldings) await refreshPrices();
      else await refreshFxRates().catch(() => {});
      const fx = await listFxRates();
      setRates(ratesFromCache(fx));
      setFxAsOf(Object.fromEntries(fx.map((r) => [r.code, r.asOf])));
    } finally {
      setRefreshing(false);
    }
  };

  // Refresh prices when the screen opens (if there are holdings to price).
  useEffect(() => {
    if (hasHoldings) refreshPrices().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHoldings]);

  useEffect(() => {
    refreshFxRates().catch(() => {}).then(listFxRates).then((fx) => {
      setRates(ratesFromCache(fx));
      setFxAsOf(Object.fromEntries(fx.map((r) => [r.code, r.asOf])));
    });
  }, []);

  const dc = useDisplayCurrency();
  const nativeTotals = useMemo(
    () => nativeAccountTotalsByCurrency(accounts, accountValues),
    [accounts, accountValues]
  );
  const nativeBreakdown = useMemo(() => {
    const visible = Object.fromEntries(Object.entries(nativeTotals).filter(([, value]) => value !== 0));
    return Object.keys(visible).length > 1 ? formatCurrencyBreakdown(visible) : '';
  }, [nativeTotals]);

  // Native balances (accountValues) converted to MYR for every total/grouping; an account
  // with no cached rate is excluded rather than counted at parity (see toMyrValues).
  const { valueById: myrValues, unconvertible } = useMemo(
    () => toMyrValues(accounts, accountValues, rates),
    [accounts, accountValues, rates]
  );
  const nw = useMemo(() => netWorth(accounts, myrValues), [accounts, myrValues]);
  const groups = useMemo(() => groupByClass(accounts, myrValues), [accounts, myrValues]);
  const series = useMemo(
    () => netWorthSeries(accounts, balanceEntries, lastMonths(6), rates).map((p) => p.net),
    [accounts, balanceEntries, rates]
  );
  const monthKeys = useMemo(() => lastMonths(6), []);
  const previousValues = useMemo(() => {
    const previousMonthEnd = `${monthKeys[monthKeys.length - 2]}-31`;
    const native: Record<string, number> = {};
    for (const account of accounts) {
      native[account.id] = accountValueAsOf(
        balanceEntries.filter((entry) => entry.accountId === account.id),
        previousMonthEnd,
      );
    }
    return toMyrValues(accounts, native, rates).valueById;
  }, [accounts, balanceEntries, monthKeys, rates]);
  const movers = useMemo(
    () => rankClassMovers(accounts, myrValues, previousValues).slice(0, 3),
    [accounts, myrValues, previousValues],
  );
  const freshness = useMemo(
    () => netWorthFreshness(accounts, balanceEntries, todayISO()),
    [accounts, balanceEntries],
  );
  const staleAccounts = useMemo(
    () => freshness.staleAccountIds
      .map((id) => accounts.find((account) => account.id === id))
      .filter((account): account is Account => !!account),
    [accounts, freshness.staleAccountIds],
  );
  const recordedMonths = useMemo(
    () => new Set(balanceEntries.map((entry) => entry.asOf.slice(0, 7))).size,
    [balanceEntries],
  );
  const hasTrend = recordedMonths >= 2;
  const editing = editingId ? accounts.find((a) => a.id === editingId) ?? null : null;
  const groupLots = useMemo(
    () => (groupSymbol ? accounts.filter((a) => isHolding(a) && a.symbol === groupSymbol) : []),
    [groupSymbol, accounts]
  );

  const empty = accounts.length === 0;
  const monthShorts = useMemo(
    () => lastMonths(6).map((k) => (isZh ? MONTHS_ZH : MONTHS_SHORT)[parseInt(k.slice(5, 7), 10) - 1]),
    [isZh]
  );
  const delta = series.length >= 2 ? nw.net - series[series.length - 2] : null;
  const prevMonth = monthShorts[monthShorts.length - 2] ?? '';
  const isEstimate = freshness.staleAccountIds.length > 0 || unconvertible.length > 0;

  const openDebts = useMemo(() => {
    return (openShares ?? []).filter((s) => s.status === 'open' && s.outstanding > 0);
  }, [openShares]);

  const debtPeopleCount = useMemo(() => {
    return new Set(openDebts.map((d) => d.personName.trim().toLowerCase())).size;
  }, [openDebts]);

  const handleShareDebt = async (debt: OpenShare) => {
    tap();
    const desc = debt.remark?.trim() || (debt.merchant && debt.merchant !== 'A shared bill' ? debt.merchant : (isZh ? '分摊账单' : 'Shared bill'));
    const message = buildBillReminder({
      personName: debt.personName,
      currency: debt.currency ?? 'MYR',
      total: debt.outstanding,
      bills: [{
        shareId: debt.shareId,
        merchant: desc,
        billDate: debt.billDate,
        outstanding: debt.outstanding,
        paid: debt.paid,
        remark: debt.remark,
      }],
      isZh,
    }, debt.shareId);
    await shareSplitMessage(message || '');
  };

  const handleDeleteDebt = (debt: OpenShare) => {
    confirmAction(
      isZh ? '删除借款记录？' : 'Remove debt record?',
      isZh
        ? `确认移除 ${debt.personName} 欠您的 ${fmtMoney(debt.outstanding, debt.currency ?? 'MYR')}？`
        : `Remove ${debt.personName}’s debt of ${fmtMoney(debt.outstanding, debt.currency ?? 'MYR')}?`,
      isZh ? '移除' : 'Remove',
      async () => {
        tap();
        await deleteDirectDebt(debt.shareId);
      }
    );
  };

  const toggleClass = (cls: string) => {
    tap();
    setExpandedClasses((current) => current.includes(cls)
      ? current.filter((item) => item !== cls)
      : [...current, cls]);
  };

  // Safe to branch here  all hooks above have run unconditionally.
  if (scanning) {
    return <BalanceScanScreen onClose={() => setScanning(false)} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={[styles.nav, { paddingTop: insets.top + 6 }]}>
          <Title>{t('netWorthTitle')}</Title>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          hasHoldings ? <RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={theme.accent} /> : undefined
        }
      >
        {empty ? (
          <EmptyNetWorth
            onAdd={() => { setPresetCoin(null); setAdding(true); }}
            onScan={() => setScanning(true)}
          />
        ) : (
          <>
            <SummaryBlock
              net={nw.net}
              delta={hasTrend ? delta : null}
              prevMonth={prevMonth}
              isEstimate={isEstimate}
              breakdown={nativeBreakdown}
              dc={dc}
            />

            {freshness.staleAccountIds.length > 0 && (
              <BalanceReview
                accounts={staleAccounts}
                entries={balanceEntries}
                expanded={showBalanceReview}
                onToggle={() => setShowBalanceReview((shown) => !shown)}
                onEdit={setEditingId}
              />
            )}

            <TrendSection
              values={series}
              months={monthShorts}
              hasTrend={hasTrend}
              isPro={isPro}
              onOpenHistory={onOpenHistory}
              dc={dc}
            />

            {hasTrend && movers.length > 0 && (
              <MoversSection movers={movers} prevMonth={prevMonth} dc={dc} />
            )}

            <AccountTotals assets={nw.assets} liabilities={nw.liabilities} dc={dc} />
            <View style={[styles.accountGroups, { backgroundColor: colorTheme.surface }]}>
              {[...groups.assets, ...groups.liabilities].map((g, groupIndex) => {
                const expanded = expandedClasses.includes(g.cls);
                const localizedLabel = formatClassLabel(g.cls, isZh, g.label);
                const staleCount = g.accounts.filter(({ account }) => freshness.staleAccountIds.includes(account.id)).length;
                return (
                  <View key={g.cls}>
                    <AccountClassSummary
                      group={g}
                      label={localizedLabel}
                      staleCount={staleCount}
                      expanded={expanded}
                      showDivider={groupIndex > 0}
                      dc={dc}
                      onPress={() => toggleClass(g.cls)}
                      debtsCount={g.cls === RECEIVABLE_CLS ? debtPeopleCount : undefined}
                      onMove={g.cls === 'cash' && canMoveCash(accounts) ? () => {
                        tap();
                        setMoveFromId(null);
                        setMoveOpen(true);
                      } : undefined}
                    />
                    {expanded && g.kind === 'asset' && (
                      g.cls === RECEIVABLE_CLS ? (
                        <ReceivableClassCard
                          openDebts={openDebts}
                          receivableAccount={g.accounts[0]?.account}
                          onSettle={(debt) => setSettlingDebt(debt)}
                          onDelete={handleDeleteDebt}
                          onShare={handleShareDebt}
                          onAddDebt={() => setAddingDebt(true)}
                          onOpenOwed={onOpenOwed}
                          onEditAccount={(accountId) => setEditingId(accountId)}
                          dc={dc}
                        />
                      ) : (
                        <AssetClassCard
                          g={g}
                          accountValues={accountValues}
                          prices={prices}
                          pricesAsOf={pricesAsOf}
                          profitMode={profitMode}
                          refreshing={refreshing}
                          onRefresh={doRefresh}
                          onTapManual={setEditingId}
                          onTapGroup={setGroupSymbol}
                          unconvertible={unconvertible}
                          fxAsOf={fxAsOf}
                          dc={dc}
                        />
                      )
                    )}
                    {expanded && g.kind === 'liability' && (
                      <View style={[styles.accountDetails, { backgroundColor: colorTheme.surface2 }]}>
                        {g.accounts.map(({ account, value }, index) => (
                          <LiabilityRowD
                            key={account.id}
                            name={account.name}
                            cls={localizedLabel}
                            nativeValue={accountValues[account.id] ?? 0}
                            myrValue={value}
                            currency={account.currency}
                            unconvertible={unconvertible.includes(account.id)}
                            fxAsOf={fxAsOf}
                            dc={dc}
                            customIcon={account.icon}
                            isLast={index === g.accounts.length - 1}
                            onPress={() => setEditingId(account.id)}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            <AccountActions
              onScan={() => setScanning(true)}
              onAdd={() => { setPresetCoin(null); setAdding(true); }}
            />
          </>
        )}
      </ScrollView>

      <AddAccountModal visible={adding} preset={presetCoin} onClose={() => { setAdding(false); setPresetCoin(null); }} />
      <AddDebtModal visible={addingDebt} onClose={() => setAddingDebt(false)} />
      <SettleSheet
        share={settlingDebt}
        accounts={accounts}
        today={todayISO()}
        onClose={() => setSettlingDebt(null)}
        onSettle={async (amount, accountId) => {
          if (!settlingDebt) return;
          await settleShare(settlingDebt.shareId, amount, todayISO(), 'declared', null, accountId);
          setSettlingDebt(null);
        }}
      />
      <AccountSheet
        account={editing}
        dc={dc}
        onClose={() => setEditingId(null)}
        onOpenOwed={onOpenOwed}
        onDismiss={onAccountSheetDismissed}
        onMove={canMoveCash(accounts) ? (accountId) => {
          setEditingId(null);
          requestMoveSheet(() => {
            setMoveFromId(accountId);
            setMoveOpen(true);
          });
        } : undefined}
      />
      <MoveFundsSheet
        visible={moveOpen}
        initialFromId={moveFromId}
        onClose={() => setMoveOpen(false)}
      />
      <HoldingGroupSheet
        lots={groupLots}
        accountValues={accountValues}
        prices={prices}
        profitMode={profitMode}
        dc={dc}
        onClose={() => setGroupSymbol(null)}
        onEditLot={(id) => { setGroupSymbol(null); setEditingId(id); }}
        onAddMore={(coin) => { setGroupSymbol(null); setPresetCoin(coin); setAdding(true); }}
      />
    </View>
  );
}

function SummaryBlock({
  net,
  delta,
  prevMonth,
  isEstimate,
  breakdown,
  dc,
}: {
  net: number;
  delta: number | null;
  prevMonth: string;
  isEstimate: boolean;
  breakdown: string;
  dc: DisplayCurrency;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const wentUp = (delta ?? 0) >= 0;
  const comparison = delta == null
    ? null
    : isZh
      ? `${fmtMoney(dc.convert(Math.abs(delta)), dc.code)} ${wentUp ? '高于' : '低于'} ${prevMonth}`
      : `${fmtMoney(dc.convert(Math.abs(delta)), dc.code)} ${wentUp ? 'higher' : 'lower'} than ${prevMonth}`;
  return (
    <View style={styles.summary}>
      <Body color={colorTheme.ink2}>{isEstimate ? (isZh ? '预估净资产' : 'Estimated net worth') : (isZh ? '净资产' : 'Net worth')}</Body>
      <Display
        numeric
        style={styles.summaryValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {net < 0 ? '−' : ''}{fmtMoney(dc.convert(Math.abs(net)), dc.code)}
      </Display>
      {comparison && (
        <View style={styles.summaryDelta}>
          <Label color={wentUp ? theme.accent : colorTheme.red}>{comparison}</Label>
        </View>
      )}
      {breakdown ? <Caption color={colorTheme.ink2} style={styles.currencyBreakdown}>{breakdown}</Caption> : null}
    </View>
  );
}

function latestBalanceDate(entries: BalanceEntry[], accountId: string): string | null {
  const dates = entries.filter((entry) => entry.accountId === accountId).map((entry) => entry.asOf).sort();
  return dates[dates.length - 1] ?? null;
}

function BalanceReview({
  accounts,
  entries,
  expanded,
  onToggle,
  onEdit,
}: {
  accounts: Account[];
  entries: BalanceEntry[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: (id: string) => void;
}) {
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  return (
    <View style={[styles.reviewBlock, { backgroundColor: colorTheme.amberTint }]}>
      <Pressable
        onPress={onToggle}
        style={styles.reviewSummary}
        accessibilityRole="button"
        accessibilityLabel={isZh ? '查看需更新的余额' : 'Review outdated balances'}
        accessibilityState={{ expanded }}
      >
        <View style={[styles.reviewDot, { backgroundColor: colorTheme.amber }]} />
        <View style={styles.reviewCopy}>
          <Label>{isZh ? '部分余额可能已过期' : 'Some balances may be outdated'}</Label>
          <Caption color={colorTheme.ink2} style={styles.reviewMeta}>
            {isZh ? `${accounts.length} 个账户需要更新` : `${accounts.length} account${accounts.length === 1 ? ' needs' : 's need'} updating`}
          </Caption>
        </View>
        <Label color={colorTheme.amber}>{isZh ? '查看' : 'Review'}</Label>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={15} color={colorTheme.amber} />
      </Pressable>
      {expanded && (
        <View style={[styles.reviewList, { borderTopColor: colorTheme.line }]}>
          {accounts.map((account) => {
            const asOf = latestBalanceDate(entries, account.id);
            return (
              <View key={account.id} style={styles.reviewAccount}>
                <View style={styles.reviewCopy}>
                  <Body weight={700} numberOfLines={1}>{account.name}</Body>
                  <Caption color={colorTheme.ink2} style={styles.reviewMeta}>
                    {asOf ? (isZh ? `上次更新 ${shortDate(asOf)}` : `Last updated ${shortDate(asOf)}`) : (isZh ? '尚未记录余额' : 'No balance recorded')}
                  </Caption>
                </View>
                <Pressable
                  onPress={() => onEdit(account.id)}
                  style={[styles.updateButton, { backgroundColor: colorTheme.surface }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${isZh ? '更新' : 'Update'} ${account.name}`}
                >
                  <Label>{isZh ? '更新' : 'Update'}</Label>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function TrendSection({
  values,
  months,
  hasTrend,
  isPro,
  onOpenHistory,
  dc,
}: {
  values: number[];
  months: string[];
  hasTrend: boolean;
  isPro: boolean;
  onOpenHistory: () => void;
  dc: DisplayCurrency;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, values.length - 1));

  useEffect(() => {
    if (values.length === 0) return;
    setSelectedIndex(values.length - 1);
  }, [values.length]);

  const selected = values.length > 0 ? Math.min(selectedIndex, values.length - 1) : -1;
  const selectedValue = selected >= 0 ? values[selected] : null;
  const selectedMonth = selected >= 0 ? months[selected] : null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Body weight={700} style={styles.sectionTitle}>{isZh ? '六个月趋势' : 'Your 6-month trend'}</Body>
        <Pressable onPress={onOpenHistory} hitSlop={8} accessibilityRole="button" accessibilityLabel={isZh ? '查看净资产历史' : 'View net worth history'} style={styles.proInlineAction}>
          <Label color={theme.accent}>{isZh ? '历史记录' : 'View history'}</Label>
          {!isPro ? <ProBadge locked /> : null}
        </Pressable>
      </View>
      {hasTrend ? (
        <View style={[styles.trendSurface, { backgroundColor: colorTheme.surface2 }]}>
          {selectedValue != null && selectedMonth != null && (
            <Caption
              color={selectedValue < 0 ? colorTheme.red : colorTheme.ink2}
              style={styles.trendReadout}
            >
              {selectedMonth} · {fmtMoney(dc.convert(selectedValue), dc.code)}
            </Caption>
          )}
          <JournalTrendChart
            values={values}
            lineColor={theme.accent}
            ink3={colorTheme.ink3}
            selectedIndex={selected}
            onSelectIndex={setSelectedIndex}
          />
          <View style={styles.trendMonths}>
            {months.map((month, index) => (
              <Pressable
                key={`${month}-${index}`}
                onPress={() => setSelectedIndex(index)}
                hitSlop={6}
                style={styles.trendMonthHit}
                accessibilityRole="button"
                accessibilityState={{ selected: index === selected }}
                accessibilityLabel={`${month} net worth`}
              >
                <Caption
                  color={index === selected ? theme.accent : colorTheme.ink2}
                  style={[styles.trendMonth, index === selected && styles.trendMonthSelected]}
                >
                  {month}
                </Caption>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={[styles.trendEmpty, { borderColor: colorTheme.line }]}>
          <Body color={colorTheme.ink2}>{isZh ? '再记录一个月的余额即可查看趋势。' : 'Record another monthly balance to see your trend.'}</Body>
        </View>
      )}
    </View>
  );
}

function JournalTrendChart({
  values,
  lineColor,
  ink3,
  selectedIndex,
  onSelectIndex,
}: {
  values: number[];
  lineColor: string;
  ink3: string;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const height = 76;
  const verticalPadding = 10;
  if (values.length < 2) return null;
  const width = layoutWidth || 320;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const points: [number, number][] = values.map((value, index) => [
    ((index + 0.5) / values.length) * width,
    range === 0 ? height / 2 : verticalPadding + (1 - (value - min) / range) * (height - verticalPadding * 2),
  ]);
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L ${last[0].toFixed(1)} ${height} L ${first[0].toFixed(1)} ${height} Z`;
  const selected = points[Math.min(Math.max(selectedIndex, 0), points.length - 1)] ?? last;

  const selectAtX = (x: number) => {
    if (points.length === 0) return;
    let best = 0;
    let bestDist = Math.abs(points[0][0] - x);
    for (let i = 1; i < points.length; i++) {
      const d = Math.abs(points[i][0] - x);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    if (best !== selectedIndex) onSelectIndex(best);
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      runOnJS(selectAtX)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(selectAtX)(e.x);
    });
  const tap = Gesture.Tap().onEnd((e) => {
    runOnJS(selectAtX)(e.x);
  });
  const gesture = Gesture.Race(pan, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.trendChart}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth > 0 && nextWidth !== layoutWidth) setLayoutWidth(nextWidth);
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Six-month net worth trend"
      >
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="journalTrend" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity={0.24} />
              <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#journalTrend)" />
          <Path d={line} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <Line
            x1={selected[0]}
            x2={selected[0]}
            y1={verticalPadding / 2}
            y2={height}
            stroke={ink3}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.55}
          />
          <Circle cx={selected[0]} cy={selected[1]} r={4} fill={lineColor} stroke="#fff" strokeWidth={1.5} />
        </Svg>
      </View>
    </GestureDetector>
  );
}

function MoversSection({ movers, prevMonth, dc }: { movers: ClassMover[]; prevMonth: string; dc: DisplayCurrency }) {
  const colorTheme = useThemeColors();
  const theme = useAccent();
  const signedUp = useSignedUp();
  const { isZh } = useLanguage();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Body weight={700} style={styles.sectionTitle}>{isZh ? '变化原因' : 'What changed'}</Body>
        <Caption color={colorTheme.ink2}>{isZh ? `自 ${prevMonth}` : `Since ${prevMonth}`}</Caption>
      </View>
      <View style={[styles.moversList, { borderTopColor: colorTheme.line }]}>
        {movers.map((mover, index) => {
          const up = mover.delta >= 0;
          return (
            <View key={mover.cls} style={[styles.moverRow, index > 0 && { borderTopColor: colorTheme.line, borderTopWidth: 1 }]}>
              <Body>{formatClassLabel(mover.cls, isZh, mover.label)}</Body>
              <Label numeric color={up ? signedUp : colorTheme.red}>
                {up ? '+' : '−'}{fmtMoney(dc.convert(Math.abs(mover.delta)), dc.code)}
              </Label>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function AccountTotals({ assets, liabilities, dc }: { assets: number; liabilities: number; dc: DisplayCurrency }) {
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  return (
    <View style={styles.section}>
      <Body weight={700} style={styles.sectionTitle}>{isZh ? '账户' : 'Accounts'}</Body>
      <View style={[styles.totalsRow, { borderBottomColor: colorTheme.line }]}>
        <View style={styles.totalItem}>
          <Caption color={colorTheme.ink2}>{isZh ? '资产' : 'Assets'}</Caption>
          <Amount value={assets} currency={dc.code} size={16} />
        </View>
        <View style={[styles.totalItem, styles.totalItemEnd, { borderLeftColor: colorTheme.line }]}>
          <Caption color={colorTheme.ink2}>{isZh ? '负债' : 'Liabilities'}</Caption>
          <Amount value={liabilities} currency={dc.code} size={16} color={liabilities > 0 ? colorTheme.red : colorTheme.ink} />
        </View>
      </View>
    </View>
  );
}

function AccountClassSummary({
  group,
  label,
  staleCount,
  expanded,
  showDivider,
  dc,
  onPress,
  debtsCount,
  onMove,
}: {
  group: ClassGroup;
  label: string;
  staleCount: number;
  expanded: boolean;
  showDivider: boolean;
  dc: DisplayCurrency;
  onPress: () => void;
  debtsCount?: number;
  onMove?: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const icon = (CLASS_BY_ID[group.cls]?.icon ?? 'wallet') as IconName;
  const isReceivable = group.cls === RECEIVABLE_CLS;
  const count = isReceivable && debtsCount !== undefined ? debtsCount : group.accounts.length;
  return (
    <View style={[styles.classSummary, showDivider && { borderTopColor: colorTheme.line, borderTopWidth: 1 }]}>
      <Pressable
        onPress={onPress}
        style={styles.classSummaryMain}
        accessibilityRole="button"
        accessibilityLabel={isZh
          ? `${expanded ? '收起' : '展开'}${label}账户`
          : `${expanded ? 'Collapse' : 'Expand'} ${label} accounts`}
        accessibilityState={{ expanded }}
      >
        <View style={[styles.classSummaryIcon, { backgroundColor: group.kind === 'liability' ? colorTheme.redTint : theme.accentTint }]}>
          <Icon name={icon} size={17} color={group.kind === 'liability' ? colorTheme.red : theme.accent} />
        </View>
        <View style={styles.classSummaryCopy}>
          <Body weight={700}>{label}</Body>
          <Caption color={staleCount > 0 ? colorTheme.amber : colorTheme.ink2} style={styles.classSummaryMeta}>
            {staleCount > 0
              ? (isZh ? `${staleCount} 个需更新` : `${staleCount} need${staleCount === 1 ? 's' : ''} update`)
              : isReceivable
                ? (isZh ? `${count} 位欠款人` : `${count} ${count === 1 ? 'person' : 'people'}`)
                : (isZh ? `${count} 个账户` : `${count} account${count === 1 ? '' : 's'}`)}
          </Caption>
        </View>
        <Amount
          value={group.kind === 'liability' ? -group.total : group.total}
          currency={dc.code}
          size={14}
          color={group.kind === 'liability' && group.total > 0 ? colorTheme.red : colorTheme.ink}
        />
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} color={colorTheme.ink3} />
      </Pressable>
      {onMove ? (
        <Pressable
          onPress={onMove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isZh ? '划转' : 'Move'}
          style={styles.classMove}
        >
          <Label color={theme.accent}>{isZh ? '划转' : 'Move'}</Label>
        </Pressable>
      ) : null}
    </View>
  );
}

function AccountActions({ onScan, onAdd }: { onScan: () => void; onAdd: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  return (
    <View style={styles.accountActions}>
      <Pressable onPress={onScan} style={styles.tertiaryAction} accessibilityRole="button">
        <Icon name="scan" size={16} color={colorTheme.ink2} />
        <Label color={colorTheme.ink2}>{isZh ? '扫描余额' : 'Scan balances'}</Label>
      </Pressable>
      <Pressable onPress={onAdd} style={[styles.addAccountAction, { backgroundColor: theme.accentTint }]} accessibilityRole="button">
        <Icon name="plus" size={16} color={theme.accent} />
        <Label color={theme.onTint}>{isZh ? '添加账户' : 'Add account'}</Label>
      </Pressable>
    </View>
  );
}

function EmptyNetWorth({ onAdd, onScan }: { onAdd: () => void; onScan: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.accentTint }]}><Icon name="scale" size={24} color={theme.accent} /></View>
      <Title>{isZh ? '建立您的财务全景' : 'Build your financial picture'}</Title>
      <Body color={colorTheme.ink2} style={styles.emptyBody}>
        {isZh ? '添加您拥有和所欠的账户，Pip 会显示净资产如何变化。' : 'Add what you own and owe. Pip will show how your position changes over time.'}
      </Body>
      <PrimaryButton onPress={onAdd} height={52}><BtnLabel>{isZh ? '添加第一个账户' : 'Add your first account'}</BtnLabel></PrimaryButton>
      <Pressable onPress={onScan} style={styles.emptyScan} accessibilityRole="button">
        <Label color={colorTheme.ink2}>{isZh ? '或扫描余额' : 'Or scan a balance'}</Label>
      </Pressable>
    </View>
  );
}

function PriceStamp({ asOf, refreshing, onRefresh }: { asOf: string | null; refreshing: boolean; onRefresh: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  return (
    <View style={[styles.priceStamp, { borderBottomColor: colorTheme.line, backgroundColor: colorTheme.surface2 }]}>
      <View style={styles.liveDot} />
      <Text style={[styles.priceStampText, { color: colorTheme.ink2 }]}>
        {isZh ? `今日行情截至 ${timeOf(asOf) || ''}` : `Prices as of ${timeOf(asOf) || ''} today`}
      </Text>
      <Pressable onPress={onRefresh} style={[styles.refreshBtn, { backgroundColor: theme.accentTint }]} hitSlop={6}>
        {refreshing ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Text style={[styles.refreshText, { color: theme.accent }]}>{isZh ? '↻ 刷新' : '↻ Refresh'}</Text>
        )}
      </Pressable>
    </View>
  );
}

// ── Receivable class card (people who owe you) ───────────────────────────
function ReceivableClassCard({
  openDebts,
  receivableAccount,
  onSettle,
  onDelete,
  onShare,
  onAddDebt,
  onOpenOwed,
  onEditAccount,
  dc,
}: {
  openDebts: OpenShare[];
  receivableAccount?: Account;
  onSettle: (debt: OpenShare) => void;
  onDelete: (debt: OpenShare) => void;
  onShare: (debt: OpenShare) => void;
  onAddDebt: () => void;
  onOpenOwed?: () => void;
  onEditAccount?: (accountId: string) => void;
  dc: DisplayCurrency;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();

  return (
    <View style={[styles.classCard, { backgroundColor: colorTheme.surface2, paddingHorizontal: 12, paddingVertical: 12 }]}>
      {openDebts.length === 0 ? (
        <View style={[styles.debtEmptyCard, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, marginVertical: 4 }]}>
          <Icon name="gift" size={24} color={colorTheme.ink3} />
          <Text style={[styles.debtEmptyText, { color: colorTheme.ink2 }]}>
            {isZh ? '目前没人欠您钱。' : 'Nobody owes you anything right now.'}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {openDebts.map((debt) => {
            const desc = debt.remark?.trim() || (debt.merchant && debt.merchant !== 'A shared bill' ? debt.merchant : isZh ? '借款 / 分摊' : 'Owed');
            const when = shortDate(debt.billDate);
            return (
              <View
                key={debt.shareId}
                style={[
                  styles.receivableDebtCard,
                  { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.debtAvatar, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[styles.debtAvatarText, { color: theme.onTint }]}>
                      {debt.personName.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.debtPersonName, { color: colorTheme.ink }]} numberOfLines={1}>
                      {debt.personName}
                    </Text>
                    <Text style={[styles.debtPersonSub, { color: colorTheme.ink2 }]} numberOfLines={1}>
                      {desc}{when ? ` · ${when}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.debtAmountText, { color: theme.accent }]}>
                    {fmtMoney(dc.convert(debt.outstanding), dc.code)}
                  </Text>
                </View>

                {/* Actions row: Share, Settle, Delete */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colorTheme.line2 }}>
                  <Pressable
                    onPress={() => onShare(debt)}
                    hitSlop={6}
                    accessibilityLabel={isZh ? `分享/提醒 ${debt.personName}` : `Share / remind ${debt.personName}`}
                    style={[styles.debtActionChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  >
                    <Icon name="share" size={12} color={colorTheme.ink2} />
                    <Text style={[styles.debtActionChipText, { color: colorTheme.ink2 }]}>
                      {isZh ? '分享提醒' : 'Share'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => onSettle(debt)}
                    hitSlop={6}
                    accessibilityLabel={isZh ? `结算 ${debt.personName} 的还款` : `Settle repayment from ${debt.personName}`}
                    style={[styles.debtActionChip, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}
                  >
                    <Icon name="check" size={12} color={theme.accent} stroke={2.4} />
                    <Text style={[styles.debtActionChipText, { color: theme.onTint, fontFamily: uiFont(700) }]}>
                      {isZh ? '还款' : 'Settle'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => onDelete(debt)}
                    hitSlop={8}
                    accessibilityLabel={isZh ? `删除 ${debt.personName} 的欠款记录` : `Delete debt from ${debt.personName}`}
                    style={[styles.debtActionChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  >
                    <Icon name="trash" size={12} color={colorTheme.red} />
                    <Text style={[styles.debtActionChipText, { color: colorTheme.red }]}>
                      {isZh ? '删除' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Footer controls: Add Person, View in Owed, Account Settings */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 6 }}>
        <Pressable
          onPress={onAddDebt}
          hitSlop={6}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}
        >
          <Icon name="plus" size={14} color={theme.accent} stroke={2.4} />
          <Text style={{ fontSize: 13, fontFamily: uiFont(700), color: theme.accent }}>
            {isZh ? '添加欠款人' : 'Add someone'}
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {onOpenOwed && (
            <Pressable
              onPress={onOpenOwed}
              hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
            >
              <Text style={{ fontSize: 12.5, fontFamily: uiFont(600), color: colorTheme.ink2 }}>
                {isZh ? '借款管理' : 'View in Owed'}
              </Text>
              <Icon name="chevronRight" size={13} color={colorTheme.ink3} />
            </Pressable>
          )}

          {receivableAccount && onEditAccount && (
            <Pressable
              onPress={() => onEditAccount(receivableAccount.id)}
              hitSlop={6}
              accessibilityLabel={isZh ? '账户设置' : 'Account settings'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
            >
              <Icon name="wallet" size={13} color={colorTheme.ink3} />
              <Text style={{ fontSize: 12.5, fontFamily: uiFont(600), color: colorTheme.ink3 }}>
                {isZh ? '设置' : 'Settings'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Asset class card (cash / investments / etc.) ────────────────────────────
function AssetClassCard({
  g,
  accountValues,
  prices,
  pricesAsOf,
  profitMode,
  refreshing,
  onRefresh,
  onTapManual,
  onTapGroup,
  unconvertible,
  fxAsOf,
  dc,
}: {
  g: ClassGroup;
  accountValues: Record<string, number>;
  prices: Record<string, PriceQuote>;
  pricesAsOf: string | null;
  profitMode: ValueMode;
  refreshing: boolean;
  onRefresh: () => void;
  onTapManual: (id: string) => void;
  onTapGroup: (symbol: string) => void;
  unconvertible: string[];
  fxAsOf: Record<string, string>;
  dc: DisplayCurrency;
}) {
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const holdings = g.accounts.filter((x) => isHolding(x.account)).map((x) => x.account);
  const manual = g.accounts.filter((x) => !isHolding(x.account));
  const hGroups = groupHoldings(holdings, accountValues);
  const hasH = hGroups.length > 0;
  const icon = (CLASS_BY_ID[g.cls]?.icon ?? 'wallet') as IconName;
  const localizedLabel = formatClassLabel(g.cls, isZh, g.label);
  return (
      <View style={[styles.classCard, { backgroundColor: colorTheme.surface2 }]}>
        {hasH && <PriceStamp asOf={pricesAsOf} refreshing={refreshing} onRefresh={onRefresh} />}
        {hGroups.map((grp, i) => {
          const profit = grp.cost != null && grp.cost > 0 ? holdingProfit(grp.value, grp.cost) : null;
          const isLast = i === hGroups.length - 1 && manual.length === 0;
          return (
            <HoldingRowD key={grp.symbol} grp={grp} price={prices[grp.symbol]} profit={profit} profitMode={profitMode} isLast={isLast} dc={dc} onPress={() => onTapGroup(grp.symbol)} />
          );
        })}
        {manual.map(({ account, value }, i) => (
          <ManualRowD
            key={account.id}
            icon={icon}
            customIcon={account.icon}
            name={account.name}
            sub={localizedLabel}
            nativeValue={accountValues[account.id] ?? 0}
            myrValue={value}
            currency={account.currency}
            interestRate={account.interestRate}
            cost={account.cost}
            cls={account.cls}
            unconvertible={unconvertible.includes(account.id)}
            fxAsOf={fxAsOf}
            dc={dc}
            isLast={i === manual.length - 1}
            onPress={() => onTapManual(account.id)}
          />
        ))}
      </View>
  );
}

function ManualRowD({
  icon,
  name,
  sub,
  nativeValue,
  myrValue,
  currency,
  interestRate,
  cost,
  cls,
  unconvertible,
  fxAsOf,
  dc,
  isLast,
  onPress,
  customIcon,
}: {
  icon: IconName;
  name: string;
  sub: string;
  nativeValue: number;
  myrValue: number;
  currency: string;
  interestRate?: number | null;
  cost?: number | null;
  cls?: string;
  unconvertible: boolean;
  fxAsOf: Record<string, string>;
  dc: DisplayCurrency;
  isLast: boolean;
  onPress: () => void;
  customIcon?: string | null;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const inst = matchInstitution(name);
  const brand = inst ? (matchBrand(inst.id) || matchBrand(inst.name)) : matchBrand(name);
  const isCustomImage = customIcon && (
    customIcon.startsWith('data:') ||
    customIcon.startsWith('file:') ||
    customIcon.startsWith('content:') ||
    customIcon.startsWith('http') ||
    customIcon.startsWith('/')
  );
  // The "≈" hint is worth showing whenever the row's own currency differs from the one the
  // totals above it are denominated in — not just when it differs from ringgit. A user
  // reading in SGD needs the SGD equivalent of a ringgit account just as much as the
  // reverse, and an SGD account under an SGD display currency needs no hint at all.
  const foreign = currency !== dc.code;
  const subText = useMemo(() => {
    if (cls === 'illiquid') {
      const parts: string[] = [];
      if (cost != null && cost > 0) {
        const diff = nativeValue - cost;
        const pct = Math.round((diff / cost) * 1000) / 10;
        const sign = diff >= 0 ? '+' : '−';
        parts.push(isZh ? `${sign}${Math.abs(pct)}% 较成本` : `${sign}${Math.abs(pct)}% vs cost`);
      }
      if (interestRate != null) {
        if (interestRate > 0) {
          parts.push(isZh ? `+${interestRate}%/年 预估增值` : `+${interestRate}%/yr ETA`);
        } else if (interestRate < 0) {
          parts.push(isZh ? `−${Math.abs(interestRate)}%/年 预估折旧` : `−${Math.abs(interestRate)}%/yr dep.`);
        } else {
          parts.push(isZh ? '0%/年' : '0%/yr');
        }
      }
      if (parts.length > 0) return parts.join(' · ');
      return sub;
    }
    return interestRate != null ? `${sub} · ${interestRate}% APR` : sub;
  }, [cls, cost, nativeValue, interestRate, isZh, sub]);
  return (
    <Pressable onPress={onPress} style={[styles.row, !isLast && [styles.rowDivider, { borderBottomColor: colorTheme.line }]]}>
      {brand ? (
        <BrandBadge brand={brand} size={36} rad={11} />
      ) : inst ? (
        <InstitutionBadge inst={inst} size={36} />
      ) : isCustomImage ? (
        <View style={[styles.rowTile, { backgroundColor: theme.accentTint, overflow: 'hidden' }]}>
          <Image source={{ uri: customIcon }} style={{ width: 36, height: 36 }} resizeMode="cover" />
        </View>
      ) : (
        <View style={[styles.rowTile, { backgroundColor: theme.accentTint }]}>
          <Icon name={icon} size={16} color={theme.accent} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowName, { color: colorTheme.ink }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.rowSub, { color: colorTheme.ink2 }]} numberOfLines={1}>{subText}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowVal, { color: colorTheme.ink }]}>{fmtMoney(nativeValue, currency)}</Text>
        {foreign && (
          <Text style={[styles.rowFx, { color: colorTheme.ink3 }]} numberOfLines={1}>
            {unconvertible ? 'rate unavailable' : fxSubtitle(currency, myrValue, fxAsOf, dc)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function HoldingRowD({
  grp,
  price,
  profit,
  profitMode,
  isLast,
  dc,
  onPress,
}: {
  grp: HoldingGroup;
  price?: PriceQuote;
  profit: { profit: number; pct: number | null } | null;
  profitMode: ValueMode;
  isLast: boolean;
  dc: DisplayCurrency;
  onPress: () => void;
}) {
  const theme = useAccent();
  const signedUp = useSignedUp();
  const colorTheme = useThemeColors();
  const badge = badgeFor(grp.sub, grp.symbol);
  const cryptoBrand = grp.sub === 'crypto' ? matchCrypto(grp.symbol) || matchCrypto(grp.ticker) || matchCrypto(grp.name) : null;
  const unitPx = price ? toQuantityUnitPrice(grp.symbol, price.priceMYR) : null;
  const ch = price?.change24 ?? null;
  const chUp = (ch ?? 0) >= 0;
  const up = (profit?.profit ?? 0) >= 0;
  const tick = grp.sub === 'commodity' ? (grp.symbol.startsWith('SI') ? 'XAG' : 'XAU') : grp.ticker;
  return (
    <Pressable onPress={onPress} style={[styles.row, !isLast && [styles.rowDivider, { borderBottomColor: colorTheme.line }]]}>
      {cryptoBrand ? (
        <BrandBadge brand={cryptoBrand} size={38} rad={11} />
      ) : (
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeTick, { color: badge.clr }]} numberOfLines={1}>{tick}</Text>
          <Text style={[styles.badgeLbl, { color: badge.clr }]}>{badge.lbl}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowName, { color: colorTheme.ink }]} numberOfLines={1}>{grp.name}</Text>
        <View style={styles.holdMetaRow}>
          <Text style={[styles.holdMeta, { color: colorTheme.ink2 }]} numberOfLines={1}>
            {grp.quantity} {unitPx != null ? `× ${currencyPrefix(dc.code)} ${fmtPx(dc.convert(unitPx))}` : grp.ticker}
          </Text>
          {ch != null && (
            <Text style={[styles.chChip, { color: chUp ? theme.onTint : colorTheme.red, backgroundColor: chUp ? theme.accentTint : colorTheme.redTint }]}>
              {chUp ? '+' : ''}{ch.toFixed(2)}%
            </Text>
          )}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowVal, { color: colorTheme.ink }]}>{fmtMoney(dc.convert(grp.value), dc.code)}</Text>
        {profit && (
          <Text style={[styles.rowProfit, { color: up ? signedUp : colorTheme.red }]}>
            {up ? '+' : '−'}
            {profitMode === 'percent' && profit.pct != null
              ? `${Math.abs(profit.pct).toFixed(1)}%`
              : fmtMoney(dc.convert(Math.abs(profit.profit)), dc.code)}
          </Text>
        )}
      </View>
      <Icon name="chevronRight" size={15} color={colorTheme.ink3} />
    </Pressable>
  );
}

function LiabilityRowD({
  name,
  cls,
  nativeValue,
  myrValue,
  currency,
  unconvertible,
  fxAsOf,
  dc,
  isLast,
  onPress,
  customIcon,
}: {
  name: string;
  cls: string;
  nativeValue: number;
  myrValue: number;
  currency: string;
  unconvertible: boolean;
  fxAsOf: Record<string, string>;
  dc: DisplayCurrency;
  isLast: boolean;
  onPress: () => void;
  customIcon?: string | null;
}) {
  const colorTheme = useThemeColors();
  const inst = matchInstitution(name);
  const brand = inst ? (matchBrand(inst.id) || matchBrand(inst.name)) : matchBrand(name);
  const isCustomImage = customIcon && (
    customIcon.startsWith('data:') ||
    customIcon.startsWith('file:') ||
    customIcon.startsWith('content:') ||
    customIcon.startsWith('http') ||
    customIcon.startsWith('/')
  );
  // The "≈" hint is worth showing whenever the row's own currency differs from the one the
  // totals above it are denominated in — not just when it differs from ringgit. A user
  // reading in SGD needs the SGD equivalent of a ringgit account just as much as the
  // reverse, and an SGD account under an SGD display currency needs no hint at all.
  const foreign = currency !== dc.code;
  return (
    <Pressable onPress={onPress} style={[styles.row, !isLast && [styles.rowDivider, { borderBottomColor: colorTheme.line }]]}>
      {brand ? (
        <BrandBadge brand={brand} size={36} rad={11} />
      ) : inst ? (
        <InstitutionBadge inst={inst} size={36} />
      ) : isCustomImage ? (
        <View style={[styles.rowTile, { overflow: 'hidden' }]}>
          <Image source={{ uri: customIcon }} style={{ width: 36, height: 36 }} resizeMode="cover" />
        </View>
      ) : (
        <View style={[styles.rowTile, { backgroundColor: colorTheme.redTint }]}>
          <Icon name="scale" size={16} color={colorTheme.red} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.liabNameRow}>
          <Text style={[styles.rowName, { color: colorTheme.ink }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.liabChip, { color: colorTheme.red, backgroundColor: colorTheme.redTint }]}>{cls}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowVal, { color: colorTheme.red }]}>-{fmtMoney(nativeValue, currency)}</Text>
        {foreign && (
          <Text style={[styles.rowFx, { color: colorTheme.ink3 }]} numberOfLines={1}>
            {unconvertible ? 'rate unavailable' : fxSubtitle(currency, myrValue, fxAsOf, dc)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** Flatten liability class groups into rows tagged with their class label. */
function flattenLiabs(groups: ClassGroup[]): { account: Account; value: number; clsLabel: string }[] {
  const out: { account: Account; value: number; clsLabel: string }[] = [];
  for (const g of groups) for (const { account, value } of g.accounts) out.push({ account, value, clsLabel: g.label });
  return out;
}

/** A row showing a name + optional meta on the left and value + optional profit on the right. */
function AccountRow({
  name,
  meta,
  value,
  profit,
  profitMode,
  dc,
  onPress,
}: {
  name: string;
  meta?: string;
  value: number;
  profit: { profit: number; pct: number | null } | null;
  profitMode: ValueMode;
  dc: DisplayCurrency;
  onPress: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable onPress={onPress} style={[styles.acctRow, styles.divider, { borderTopColor: colorTheme.line2 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.acctName, { color: colorTheme.ink }]} numberOfLines={1}>{name}</Text>
        {meta ? <Text style={[styles.acctMeta, { color: colorTheme.ink2 }]} numberOfLines={1}>{meta}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.acctVal, { color: colorTheme.ink2 }]}>{fmtMoney(dc.convert(value), dc.code)}</Text>
        {profit && (
          <Text style={[styles.profit, { color: profit.profit >= 0 ? theme.accent : RED2 }]}>
            {profit.profit >= 0 ? '+' : '−'}
            {profitMode === 'percent' && profit.pct != null
              ? `${Math.abs(profit.pct).toFixed(1)}%`
              : fmtMoney(dc.convert(Math.abs(profit.profit)), dc.code)}
          </Text>
        )}
      </View>
      <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
    </Pressable>
  );
}

/** The combined view of one symbol's lots: totals + each lot (tap to modify) + add another. */
function HoldingGroupSheet({
  lots,
  accountValues,
  prices,
  profitMode,
  dc,
  onClose,
  onEditLot,
  onAddMore,
}: {
  lots: Account[];
  accountValues: Record<string, number>;
  prices: Record<string, PriceQuote>;
  profitMode: ValueMode;
  dc: DisplayCurrency;
  onClose: () => void;
  onEditLot: (id: string) => void;
  onAddMore: (coin: TickerResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  if (lots.length === 0) return <Modal visible={false} transparent />;

  const grp = groupHoldings(lots, accountValues)[0];
  const price = prices[grp.symbol];
  const totalP = grp.cost != null && grp.cost > 0 ? holdingProfit(grp.value, grp.cost) : null;
  const coin: TickerResult = { id: grp.symbol, ticker: grp.ticker, name: grp.name, type: typeFromSub(grp.sub) };
  const ordered = [...lots].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18, backgroundColor: colorTheme.bg }]}>
        <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: colorTheme.ink }]} numberOfLines={1}>{grp.name}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Icon name="x" size={20} color={colorTheme.ink2} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.holdingSummary}>
            <Text style={[styles.holdingTicker, { color: theme.accent, backgroundColor: theme.accentTint }]}>{grp.ticker}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.holdingPrice, { color: colorTheme.ink2 }]}>
                {grp.quantity} {grp.ticker}{price ? ` · ${fmtMoney(dc.convert(price.priceMYR), dc.code)} each` : ''}
              </Text>
              <Text style={[styles.holdingValue, { color: colorTheme.ink }]}>= {fmtMoney(dc.convert(grp.value), dc.code)}</Text>
            </View>
          </View>
          {totalP && (
            <Text style={[styles.profitLine, { color: totalP.profit >= 0 ? theme.accent : RED2 }]}>
              {totalP.profit >= 0 ? '▲ +' : '▼ −'}{fmtMoney(dc.convert(Math.abs(totalP.profit)), dc.code)}
              {totalP.pct != null ? ` (${totalP.profit >= 0 ? '+' : '−'}${Math.abs(totalP.pct).toFixed(1)}%)` : ''} on {fmtMoney(dc.convert(grp.cost as number), dc.code)} invested
            </Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, marginBottom: 10 }}>
            <Eyebrow>{ordered.length} lot{ordered.length === 1 ? '' : 's'}</Eyebrow>
            <InfoButton entry="holdings" />
          </View>
          <Card style={{ overflow: 'hidden' }}>
            {ordered.map((lot) => {
              const { id, quantity, createdAt, cost, interestRate } = lot;
              const value = accountValues[id] ?? 0;
              const p = cost != null && cost > 0 ? holdingProfit(value, cost) : null;
              const metaText = `added ${shortDate(createdAt)}${interestRate != null ? ` · ${interestRate}% APR` : ''}`;
              return (
                <AccountRow
                  key={id}
                  name={`${quantity} ${grp.ticker}`}
                  meta={metaText}
                  value={value}
                  profit={p}
                  profitMode={profitMode}
                  dc={dc}
                  onPress={() => onEditLot(id)}
                />
              );
            })}
          </Card>

          <View style={{ marginTop: 20 }}>
            <PrimaryButton onPress={() => onAddMore(coin)} height={50}>
              <Icon name="plus" size={18} color="#fff" stroke={2.2} />
              <BtnLabel>Add another {grp.ticker}</BtnLabel>
            </PrimaryButton>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Manage one account: update balance, rename, reclassify, convert to live holding, view history, delete. */
function AccountSheet({
  account,
  dc,
  onClose,
  onOpenOwed,
  onMove,
  onDismiss,
}: {
  account: Account | null;
  dc: DisplayCurrency;
  onClose: () => void;
  onOpenOwed?: () => void;
  onMove?: (accountId: string) => void;
  onDismiss?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const signedUp = useSignedUp();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const {
    accounts,
    balanceEntries,
    accountValues,
    prices,
    setBalance,
    updateAccount,
    deleteAccount,
    updateHoldingQuantity,
    setHoldingCost,
    refreshPrices,
    openShares,
    people,
    addDirectDebt,
    deleteDirectDebt,
    settleShare,
  } = useAppData();
  const [name, setName] = useState('');
  const [cls, setCls] = useState('cash');
  const [valueText, setValueText] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [costText, setCostText] = useState('');
  const [rateText, setRateText] = useState('');
  const [editRateMode, setEditRateMode] = useState<'appreciation' | 'depreciation'>('depreciation');
  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const [holdingCoin, setHoldingCoin] = useState<TickerResult | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [settlingDebt, setSettlingDebt] = useState<OpenShare | null>(null);

  const handleShareDebt = async (debt: OpenShare) => {
    tap();
    const desc = debt.remark?.trim() || (debt.merchant && debt.merchant !== 'A shared bill' ? debt.merchant : (isZh ? '分摊账单' : 'Shared bill'));
    const message = buildBillReminder({
      personName: debt.personName,
      currency: debt.currency ?? 'MYR',
      total: debt.outstanding,
      bills: [{
        shareId: debt.shareId,
        merchant: desc,
        billDate: debt.billDate,
        outstanding: debt.outstanding,
        paid: debt.paid,
        remark: debt.remark,
      }],
      isZh,
    }, debt.shareId);
    await shareSplitMessage(message || '');
  };

  // Debts state for 'receivable' (Owed to me) accounts
  const isReceivable = account?.cls === RECEIVABLE_CLS;
  const [debtPersonName, setDebtPersonName] = useState('');
  const [debtAmountText, setDebtAmountText] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [isAddingDebt, setIsAddingDebt] = useState(false);

  const openDebts = useMemo(() => {
    if (!isReceivable) return [];
    return openShares.filter((s) => s.status === 'open' && s.outstanding > 0);
  }, [isReceivable, openShares]);

  const totalOwed = useMemo(() => {
    return openDebts.reduce((sum, s) => sum + s.outstanding, 0);
  }, [openDebts]);

  const suggestedPeople = useMemo(() => {
    return people.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [people]);

  const handleAddDebt = async () => {
    const trimmed = debtPersonName.trim();
    const amount = parseFloat(debtAmountText.replace(/[^0-9.]/g, ''));
    if (!trimmed || !Number.isFinite(amount) || amount <= 0) return;
    setIsAddingDebt(true);
    try {
      tap();
      await addDirectDebt(trimmed, Math.round(amount * 100) / 100, debtNote.trim() || null);
      setDebtPersonName('');
      setDebtAmountText('');
      setDebtNote('');
    } finally {
      setIsAddingDebt(false);
    }
  };

  const handleRemoveDebt = (shareId: string, personName: string, amount: number) => {
    confirmAction(
      isZh ? '删除借款记录？' : 'Remove debt record?',
      isZh
        ? `确认移除 ${personName} 欠您的 ${fmtMoney(amount, 'MYR')}？`
        : `Remove ${personName}’s debt of ${fmtMoney(amount, 'MYR')}?`,
      isZh ? '移除' : 'Remove',
      async () => {
        tap();
        await deleteDirectDebt(shareId);
      }
    );
  };

  const holding = account ? isHolding(account) : false;
  const valueDecimals = decimalsFor(account?.currency ?? BASE_CURRENCY);
  const valueCalc = useMemo(() => evaluateExpression(valueText, valueDecimals), [valueText, valueDecimals]);

  const mergeScaleX = useRef(new Animated.Value(1)).current;
  const mergeScaleY = useRef(new Animated.Value(1)).current;
  const mergeOpacity = useRef(new Animated.Value(1)).current;
  const [isMergingValue, setIsMergingValue] = useState(false);

  const handleMergeValue = () => {
    if (!valueCalc.isExpression || valueCalc.result == null || valueCalc.result <= 0) return;
    const finalValue = valueDecimals === 0 ? String(Math.round(valueCalc.result)) : valueCalc.result.toFixed(valueDecimals);
    const useNative = Platform.OS !== 'web';

    setIsMergingValue(true);
    tap();

    // Phase 1: Numbers converge/squeeze inward
    Animated.parallel([
      Animated.timing(mergeScaleX, {
        toValue: 0.82,
        duration: 80,
        easing: Easing.in(Easing.ease),
        useNativeDriver: useNative,
      }),
      Animated.timing(mergeScaleY, {
        toValue: 0.88,
        duration: 80,
        easing: Easing.in(Easing.ease),
        useNativeDriver: useNative,
      }),
      Animated.timing(mergeOpacity, {
        toValue: 0.35,
        duration: 80,
        useNativeDriver: useNative,
      }),
    ]).start(() => {
      setValueText(finalValue);

      // Phase 2: Bloom outward with spring bounce into final number
      Animated.parallel([
        Animated.spring(mergeScaleX, {
          toValue: 1,
          tension: 180,
          friction: 6,
          useNativeDriver: useNative,
        }),
        Animated.spring(mergeScaleY, {
          toValue: 1,
          tension: 180,
          friction: 6,
          useNativeDriver: useNative,
        }),
        Animated.timing(mergeOpacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: useNative,
        }),
      ]).start(() => {
        setIsMergingValue(false);
      });
    });
  };

  const openId = account?.id;
  React.useEffect(() => {
    if (account) {
      setName(account.name);
      setCls(account.cls);
      setValueText(String(accountValues[account.id] ?? 0));
      setQtyText(account.quantity != null ? String(account.quantity) : '');
      setCostText(account.cost != null ? String(account.cost) : (account.cls === 'investments' && !isHolding(account) && (accountValues[account.id] ?? 0) > 0 ? String(accountValues[account.id]) : ''));
      if (account.interestRate != null) {
        if (account.interestRate < 0) {
          setEditRateMode('depreciation');
          setRateText(String(Math.abs(account.interestRate)));
        } else {
          setEditRateMode('appreciation');
          setRateText(String(account.interestRate));
        }
      } else {
        setEditRateMode(account.cls === 'illiquid' ? 'depreciation' : 'appreciation');
        setRateText('');
      }
      setCustomIcon(account.icon ?? null);
      setHoldingCoin(null);
      setSearchOpen(false);
      setShowHistory(false);
      setDebtPersonName('');
      setDebtAmountText('');
      setDebtNote('');
      setIsAddingDebt(false);
    }
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const history = useMemo(
    () => (account ? balanceEntries.filter((e) => e.accountId === account.id).slice().reverse() : []),
    [account, balanceEntries]
  );

  const pickedSub = holdingCoin ? subFromType(holdingCoin.type) : (account?.sub ? account.sub : null);
  const holdingQtyUnit = pickedSub === 'commodity' ? 'g' : (holdingCoin?.ticker ?? account?.ticker ?? '');
  const holdingQtyLabel = pickedSub === 'commodity' ? (isZh ? '克重' : 'Grams') : pickedSub === 'stock' ? (isZh ? '股数' : 'Shares') : (isZh ? '持仓数量' : 'Quantity');

  const pickCustomIcon = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      const dataUri = a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
      setCustomIcon(dataUri);
    }
  };

  if (!account) return <Modal visible={false} transparent />;

  const save = async () => {
    const newName = name.trim() || account.name;
    const isCurrentIlliquid = account.cls === 'illiquid' || cls === 'illiquid';
    let parsedRate: number | null = null;
    if (rateText.trim()) {
      const num = parseFloat(rateText.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(num)) {
        parsedRate = isCurrentIlliquid && editRateMode === 'depreciation' ? -Math.abs(num) : num;
      }
    }
    const parsedCost = costText.trim() ? Math.round((parseFloat(costText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100 : null;

    // 1. Converting a manual account to a live holding
    if (!holding && holdingCoin) {
      const q = parseFloat(qtyText.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(q) && q > 0) {
        const sub = subFromType(holdingCoin.type);
        const ticker = sub === 'commodity' ? 'g' : holdingCoin.ticker;
        const cost = costText.trim() ? Math.round((parseFloat(costText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100 : null;
        await updateAccount(account.id, {
          name: newName,
          cls: 'investments',
          icon: customIcon,
          interestRate: null,
          sub,
          symbol: holdingCoin.id,
          ticker,
          quantity: Math.round(q * 1e8) / 1e8,
          cost,
        });
        await refreshPrices().catch(() => {});
        onClose();
        return;
      }
    }

    // 2. Existing holding (or updated ticker)
    if (holding) {
      const targetCoin = holdingCoin;
      const sub = targetCoin ? subFromType(targetCoin.type) : account.sub;
      const symbol = targetCoin ? targetCoin.id : account.symbol;
      const ticker = targetCoin ? (sub === 'commodity' ? 'g' : targetCoin.ticker) : account.ticker;
      const q = parseFloat(qtyText.replace(/[^0-9.]/g, ''));
      const quantity = Number.isFinite(q) && q >= 0 ? Math.round(q * 1e8) / 1e8 : account.quantity;
      const cost = costText.trim() ? Math.round((parseFloat(costText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100 : null;
      await updateAccount(account.id, {
        name: newName,
        cls: account.cls,
        icon: customIcon,
        interestRate: null,
        sub,
        symbol,
        ticker,
        quantity,
        cost,
      });
      if (targetCoin) await refreshPrices().catch(() => {});
      onClose();
      return;
    }

    // 3. Receivable ("Owed to me") account update: balance is derived from debts; name never changes, only icon persists
    if (isReceivable) {
      if (customIcon !== account.icon) {
        await updateAccount(account.id, { name: 'Owed to me', cls: account.cls, icon: customIcon });
      }
      onClose();
      return;
    }

    // 4. Regular manual account update
    if (newName !== account.name || cls !== account.cls || customIcon !== account.icon || parsedRate !== account.interestRate || parsedCost !== account.cost) {
      await updateAccount(account.id, { name: newName, cls, icon: customIcon, interestRate: parsedRate, cost: parsedCost });
    }
    const v = valueCalc.result != null ? valueCalc.result : parseFloat(valueText.replace(/[^0-9.]/g, ''));
    const value = Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
    if (value !== null && value !== (accountValues[account.id] ?? 0)) {
      await setBalance(account.id, value, todayISO());
    }
    onClose();
  };

  const confirmDelete = () => {
    confirmAction('Delete account?', `Remove “${account.name}” and its history? This can’t be undone.`, 'Delete', async () => {
      await deleteAccount(account.id);
      onClose();
    });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.sheetAvoider}
        pointerEvents="box-none"
      >
      <View style={[styles.sheetCard, { paddingBottom: insets.bottom + 18, backgroundColor: colorTheme.bg }]}>
        <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: colorTheme.ink }]} numberOfLines={1}>{account.name}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Icon name="x" size={20} color={colorTheme.ink2} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {holding ? (
            <>
              <View style={styles.holdingSummary}>
                <Text style={[styles.holdingTicker, { color: theme.accent, backgroundColor: theme.accentTint }]}>{account.ticker}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.holdingPrice, { color: colorTheme.ink2 }]}>
                    {prices[account.symbol as string] ? `${fmtMoney(dc.convert(prices[account.symbol as string].priceMYR), dc.code)} each` : 'Price unavailable'}
                  </Text>
                  <Text style={[styles.holdingValue, { color: colorTheme.ink }]}>= {fmtMoney(dc.convert(accountValues[account.id] ?? 0), dc.code)}</Text>
                </View>
                <Pressable onPress={() => setSearchOpen(true)} style={[styles.changeBtn, { backgroundColor: theme.accentTint }]}>
                  <Text style={[styles.changeText, { color: theme.accent }]}>{isZh ? '更换标的' : 'Change'}</Text>
                </Pressable>
              </View>

              {account.cost != null && account.cost > 0 && (() => {
                const p = holdingProfit(accountValues[account.id] ?? 0, account.cost);
                const up = p.profit >= 0;
                return (
                  <Text style={[styles.profitLine, { color: up ? signedUp : RED2 }]}>
                    {up ? '▲' : '▼'} {up ? '+' : '−'}{fmtMoney(dc.convert(Math.abs(p.profit)), dc.code)}
                    {p.pct != null ? ` (${up ? '+' : '−'}${Math.abs(p.pct).toFixed(1)}%)` : ''} on {fmtMoney(dc.convert(account.cost), dc.code)} invested
                  </Text>
                );
              })()}

              <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>{holdingQtyLabel}</Text>
              <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                <TextInput value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" selectTextOnFocus style={[styles.amountInput, { color: colorTheme.ink }]} />
                <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{holdingQtyUnit}</Text>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>{isZh ? '买入成本 / 总投入 (成本价)' : 'Invested amount (cost)'}</Text>
              <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(account.currency)}</Text>
                <TextInput value={costText} onChangeText={setCostText} keyboardType="decimal-pad" placeholder={isZh ? '买入成本' : 'cost of investment'} placeholderTextColor={colorTheme.ink3} style={[styles.amountInput, { color: colorTheme.ink }]} />
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>{isZh ? '账户名称' : 'Name'}</Text>
              <TextInput value={name} onChangeText={setName} style={[styles.textInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]} />
            </>
          ) : (
            <>
              <View style={styles.labelRow}>
                <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>
                  {isReceivable
                    ? isZh
                      ? '待收回总额'
                      : 'Total owed to you'
                    : account.cls === 'illiquid' || cls === 'illiquid'
                      ? isZh
                        ? '当前市值'
                        : 'Market value'
                      : account.kind === 'asset'
                        ? isZh
                          ? '当前金额'
                          : 'Current value'
                        : isZh
                          ? '待还金额'
                          : 'Outstanding amount'}
                </Text>
                {!isReceivable && <ScanBalanceButton onResult={(n) => setValueText(String(n))} />}
              </View>

              {isReceivable ? (
                <>
                  <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                    <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(account.currency)}</Text>
                    <Text style={[styles.amountInput, { color: colorTheme.ink, paddingVertical: 12 }]}>
                      {totalOwed.toFixed(2)}
                    </Text>
                  </View>
                  <Text style={[styles.hint, { color: colorTheme.ink2 }]}>
                    {isZh ? '此金额由下方借款人记录自动累计。' : 'Total calculated from people who owe you below.'}
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                    <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(account.currency)}</Text>
                    <Animated.View
                      style={{
                        flex: 1,
                        minWidth: 0,
                        opacity: mergeOpacity,
                        transform: [{ scaleX: mergeScaleX }, { scaleY: mergeScaleY }],
                      }}
                    >
                      <TextInput
                        value={valueText}
                        onChangeText={(t) => setValueText(cleanCalcInput(t, valueDecimals > 0))}
                        onSubmitEditing={handleMergeValue}
                        keyboardType="numbers-and-punctuation"
                        selectTextOnFocus
                        style={[styles.amountInput, { color: isMergingValue ? theme.accent : colorTheme.ink }]}
                      />
                    </Animated.View>
                    {valueCalc.isExpression && valueCalc.result != null && valueCalc.result > 0 && (
                      <CalcBadge
                        result={valueCalc.result}
                        decimals={valueDecimals}
                        onApply={handleMergeValue}
                      />
                    )}
                  </View>
                  {valueCalc.isExpression && valueCalc.result != null && valueCalc.result > 0 && (
                    <Text style={[styles.calcHint, { color: theme.accent }]}>
                      = {account.currency} {valueDecimals === 0 ? String(Math.round(valueCalc.result)) : valueCalc.result.toFixed(valueDecimals)}
                    </Text>
                  )}
                  <Text style={[styles.hint, { color: colorTheme.ink2 }]}>{isZh ? '保存新金额将记录为今天的最新余额。' : 'Saving a new value records it as of today.'}</Text>
                  {onMove && isCashAccount(account) && canMoveCash(accounts) ? (
                    <Pressable
                      onPress={() => {
                        tap();
                        onMove(account.id);
                      }}
                      hitSlop={6}
                      style={{ marginTop: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={isZh ? '转到另一账户' : 'Move to another account'}
                    >
                      <Text style={{ fontFamily: uiFont(700), fontSize: 13, color: theme.accent }}>
                        {isZh ? '转到另一账户' : 'Move to another account'}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}

              <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>
                {account.cls === 'illiquid' || cls === 'illiquid' ? (isZh ? '资产名称' : 'Asset name') : (isZh ? '账户名称' : 'Account')}
              </Text>
              {isReceivable ? (
                <View style={[styles.textInput, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, justifyContent: 'center' }]}>
                  <Text style={{ fontFamily: uiFont(600), fontSize: 15, color: colorTheme.ink2 }}>
                    Owed to me
                  </Text>
                </View>
              ) : (
                <InstitutionField
                  value={name}
                  onChangeText={setName}
                  onPick={(inst) => {
                    if (inst.kind === 'auto') {
                      if (account.kind === 'liability') setCls('car');
                      else setCls('illiquid');
                    } else if (account.kind === 'asset') {
                      setCls('cash');
                    }
                  }}
                />
              )}

              {!isReceivable && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>{isZh ? '分类' : 'Type'}</Text>
                  <View style={styles.classGrid}>
                    {classesFor(account.kind).map((c) => {
                      const on = cls === c.id;
                      return (
                        <Pressable key={c.id} onPress={() => setCls(c.id)} style={[styles.classChip, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, on && [styles.classChipOn, { borderColor: theme.accent, backgroundColor: theme.accentTint }]]}>
                          <Icon name={c.icon as IconName} size={15} color={on ? theme.accent : colorTheme.ink3} />
                          <Text style={[styles.classChipText, { color: colorTheme.ink2 }, on && { color: theme.onTint }]}>{c.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {isReceivable && (
                <View style={{ marginTop: 22 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={[styles.fieldLabel, { color: colorTheme.ink2, marginTop: 0 }]}>
                      {isZh ? '欠款人与借款记录' : 'Who owes you'}
                      {openDebts.length > 0 ? ` (${openDebts.length})` : ''}
                    </Text>
                    {onOpenOwed && (
                      <Pressable
                        onPress={() => {
                          onClose();
                          onOpenOwed();
                        }}
                        hitSlop={8}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Text style={{ fontSize: 13, fontFamily: uiFont(700), color: theme.accent }}>
                          {isZh ? '前往借款管理' : 'View in Owed'}
                        </Text>
                        <Icon name="chevronRight" size={13} color={theme.accent} />
                      </Pressable>
                    )}
                  </View>

                  {openDebts.length === 0 ? (
                    <View style={[styles.debtEmptyCard, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
                      <Icon name="gift" size={24} color={colorTheme.ink3} />
                      <Text style={[styles.debtEmptyText, { color: colorTheme.ink2 }]}>
                        {isZh ? '目前没人欠您钱。在下方添加谁欠您款项。' : 'Nobody owes you anything right now. Add someone below.'}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.debtListCard, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                      {openDebts.map((debt, i) => (
                        <View
                          key={debt.shareId}
                          style={[
                            styles.debtRow,
                            i > 0 && [styles.debtRowBorder, { borderTopColor: colorTheme.line2 }],
                          ]}
                        >
                          <View style={[styles.debtAvatar, { backgroundColor: theme.accentSoft }]}>
                            <Text style={[styles.debtAvatarText, { color: theme.onTint }]}>
                              {debt.personName.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.debtPersonName, { color: colorTheme.ink }]} numberOfLines={1}>
                              {debt.personName}
                            </Text>
                            <Text style={[styles.debtPersonSub, { color: colorTheme.ink2 }]} numberOfLines={1}>
                              {debt.remark?.trim() || (debt.merchant && debt.merchant !== 'A shared bill' ? debt.merchant : isZh ? '借款 / 分摊' : 'Owed')}
                            </Text>
                          </View>
                          <Text style={[styles.debtAmountText, { color: theme.accent }]}>
                            {fmtMoney(debt.outstanding, debt.currency || 'MYR')}
                          </Text>
                          <Pressable
                            onPress={() => handleShareDebt(debt)}
                            hitSlop={6}
                            style={{ padding: 6, marginLeft: 2 }}
                            accessibilityLabel={isZh ? `分享/提醒 ${debt.personName}` : `Share / remind ${debt.personName}`}
                          >
                            <Icon name="share" size={15} color={colorTheme.ink2} />
                          </Pressable>
                          <Pressable
                            onPress={() => setSettlingDebt(debt)}
                            hitSlop={6}
                            style={{ padding: 6, marginLeft: 2 }}
                            accessibilityLabel={isZh ? `结算 ${debt.personName} 还款` : `Settle repayment from ${debt.personName}`}
                          >
                            <Icon name="check" size={16} color={theme.accent} stroke={2.4} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleRemoveDebt(debt.shareId, debt.personName, debt.outstanding)}
                            hitSlop={8}
                            style={{ padding: 6, marginLeft: 2 }}
                            accessibilityLabel={isZh ? `删除 ${debt.personName} 欠款` : `Delete debt from ${debt.personName}`}
                          >
                            <Icon name="trash" size={15} color={colorTheme.red} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Inline Add Person Form */}
                  <View style={[styles.addDebtBox, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2, marginTop: 14 }]}>
                    <Text style={[styles.addDebtTitle, { color: colorTheme.ink }]}>
                      {isZh ? '+ 添加欠款人' : '+ Add someone who owes you'}
                    </Text>

                    <Text style={[styles.addDebtLabel, { color: colorTheme.ink2 }]}>
                      {isZh ? '姓名' : 'Name'}
                    </Text>
                    <TextInput
                      value={debtPersonName}
                      onChangeText={setDebtPersonName}
                      placeholder={isZh ? '例如: Fong Yan Yan' : 'e.g. Fong Yan Yan'}
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.addDebtInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
                    />

                    {/* Suggested existing people chips */}
                    {suggestedPeople.length > 0 && !debtPersonName && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {suggestedPeople.slice(0, 5).map((p) => (
                            <Pressable
                              key={p.id}
                              onPress={() => setDebtPersonName(p.name)}
                              style={[styles.personChip, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}
                            >
                              <Text style={[styles.personChipText, { color: colorTheme.ink2 }]}>{p.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                    )}

                    <Text style={[styles.addDebtLabel, { color: colorTheme.ink2, marginTop: 10 }]}>
                      {isZh ? '欠款金额' : 'Amount owed'}
                    </Text>
                    <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, height: 44 }]}>
                      <Text style={[styles.rm, { color: colorTheme.ink2 }]}>RM</Text>
                      <TextInput
                        value={debtAmountText}
                        onChangeText={setDebtAmountText}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colorTheme.ink3}
                        style={[styles.amountInput, { color: colorTheme.ink, fontSize: 18 }]}
                      />
                    </View>

                    <Text style={[styles.addDebtLabel, { color: colorTheme.ink2, marginTop: 10 }]}>
                      {isZh ? '原因 / 备注 (选填)' : 'Reason / note (optional)'}
                    </Text>
                    <TextInput
                      value={debtNote}
                      onChangeText={setDebtNote}
                      placeholder={isZh ? '例如: 晚餐分摊、借款' : 'e.g. Dinner, personal loan'}
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.addDebtInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
                    />

                    <Pressable
                      onPress={handleAddDebt}
                      disabled={isAddingDebt || !debtPersonName.trim() || !parseFloat(debtAmountText)}
                      style={[
                        styles.addDebtBtn,
                        { backgroundColor: theme.accent },
                        (!debtPersonName.trim() || !parseFloat(debtAmountText)) && { opacity: 0.5 },
                      ]}
                    >
                      <Icon name="plus" size={15} color="#fff" stroke={2.4} />
                      <Text style={styles.addDebtBtnText}>
                        {isZh ? '添加欠款' : 'Add to Owed'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {(account.cls === 'illiquid' || cls === 'illiquid') && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>
                    {isZh ? '购置成本 (选填)' : 'Cost of asset (optional)'}
                  </Text>
                  <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                    <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(account.currency)}</Text>
                    <TextInput
                      value={costText}
                      onChangeText={setCostText}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.amountInput, { color: colorTheme.ink }]}
                    />
                  </View>

                  {(() => {
                    const costVal = parseFloat(costText.replace(/[^0-9.]/g, ''));
                    const curVal = parseFloat(valueText.replace(/[^0-9.]/g, ''));
                    if (Number.isFinite(costVal) && costVal > 0 && Number.isFinite(curVal)) {
                      const diff = curVal - costVal;
                      const pct = Math.round((diff / costVal) * 1000) / 10;
                      const up = diff >= 0;
                      return (
                        <Text style={[styles.profitLine, { color: up ? signedUp : RED2, marginTop: 6 }]}>
                          {up ? '▲' : '▼'} {up ? '+' : '−'}{fmtMoney(dc.convert(Math.abs(diff)), dc.code)}
                          {` (${up ? '+' : '−'}${Math.abs(pct)}%) ${isZh ? '较购置成本' : 'vs cost'}`}
                        </Text>
                      );
                    }
                    return null;
                  })()}

                  <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>
                    {isZh ? '预估年化增值/折旧率 (选填)' : 'ETA appreciation / depreciation % (optional)'}
                  </Text>
                  <View style={[styles.toggle, { marginTop: 6, marginBottom: 8, backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
                    {([
                      ['appreciation', isZh ? '+ 增值' : '+ Appreciation'],
                      ['depreciation', isZh ? '− 折旧' : '− Depreciation'],
                    ] as const).map(([m, label]) => {
                      const on = editRateMode === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => setEditRateMode(m)}
                          style={[styles.toggleBtn, on && styles.toggleBtnOn, on && { backgroundColor: colorTheme.surface }]}
                        >
                          <Text
                            style={[
                              styles.toggleText,
                              { color: colorTheme.ink2 },
                              on && styles.toggleTextOn,
                              on && { color: m === 'appreciation' ? theme.accent : colorTheme.ink },
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={[styles.compactInputRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, width: 160 }]}>
                    <TextInput
                      value={rateText}
                      onChangeText={setRateText}
                      keyboardType="decimal-pad"
                      placeholder={editRateMode === 'depreciation' ? '10.0' : '5.0'}
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.compactInput, { color: colorTheme.ink }]}
                    />
                    <Text style={[styles.compactUnit, { color: colorTheme.ink2 }]}>% / yr</Text>
                  </View>
                </>
              )}

              {(account.cls === 'investments' || cls === 'investments') && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>{isZh ? '年化收益率 / APR (选填)' : 'Interest rate (optional)'}</Text>
                  <View style={[styles.compactInputRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                    <TextInput value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" placeholder="APR" placeholderTextColor={colorTheme.ink3} style={[styles.compactInput, { color: colorTheme.ink }]} />
                    <Text style={[styles.compactUnit, { color: colorTheme.ink2 }]}>%</Text>
                  </View>

                  {/* Convert manual investment account to live market holding */}
                  <View style={[styles.convertCard, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Icon name="sparkles" size={16} color={theme.accent} />
                      <Text style={[styles.convertTitle, { color: theme.accent }]}>
                        {isZh ? '转换为实时行情账户' : 'Convert to Live Holding'}
                      </Text>
                    </View>
                    <Text style={[styles.convertDesc, { color: colorTheme.ink2 }]}>
                      {isZh
                        ? '关联实时标的（美股、马股、加密货币、黄金/白银），自动同步每日最新行情。'
                        : 'Link a market ticker (stocks, ETFs, crypto, gold) to track live prices automatically.'}
                    </Text>
                    {holdingCoin ? (
                      <View style={{ marginTop: 12 }}>
                        <View style={[styles.holdingSelectedRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                          <View style={[styles.tickerBox, { backgroundColor: theme.accentTint }]}>
                            <Text style={[styles.tickerText, { color: theme.accent }]}>{holdingCoin.ticker.slice(0, 4)}</Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.coinName, { color: colorTheme.ink }]} numberOfLines={1}>{holdingCoin.name}</Text>
                            <Text style={[styles.coinSub, { color: colorTheme.ink2 }]}>{holdingCoin.ticker}</Text>
                          </View>
                          <Pressable onPress={() => setSearchOpen(true)} style={[styles.changeBtn, { backgroundColor: theme.accentTint }]}>
                            <Text style={[styles.changeText, { color: theme.accent }]}>{isZh ? '更换' : 'Change'}</Text>
                          </Pressable>
                          <Pressable onPress={() => setHoldingCoin(null)} hitSlop={6} style={{ padding: 4 }}>
                            <Icon name="x" size={16} color={colorTheme.ink3} />
                          </Pressable>
                        </View>

                        <Text style={[styles.fieldLabel, { marginTop: 12, color: colorTheme.ink2 }]}>
                          {holdingQtyLabel}
                        </Text>
                        <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                          <TextInput
                            value={qtyText}
                            onChangeText={setQtyText}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={colorTheme.ink3}
                            style={[styles.amountInput, { color: colorTheme.ink }]}
                          />
                          <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{holdingQtyUnit}</Text>
                        </View>

                        <Text style={[styles.fieldLabel, { marginTop: 12, color: colorTheme.ink2 }]}>
                          {isZh ? '买入成本 / 总投资额 (选填)' : 'Invested amount (cost)'}
                        </Text>
                        <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                          <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(account.currency)}</Text>
                          <TextInput
                            value={costText}
                            onChangeText={setCostText}
                            keyboardType="decimal-pad"
                            placeholder={valueText || '0.00'}
                            placeholderTextColor={colorTheme.ink3}
                            style={[styles.amountInput, { color: colorTheme.ink }]}
                          />
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setSearchOpen(true)}
                        style={[styles.linkTickerBtn, { backgroundColor: theme.accent }]}
                      >
                        <Icon name="search" size={15} color="#fff" stroke={2.2} />
                        <Text style={styles.linkTickerBtnText}>
                          {isZh ? '搜索并关联标的 (股票/币/黄金)' : 'Search & Link Live Ticker'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
            </>
          )}

          {history.length > 1 && (
            <View style={{ marginTop: 18 }}>
              <Pressable
                onPress={() => setShowHistory((prev) => !prev)}
                style={[
                  styles.historyBtn,
                  {
                    backgroundColor: colorTheme.surface,
                    borderColor: showHistory ? theme.accent : colorTheme.line,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  showHistory
                    ? (isZh ? '收起历史记录' : 'Hide histories')
                    : (isZh ? '查看历史记录' : 'View histories')
                }
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon
                    name="clock"
                    size={16}
                    color={showHistory ? theme.accent : colorTheme.ink2}
                  />
                  <Text
                    style={[
                      styles.historyBtnText,
                      { color: showHistory ? theme.accent : colorTheme.ink },
                    ]}
                  >
                    {showHistory
                      ? (isZh ? '收起历史记录' : 'Hide histories')
                      : (isZh ? '查看历史记录' : 'View histories')}
                  </Text>
                </View>
                <Icon
                  name={showHistory ? 'chevronUp' : 'chevronDown'}
                  size={16}
                  color={showHistory ? theme.accent : colorTheme.ink3}
                />
              </Pressable>

              {showHistory && (
                <Card style={{ overflow: 'hidden', marginTop: 8 }}>
                  {history.map((e, i) => (
                    <View key={e.id} style={[styles.histRow, i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }]]}>
                      <Text style={[styles.histDate, { color: colorTheme.ink2 }]}>{shortDate(e.asOf)}</Text>
                      <Text style={[styles.histVal, { color: colorTheme.ink }]}>{fmtMoney(e.value, account.currency)}</Text>
                    </View>
                  ))}
                </Card>
              )}
            </View>
          )}

          {/* Custom icon picker */}
          <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>{isZh ? '自定义图标 (选填)' : 'Custom Icon (Optional)'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <Pressable
              onPress={pickCustomIcon}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: colorTheme.surface2,
                borderWidth: 1.5,
                borderColor: customIcon ? theme.accent : colorTheme.line,
                borderRadius: radius.sm,
                paddingVertical: 10,
                paddingHorizontal: 16,
              }}
            >
              {customIcon ? (
                <Image source={{ uri: customIcon }} style={{ width: 20, height: 20, borderRadius: 4 }} />
              ) : (
                <Icon name="image" size={18} color={theme.accent} />
              )}
              <Text style={{ fontSize: 13, fontFamily: uiFont(700), color: theme.accent }}>
                {customIcon ? (isZh ? '更换图标' : 'Change icon') : (isZh ? '从相册选择' : 'Choose from gallery')}
              </Text>
            </Pressable>
            {customIcon && (
              <Pressable
                onPress={() => setCustomIcon(null)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colorTheme.redTint,
                }}
              >
                <Icon name="trash" size={16} color={colorTheme.red} />
              </Pressable>
            )}
          </View>

          <View style={{ marginTop: 20 }}>
            <PrimaryButton onPress={save} height={52}>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
              <BtnLabel>{isZh ? '保存' : 'Save'}</BtnLabel>
            </PrimaryButton>
          </View>
          {!isReceivable && (
            <Pressable onPress={confirmDelete} style={styles.deleteBtn} hitSlop={6}>
              <Icon name="trash" size={17} color="#b3261e" />
              <Text style={styles.deleteText}>{isZh ? '删除账户' : 'Delete account'}</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
      </KeyboardAvoidingView>

      <TickerSearchModal
        visible={searchOpen}
        title={isZh ? '搜索资产标的' : 'Search investment'}
        placeholder={isZh ? '输入代码、名称、加密货币、美股、马股或黄金…' : 'e.g. BTC, Maybank, AAPL, Gold…'}
        search={searchInvestments}
        onPick={(coin) => {
          setHoldingCoin(coin);
          if (!name.trim() || name === account.name) setName(coin.name);
          setSearchOpen(false);
        }}
        onClose={() => setSearchOpen(false)}
      />

      <SettleSheet
        share={settlingDebt}
        accounts={accounts}
        today={todayISO()}
        onClose={() => setSettlingDebt(null)}
        onSettle={async (amount, accountId) => {
          if (!settlingDebt) return;
          await settleShare(settlingDebt.shareId, amount, todayISO(), 'declared', null, accountId);
          setSettlingDebt(null);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  scanText: { fontFamily: uiFont(700), fontSize: 13 },
  profit: { fontFamily: numFont(700), fontSize: 12, marginTop: 2 },
  profitLine: { fontFamily: uiFont(600), fontSize: 13, marginTop: 12 },

  /* nav */
  nav: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base },

  /* net-worth journal */
  summary: { marginHorizontal: spacing.lg, paddingTop: spacing.sm, marginBottom: spacing.lg },
  summaryValue: { marginTop: spacing.xs },
  summaryDelta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  currencyBreakdown: { marginTop: spacing.sm },
  reviewBlock: { marginHorizontal: spacing.base, borderRadius: radius.sm, marginBottom: spacing.lg, overflow: 'hidden' },
  reviewSummary: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  reviewDot: { width: spacing.sm, height: spacing.sm, borderRadius: spacing.xs },
  reviewCopy: { flex: 1, minWidth: 0 },
  reviewMeta: { marginTop: spacing.xs },
  reviewList: { borderTopWidth: 1, paddingHorizontal: spacing.base },
  reviewAccount: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  updateButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.base, borderRadius: radius.sm },
  section: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  proInlineAction: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  sectionTitle: { flex: 1 },
  trendSurface: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  trendReadout: { marginBottom: spacing.xs, fontFamily: numFont(600) },
  trendChart: { width: '100%', height: 76 },
  trendMonths: { flexDirection: 'row', marginTop: spacing.xs },
  trendMonthHit: { flex: 1 },
  trendMonth: { textAlign: 'center' },
  trendMonthSelected: { fontFamily: uiFont(700) },
  trendEmpty: { minHeight: 76, borderTopWidth: 1, borderBottomWidth: 1, justifyContent: 'center', paddingVertical: spacing.base },
  moversList: { borderTopWidth: 1 },
  moverRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  totalsRow: { flexDirection: 'row', marginTop: spacing.md, paddingBottom: spacing.base, borderBottomWidth: 1 },
  totalItem: { flex: 1, gap: spacing.xs },
  totalItemEnd: { borderLeftWidth: 1, paddingLeft: spacing.base },
  accountGroups: { marginHorizontal: spacing.base, borderRadius: radius.sm, overflow: 'hidden' },
  classSummary: { minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  classSummaryMain: { flex: 1, minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  classMove: { paddingRight: spacing.base, paddingVertical: spacing.md },
  classSummaryIcon: { width: 36, height: 36, borderRadius: spacing.md, alignItems: 'center', justifyContent: 'center' },
  classSummaryCopy: { flex: 1, minWidth: 0 },
  classSummaryMeta: { marginTop: spacing.xs },
  accountDetails: { overflow: 'hidden' },
  accountActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm, marginHorizontal: spacing.base, marginTop: spacing.md },
  tertiaryAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  addAccountAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.base, borderRadius: radius.sm },
  emptyState: { marginHorizontal: spacing.lg, paddingTop: spacing.xl, alignItems: 'center' },
  emptyIcon: { width: 48, height: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.base },
  emptyBody: { textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.lg },
  emptyScan: { minHeight: 44, justifyContent: 'center', marginTop: spacing.sm },

  classCard: { overflow: 'hidden' },

  /* price stamp */
  priceStamp: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 8, borderBottomWidth: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: '#42e893' },
  priceStampText: { flex: 1, fontFamily: uiFont(500), fontSize: 11 },
  refreshBtn: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, minWidth: 64, alignItems: 'center' },
  refreshText: { fontFamily: uiFont(700), fontSize: 11 },

  /* rows */
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 18, paddingVertical: 11 },
  rowDivider: { borderBottomWidth: 1 },
  rowTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontFamily: uiFont(600), fontSize: 13 },
  rowSub: { fontFamily: uiFont(500), fontSize: 11, marginTop: 1 },
  rowVal: { fontFamily: numFont(700), fontSize: 14 },
  rowProfit: { fontFamily: numFont(700), fontSize: 11.5, marginTop: 1 },
  rowFx: { fontFamily: uiFont(500), fontSize: 10.5, marginTop: 1, maxWidth: 120 },
  badge: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeTick: { fontFamily: numFont(700), fontSize: 11, lineHeight: 13 },
  badgeLbl: { fontFamily: uiFont(500), fontSize: 11, opacity: 0.75, lineHeight: 9 },
  holdMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  holdMeta: { fontFamily: numFont(500), fontSize: 11, flexShrink: 1 },
  chChip: { fontFamily: numFont(700), fontSize: 11, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  liabNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liabChip: { fontFamily: uiFont(600), fontSize: 11, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17, marginTop: 12 },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  sectionTotal: { fontFamily: numFont(700), fontSize: 14 },
  classHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingTop: 13, paddingBottom: 4 },
  classIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  className: { flex: 1, fontFamily: uiFont(700), fontSize: 14.5 },
  classTotal: { fontFamily: numFont(700), fontSize: 13.5 },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 12, marginTop: 2 },
  divider: { borderTopWidth: 1 },
  acctName: { fontFamily: uiFont(600), fontSize: 14 },
  acctMeta: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 2 },
  acctVal: { fontFamily: numFont(600), fontSize: 13.5 },
  asOf: { fontFamily: uiFont(500), fontSize: 11.5, textAlign: 'center', marginTop: 16 },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  subChipOn: {},
  subChipText: { fontFamily: uiFont(700), fontSize: 13 },
  subChipTextOn: { color: '#fff' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 14 },
  pickerText: { flex: 1, fontFamily: uiFont(600), fontSize: 15 },
  holdingSummary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  holdingTicker: { fontFamily: uiFont(700), fontSize: 15, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  holdingPrice: { fontFamily: uiFont(500), fontSize: 12.5 },
  holdingValue: { fontFamily: numFont(700), fontSize: 18, marginTop: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10, maxHeight: '88%' },
  // Same visual sheet as `sheet`, but positioned by flexbox rather than `position: absolute`.
  // On Android, windowSoftInputMode="adjustResize" automatically resizes the Modal window when the keyboard opens;
  // giving the KeyboardAvoidingView `flex: 1` with `justifyContent: 'flex-end'` and disabling active height-avoidance
  // on Android (`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`) allows Android OS to resize the window
  // cleanly without the 60 FPS oscillation loop caused by KeyboardAvoidingView's height calculation against navigation bar insets.
  sheetAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { flex: 1, fontFamily: uiFont(700), fontSize: 19, marginRight: 12 },
  toggle: { flexDirection: 'row', borderRadius: 999, padding: 4, marginBottom: 18, borderWidth: 1 },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14 },
  toggleTextOn: { },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5 },
  classChipOn: {},
  classChipText: { fontFamily: uiFont(600), fontSize: 13 },
  textInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, fontFamily: uiFont(600), fontSize: 16 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14 },
  calcHint: { fontFamily: numFont(600), fontSize: 13, marginTop: 6, marginLeft: 2 },
  rm: { fontFamily: numFont(600), fontSize: 18 },
  amountInput: { flex: 1, minWidth: 0, fontFamily: numFont(700), fontSize: 24, paddingVertical: 12 },
  compactInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
    width: 130,
    gap: 6,
  },
  compactInput: {
    flex: 1,
    fontFamily: uiFont(600),
    fontSize: 14,
    paddingVertical: 0,
  },
  compactUnit: {
    fontFamily: uiFont(600),
    fontSize: 13,
    flexShrink: 0,
  },
  hint: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 6 },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  historyBtnText: {
    fontFamily: uiFont(600),
    fontSize: 13.5,
  },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 11 },
  histDate: { fontFamily: uiFont(500), fontSize: 13 },
  histVal: { fontFamily: numFont(600), fontSize: 13.5 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16, marginTop: 4 },
  deleteText: { fontFamily: uiFont(700), fontSize: 14.5, color: '#b3261e' },
  convertCard: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 18,
    marginBottom: 4,
  },
  convertTitle: { fontFamily: uiFont(700), fontSize: 14 },
  convertDesc: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  linkTickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.sm,
    paddingVertical: 12,
    marginTop: 12,
  },
  linkTickerBtnText: { fontFamily: uiFont(700), fontSize: 13.5, color: '#fff' },
  holdingSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
  },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  changeText: { fontFamily: uiFont(700), fontSize: 12 },
  tickerBox: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tickerText: {
    fontFamily: uiFont(700),
    fontSize: 12,
  },
  coinName: {
    fontFamily: uiFont(600),
    fontSize: 13.5,
  },
  coinSub: {
    fontFamily: uiFont(500),
    fontSize: 11.5,
    marginTop: 1,
  },
  debtEmptyCard: {
    padding: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  debtEmptyText: {
    fontFamily: uiFont(500),
    fontSize: 12.5,
    textAlign: 'center',
  },
  debtListCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  debtRowBorder: {
    borderTopWidth: 1,
  },
  debtAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtAvatarText: {
    fontFamily: uiFont(700),
    fontSize: 13,
  },
  debtPersonName: {
    fontFamily: uiFont(700),
    fontSize: 14,
  },
  debtPersonSub: {
    fontFamily: uiFont(500),
    fontSize: 11.5,
    marginTop: 1,
  },
  debtAmountText: {
    fontFamily: numFont(700),
    fontSize: 15,
  },
  addDebtBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
  },
  addDebtTitle: {
    fontFamily: uiFont(700),
    fontSize: 13.5,
    marginBottom: 10,
  },
  addDebtLabel: {
    fontFamily: uiFont(600),
    fontSize: 11.5,
    marginBottom: 4,
  },
  addDebtInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: uiFont(500),
    fontSize: 13.5,
  },
  personChip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  personChipText: {
    fontFamily: uiFont(600),
    fontSize: 11.5,
  },
  addDebtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.sm,
    paddingVertical: 10,
    marginTop: 12,
  },
  addDebtBtnText: {
    fontFamily: uiFont(700),
    fontSize: 13,
    color: '#fff',
  },
  receivableDebtCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
  },
  debtActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  debtActionChipText: {
    fontSize: 12,
    fontFamily: uiFont(600),
  },
});
