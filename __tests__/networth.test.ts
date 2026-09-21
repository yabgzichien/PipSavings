// __tests__/networth.test.ts
import {
  currentValue,
  accountValueAsOf,
  netWorth,
  groupByClass,
  netWorthSeries,
  monthsWithData,
  defaultLinkEffect,
  applyEffect,
  toMyrValues,
  nativeAccountTotalsByCurrency,
  ACCOUNT_CLASSES,
  classesFor,
} from '../src/lib/networth';
import type { Account, BalanceEntry } from '../src/lib/types';

function acct(over: Partial<Account>): Account {
  return {
    id: 'a1', name: 'Acct', kind: 'asset', cls: 'cash', archived: false, createdAt: '2026-01-01T00:00:00.000Z',
    sub: null, symbol: null, ticker: null, quantity: null, cost: null, currency: 'MYR', ...over,
  };
}
function entry(over: Partial<BalanceEntry>): BalanceEntry {
  return { id: Math.random().toString(36).slice(2), accountId: 'a1', value: 100, asOf: '2026-05-01', createdAt: '2026-05-01T00:00:00.000Z', ...over };
}

describe('currentValue', () => {
  it('returns the latest entry by asOf', () => {
    const es = [entry({ value: 100, asOf: '2026-04-01' }), entry({ value: 250, asOf: '2026-06-01' }), entry({ value: 180, asOf: '2026-05-01' })];
    expect(currentValue(es)).toBe(250);
  });
  it('breaks asOf ties by createdAt', () => {
    const es = [
      entry({ value: 10, asOf: '2026-05-01', createdAt: '2026-05-01T09:00:00.000Z' }),
      entry({ value: 20, asOf: '2026-05-01', createdAt: '2026-05-01T18:00:00.000Z' }),
    ];
    expect(currentValue(es)).toBe(20);
  });
  it('is 0 when there are no entries', () => {
    expect(currentValue([])).toBe(0);
  });
});

describe('accountValueAsOf', () => {
  const es = [entry({ value: 100, asOf: '2026-04-10' }), entry({ value: 300, asOf: '2026-06-15' })];
  it('uses the latest entry on or before the date', () => {
    expect(accountValueAsOf(es, '2026-05-31')).toBe(100);
    expect(accountValueAsOf(es, '2026-06-30')).toBe(300);
  });
  it('is 0 before any entry exists', () => {
    expect(accountValueAsOf(es, '2026-03-01')).toBe(0);
  });
});

describe('netWorth', () => {
  it('sums assets minus liabilities, ignoring archived', () => {
    const accounts = [
      acct({ id: 'cash1', kind: 'asset', cls: 'cash' }),
      acct({ id: 'inv1', kind: 'asset', cls: 'investments' }),
      acct({ id: 'car', kind: 'liability', cls: 'car' }),
      acct({ id: 'old', kind: 'asset', cls: 'cash', archived: true }),
    ];
    const values = { cash1: 1000, inv1: 5000, car: 2000, old: 9999 };
    expect(netWorth(accounts, values)).toEqual({ assets: 6000, liabilities: 2000, net: 4000 });
  });
  it('handles missing values as 0', () => {
    expect(netWorth([acct({ id: 'x' })], {})).toEqual({ assets: 0, liabilities: 0, net: 0 });
  });
});

describe('groupByClass', () => {
  it('groups active accounts by class in canonical order with totals', () => {
    const accounts = [
      acct({ id: 'tng', name: 'TnG', kind: 'asset', cls: 'cash' }),
      acct({ id: 'fd', name: 'FD', kind: 'asset', cls: 'cash' }),
      acct({ id: 'stk', name: 'Stocks', kind: 'asset', cls: 'investments' }),
      acct({ id: 'car', name: 'Car Loan', kind: 'liability', cls: 'car' }),
    ];
    const values = { tng: 50, fd: 950, stk: 3000, car: 1500 };
    const g = groupByClass(accounts, values);
    expect(g.assets.map((c) => [c.cls, c.total])).toEqual([['cash', 1000], ['investments', 3000]]);
    expect(g.liabilities.map((c) => [c.cls, c.total])).toEqual([['car', 1500]]);
    // Sorted by value, high → low (FD 950 before TnG 50).
    expect(g.assets[0].accounts.map((a) => a.account.name)).toEqual(['FD', 'TnG']);
  });
});

describe('netWorthSeries', () => {
  it('computes month-end net worth per month key', () => {
    const accounts = [acct({ id: 'cash1', kind: 'asset', cls: 'cash' }), acct({ id: 'loan', kind: 'liability', cls: 'personal' })];
    const entries = [
      entry({ accountId: 'cash1', value: 1000, asOf: '2026-04-15' }),
      entry({ accountId: 'cash1', value: 1200, asOf: '2026-06-10' }),
      entry({ accountId: 'loan', value: 500, asOf: '2026-04-20' }),
      entry({ accountId: 'loan', value: 300, asOf: '2026-06-05' }),
    ];
    const series = netWorthSeries(accounts, entries, ['2026-04', '2026-05', '2026-06']);
    expect(series).toEqual([
      { monthKey: '2026-04', assets: 1000, liabilities: 500, net: 500, measured: true },
      { monthKey: '2026-05', assets: 1000, liabilities: 500, net: 500, measured: false },
      { monthKey: '2026-06', assets: 1200, liabilities: 300, net: 900, measured: true },
    ]);
  });

  // The cursor walk that replaced the per-month re-sort has to survive unsorted input and
  // asOf ties, since neither the DB order nor the caller's month order is guaranteed.
  it('matches a per-month accountValueAsOf lookup on unsorted entries', () => {
    const accounts = [acct({ id: 'cash1', kind: 'asset', cls: 'cash' }), acct({ id: 'loan', kind: 'liability', cls: 'personal' })];
    const entries = [
      entry({ accountId: 'cash1', value: 1200, asOf: '2026-06-10' }),
      entry({ accountId: 'loan', value: 500, asOf: '2026-04-20' }),
      entry({ accountId: 'cash1', value: 1000, asOf: '2026-04-15' }),
      // Same asOf, later createdAt: the tie-break must pick 900, not 700.
      entry({ accountId: 'cash1', value: 700, asOf: '2026-05-02', createdAt: '2026-05-02T08:00:00.000Z' }),
      entry({ accountId: 'cash1', value: 900, asOf: '2026-05-02', createdAt: '2026-05-02T21:00:00.000Z' }),
      entry({ accountId: 'loan', value: 300, asOf: '2026-06-05' }),
    ];
    const monthKeys = ['2026-03', '2026-04', '2026-05', '2026-06'];
    const expected = monthKeys.map((mk) => {
      const valueById: Record<string, number> = {};
      for (const a of accounts) {
        valueById[a.id] = accountValueAsOf(entries.filter((e) => e.accountId === a.id), `${mk}-31`);
      }
      const measured = entries.some(
        (e) => e.asOf.slice(0, 7) === mk && (e.source ?? 'manual') === 'manual'
      );
      return { monthKey: mk, measured, ...netWorth(accounts, valueById) };
    });
    expect(netWorthSeries(accounts, entries, monthKeys)).toEqual(expected);
  });

  it('keeps the caller’s month order even when the keys arrive out of order', () => {
    const accounts = [acct({ id: 'cash1' })];
    const entries = [
      entry({ accountId: 'cash1', value: 100, asOf: '2026-04-01' }),
      entry({ accountId: 'cash1', value: 250, asOf: '2026-06-01' }),
    ];
    expect(netWorthSeries(accounts, entries, ['2026-06', '2026-04', '2026-05']).map((p) => [p.monthKey, p.net])).toEqual([
      ['2026-06', 250],
      ['2026-04', 100],
      ['2026-05', 100],
    ]);
  });

  it('is 0 for an account whose first reading is after every month asked for', () => {
    const accounts = [acct({ id: 'cash1' })];
    const entries = [entry({ accountId: 'cash1', value: 500, asOf: '2026-09-01' })];
    expect(netWorthSeries(accounts, entries, ['2026-04', '2026-05'])).toEqual([
      { monthKey: '2026-04', assets: 0, liabilities: 0, net: 0, measured: false },
      { monthKey: '2026-05', assets: 0, liabilities: 0, net: 0, measured: false },
    ]);
  });
});

describe('monthsWithData', () => {
  it('returns every month from the earliest entry through now, inclusive', () => {
    const entries = [entry({ asOf: '2026-03-10' }), entry({ asOf: '2026-05-20' })];
    expect(monthsWithData(entries, new Date(2026, 5, 15))).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
  });
  it('is empty when there are no entries yet', () => {
    expect(monthsWithData([], new Date(2026, 5, 15))).toEqual([]);
  });
  it('is a single month when the earliest entry is this month', () => {
    expect(monthsWithData([entry({ asOf: '2026-06-02' })], new Date(2026, 5, 15))).toEqual(['2026-06']);
  });
  it('picks the earliest asOf across multiple accounts, unsorted input', () => {
    const entries = [entry({ accountId: 'a', asOf: '2026-04-01' }), entry({ accountId: 'b', asOf: '2026-01-15' }), entry({ accountId: 'a', asOf: '2026-02-01' })];
    expect(monthsWithData(entries, new Date(2026, 1, 20))).toEqual(['2026-01', '2026-02']);
  });
});

describe('toMyrValues', () => {
  it('leaves MYR accounts untouched and needs no rate table', () => {
    const accounts = [acct({ id: 'a', currency: 'MYR' })];
    const result = toMyrValues(accounts, { a: 1000 }, {});
    expect(result.valueById).toEqual({ a: 1000 });
    expect(result.unconvertible).toEqual([]);
  });

  it('converts a foreign account at the supplied rate', () => {
    const accounts = [acct({ id: 'a', currency: 'CNY' })];
    const result = toMyrValues(accounts, { a: 12000 }, { CNY: 0.63 });
    expect(result.valueById).toEqual({ a: 7560 });
    expect(result.unconvertible).toEqual([]);
  });

  it('EXCLUDES an account with no rate rather than counting it at parity', () => {
    const accounts = [acct({ id: 'a', currency: 'MYR' }), acct({ id: 'b', currency: 'CNY' })];
    const result = toMyrValues(accounts, { a: 1000, b: 12000 }, {});
    expect(result.valueById).toEqual({ a: 1000 });
    expect(result.valueById.b).toBeUndefined();
    expect(result.unconvertible).toEqual(['b']);
  });

  it('feeds netWorth a total that omits the unconvertible account', () => {
    const accounts = [acct({ id: 'a', currency: 'MYR' }), acct({ id: 'b', currency: 'CNY' })];
    const { valueById } = toMyrValues(accounts, { a: 1000, b: 12000 }, {});
    expect(netWorth(accounts, valueById).net).toBe(1000);
  });

  it('rounds converted values to 2dp', () => {
    const accounts = [acct({ id: 'a', currency: 'CNY' })];
    expect(toMyrValues(accounts, { a: 128 }, { CNY: 0.6321 }).valueById.a).toBe(80.91);
  });

  it('skips archived accounts', () => {
    const accounts = [acct({ id: 'a', currency: 'CNY', archived: true })];
    expect(toMyrValues(accounts, { a: 12000 }, {}).unconvertible).toEqual([]);
  });
});

describe('nativeAccountTotalsByCurrency', () => {
  it('groups native balances by each account\'s own currency', () => {
    const accounts = [
      acct({ id: 'a', currency: 'MYR' }),
      acct({ id: 'b', currency: 'USD' }),
      acct({ id: 'c', currency: 'USD' }),
    ];
    const totals = nativeAccountTotalsByCurrency(accounts, { a: 1000, b: 200, c: 50 });
    expect(totals).toEqual({ MYR: 1000, USD: 250 });
  });

  it('always includes MYR, even at zero, so the base case never looks incomplete', () => {
    const accounts = [acct({ id: 'b', currency: 'USD' })];
    expect(nativeAccountTotalsByCurrency(accounts, { b: 100 })).toEqual({ MYR: 0, USD: 100 });
  });

  it('skips archived accounts', () => {
    const accounts = [acct({ id: 'a', currency: 'USD', archived: true })];
    expect(nativeAccountTotalsByCurrency(accounts, { a: 500 })).toEqual({ MYR: 0 });
  });

  it('treats a missing native value as zero rather than throwing', () => {
    const accounts = [acct({ id: 'a', currency: 'MYR' })];
    expect(nativeAccountTotalsByCurrency(accounts, {})).toEqual({ MYR: 0 });
  });
});

describe('netWorthSeries with rates', () => {
  it('defaults to an empty rate table so existing MYR-only callers are unaffected', () => {
    const accounts = [acct({ id: 'a', currency: 'MYR' })];
    const entries = [entry({ accountId: 'a', value: 500, asOf: '2026-05-01' })];
    expect(netWorthSeries(accounts, entries, ['2026-05'])[0].net).toBe(500);
  });

  it('converts foreign balances in each month point', () => {
    const accounts = [acct({ id: 'a', currency: 'CNY' })];
    const entries = [entry({ accountId: 'a', value: 1000, asOf: '2026-05-01' })];
    expect(netWorthSeries(accounts, entries, ['2026-05'], { CNY: 0.63 })[0].net).toBe(630);
  });
});

describe('defaultLinkEffect', () => {
  it('liability + expense pays down (subtract); income draws up (add)', () => {
    expect(defaultLinkEffect('liability', 'expense')).toBe('subtract');
    expect(defaultLinkEffect('liability', 'income')).toBe('add');
  });
  it('asset + income adds; expense subtracts', () => {
    expect(defaultLinkEffect('asset', 'income')).toBe('add');
    expect(defaultLinkEffect('asset', 'expense')).toBe('subtract');
  });
});

describe('applyEffect', () => {
  it('adds or subtracts and rounds to cents', () => {
    expect(applyEffect(100, 25.5, 'add')).toBe(125.5);
    expect(applyEffect(50, 10, 'subtract')).toBe(40);
    expect(applyEffect(0, 1 / 3, 'add')).toBe(0.33);
  });
});

describe('ACCOUNT_CLASSES', () => {
  it('includes Cash & Bank as the cash class label', () => {
    const cashMeta = ACCOUNT_CLASSES.find((c) => c.id === 'cash');
    expect(cashMeta?.label).toBe('Cash & Bank');
  });

  it('supports accounts with optional interestRate (APR)', () => {
    const accountWithAPR = acct({ id: 'inv_fd', cls: 'investments', interestRate: 3.85 });
    expect(accountWithAPR.interestRate).toBe(3.85);
  });

  it('includes illiquid asset class', () => {
    const illiquidMeta = ACCOUNT_CLASSES.find((c) => c.id === 'illiquid');
    expect(illiquidMeta).toBeDefined();
    expect(illiquidMeta?.kind).toBe('asset');
    expect(illiquidMeta?.label).toBe('Illiquid Assets');
  });

  it('classesFor asset includes illiquid', () => {
    const assetClasses = classesFor('asset');
    const ids = assetClasses.map((c) => c.id);
    expect(ids).toContain('illiquid');
  });

  it('classesFor liability does not include illiquid', () => {
    const liabilityClasses = classesFor('liability');
    const ids = liabilityClasses.map((c) => c.id);
    expect(ids).not.toContain('illiquid');
  });

  it('groupByClass groups illiquid accounts correctly', () => {
    const accounts = [
      acct({ id: 'prop1', kind: 'asset', cls: 'illiquid', name: 'Mont Kiara Condo' }),
      acct({ id: 'prop2', kind: 'asset', cls: 'illiquid', name: '2022 Honda Civic' }),
      acct({ id: 'bank1', kind: 'asset', cls: 'cash', name: 'Maybank' }),
    ];
    const values: Record<string, number> = { prop1: 800000, prop2: 90000, bank1: 5000 };
    const { assets } = groupByClass(accounts, values);
    const illiquidGroup = assets.find((g) => g.cls === 'illiquid');
    expect(illiquidGroup).toBeDefined();
    expect(illiquidGroup?.total).toBe(890000);
    expect(illiquidGroup?.accounts).toHaveLength(2);
  });

  it('illiquid assets support cost and depreciation rate', () => {
    const asset = acct({ id: 'car1', kind: 'asset', cls: 'illiquid', cost: 95000, interestRate: -10.0 });
    expect(asset.cost).toBe(95000);
    expect(asset.interestRate).toBe(-10.0);
  });
});
