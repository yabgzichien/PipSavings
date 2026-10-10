/* Trip types. A trip is a second, orthogonal grouping over existing transactions — see
 * src/db/tripsRepo.ts for the repository and docs/superpowers/sdd for the design. */

import { txnMonthKey } from './budget';
import { destinationByKey, matchDestination, type DestinationKey } from './destinations';
import type { Transaction } from './types';

/** A named trip a user can (optionally) attach transactions to. New trips require both dates;
 *  the nullable fields preserve legacy rows created before that rule. Dates are metadata for
 *  display and candidate-finding only, never a filter that decides membership on their own. */
export interface Trip {
  id: string;
  name: string;
  createdAt: string;
  archived: boolean;
  startDate: string | null;
  endDate: string | null;
  /**
   * The trip's chosen icon, or `null` to derive one from the name.
   *
   * Three states in one column, mirroring `categories.icon`: `null` = follow the name, a
   * destination key ('jp') = the user picked a landmark, a `data:`/`file:` URI = the user picked
   * an image from their gallery.
   *
   * Deliberately NOT populated with the auto-derived key at creation time. Storing the guess
   * would make "Pip guessed this" and "the user chose this" indistinguishable, and a later
   * rename could then either overwrite a deliberate choice or be unable to update a stale guess.
   */
  icon: string | null;
  /**
   * A photo behind the recorded-expenses card, or null when that card is plain.
   * Separate from `icon`: a landmark badge and a wide cover are different choices.
   */
  cover?: string | null;
  /**
   * Currency the recorded-expenses total and category amounts convert into.
   * Null or absent follows the app display currency. Transaction rows keep their own currency.
   */
  currency?: string | null;
}

export interface TripTotals {
  recordedExpenses: number;
  txnCount: number;
  byCategory: { categoryId: string; amount: number }[];
}

/** What one trip contributed to a single month, plus the whole-trip figure it is a part of. */
export interface TripMonthTotal {
  trip: Trip;
  /** Expenses dated inside the month. Reconciles against that month's total spending. */
  monthAmount: number;
  monthCount: number;
  /** Every expense in the trip, regardless of date — context for the month figure. */
  tripTotal: number;
}

export type FeaturedTripTiming = 'current' | 'upcoming' | 'past';

export interface FeaturedTrip {
  trip: Trip;
  timing: FeaturedTripTiming;
}

/**
 * Pick the one dated trip Home should feature for a local calendar day.
 *
 * Current ranges are inclusive at both ends. If they overlap, the trip that began most recently
 * is the one the user is most likely acting on. Outside a current range, Home looks forward to
 * the nearest departure before falling back to the trip that ended most recently. Archived and
 * legacy undated rows stay available in Trips but do not claim Home's limited hero space.
 */
export function featuredTripForDate(trips: readonly Trip[], today: string): FeaturedTrip | null {
  const dated = trips.filter(
    (trip) => !trip.archived && !!trip.startDate && !!trip.endDate && trip.endDate >= trip.startDate
  );

  const current = dated
    .filter((trip) => trip.startDate! <= today && today <= trip.endDate!)
    .sort((a, b) => b.startDate!.localeCompare(a.startDate!) || a.endDate!.localeCompare(b.endDate!));
  if (current[0]) return { trip: current[0], timing: 'current' };

  const upcoming = dated
    .filter((trip) => trip.startDate! > today)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  if (upcoming[0]) return { trip: upcoming[0], timing: 'upcoming' };

  const past = dated
    .filter((trip) => trip.endDate! < today)
    .sort((a, b) => b.endDate!.localeCompare(a.endDate!));
  return past[0] ? { trip: past[0], timing: 'past' } : null;
}

/**
 * The currency a trip's recorded-expenses total should render in.
 * A blank or missing choice follows the app display currency rather than pinning a code.
 */
export function tripCurrencyCode(trip: { currency?: string | null }, appCode: string): string {
  const code = typeof trip.currency === 'string' ? trip.currency.trim() : '';
  return code || appCode;
}

/**
 * Whether a stored icon value is a picture rather than a named glyph.
 *
 * Shared with categories, whose custom icons use the identical convention (see `CatBadge`) —
 * the two must agree, because both store "a glyph name or an image" in one TEXT column and a
 * disagreement shows up as a broken image or a missing icon rather than as an error.
 */
export function isCustomImageUri(icon: string | null | undefined): boolean {
  if (!icon) return false;
  return (
    icon.startsWith('data:') ||
    icon.startsWith('file:') ||
    icon.startsWith('content:') ||
    icon.startsWith('http') ||
    icon.startsWith('/')
  );
}

/** What a trip's badge should draw. */
export type TripIconResolution =
  | { kind: 'image'; uri: string }
  | { kind: 'landmark'; destination: DestinationKey | null };

/**
 * The single place a trip's icon is decided, so no two screens can draw a different one.
 *
 * Precedence: a chosen image, then a chosen landmark, then whatever the name implies, then the
 * generic pin. An unrecognised stored key (a destination dropped in a later build) degrades to
 * the name-derived guess rather than to a blank badge.
 */
export function resolveTripIcon(trip: Pick<Trip, 'name' | 'icon'>): TripIconResolution {
  if (isCustomImageUri(trip.icon)) return { kind: 'image', uri: trip.icon! };

  const chosen = destinationByKey(trip.icon);
  if (chosen) return { kind: 'landmark', destination: chosen.key };

  return { kind: 'landmark', destination: matchDestination(trip.name) };
}

/** Expense rows that legitimately belong in a trip's detail and totals. Keeping this predicate
 * shared prevents legacy or corrupt income/transfer memberships from leaking into the drill-down. */
export function expensesForTrip(txns: Transaction[], tripId: string): Transaction[] {
  return txns.filter((txn) => txn.tripId === tripId && txn.type === 'expense');
}

/**
 * How many of `selectedIds` would be taken away from a trip they already belong to by attaching
 * them to `destinationTripId`. This is the number the "move to this trip?" confirmation quotes.
 *
 * It deliberately reads the FULL transaction list rather than whatever subset a picker happens
 * to be showing. A selection survives the search box being retyped, so counting only the visible
 * candidates let a selected row hide itself and be moved with no confirmation at all.
 */
export function reassignedFromOtherTrips(
  txns: Transaction[],
  selectedIds: readonly string[],
  destinationTripId: string
): number {
  const selected = new Set(selectedIds);
  return txns.filter((txn) => selected.has(txn.id) && !!txn.tripId && txn.tripId !== destinationTripId).length;
}

/** The portion of an Activity multi-selection that the trip action can operate on. */
export function expenseIdsFromSelection(txns: Transaction[], selected: ReadonlySet<string>): string[] {
  return txns.filter((txn) => selected.has(txn.id) && txn.type === 'expense').map((txn) => txn.id);
}

/**
 * What a trip cost, as RECORDED EXPENSES — the sum of the expense rows linked to it.
 *
 * Deliberately not "net trip cost". A refund is currently representable as an income row with no
 * link back to what it refunds, so netting it in would produce a number Pip cannot defend when
 * the user drills into it. Until refunds have explicit linkage, this counts spending only and the
 * UI says so.
 *
 * Three exclusions, each load-bearing:
 *  - Transfers move money between the user's own accounts; nothing is spent.
 *  - Income is not negative spending.
 *  - A split bill contributes the personal share ONLY, which needs no arithmetic here: the
 *    transaction row already carries `ownShare` (the full bill lives on `splits.gross`). Naively
 *    "correcting" for repayments here would subtract the friends' portions a second time.
 *
 * Every row goes through `convert`, the caller's single display-currency rule, so the headline,
 * the breakdown and the drill-down cannot disagree. Native amounts in different currencies are
 * never added directly.
 *
 * Membership is explicit and date-independent: an accommodation booked two months early counts,
 * and an unrelated payment made mid-trip does not.
 */
/**
 * The trip a written-off split share's new expense should inherit.
 *
 * The write-off is the same consumption as the original bill, so it belongs to the same trip.
 * Without this, a Singapore dinner someone never paid back would drop out of the Singapore total
 * at exactly the moment it genuinely became the user's own cost.
 */
export function inheritedTripId(origin: { tripId?: string | null } | undefined | null): string | null {
  return origin?.tripId ?? null;
}

export function computeTripTotals(
  txns: Transaction[],
  tripId: string,
  convert: (t: { amount: number; currency: string; nativeAmount?: number | null }) => number
): TripTotals {
  const mine = expensesForTrip(txns, tripId);

  const byCat = new Map<string, number>();
  let recordedExpenses = 0;
  for (const t of mine) {
    const value = convert(t);
    recordedExpenses += value;
    const key = t.categoryId ?? 'other';
    byCat.set(key, (byCat.get(key) ?? 0) + value);
  }

  return {
    recordedExpenses,
    txnCount: mine.length,
    byCategory: [...byCat.entries()]
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/**
 * What each trip cost inside one 'YYYY-MM' month — the list behind the "Trips this month"
 * section on Breakdown and Recap.
 *
 * Trips are an OVERLAY on categories, never a replacement: a RM 30 Grab is both Transport and
 * Penang, and it stays counted in both places. Nothing here subtracts from the category
 * breakdown these rows sit above.
 *
 * A trip qualifies for a month by having at least one expense dated in it, not by its
 * `startDate`/`endDate` — those are display metadata and never decide membership (see `Trip`).
 * Deriving the row from real dated rows is what lets `monthAmount` be quoted against the
 * month's own total without the two disagreeing; a date-range rule would let a trip whose
 * spending was all prepaid render an empty row under a month it contributed nothing to.
 *
 * `tripTotal` is deliberately date-blind, so the prepaid hotel that `monthAmount` excludes is
 * still visible in the subtext rather than vanishing from the screen entirely.
 *
 * Archived trips are kept. Archiving says "this trip is over," not "this spending did not
 * happen" — dropping them would silently make the section stop reconciling with the month.
 *
 * Expense-only and `convert`-per-row for the same reasons as `computeTripTotals`.
 */
export function tripMonthTotals(
  txns: Transaction[],
  trips: Trip[],
  monthKey: string,
  convert: (t: { amount: number; currency: string; nativeAmount?: number | null }) => number
): TripMonthTotal[] {
  const out: TripMonthTotal[] = [];

  for (const trip of trips) {
    let monthAmount = 0;
    let monthCount = 0;
    let tripTotal = 0;

    for (const t of expensesForTrip(txns, trip.id)) {
      const value = convert(t);
      tripTotal += value;
      if (txnMonthKey(t) === monthKey) {
        monthAmount += value;
        monthCount += 1;
      }
    }

    if (monthCount > 0) out.push({ trip, monthAmount, monthCount, tripTotal });
  }

  return out.sort((a, b) => b.monthAmount - a.monthAmount);
}

/** What the second line of a trip row should say, once the first line has said the month figure. */
export type TripRowSecondary =
  | { kind: 'tripTotal'; amount: number }
  | { kind: 'share'; pct: number }
  | { kind: 'none' };

/**
 * Which of the two useful facts a trip row has room for.
 *
 * The row shows the month figure prominently and gets exactly one line underneath it. The trip
 * total is the better thing to say WHEN it differs — it explains that the trip is bigger than
 * this month — but a trip whose spending all landed in this month has a total identical to the
 * number directly above, and printing it twice reads as a rendering bug. In that case the share
 * of the month is the fact that still carries information.
 *
 * `monthExpenseTotal` is the month's expenses in the same display currency as `row.monthAmount`.
 * Two ways it fails to be a usable denominator, both silent, both handled here:
 *  - Zero, for a month with no expenses at all. Nothing to be a share of.
 *  - Smaller than the row, reachable when a caller converts its total in aggregate while these
 *    rows convert per transaction. A mixed-currency month can then yield 104%, and saying
 *    nothing beats printing a share of a month that is larger than the month.
 *
 * The half-cent margin keeps float noise in the trip total from tipping an equal pair into the
 * redundant branch.
 */
export function tripRowSecondary(row: TripMonthTotal, monthExpenseTotal: number): TripRowSecondary {
  if (row.tripTotal > row.monthAmount + 0.005) return { kind: 'tripTotal', amount: row.tripTotal };
  if (monthExpenseTotal <= 0) return { kind: 'none' };

  const pct = Math.round((row.monthAmount / monthExpenseTotal) * 100);
  return pct <= 100 ? { kind: 'share', pct } : { kind: 'none' };
}
