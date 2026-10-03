import { currencyPrefix, fmt, fmtCompact, fmtCompactMoney, fmtMoney, formatCurrencyBreakdown, readTimeLabel } from '../src/lib/format';

describe('currencyPrefix', () => {
  it('renders MYR as the local RM convention', () => {
    expect(currencyPrefix('MYR')).toBe('RM');
  });

  it('renders any other currency as its own three-letter code', () => {
    expect(currencyPrefix('SGD')).toBe('SGD');
    expect(currencyPrefix('USD')).toBe('USD');
    expect(currencyPrefix('JPY')).toBe('JPY');
  });

  it('agrees with the prefix fmtMoney itself emits, so the two can never drift', () => {
    for (const code of ['MYR', 'SGD', 'CNY']) {
      expect(fmtMoney(1, code).startsWith(`${currencyPrefix(code)} `)).toBe(true);
    }
  });
});

describe('fmtCompact', () => {
  it('matches fmt exactly under the 100K threshold', () => {
    expect(fmtCompact(85)).toBe(fmt(85));
    expect(fmtCompact(3000)).toBe(fmt(3000));
    expect(fmtCompact(99_999.99)).toBe(fmt(99_999.99));
  });

  it('abbreviates to K from 100,000', () => {
    expect(fmtCompact(100_000)).toBe('100K');
    expect(fmtCompact(123_456)).toBe('123.5K');
  });

  it('abbreviates to M from 1,000,000', () => {
    expect(fmtCompact(1_000_000)).toBe('1M');
    expect(fmtCompact(2_345_678)).toBe('2.3M');
  });

  it('bumps a K value that rounds up to 1000 into M instead', () => {
    expect(fmtCompact(999_950)).toBe('1M');
  });

  it('preserves the negative sign', () => {
    expect(fmtCompact(-123_456)).toBe('-123.5K');
    expect(fmtCompact(-2_000_000)).toBe('-2M');
  });

  it('falls back to 0 for non-finite input, same as fmt', () => {
    expect(fmtCompact(NaN)).toBe(fmt(NaN));
    expect(fmtCompact(Infinity)).toBe(fmt(Infinity));
  });
});

describe('fmtCompactMoney', () => {
  it('uses the currency decimal rules below the compact threshold', () => {
    expect(fmtCompactMoney(1200, 'JPY')).toBe('JPY 1,200');
    expect(fmtCompactMoney(12.345, 'TND')).toBe('TND 12.345');
  });

  it('keeps the currency prefix while compacting large values', () => {
    expect(fmtCompactMoney(125_000_000, 'MYR')).toBe('RM 125M');
  });
});

describe('readTimeLabel', () => {
  it('rounds to the nearest second', () => {
    expect(readTimeLabel(5_800)).toBe('Read in 6 seconds');
    expect(readTimeLabel(5_400)).toBe('Read in 5 seconds');
  });

  it('pluralizes correctly at exactly one second', () => {
    expect(readTimeLabel(1_000)).toBe('Read in 1 second');
    expect(readTimeLabel(1_400)).toBe('Read in 1 second');
  });

  it('floors sub-second reads at 1 second rather than claiming 0', () => {
    expect(readTimeLabel(300)).toBe('Read in 1 second');
    expect(readTimeLabel(0)).toBe('Read in 1 second');
  });

  it('shows the true elapsed time for a long extraction, uncapped', () => {
    expect(readTimeLabel(22_000)).toBe('Read in 22 seconds');
  });
});

describe('fmtMoney', () => {
  it('uses the RM convention for ringgit rather than the code', () => {
    expect(fmtMoney(128, 'MYR')).toBe('RM 128.00');
    expect(fmtMoney(1234.5, 'MYR')).toBe('RM 1,234.50');
  });

  it('uses the 3-letter code for everything else, never a symbol', () => {
    expect(fmtMoney(128, 'CNY')).toBe('CNY 128.00');
    expect(fmtMoney(1234.5, 'USD')).toBe('USD 1,234.50');
  });

  it('drops decimals for zero-subunit currencies', () => {
    expect(fmtMoney(1200, 'JPY')).toBe('JPY 1,200');
    expect(fmtMoney(45000, 'KRW')).toBe('KRW 45,000');
  });

  it('formats 3-decimal currencies correctly', () => {
    expect(fmtMoney(12.345, 'TND')).toBe('TND 12.345');
    expect(fmtMoney(12.3, 'TND')).toBe('TND 12.300');
  });

  it('rounds rather than truncates a zero-decimal currency', () => {
    expect(fmtMoney(1200.6, 'JPY')).toBe('JPY 1,201');
  });

  it('keeps the negative sign in front of the number, after the code', () => {
    expect(fmtMoney(-128, 'CNY')).toBe('CNY -128.00');
    expect(fmtMoney(-128, 'MYR')).toBe('RM -128.00');
  });

  it('agrees with fmt for MYR amounts, so existing RM labels stay consistent', () => {
    expect(fmtMoney(1234.5, 'MYR')).toBe(`RM ${fmt(1234.5)}`);
  });

  it('falls back to 0 for non-finite input, same as fmt', () => {
    expect(fmtMoney(NaN, 'MYR')).toBe('RM 0.00');
  });
});

describe('formatCurrencyBreakdown', () => {
  it('renders each currency as "CODE amount", separated by middle dots', () => {
    expect(formatCurrencyBreakdown({ MYR: 3200, USD: 450 })).toBe('RM 3,200.00 · USD 450.00');
  });

  it('renders a single MYR-only breakdown the same as any other MYR amount', () => {
    expect(formatCurrencyBreakdown({ MYR: 128 })).toBe('RM 128.00');
  });

  it('respects each currency\'s own decimal places', () => {
    expect(formatCurrencyBreakdown({ MYR: 0, JPY: 1200 })).toBe('RM 0.00 · JPY 1,200');
  });
});
