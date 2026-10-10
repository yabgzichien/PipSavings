// __tests__/trips.test.ts
// The totals contract is the whole of Trips that can be wrong quietly. Every case here is one
// the spec names explicitly, and each has a way of producing a plausible-looking number that is
// not the number the user means.
import { computeTripTotals, expenseIdsFromSelection, expensesForTrip, inheritedTripId, isCustomImageUri, reassignedFromOtherTrips, resolveTripIcon, tripCurrencyCode, tripMonthTotals, tripRowSecondary } from '../src/lib/trips';
import * as tripsLib from '../src/lib/trips';
import type { Trip, TripMonthTotal } from '../src/lib/trips';
import type { Transaction } from '../src/lib/types';

// Stand-in for useDisplayCurrency().convertTxn: MYR passes through, SGD is 3.5.
const convert = (t: { amount: number; currency: string }) => t.amount;

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    merchantRaw: 'Somewhere',
    merchantKey: 'somewhere',
    amount: 100,
    currency: 'MYR',
    type: 'expense',
    date: '2026-09-10',
    categoryId: 'food',
    createdAt: '2026-09-10T00:00:00.000Z',
    source: 'manual',
    tripId: 'trip-sg',
    ...over,
  };
}

describe('tripCurrencyCode', () => {
  it('follows the app currency when the trip has not chosen one', () => {
    expect(tripCurrencyCode({ currency: null }, 'MYR')).toBe('MYR');
    expect(tripCurrencyCode({}, 'MYR')).toBe('MYR');
    expect(tripCurrencyCode({ currency: '   ' }, 'SGD')).toBe('SGD');
  });

  it('uses the currency saved on the trip', () => {
    expect(tripCurrencyCode({ currency: 'SGD' }, 'MYR')).toBe('SGD');
  });
});

describe('computeTripTotals', () => {
  it('sums only the expenses linked to this trip', () => {
    const out = computeTripTotals(
      [txn({ amount: 100 }), txn({ amount: 50 }), txn({ amount: 999, tripId: 'trip-other' }), txn({ amount: 777, tripId: null })],
      'trip-sg',
      convert
    );
    expect(out.recordedExpenses).toBe(150);
    expect(out.txnCount).toBe(2);
  });

  it('excludes transfers — they move money, they do not spend it', () => {
    const out = computeTripTotals([txn({ amount: 100 }), txn({ amount: 500, type: 'transfer', categoryId: null })], 'trip-sg', convert);
    expect(out.recordedExpenses).toBe(100);
  });

  it('excludes income, so a refund recorded as income cannot silently net the total', () => {
    const out = computeTripTotals([txn({ amount: 100 }), txn({ amount: 40, type: 'income', categoryId: 'other-income' })], 'trip-sg', convert);
    expect(out.recordedExpenses).toBe(100);
  });

  it('sums the personal share the transaction already carries (splits are not consulted here)', () => {
    // This is an assertion of interface intent, not a regression guard. The function receives only
    // Transaction[], and Transaction carries only ownShare (splits.gross lives on the separate Split
    // record), so double-counting is prevented structurally by the type, not by this assertion.
    // If the input ever widens to include split records, this test must be upgraded to a real guard.
    const out = computeTripTotals([txn({ amount: 40 })], 'trip-sg', convert);
    expect(out.recordedExpenses).toBe(40);
  });

  it('includes an advance booking dated before the trip started', () => {
    const out = computeTripTotals([txn({ amount: 600, date: '2026-07-01', categoryId: 'rental' }), txn({ amount: 100 })], 'trip-sg', convert);
    expect(out.recordedExpenses).toBe(700);
  });

  it('converts every row through the supplied rule rather than adding native amounts', () => {
    const sgdAware = (t: { amount: number; currency: string }) => (t.currency === 'SGD' ? t.amount * 3.5 : t.amount);
    const out = computeTripTotals(
      [txn({ amount: 100, currency: 'MYR' }), txn({ amount: 20, currency: 'SGD', nativeAmount: 20 })],
      'trip-sg',
      sgdAware
    );
    expect(out.recordedExpenses).toBe(170);
  });

  it('breaks down by category, largest first, with uncategorised folded into `other`', () => {
    const out = computeTripTotals(
      [txn({ amount: 30, categoryId: 'food' }), txn({ amount: 90, categoryId: 'rental' }), txn({ amount: 10, categoryId: null })],
      'trip-sg',
      convert
    );
    expect(out.byCategory).toEqual([
      { categoryId: 'rental', amount: 90 },
      { categoryId: 'food', amount: 30 },
      { categoryId: 'other', amount: 10 },
    ]);
  });

  it('an empty trip totals zero rather than throwing', () => {
    expect(computeTripTotals([], 'trip-sg', convert)).toEqual({ recordedExpenses: 0, txnCount: 0, byCategory: [] });
  });
});

describe('tripMonthTotals', () => {
  // The month figure is shown directly beneath a month total on Breakdown and Recap. Anything
  // that lets a non-month row into it makes the section contradict the number above it.
  const sg: Trip = { id: 'trip-sg', name: 'Singapore', createdAt: '2026-09-01T00:00:00.000Z', archived: false, startDate: '2026-09-08', endDate: '2026-09-12', icon: null };
  const jp: Trip = { id: 'trip-jp', name: 'Japan', createdAt: '2026-08-01T00:00:00.000Z', archived: false, startDate: null, endDate: null, icon: null };

  it('counts only the expenses dated inside the month, while tripTotal keeps the whole trip', () => {
    // The prepaid hotel belongs to the trip but not to September; it must stay out of the month
    // figure and stay inside the trip total, which is the entire point of showing both.
    const out = tripMonthTotals(
      [txn({ amount: 30, date: '2026-09-10' }), txn({ amount: 3, date: '2026-09-11' }), txn({ amount: 600, date: '2026-07-01' })],
      [sg],
      '2026-09',
      convert
    );
    expect(out).toHaveLength(1);
    expect(out[0].monthAmount).toBe(33);
    expect(out[0].monthCount).toBe(2);
    expect(out[0].tripTotal).toBe(633);
  });

  it('drops a trip with no expenses in the month rather than showing a zero row', () => {
    expect(tripMonthTotals([txn({ amount: 600, date: '2026-07-01' })], [sg], '2026-09', convert)).toEqual([]);
  });

  it('excludes income and transfers from both the month figure and the trip total', () => {
    const out = tripMonthTotals(
      [
        txn({ amount: 30, date: '2026-09-10' }),
        txn({ amount: 500, date: '2026-09-10', type: 'transfer', categoryId: null }),
        txn({ amount: 40, date: '2026-09-10', type: 'income', categoryId: 'other-income' }),
      ],
      [sg],
      '2026-09',
      convert
    );
    expect(out[0].monthAmount).toBe(30);
    expect(out[0].tripTotal).toBe(30);
  });

  it('falls back to createdAt when a row carries no date, matching txnMonthKey', () => {
    const out = tripMonthTotals(
      [txn({ amount: 30, date: null, createdAt: '2026-09-04T00:00:00.000Z' })],
      [sg],
      '2026-09',
      convert
    );
    expect(out[0].monthAmount).toBe(30);
  });

  it('keeps an archived trip — its spending still happened in that month', () => {
    const out = tripMonthTotals([txn({ amount: 30, date: '2026-09-10' })], [{ ...sg, archived: true }], '2026-09', convert);
    expect(out).toHaveLength(1);
    expect(out[0].trip.archived).toBe(true);
  });

  it('orders trips by what they cost in this month, biggest first', () => {
    const out = tripMonthTotals(
      [txn({ amount: 30, date: '2026-09-10' }), txn({ amount: 900, date: '2026-09-02', tripId: 'trip-jp' })],
      [sg, jp],
      '2026-09',
      convert
    );
    expect(out.map((r) => r.trip.id)).toEqual(['trip-jp', 'trip-sg']);
  });

  it('converts every row through the display-currency rule instead of adding native amounts', () => {
    const rate = (t: { amount: number; currency: string }) => (t.currency === 'SGD' ? t.amount * 3.5 : t.amount);
    const out = tripMonthTotals(
      [txn({ amount: 10, currency: 'SGD', date: '2026-09-10' }), txn({ amount: 5, date: '2026-09-11' })],
      [sg],
      '2026-09',
      rate
    );
    expect(out[0].monthAmount).toBe(40);
  });

  it('returns nothing when there are no trips at all', () => {
    expect(tripMonthTotals([txn({ amount: 30, tripId: null })], [], '2026-09', convert)).toEqual([]);
  });
});

describe('isCustomImageUri', () => {
  it('recognises every shape a picked image arrives as', () => {
    expect(isCustomImageUri('data:image/jpeg;base64,abc')).toBe(true);
    expect(isCustomImageUri('file:///var/img.png')).toBe(true);
    expect(isCustomImageUri('content://media/1')).toBe(true);
    expect(isCustomImageUri('https://x.test/a.png')).toBe(true);
    expect(isCustomImageUri('/storage/emulated/0/a.png')).toBe(true);
  });

  it('does not mistake a landmark key or an empty value for an image', () => {
    expect(isCustomImageUri('jp')).toBe(false);
    expect(isCustomImageUri('')).toBe(false);
    expect(isCustomImageUri(null)).toBe(false);
    expect(isCustomImageUri(undefined)).toBe(false);
  });
});

describe('resolveTripIcon', () => {
  const trip = (over: Partial<Trip>): Trip => ({
    id: 't', name: 'Somewhere', createdAt: '2026-09-01T00:00:00.000Z',
    archived: false, startDate: null, endDate: null, icon: null, ...over,
  });

  it('derives the destination from the name when nothing was chosen', () => {
    expect(resolveTripIcon(trip({ name: 'Tokyo 2026' }))).toEqual({ kind: 'landmark', destination: 'jp' });
  });

  it('falls back to the generic pin when the name means nothing', () => {
    expect(resolveTripIcon(trip({ name: "Mum's birthday" }))).toEqual({ kind: 'landmark', destination: null });
  });

  it('prefers an explicitly chosen landmark over what the name says', () => {
    // The whole point of the override: the user has already told us the guess was wrong.
    expect(resolveTripIcon(trip({ name: 'Tokyo 2026', icon: 'kr' }))).toEqual({ kind: 'landmark', destination: 'kr' });
  });

  it('prefers a chosen image over both', () => {
    expect(resolveTripIcon(trip({ name: 'Tokyo', icon: 'data:image/png;base64,zz' })))
      .toEqual({ kind: 'image', uri: 'data:image/png;base64,zz' });
  });

  it('re-derives from the new name after a rename, when nothing was chosen', () => {
    expect(resolveTripIcon(trip({ name: 'Osaka' }))).toEqual({ kind: 'landmark', destination: 'jp' });
    expect(resolveTripIcon(trip({ name: 'Seoul' }))).toEqual({ kind: 'landmark', destination: 'kr' });
  });

  it('keeps an explicit choice through a rename', () => {
    // Storing the derived key at creation would make this indistinguishable from an auto match
    // and let a rename silently discard a deliberate choice.
    expect(resolveTripIcon(trip({ name: 'Seoul', icon: 'jp' }))).toEqual({ kind: 'landmark', destination: 'jp' });
  });

  it('ignores a stored key that is no longer a real destination', () => {
    // A key removed from the table in a later build must degrade to auto, not to a blank badge.
    expect(resolveTripIcon(trip({ name: 'Kyoto', icon: 'zz' }))).toEqual({ kind: 'landmark', destination: 'jp' });
  });
});

describe('featuredTripForDate', () => {
  const trip = (id: string, startDate: string | null, endDate: string | null, archived = false): Trip => ({
    id,
    name: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    archived,
    startDate,
    endDate,
    icon: null,
  });
  const select = (items: Trip[], today: string) =>
    (tripsLib as any).featuredTripForDate?.(items, today);

  it('treats both trip endpoints as current days', () => {
    const malaysia = trip('malaysia', '2026-08-30', '2026-09-10');

    expect(select([malaysia], '2026-08-30')).toEqual({ trip: malaysia, timing: 'current' });
    expect(select([malaysia], '2026-09-10')).toEqual({ trip: malaysia, timing: 'current' });
  });

  it('uses the most recently started trip when current trips overlap', () => {
    const earlier = trip('earlier', '2026-08-30', '2026-09-12');
    const later = trip('later', '2026-09-05', '2026-09-10');

    expect(select([earlier, later], '2026-09-09')).toEqual({ trip: later, timing: 'current' });
  });

  it('falls forward to the nearest upcoming trip, then back to the most recent past trip', () => {
    const past = trip('past', '2026-08-01', '2026-08-03');
    const soon = trip('soon', '2026-09-20', '2026-09-24');
    const later = trip('later', '2026-10-01', '2026-10-04');

    expect(select([later, past, soon], '2026-09-09')).toEqual({ trip: soon, timing: 'upcoming' });
    expect(select([past], '2026-09-09')).toEqual({ trip: past, timing: 'past' });
  });

  it('ignores archived and undated legacy trips', () => {
    expect(select([
      trip('undated', null, null),
      trip('archived', '2026-09-01', '2026-09-12', true),
    ], '2026-09-09')).toBeNull();
  });
});

describe('tripRowSecondary', () => {
  // The row has one secondary line and three things it could say. Getting this wrong is not a
  // crash — it is a line that reads as a rendering bug (the same number twice) or an impossible
  // claim (104% of a month), which is exactly the kind of thing nobody files a report about.
  const row = (over: Partial<TripMonthTotal>): TripMonthTotal => ({
    trip: { id: 'trip-sg', name: 'Singapore', createdAt: '2026-09-01T00:00:00.000Z', archived: false, startDate: null, endDate: null, icon: null },
    monthAmount: 30,
    monthCount: 2,
    tripTotal: 30,
    ...over,
  });

  it('offers the trip total when the trip also spent outside this month', () => {
    expect(tripRowSecondary(row({ monthAmount: 30, tripTotal: 630 }), 100)).toEqual({ kind: 'tripTotal', amount: 630 });
  });

  it('offers the share instead when the trip total would just repeat the figure above it', () => {
    expect(tripRowSecondary(row({ monthAmount: 30, tripTotal: 30 }), 100)).toEqual({ kind: 'share', pct: 30 });
  });

  it('treats a sub-cent difference as a repeat rather than surfacing an identical-looking total', () => {
    expect(tripRowSecondary(row({ monthAmount: 30, tripTotal: 30.004 }), 100)).toEqual({ kind: 'share', pct: 30 });
  });

  it('says nothing when the month total is zero, rather than dividing by it', () => {
    expect(tripRowSecondary(row({ monthAmount: 30, tripTotal: 30 }), 0)).toEqual({ kind: 'none' });
  });

  it('drops an impossible share rather than claiming more than the whole month', () => {
    // Reachable when the caller converts a month total in aggregate while the rows convert per
    // transaction. Better to say nothing than to print "104% of this month".
    expect(tripRowSecondary(row({ monthAmount: 104, tripTotal: 104 }), 100)).toEqual({ kind: 'none' });
  });

  it('keeps a share of exactly the whole month', () => {
    expect(tripRowSecondary(row({ monthAmount: 100, tripTotal: 100 }), 100)).toEqual({ kind: 'share', pct: 100 });
  });
});

describe('expensesForTrip', () => {
  it('keeps stale income and transfer memberships out of a trip transaction list', () => {
    const expense = txn({ id: 'expense' });
    const income = txn({ id: 'income', type: 'income' });
    const transfer = txn({ id: 'transfer', type: 'transfer' });

    expect(expensesForTrip([expense, income, transfer], 'trip-sg')).toEqual([expense]);
  });
});

describe('expenseIdsFromSelection', () => {
  it('keeps the bulk trip action scoped to selected expenses', () => {
    const transactions = [
      txn({ id: 'expense' }),
      txn({ id: 'income', type: 'income' }),
      txn({ id: 'transfer', type: 'transfer' }),
    ];

    expect(expenseIdsFromSelection(transactions, new Set(['expense', 'income', 'transfer']))).toEqual(['expense']);
    expect(expenseIdsFromSelection(transactions, new Set(['income', 'transfer']))).toEqual([]);
  });
});

describe('inheritedTripId', () => {
  // `writeOffShare` (src/state/store.tsx) uses this to decide the trip for the expense it
  // creates when a friend never pays back a split bill. It is tested here as a pure helper
  // because writeOffShare itself lives inside AppDataProvider's React context and has no
  // existing harness in this codebase to drive it directly.
  it('takes the trip from the origin transaction, so a written-off share stays in its trip total', () => {
    expect(inheritedTripId({ tripId: 'trip-sg' })).toBe('trip-sg');
  });

  it('falls back to no trip when the origin transaction was never in one', () => {
    expect(inheritedTripId({ tripId: null })).toBeNull();
  });

  it('falls back to no trip when there is no origin transaction at all (e.g. a deleted bill)', () => {
    expect(inheritedTripId(undefined)).toBeNull();
  });
});

describe('reassignedFromOtherTrips', () => {
  // The confirmation before moving someone else's trip expense used to be computed from the
  // picker's *filtered* candidate list. Selecting a row and then typing a search that hid it
  // left the selection intact but made the count zero, so the move happened silently.
  const all = [
    txn({ id: 'a', tripId: null }),
    txn({ id: 'b', tripId: 'trip-jp' }),
    txn({ id: 'c', tripId: 'trip-kr' }),
    txn({ id: 'd', tripId: 'trip-sg' }),
  ];

  it('counts selected rows that currently belong to a different trip', () => {
    expect(reassignedFromOtherTrips(all, ['a', 'b', 'c'], 'trip-sg')).toBe(2);
  });

  it('counts a selection the caller can no longer see', () => {
    expect(reassignedFromOtherTrips(all, ['b'], 'trip-sg')).toBe(1);
  });

  it('ignores rows with no trip and rows already in the destination', () => {
    expect(reassignedFromOtherTrips(all, ['a', 'd'], 'trip-sg')).toBe(0);
  });

  it('ignores an id that no longer matches any transaction', () => {
    expect(reassignedFromOtherTrips(all, ['gone'], 'trip-sg')).toBe(0);
  });
});
