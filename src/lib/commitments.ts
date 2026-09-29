import { round2 } from './currency';
import { merchantKey } from './normalize';
import type { Transaction } from './types';

export type CommitmentKind = 'expense' | 'investment';
export type OccurrenceStatus = 'scheduled' | 'paid' | 'late' | 'skipped';

export interface Commitment {
  id: string;
  label: string;
  merchantKey: string;
  kind: CommitmentKind;
  amount: number;
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  /** 1..31. Clamped to the target month's last day, same rule as `addMonthsClamped`. */
  dueDay: number;
  startMonth: string; // 'YYYY-MM'
  endMonth: string | null; // 'YYYY-MM', null = open-ended
  archived: boolean;
  createdAt: string;
  /** LHDN relief line code this bill counts toward, set once in the Tax screen. Every future
   *  paid occurrence auto-tags its transaction against this code. Null = not a relief bill. */
  reliefCode: string | null;
  /** Currency this commitment is denominated in. Defaults to 'MYR'. */
  currency: string;
}

export interface CommitmentOccurrence {
  id: string;
  commitmentId: string;
  dueDate: string; // 'YYYY-MM-DD'
  month: string; // 'YYYY-MM'
  amount: number;
  paidAmount: number | null;
  paidOn: string | null;
  status: OccurrenceStatus;
  txnId: string | null;
  /** True when the ledger row was created by paying this occurrence (untick deletes it);
   *  false when it was matched to a transaction the user already had (untick only unlinks). */
  txnCreated: boolean;
  unitsAdded: number | null;
  priceMYR: number | null;
  createdAt: string;
  /** Frozen FX rate (MYR per native unit) when the occurrence was generated. Null for MYR. */
  fxRate: number | null;
}

/** Convert a native commitment amount to MYR at an occurrence's frozen rate. */
export function occurrenceMyr(nativeAmount: number, fxRate: number): number {
  return round2(nativeAmount * fxRate);
}

/**
 * Rows for the month timeline. On the current month the Overdue section already lists every
 * overdue occurrence (and keeps a just-paid one there for the rest of the session), so those
 * ids must not be drawn again underneath it.
 */
export function monthTimelineOccurrences<T extends { id: string }>(
  monthOccurrences: T[],
  overdueIds: ReadonlySet<string>,
  isCurrentMonth: boolean
): T[] {
  if (!isCurrentMonth) return monthOccurrences;
  return monthOccurrences.filter((o) => !overdueIds.has(o.id));
}

export interface NewOccurrence {
  commitmentId: string;
  dueDate: string;
  month: string;
  amount: number;
}

/** How many months ahead of `fromMonth` to keep occurrences materialised. */
export const OCCURRENCE_HORIZON_MONTHS = 24;

/** A tick matches an existing transaction within this fraction of the expected amount. */
const MATCH_AMOUNT_TOLERANCE = 0.05;
/** A tick matches an existing transaction dated within this many days of the due date. */
const MATCH_DAY_WINDOW = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** First day of the next calendar month after `mk` ('YYYY-MM' -> 'YYYY-MM'). */
function nextMonthKey(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The due date for a given month and day-of-month, clamped to that month's last day
 *  (e.g. dueDay 31 in February -> the 28th/29th). */
export function clampToMonth(month: string, dueDay: number): string {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * Generate the occurrences a commitment should have from `fromMonth` through
 * `OCCURRENCE_HORIZON_MONTHS` months ahead (inclusive), bounded by `startMonth`/`endMonth`.
 * No backfill: a commitment created with an old `startMonth` never spawns a wall of overdue
 * occurrences, it only ever generates forward from wherever materialisation last reached.
 */
export function occurrencesFor(c: Commitment, fromMonth: string, monthsAhead: number = OCCURRENCE_HORIZON_MONTHS): NewOccurrence[] {
  const start = c.startMonth > fromMonth ? c.startMonth : fromMonth;
  const out: NewOccurrence[] = [];
  let month = start;
  for (let i = 0; i < monthsAhead; i++) {
    if (c.endMonth && month > c.endMonth) break;
    out.push({
      commitmentId: c.id,
      dueDate: clampToMonth(month, c.dueDay),
      month,
      amount: c.amount,
    });
    month = nextMonthKey(month);
  }
  return out;
}

/**
 * Find an already-saved transaction likely to BE this occurrence's payment, so ticking never
 * creates a duplicate of a row the user already logged (e.g. via a bank-statement import).
 * Looser than `findDuplicate` in duplicates.ts on purpose: that helper requires an exact amount
 * and exact day, which is right for de-duplicating a second scan of the same receipt, but wrong
 * here — a bill can post a few days either side of its due date and drift a little in amount.
 */
export function findCommitmentMatch(
  candidates: Transaction[],
  commitment: Commitment,
  dueDate: string,
  excludeTxnIds: ReadonlySet<string> = new Set()
): Transaction | null {
  const key = merchantKey(commitment.label);
  if (!key) return null;
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  for (const t of candidates) {
    if (excludeTxnIds.has(t.id)) continue;
    if (t.merchantKey !== key && t.merchantKey !== commitment.merchantKey) continue;
    if (Math.abs(t.amount - commitment.amount) > commitment.amount * MATCH_AMOUNT_TOLERANCE) continue;
    const d = t.date ?? t.createdAt.slice(0, 10);
    const dTime = new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime();
    if (Math.abs(dTime - due) > MATCH_DAY_WINDOW * MS_PER_DAY) continue;
    return t;
  }
  return null;
}
