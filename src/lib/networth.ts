// src/lib/networth.ts
// Pure, deterministic balance-sheet logic. No UI/DB imports  unit-tested.
import type { Account, AccountKind, BalanceEntry, TxnType } from './types';
import { rateFor } from './fx';
import { round2 } from './currency';

export interface ClassMeta {
  id: string;
  label: string;
  kind: AccountKind;
  icon: string; // IconName
  /** Owned by a feature, not by the user: hidden from the class pickers so it cannot be
   *  hand-created or edited into a desynced state. Still resolves for display. */
  managed?: boolean;
}

/** The fixed asset/liability classes, in display order. */
export const ACCOUNT_CLASSES: ClassMeta[] = [
  { id: 'cash', label: 'Cash & Bank', kind: 'asset', icon: 'cash' },
  { id: 'investments', label: 'Investments', kind: 'asset', icon: 'trending' },
  { id: 'illiquid', label: 'Illiquid Assets', kind: 'asset', icon: 'home' },
  // Money friends owe you from split bills. Maintained by the split engine, never by hand.
  { id: 'receivable', label: 'Owed to me', kind: 'asset', icon: 'gift', managed: true },
  { id: 'mortgage', label: 'Mortgage', kind: 'liability', icon: 'home' },
  { id: 'personal', label: 'Personal Loan', kind: 'liability', icon: 'wallet' },
  { id: 'credit_card', label: 'Credit Card', kind: 'liability', icon: 'receipt' },
  { id: 'pay_later', label: 'Pay Later', kind: 'liability', icon: 'clock' },
  { id: 'car', label: 'Car Loan', kind: 'liability', icon: 'car' },
];

export const CLASS_BY_ID: Record<string, ClassMeta> = Object.fromEntries(
  ACCOUNT_CLASSES.map((c) => [c.id, c])
);

/** The classes a user may pick when creating or re-classing an account (managed ones excluded). */
export function classesFor(kind: AccountKind): ClassMeta[] {
  return ACCOUNT_CLASSES.filter((c) => c.kind === kind && !c.managed);
}

/** The single slug the split engine keeps its receivable balance under. */
export const RECEIVABLE_CLS = 'receivable';

/** Order entries oldest→newest by asOf date, tie-broken by createdAt. */
function chronological(entries: BalanceEntry[]): BalanceEntry[] {
  return [...entries].sort((a, b) =>
    a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  );
}

/** The most recent reading's value (0 if none). */
export function currentValue(entries: BalanceEntry[]): number {
  if (entries.length === 0) return 0;
  const sorted = chronological(entries);
  return sorted[sorted.length - 1].value;
}

/** The value as of a date: the latest reading on or before it (0 if none yet). */
export function accountValueAsOf(entries: BalanceEntry[], date: string): number {
  const eligible = chronological(entries.filter((e) => e.asOf <= date));
  return eligible.length ? eligible[eligible.length - 1].value : 0;
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  net: number;
}

/** Total assets, total liabilities, and net (assets − liabilities). Skips archived. */
export function netWorth(accounts: Account[], valueById: Record<string, number>): NetWorth {
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    const v = valueById[a.id] ?? 0;
    if (a.kind === 'asset') assets += v;
    else liabilities += v;
  }
  return { assets, liabilities, net: assets - liabilities };
}

export interface ConvertedValues {
  /** MYR values, keyed by account id. An account with no usable rate is absent. */
  valueById: Record<string, number>;
  /** Account ids that could not be converted, for the "rate unavailable" row hint. */
  unconvertible: string[];
}

/**
 * Convert native account values into MYR.
 *
 * An account with no rate is omitted from `valueById` entirely rather than defaulting to
 * its native number. `netWorth` and `groupByClass` both read `valueById[id] ?? 0`, so
 * omission excludes it from the total, which is the required behaviour: counting a foreign
 * balance at 1:1 is the bug this feature exists to fix, and doing it in a fallback path
 * would make it look deliberate.
 */
export function toMyrValues(
  accounts: Account[],
  valueById: Record<string, number>,
  rates: Record<string, number>
): ConvertedValues {
  const out: Record<string, number> = {};
  const unconvertible: string[] = [];
  for (const a of accounts) {
    if (a.archived) continue;
    const rate = rateFor(rates, a.currency);
    if (rate == null) {
      unconvertible.push(a.id);
      continue;
    }
    out[a.id] = round2((valueById[a.id] ?? 0) * rate);
  }
  return { valueById: out, unconvertible };
}

/**
 * Native (unconverted) account balances grouped by currency — the per-currency breakdown
 * row on Net Worth. Unlike `toMyrValues`, nothing here is converted: a CNY 500 account
 * contributes to the CNY bucket at 500, not its MYR equivalent.
 */
export function nativeAccountTotalsByCurrency(
  accounts: Account[],
  nativeValueById: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = { MYR: 0 };
  for (const a of accounts) {
    if (a.archived) continue;
    const v = nativeValueById[a.id] ?? 0;
    out[a.currency] = round2((out[a.currency] ?? 0) + v);
  }
  return out;
}

export interface ClassGroup {
  cls: string;
  label: string;
  kind: AccountKind;
  total: number;
  accounts: { account: Account; value: number }[];
}

/** Group active accounts by class (in ACCOUNT_CLASSES order), split into assets and liabilities. */
export function groupByClass(
  accounts: Account[],
  valueById: Record<string, number>
): { assets: ClassGroup[]; liabilities: ClassGroup[] } {
  const groups = new Map<string, ClassGroup>();
  for (const a of accounts) {
    if (a.archived) continue;
    let g = groups.get(a.cls);
    if (!g) {
      const meta = CLASS_BY_ID[a.cls];
      g = { cls: a.cls, label: meta?.label ?? a.cls, kind: a.kind, total: 0, accounts: [] };
      groups.set(a.cls, g);
    }
    const value = valueById[a.id] ?? 0;
    g.total += value;
    g.accounts.push({ account: a, value });
  }
  const ordered = ACCOUNT_CLASSES.map((c) => groups.get(c.id)).filter((g): g is ClassGroup => !!g);
  // Sort accounts within each class by current value, high → low.
  for (const g of ordered) g.accounts.sort((a, b) => b.value - a.value);
  return {
    assets: ordered.filter((g) => g.kind === 'asset'),
    liabilities: ordered.filter((g) => g.kind === 'liability'),
  };
}

export interface NetWorthPoint extends NetWorth {
  monthKey: string;
  /**
   * True when at least one `manual` (or legacy) balance reading fell in this month for an
   * account that still contributes to the total. Linked/price-only months are carried.
   */
  measured: boolean;
}

/** YYYY-MM-DD cutoff for an archived account, or null while it is still active. */
export function resolveArchivedAt(account: Account, entries: BalanceEntry[]): string | null {
  if (!account.archived) return null;
  if (account.archivedAt) return account.archivedAt.slice(0, 10);
  let latest: string | null = null;
  for (const e of entries) {
    if (e.accountId !== account.id) continue;
    if (!latest || e.asOf > latest) latest = e.asOf;
  }
  return latest;
}

/** Accounts that should contribute to net worth on `date` (YYYY-MM-DD).
 *  Archived accounts remain through the calendar month of their archive date. */
export function accountsActiveAsOf(
  accounts: Account[],
  entries: BalanceEntry[],
  date: string
): Account[] {
  const month = date.slice(0, 7);
  return accounts.filter((a) => {
    if (!a.archived) return true;
    const until = resolveArchivedAt(a, entries);
    return until != null && month <= until.slice(0, 7);
  });
}

function entrySource(e: BalanceEntry): NonNullable<BalanceEntry['source']> {
  return e.source ?? 'manual';
}

/**
 * MYR account values as of the end of `monthKey`, including archived accounts that were
 * still active then. Used by the history drill-down to compute class movers between months.
 */
export function classValuesAsOf(
  accounts: Account[],
  entries: BalanceEntry[],
  monthKey: string,
  rates: Record<string, number> = {}
): Record<string, number> {
  const upper = `${monthKey}-31`;
  const active = accountsActiveAsOf(accounts, entries, upper);
  // toMyrValues / netWorth skip archived — temporarily treat contributors as active.
  const asActive = active.map((a) => (a.archived ? { ...a, archived: false } : a));
  const native: Record<string, number> = {};
  for (const a of asActive) {
    native[a.id] = accountValueAsOf(
      entries.filter((e) => e.accountId === a.id),
      upper
    );
  }
  return toMyrValues(asActive, native, rates).valueById;
}

/** Month-end net worth for each 'YYYY-MM' key (latest reading on or before month end). The
 *  default empty rate table plus `rateFor` short-circuiting MYR to 1 means every existing
 *  MYR-only caller is unaffected. */
export function netWorthSeries(
  accounts: Account[],
  entries: BalanceEntry[],
  monthKeys: string[],
  rates: Record<string, number> = {}
): NetWorthPoint[] {
  const byAccount: Record<string, BalanceEntry[]> = {};
  for (const e of entries) (byAccount[e.accountId] ??= []).push(e);
  // Sort each account's history ONCE. Calling `accountValueAsOf` per month re-filtered and
  // re-sorted the same rows for every month in the series, so the screen got quadratically
  // slower the longer someone had used the app — the users it should be fastest for.
  for (const id of Object.keys(byAccount)) byAccount[id] = chronological(byAccount[id]);

  const archivedUntil: Record<string, string | null> = {};
  for (const a of accounts) {
    archivedUntil[a.id] = resolveArchivedAt(a, byAccount[a.id] ?? []);
  }

  // Walk the months oldest → newest with a cursor per account, carrying the last reading
  // forward. Each entry is visited once across the whole series instead of once per month.
  // The output keeps the caller's original `monthKeys` order, which is why this indexes
  // rather than sorting the keys themselves.
  const order = monthKeys.map((_, i) => i).sort((a, b) => monthKeys[a].localeCompare(monthKeys[b]));
  const cursor: Record<string, number> = {};
  const latest: Record<string, number> = {};
  const out: NetWorthPoint[] = new Array(monthKeys.length);

  for (const i of order) {
    const mk = monthKeys[i];
    const upper = `${mk}-31`; // string upper bound for the month (safe for YYYY-MM-DD compare)
    const monthStart = `${mk}-01`;
    // Include through the archive month: account contributes while monthStart <= archivedAt.
    const forTotals = accounts.filter((a) => {
      if (!a.archived) return true;
      const until = archivedUntil[a.id];
      return until != null && monthStart <= until;
    });
    const asActive = forTotals.map((a) => (a.archived ? { ...a, archived: false } : a));

    const native: Record<string, number> = {};
    let measured = false;
    for (const a of forTotals) {
      const list = byAccount[a.id];
      if (list) {
        let c = cursor[a.id] ?? 0;
        while (c < list.length && list[c].asOf <= upper) {
          latest[a.id] = list[c].value;
          if (list[c].asOf >= monthStart && entrySource(list[c]) === 'manual') {
            measured = true;
          }
          c++;
        }
        cursor[a.id] = c;
      }
      native[a.id] = latest[a.id] ?? 0;
    }
    const { valueById } = toMyrValues(asActive, native, rates);
    out[i] = { monthKey: mk, measured, ...netWorth(asActive, valueById) };
  }
  return out;
}

/** Every 'YYYY-MM' key from the earliest balance entry through the current month, inclusive
 *  and oldest first. Empty when there's no balance history yet. */
export function monthsWithData(entries: BalanceEntry[], now: Date = new Date()): string[] {
  if (entries.length === 0) return [];
  const earliest = entries.reduce((min, e) => (e.asOf < min ? e.asOf : min), entries[0].asOf);
  const [startYear, startMonth] = earliest.slice(0, 7).split('-').map(Number);
  const cursor = new Date(startYear, startMonth - 1, 1);
  const out: string[] = [];
  while (cursor <= now) {
    out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export type LinkEffect = 'add' | 'subtract';

/** Smart default for how a linked transaction moves an account's balance. */
export function defaultLinkEffect(kind: AccountKind, txnType: TxnType): LinkEffect {
  if (kind === 'liability') return txnType === 'expense' ? 'subtract' : 'add';
  return txnType === 'income' ? 'add' : 'subtract';
}

/** Apply a link to a current balance, rounded to cents. */
export function applyEffect(current: number, amount: number, effect: LinkEffect): number {
  const v = effect === 'add' ? current + amount : current - amount;
  return Math.round(v * 100) / 100;
}
