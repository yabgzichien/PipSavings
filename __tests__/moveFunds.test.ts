import {
  canMoveCash,
  deriveMove,
  eligibleCashAccounts,
  linkedAsOf,
  pickerAccounts,
  planLinkedMove,
  validateMove,
} from '../src/lib/moveFunds';
import type { Account, BalanceEntry } from '../src/lib/types';

function acct(over: Partial<Account>): Account {
  return {
    id: 'a1',
    name: 'Maybank',
    kind: 'asset',
    cls: 'cash',
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    sub: null,
    symbol: null,
    ticker: null,
    quantity: null,
    cost: null,
    currency: 'MYR',
    ...over,
  };
}

function entry(over: Partial<BalanceEntry>): BalanceEntry {
  return {
    id: 'e1',
    accountId: 'from',
    value: 5420,
    asOf: '2026-09-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    source: 'manual',
    ...over,
  };
}

describe('deriveMove', () => {
  it('derives both new balances from the amount moved', () => {
    expect(deriveMove(5420, 37.4, { kind: 'amount', amount: 200 })).toEqual({
      amount: 200,
      newFrom: 5220,
      newTo: 237.4,
    });
  });

  it('back-solves the amount from a new destination total', () => {
    expect(deriveMove(5420, 37.4, { kind: 'newTo', newTo: 237.4 })).toEqual({
      amount: 200,
      newFrom: 5220,
      newTo: 237.4,
    });
  });

  it('back-solves the amount from a new source total', () => {
    expect(deriveMove(5420, 37.4, { kind: 'newFrom', newFrom: 5220 })).toEqual({
      amount: 200,
      newFrom: 5220,
      newTo: 237.4,
    });
  });

  it('returns null when the derived amount is not positive (do not reverse silently)', () => {
    expect(deriveMove(5420, 37.4, { kind: 'amount', amount: 0 })).toBeNull();
    expect(deriveMove(5420, 37.4, { kind: 'newTo', newTo: 20 })).toBeNull();
    expect(deriveMove(5420, 37.4, { kind: 'newFrom', newFrom: 5600 })).toBeNull();
  });

  it('returns null when From would go negative', () => {
    expect(deriveMove(100, 37.4, { kind: 'amount', amount: 200 })).toBeNull();
  });
});

describe('validateMove', () => {
  const from = acct({ id: 'bank', name: 'Maybank' });
  const to = acct({ id: 'tng', name: 'TnG' });

  it('rejects the same account on both sides', () => {
    expect(validateMove({ from, to: from, amount: 200, fromBalance: 5420 })).toBe('same_account');
  });

  it('rejects a zero amount', () => {
    expect(validateMove({ from, to, amount: 0, fromBalance: 5420 })).toBe('zero');
  });

  it('rejects an amount larger than the source balance', () => {
    expect(validateMove({ from, to, amount: 200, fromBalance: 100 })).toBe('insufficient');
  });

  it('rejects a non-cash or archived account', () => {
    expect(validateMove({ from: acct({ id: 'bank', cls: 'investments' }), to, amount: 200, fromBalance: 5420 })).toBe('ineligible');
    expect(validateMove({ from, to: acct({ id: 'tng', archived: true }), amount: 200, fromBalance: 5420 })).toBe('ineligible');
  });

  it('rejects mixed currencies', () => {
    expect(validateMove({ from, to: acct({ id: 'tng', currency: 'SGD' }), amount: 200, fromBalance: 5420 })).toBe('currency');
  });

  it('accepts a valid cash-to-cash move', () => {
    expect(validateMove({ from, to, amount: 200, fromBalance: 5420 })).toBeNull();
  });
});

describe('eligibleCashAccounts / canMoveCash / pickerAccounts', () => {
  const bank = acct({ id: 'bank', name: 'Maybank' });
  const tng = acct({ id: 'tng', name: 'TnG' });
  const cash = acct({ id: 'cash', name: 'Cash' });
  const usd = acct({ id: 'usd', name: 'USD', currency: 'USD' });
  const stocks = acct({ id: 'stk', name: 'Stocks', cls: 'investments' });
  const archived = acct({ id: 'old', name: 'Old', archived: true });

  it('keeps only active Cash & Bank accounts', () => {
    expect(eligibleCashAccounts([bank, tng, stocks, archived]).map((a) => a.id)).toEqual(['bank', 'tng']);
  });

  it('hides Move unless two eligible cash accounts exist', () => {
    expect(canMoveCash([bank])).toBe(false);
    expect(canMoveCash([bank, tng])).toBe(true);
    expect(canMoveCash([bank, stocks])).toBe(false);
  });

  it('excludes the other side and mismatches on currency', () => {
    expect(pickerAccounts([bank, tng, cash, usd], 'bank', 'MYR').map((a) => a.id)).toEqual(['tng', 'cash']);
    expect(pickerAccounts([bank, tng, usd], null, null).map((a) => a.id)).toEqual(['bank', 'tng', 'usd']);
  });
});

describe('planLinkedMove', () => {
  it('nudges both accounts by the same amount and never dates before the latest reading', () => {
    const fromEntries = [
      entry({ accountId: 'bank', value: 5420, asOf: '2026-09-14' }),
    ];
    const toEntries = [
      entry({ id: 'e2', accountId: 'tng', value: 37.4, asOf: '2026-09-10' }),
    ];
    expect(planLinkedMove(fromEntries, toEntries, 200, '2026-09-01')).toEqual({
      fromValue: 5220,
      toValue: 237.4,
      fromAsOf: '2026-09-14',
      toAsOf: '2026-09-10',
    });
  });

  it('uses the requested date when it is the newest reading', () => {
    expect(linkedAsOf('2026-09-01', '2026-09-15')).toBe('2026-09-15');
    expect(linkedAsOf('', '2026-09-15')).toBe('2026-09-15');
  });
});
