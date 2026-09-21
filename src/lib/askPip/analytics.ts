import { isValidIsoDate } from '../dates';
import type { Transaction } from '../types';
import type {
  AskPipAnalysisGroup,
  AskPipAnalysisRequest,
  AskPipAnalysisStatistic,
} from './catalog';

export interface AskPipAnalysisContext {
  categories: { id: string; label: string }[];
  trips: { id: string; name: string }[];
  today: string;
}

export interface AskPipAnalysisGroupResult {
  id: string;
  label: string;
  value: number;
  count: number;
}

export interface AskPipAnalysisTransactionResult {
  id: string;
  merchant: string;
  date: string;
  amount: number;
  categoryId: string | null;
  tripId: string | null;
}

export interface AskPipAnalysisResult {
  request: AskPipAnalysisRequest;
  value: number | null;
  primaryValue: number;
  comparisonValue?: number;
  unavailableReason?: 'comparison_is_zero' | 'date_range_is_future';
  hasData: boolean;
  transactionCount: number;
  comparisonTransactionCount?: number;
  dayCount: number;
  comparisonDayCount?: number;
  basis: 'daily_totals_including_zero_days' | 'transactions';
  usedFallbackDateCount: number;
  topTransactions?: AskPipAnalysisTransactionResult[];
  groups?: AskPipAnalysisGroupResult[];
}

type DatedTxn = { txn: Transaction; date: string; value: number; usedFallbackDate: boolean };

const DAY_MS = 86_400_000;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function utcDay(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayCount(from: string, to: string): number {
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) return 0;
  return Math.floor((utcDay(to) - utcDay(from)) / DAY_MS) + 1;
}

function dayKeys(from: string, to: string): string[] {
  const count = dayCount(from, to);
  const start = utcDay(from);
  return Array.from({ length: count }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

function transactionDate(txn: Transaction): { date: string | null; fallback: boolean } {
  if (isValidIsoDate(txn.date)) return { date: txn.date!, fallback: false };
  const created = txn.createdAt.slice(0, 10);
  return isValidIsoDate(created) ? { date: created, fallback: true } : { date: null, fallback: false };
}

function measureValue(txn: Transaction, measure: AskPipAnalysisRequest['measure']): number | null {
  if (!Number.isFinite(txn.amount) || txn.amount < 0 || txn.type === 'transfer') return null;
  if (measure === 'expense') return txn.type === 'expense' ? txn.amount : null;
  if (measure === 'income') return txn.type === 'income' ? txn.amount : null;
  if (txn.type === 'income') return txn.amount;
  if (txn.type === 'expense') return -txn.amount;
  return null;
}

function matchesRequest(txn: Transaction, request: AskPipAnalysisRequest, context: AskPipAnalysisContext): boolean {
  if (request.categoryId && txn.categoryId !== request.categoryId) return false;
  if (request.categoryQuery) {
    const needle = request.categoryQuery.toLowerCase();
    const label = context.categories.find((category) => category.id === txn.categoryId)?.label ?? '';
    if (!label.toLowerCase().includes(needle)) return false;
  }
  if (request.merchantQuery && !txn.merchantRaw.toLowerCase().includes(request.merchantQuery.toLowerCase())) return false;
  if (request.tripId && txn.tripId !== request.tripId) return false;
  if (request.tripQuery) {
    const needle = request.tripQuery.toLowerCase();
    const name = context.trips.find((trip) => trip.id === txn.tripId)?.name ?? '';
    if (!name.toLowerCase().includes(needle)) return false;
  }
  return true;
}

function filterPeriod(
  request: AskPipAnalysisRequest,
  transactions: Transaction[],
  context: AskPipAnalysisContext,
  from: string,
  to: string,
): DatedTxn[] {
  const out: DatedTxn[] = [];
  for (const txn of transactions) {
    const value = measureValue(txn, request.measure);
    if (value === null || !matchesRequest(txn, request, context)) continue;
    const dated = transactionDate(txn);
    if (!dated.date || dated.date < from || dated.date > to) continue;
    out.push({ txn, date: dated.date, value, usedFallbackDate: dated.fallback });
  }
  return out;
}

function dailyTotals(rows: DatedTxn[], from: string, to: string): number[] {
  const totals = new Map(dayKeys(from, to).map((day) => [day, 0]));
  for (const row of rows) totals.set(row.date, (totals.get(row.date) ?? 0) + row.value);
  return [...totals.values()];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function statisticValue(statistic: AskPipAnalysisStatistic, rows: DatedTxn[], from: string, to: string): number {
  const daily = dailyTotals(rows, from, to);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (statistic === 'total') return round2(total);
  if (statistic === 'transaction_count') return rows.length;
  if (statistic === 'largest_transaction') return round2(rows.reduce((max, row) => Math.max(max, row.value), 0));
  if (daily.length === 0) return 0;
  const mean = daily.reduce((sum, value) => sum + value, 0) / daily.length;
  if (statistic === 'daily_mean') return round2(mean);
  if (statistic === 'daily_median') return round2(median(daily));
  if (statistic === 'daily_min') return round2(Math.min(...daily));
  if (statistic === 'daily_max') return round2(Math.max(...daily));
  const variance = daily.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / daily.length;
  return statistic === 'daily_variance' ? round2(variance) : round2(Math.sqrt(variance));
}

function topTransactions(rows: DatedTxn[], value: number): AskPipAnalysisTransactionResult[] {
  if (rows.length === 0) return [];
  return rows
    .filter((row) => round2(row.value) === value)
    .slice(0, 20)
    .map((row) => ({
      id: row.txn.id,
      merchant: row.txn.merchantRaw,
      date: row.date,
      amount: round2(row.value),
      categoryId: row.txn.categoryId,
      tripId: row.txn.tripId ?? null,
    }));
}

function groupIdentity(
  row: DatedTxn,
  groupBy: AskPipAnalysisGroup,
  context: AskPipAnalysisContext,
): { id: string; label: string } {
  if (groupBy === 'merchant') {
    const label = row.txn.merchantRaw.trim() || 'Unknown merchant';
    return { id: row.txn.merchantKey || label.toLowerCase(), label };
  }
  if (groupBy === 'trip') {
    const id = row.txn.tripId ?? 'no-trip';
    return { id, label: context.trips.find((trip) => trip.id === row.txn.tripId)?.name ?? 'No trip' };
  }
  const id = row.txn.categoryId ?? 'uncategorized';
  return { id, label: context.categories.find((category) => category.id === row.txn.categoryId)?.label ?? 'Unknown category' };
}

function grouped(
  rows: DatedTxn[],
  groupBy: AskPipAnalysisGroup,
  limit: number,
  context: AskPipAnalysisContext,
): AskPipAnalysisGroupResult[] {
  const groups = new Map<string, AskPipAnalysisGroupResult>();
  for (const row of rows) {
    const identity = groupIdentity(row, groupBy, context);
    const current = groups.get(identity.id) ?? { ...identity, value: 0, count: 0 };
    current.value += row.value;
    current.count += 1;
    groups.set(identity.id, current);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, value: round2(group.value) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function computeAskPipAnalysis(
  request: AskPipAnalysisRequest,
  transactions: Transaction[],
  context: AskPipAnalysisContext,
): AskPipAnalysisResult {
  const effectiveTo = request.dateTo > context.today ? context.today : request.dateTo;
  const futureOnly = request.dateFrom > effectiveTo;
  const rows = futureOnly ? [] : filterPeriod(request, transactions, context, request.dateFrom, effectiveTo);
  const days = futureOnly ? 0 : dayCount(request.dateFrom, effectiveTo);
  const primaryValue = statisticValue(request.statistic, rows, request.dateFrom, effectiveTo);
  const result: AskPipAnalysisResult = {
    request: { ...request, dateTo: effectiveTo },
    value: futureOnly ? null : primaryValue,
    primaryValue,
    unavailableReason: futureOnly ? 'date_range_is_future' : undefined,
    hasData: rows.length > 0,
    transactionCount: rows.length,
    dayCount: days,
    basis: request.statistic.startsWith('daily_') ? 'daily_totals_including_zero_days' : 'transactions',
    usedFallbackDateCount: rows.filter((row) => row.usedFallbackDate).length,
  };

  if (request.statistic === 'largest_transaction') {
    result.topTransactions = topTransactions(rows, primaryValue);
  }
  if (request.groupBy) {
    result.groups = grouped(rows, request.groupBy, request.limit ?? 5, context);
  }
  if (request.comparison && request.compareFrom && request.compareTo) {
    const comparisonTo = request.compareTo > context.today ? context.today : request.compareTo;
    const comparisonRows = request.compareFrom > comparisonTo
      ? []
      : filterPeriod(request, transactions, context, request.compareFrom, comparisonTo);
    const comparisonValue = statisticValue(request.statistic, comparisonRows, request.compareFrom, comparisonTo);
    result.comparisonValue = comparisonValue;
    result.comparisonTransactionCount = comparisonRows.length;
    result.comparisonDayCount = dayCount(request.compareFrom, comparisonTo);
    if (request.comparison === 'difference') {
      result.value = round2(primaryValue - comparisonValue);
    } else if (comparisonValue === 0) {
      result.value = null;
      result.unavailableReason = 'comparison_is_zero';
    } else {
      result.value = round2(((primaryValue - comparisonValue) / Math.abs(comparisonValue)) * 100);
    }
  }
  return result;
}
