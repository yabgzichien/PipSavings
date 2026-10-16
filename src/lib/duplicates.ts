import { merchantKey } from './normalize';
import type { ExtractedTxn, Split, Transaction, TxnType } from './types';

export interface DupCandidate {
  merchant: string;
  amount: number;
  date: string | null;
  /** `HH:mm` printed on the row, when the scan read one. */
  time?: string | null;
  /** When given, a saved row of the other kind is never a duplicate. */
  type?: TxnType;
}

/** Inclusive YYYY-MM-DD range an undated candidate is known to fall inside. */
export interface DayWindow {
  from: string;
  to: string;
}

export interface DupMatch {
  txn: Transaction;
  /** Set when the candidate matched the full bill of a split row rather than the saved share. */
  split: { gross: number; ownShare: number } | null;
  /** Both rows carry a clock time and it is the same one. */
  sameTime: boolean;
}

export interface FindDuplicateOptions {
  /** Splits on saved rows. A split row stores only the payer's share, so the scanned line
   *  (the whole bill) has to be compared against `gross` too. */
  splits?: Pick<Split, 'txnId' | 'gross' | 'ownShare'>[];
  /** For an undated candidate: the days its dated neighbours box it into. */
  window?: DayWindow | null;
}

/** How far back an undated candidate with no neighbours is compared. */
export const UNDATED_LOOKBACK_DAYS = 30;

/** Containment only counts once the shorter name is this long, so "Grab" is not "Grab Food". */
const MIN_CONTAINED_LENGTH = 6;

/** Extract the YYYY-MM-DD day from an ISO date/datetime, or null. */
function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

/** Letters and digits only, so OCR punctuation ("XM Sepang ▪") cannot split one merchant in two. */
function compactMerchant(raw: string): string {
  return merchantKey(raw).replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Whether two merchant labels name the same payee: identical once reduced to letters and
 * digits, or one wholly inside the other ("Food Court Botanic" / "33 Food Court Botanic").
 */
export function sameMerchant(a: string, b: string): boolean {
  const x = compactMerchant(a);
  const y = compactMerchant(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= MIN_CONTAINED_LENGTH && long.includes(short);
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.005;
}

/**
 * Find an already-saved transaction that a freshly-extracted item is likely a duplicate of.
 * Deliberately generous: a hit only raises a banner, and the user decides.
 *
 * - Merchant: `sameMerchant`.
 * - Amount: the saved row's native figure, or, for a split row, the bill's `gross`.
 * - Day: the candidate's own date. An undated candidate matches anywhere inside `window`, or
 *   within the last `UNDATED_LOOKBACK_DAYS` of `today` when no window is known.
 * - Time: never required. A matching time is reported so the banner can say so; a different
 *   time does not clear the match, since a misread clock must not hide a repeat.
 *
 * A saved transaction's day is its `date` when present, else the day of `createdAt`.
 */
export function findDuplicate(
  saved: Transaction[],
  candidate: DupCandidate,
  today: string,
  options: FindDuplicateOptions = {}
): DupMatch | null {
  if (!compactMerchant(candidate.merchant)) return null;
  const candDay = dayOf(candidate.date);
  const window: DayWindow | null = candDay
    ? { from: candDay, to: candDay }
    : options.window ?? { from: shiftDay(today, -UNDATED_LOOKBACK_DAYS), to: today };
  const splitByTxn = new Map((options.splits ?? []).map((s) => [s.txnId, s]));

  for (const s of saved) {
    if (candidate.type && s.type !== candidate.type) continue;
    const savedDay = dayOf(s.date) ?? dayOf(s.createdAt);
    if (!savedDay || savedDay < window.from || savedDay > window.to) continue;
    if (!sameMerchant(s.merchantRaw || s.merchantKey, candidate.merchant)) continue;

    const split = splitByTxn.get(s.id);
    const ownAmount = s.nativeAmount ?? s.amount;
    let viaSplit = false;
    if (!sameAmount(ownAmount, candidate.amount)) {
      if (!split || !sameAmount(split.gross, candidate.amount)) continue;
      viaSplit = true;
    }
    return {
      txn: s,
      split: viaSplit && split ? { gross: split.gross, ownShare: split.ownShare } : null,
      sameTime: !!s.time && !!candidate.time && s.time === candidate.time,
    };
  }
  return null;
}

/**
 * The index of the dated row in the same scan that an undated row repeats, or null.
 *
 * Long statements are extracted in overlapping pieces, and a row on a seam can come back a
 * second time without its timestamp and with a slightly mangled name. A row with no date
 * that otherwise matches a dated row of the same batch is almost always that echo.
 */
export function findBatchCopy(items: ExtractedTxn[], index: number): number | null {
  const it = items[index];
  if (!it || it.date) return null;
  for (let i = 0; i < items.length; i++) {
    if (i === index) continue;
    const other = items[i];
    if (!other.date || other.type !== it.type || (other.currency ?? '') !== (it.currency ?? '')) continue;
    if (!sameAmount(other.amount, it.amount)) continue;
    if (sameMerchant(other.merchant, it.merchant)) return i;
  }
  return null;
}

/**
 * The days an undated row must fall within, read from the nearest dated rows on either side
 * of it in statement order. Statements are sorted by date, so a row boxed in by two dated
 * rows lies between them. Null when it is not boxed in on both sides.
 */
export function undatedWindow(items: ExtractedTxn[], index: number): DayWindow | null {
  let before: string | null = null;
  for (let i = index - 1; i >= 0 && !before; i--) before = dayOf(items[i].date);
  let after: string | null = null;
  for (let i = index + 1; i < items.length && !after; i++) after = dayOf(items[i].date);
  if (!before || !after) return null;
  return before <= after ? { from: before, to: after } : { from: after, to: before };
}

/** Today's date as YYYY-MM-DD (local). */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
