import { formatAskPipAnalysisReply } from '../src/lib/askPip/analysisReply';
import type { AskPipAnalysisResult } from '../src/lib/askPip/analytics';

function result(overrides: Partial<AskPipAnalysisResult> = {}): AskPipAnalysisResult {
  return {
    request: {
      measure: 'expense',
      statistic: 'total',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-07',
    },
    value: 120,
    primaryValue: 120,
    hasData: true,
    transactionCount: 3,
    dayCount: 7,
    basis: 'transactions',
    usedFallbackDateCount: 0,
    ...overrides,
  };
}

const myr = { currency: 'MYR', convert: (amount: number) => amount, isZh: false };

describe('formatAskPipAnalysisReply', () => {
  it('states a deterministic total directly with its inclusive period', () => {
    expect(formatAskPipAnalysisReply(result(), myr)).toBe(
      'You spent RM 120.00 from 2026-09-01 to 2026-09-07.',
    );
  });

  it('states a daily mean and converts the local result into display currency', () => {
    expect(formatAskPipAnalysisReply(result({
      request: {
        measure: 'expense',
        statistic: 'daily_mean',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-03',
      },
      value: 15,
      primaryValue: 15,
      basis: 'daily_totals_including_zero_days',
      dayCount: 3,
    }), { currency: 'SGD', convert: (amount) => amount / 3, isZh: false })).toBe(
      'Your average daily spending was SGD 5.00 from 2026-09-01 to 2026-09-03.',
    );
  });

  it('states an absolute comparison difference as higher, lower, or unchanged', () => {
    const base = result({
      request: {
        measure: 'income',
        statistic: 'total',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-21',
        comparison: 'difference',
        compareFrom: '2026-08-01',
        compareTo: '2026-08-21',
      },
      primaryValue: 600,
      comparisonValue: 500,
      value: 100,
    });
    expect(formatAskPipAnalysisReply(base, myr)).toBe(
      'Your income was RM 100.00 higher than the comparison period.',
    );
    expect(formatAskPipAnalysisReply({ ...base, value: -100 }, myr)).toBe(
      'Your income was RM 100.00 lower than the comparison period.',
    );
    expect(formatAskPipAnalysisReply({ ...base, value: 0 }, myr)).toBe(
      'Your income was unchanged from the comparison period at RM 600.00.',
    );
  });

  it('includes the direct amount with percent changes and explains a zero baseline', () => {
    const request = {
      measure: 'expense' as const,
      statistic: 'total' as const,
      dateFrom: '2026-09-01',
      dateTo: '2026-09-07',
      comparison: 'percent_change' as const,
      compareFrom: '2026-08-01',
      compareTo: '2026-08-07',
    };
    expect(formatAskPipAnalysisReply(result({ request, value: 25, primaryValue: 125, comparisonValue: 100 }), myr)).toBe(
      'You spent RM 125.00, 25.0% more than the comparison period.',
    );
    expect(formatAskPipAnalysisReply(result({
      request,
      value: null,
      primaryValue: 125,
      comparisonValue: 0,
      unavailableReason: 'comparison_is_zero',
    }), myr)).toBe(
      'You spent RM 125.00; the comparison period was RM 0.00, so a percentage change is unavailable.',
    );
  });

  it('answers zero-data, transaction-count, and largest-transaction questions directly', () => {
    expect(formatAskPipAnalysisReply(result({ value: 0, primaryValue: 0, hasData: false, transactionCount: 0 }), myr)).toBe(
      'You spent RM 0.00 from 2026-09-01 to 2026-09-07.',
    );
    expect(formatAskPipAnalysisReply(result({
      request: { measure: 'income', statistic: 'transaction_count', dateFrom: '2026-09-01', dateTo: '2026-09-07' },
      value: 4,
      primaryValue: 4,
      transactionCount: 4,
    }), myr)).toBe('You recorded 4 income transactions from 2026-09-01 to 2026-09-07.');
    expect(formatAskPipAnalysisReply(result({
      request: { measure: 'expense', statistic: 'largest_transaction', dateFrom: '2026-09-01', dateTo: '2026-09-07' },
      value: 88,
      primaryValue: 88,
    }), myr)).toBe('Your largest expense was RM 88.00 from 2026-09-01 to 2026-09-07.');
  });

  it('has deterministic Chinese copy and reports future periods with a zero amount', () => {
    expect(formatAskPipAnalysisReply(result(), { ...myr, isZh: true })).toBe(
      '你在 2026-09-01 至 2026-09-07 期间共支出 RM 120.00。',
    );
    expect(formatAskPipAnalysisReply(result({
      value: null,
      primaryValue: 0,
      hasData: false,
      unavailableReason: 'date_range_is_future',
    }), myr)).toBe('That period has not started. The recorded spending amount is RM 0.00.');
  });

  it('keeps comparison metric names localized in Chinese', () => {
    expect(formatAskPipAnalysisReply(result({
      request: {
        measure: 'income',
        statistic: 'daily_mean',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-07',
        comparison: 'difference',
        compareFrom: '2026-08-01',
        compareTo: '2026-08-07',
      },
      primaryValue: 80,
      comparisonValue: 60,
      value: 20,
    }), { ...myr, isZh: true })).toBe('本时段的每日平均收入比对比时段高 RM 20.00。');
  });
});
