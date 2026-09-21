import { computeAskPipAnalysis } from '../src/lib/askPip/analytics';
import type { AskPipAnalysisRequest } from '../src/lib/askPip/catalog';
import type { Transaction } from '../src/lib/types';

function txn(input: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'type'>): Transaction {
  return {
    merchantRaw: 'Merchant',
    merchantKey: 'merchant',
    currency: 'MYR',
    date: '2026-09-01',
    categoryId: input.type === 'income' ? 'salary' : 'food',
    createdAt: '2026-09-01T10:00:00.000Z',
    source: 'manual',
    ...input,
  };
}

const context = {
  categories: [
    { id: 'food', label: 'Food' },
    { id: 'salary', label: 'Salary' },
    { id: 'freelance', label: 'Freelance' },
  ],
  trips: [{ id: 'trip-1', name: 'Singapore' }],
  today: '2026-09-21',
};

function request(patch: Partial<AskPipAnalysisRequest> = {}): AskPipAnalysisRequest {
  return {
    measure: 'expense',
    statistic: 'total',
    dateFrom: '2026-09-01',
    dateTo: '2026-09-03',
    ...patch,
  };
}

describe('computeAskPipAnalysis', () => {
  it('computes daily mean and population standard deviation including zero-spend days', () => {
    const transactions = [
      txn({ id: 'a', type: 'expense', amount: 10, date: '2026-09-01' }),
      txn({ id: 'b', type: 'expense', amount: 20, date: '2026-09-03' }),
      txn({ id: 'income', type: 'income', amount: 100, date: '2026-09-02' }),
      txn({ id: 'transfer', type: 'transfer', amount: 999, date: '2026-09-02' }),
    ];

    const mean = computeAskPipAnalysis(request({ statistic: 'daily_mean' }), transactions, context);
    const stddev = computeAskPipAnalysis(request({ statistic: 'daily_stddev' }), transactions, context);

    expect(mean.value).toBe(10);
    expect(mean.dayCount).toBe(3);
    expect(mean.transactionCount).toBe(2);
    expect(stddev.value).toBe(8.16);
    expect(stddev.basis).toBe('daily_totals_including_zero_days');
  });

  it('uses every income category by default and allows a specific category', () => {
    const transactions = [
      txn({ id: 'salary', type: 'income', amount: 3000, categoryId: 'salary' }),
      txn({ id: 'freelance', type: 'income', amount: 500, categoryId: 'freelance' }),
      txn({ id: 'food', type: 'expense', amount: 10, categoryId: 'food' }),
    ];

    expect(computeAskPipAnalysis(
      request({ measure: 'income', dateFrom: '2026-09-01', dateTo: '2026-09-01' }),
      transactions,
      context,
    ).value).toBe(3500);
    expect(computeAskPipAnalysis(
      request({ measure: 'income', dateFrom: '2026-09-01', dateTo: '2026-09-01', categoryId: 'salary' }),
      transactions,
      context,
    ).value).toBe(3000);
  });

  it('compares the same statistic across two explicit periods', () => {
    const transactions = [
      txn({ id: 'current', type: 'income', amount: 300, date: '2026-09-02' }),
      txn({ id: 'previous', type: 'income', amount: 200, date: '2026-08-02' }),
    ];
    const difference = computeAskPipAnalysis(request({
      measure: 'income',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-03',
      comparison: 'difference',
      compareFrom: '2026-08-01',
      compareTo: '2026-08-03',
    }), transactions, context);
    const percent = computeAskPipAnalysis(request({
      measure: 'income',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-03',
      comparison: 'percent_change',
      compareFrom: '2026-08-01',
      compareTo: '2026-08-03',
    }), transactions, context);

    expect(difference.value).toBe(100);
    expect(difference.primaryValue).toBe(300);
    expect(difference.comparisonValue).toBe(200);
    expect(percent.value).toBe(50);
  });

  it('does not invent a percentage when the comparison period is zero', () => {
    const result = computeAskPipAnalysis(request({
      measure: 'income',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-03',
      comparison: 'percent_change',
      compareFrom: '2026-08-01',
      compareTo: '2026-08-03',
    }), [txn({ id: 'current', type: 'income', amount: 300 })], context);

    expect(result.value).toBeNull();
    expect(result.unavailableReason).toBe('comparison_is_zero');
  });

  it('returns all tied largest transactions and filters by merchant, trip, and fallback date', () => {
    const transactions = [
      txn({ id: 'a', type: 'expense', amount: 50, merchantRaw: 'MCD Orchard', tripId: 'trip-1', date: null, createdAt: '2026-09-02T10:00:00.000Z' }),
      txn({ id: 'b', type: 'expense', amount: 50, merchantRaw: 'MCD Marina', tripId: 'trip-1', date: '2026-09-03' }),
      txn({ id: 'c', type: 'expense', amount: 40, merchantRaw: 'Cafe', tripId: 'trip-1', date: '2026-09-03' }),
    ];
    const result = computeAskPipAnalysis(request({
      statistic: 'largest_transaction',
      merchantQuery: 'mcd',
      tripId: 'trip-1',
    }), transactions, context);

    expect(result.value).toBe(50);
    expect(result.topTransactions?.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.usedFallbackDateCount).toBe(1);
  });

  it('groups totals with stable unknown labels and applies a result limit', () => {
    const transactions = [
      txn({ id: 'a', type: 'expense', amount: 40, categoryId: 'food' }),
      txn({ id: 'b', type: 'expense', amount: 20, categoryId: 'missing' }),
      txn({ id: 'c', type: 'expense', amount: 10, categoryId: 'food' }),
    ];
    const result = computeAskPipAnalysis(request({ groupBy: 'category', limit: 1 }), transactions, context);

    expect(result.groups).toEqual([{ id: 'food', label: 'Food', value: 50, count: 2 }]);
  });
});
