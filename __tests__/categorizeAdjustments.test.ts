import {
  applyCategorizeAdjustments,
  keptCategorizeEffects,
  liabilityCurrencyMissingRate,
} from '../src/lib/categorizeAdjustments';
import { DROP, type Account } from '../src/lib/types';

function loan(over: Partial<Account> = {}): Account {
  return {
    id: 'loan',
    name: 'Proton Car Loan',
    kind: 'liability',
    cls: 'loan',
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

describe('keptCategorizeEffects', () => {
  const items = [
    { type: 'expense', amount: 25, currency: 'MYR' },
    { type: 'income', amount: 100, currency: 'MYR' },
    { type: 'expense', amount: 40, currency: 'USD', fxRate: 4 },
  ];

  it('drops skipped rows and keeps income from joining a trip or a loan', () => {
    const effects = keptCategorizeEffects(
      items,
      ['food', DROP, 'transport'],
      [
        { tripId: 'sg', liabilityAccountId: 'loan', fromAccountId: 'maybank' },
        { tripId: 'sg', liabilityAccountId: 'loan', fromAccountId: 'maybank' },
        { tripId: 'sg', liabilityAccountId: null, fromAccountId: null },
      ],
      [null, null, 10],
    );
    expect(effects).toEqual([
      { txnType: 'expense', tripId: 'sg', liabilityAccountId: 'loan', fromAccountId: 'maybank', movedMyr: 25 },
      { txnType: 'expense', tripId: 'sg', liabilityAccountId: null, fromAccountId: null, movedMyr: 40 },
    ]);
  });

  it('uses a split gross, converted to MYR, as the amount that pays down the loan', () => {
    const effects = keptCategorizeEffects(
      [{ type: 'expense', amount: 80, currency: 'USD', fxRate: 4.5 }],
      ['food'],
      [{ tripId: null, liabilityAccountId: 'loan', fromAccountId: null }],
      [20],
    );
    expect(effects[0].movedMyr).toBe(90);
  });
});

describe('liabilityCurrencyMissingRate', () => {
  it('asks for a rate only when a chosen foreign loan has none', () => {
    const effects = [
      { txnType: 'expense', tripId: null, liabilityAccountId: 'usd-loan', fromAccountId: null, movedMyr: 10 },
      { txnType: 'expense', tripId: null, liabilityAccountId: 'myr-loan', fromAccountId: 'usd-bank', movedMyr: 10 },
    ];
    const accounts = [
      loan({ id: 'usd-loan', currency: 'USD' }),
      loan({ id: 'myr-loan' }),
      loan({ id: 'usd-bank', kind: 'asset', cls: 'bank', currency: 'USD' }),
    ];
    expect(liabilityCurrencyMissingRate(effects, accounts, {})).toBe('USD');
    expect(liabilityCurrencyMissingRate(effects, accounts, { USD: 4.2 })).toBeNull();
  });
});

describe('applyCategorizeAdjustments', () => {
  it('groups trips and subtracts each loan payment in that account’s currency', async () => {
    const setTransactionsTrip = jest.fn(() => Promise.resolve());
    const recordBalanceLink = jest.fn(() => Promise.resolve());
    await applyCategorizeAdjustments({
      created: [
        { id: 'a', date: '2026-09-23' },
        { id: 'b', date: null },
        { id: 'c', date: '2026-09-24' },
      ],
      effects: [
        { txnType: 'expense', tripId: 'sg', liabilityAccountId: 'loan', fromAccountId: 'cash', movedMyr: 15 },
        { txnType: 'income', tripId: null, liabilityAccountId: null, fromAccountId: 'cash', movedMyr: 100 },
        { txnType: 'expense', tripId: 'sg', liabilityAccountId: 'usd-loan', fromAccountId: null, movedMyr: 42 },
      ],
      accounts: [loan(), loan({ id: 'usd-loan', currency: 'USD' }), loan({ id: 'cash', kind: 'asset', cls: 'cash' })],
      rates: { USD: 4.2 },
      today: '2026-10-03',
      setTransactionsTrip,
      recordBalanceLink,
    });
    expect(setTransactionsTrip).toHaveBeenCalledTimes(1);
    expect(setTransactionsTrip).toHaveBeenCalledWith(['a', 'c'], 'sg');
    expect(recordBalanceLink).toHaveBeenCalledWith('cash', 15, 'subtract', '2026-09-23');
    expect(recordBalanceLink).toHaveBeenCalledWith('loan', 15, 'subtract', '2026-09-23');
    expect(recordBalanceLink).toHaveBeenCalledWith('cash', 100, 'add', '2026-10-03');
    expect(recordBalanceLink).toHaveBeenCalledWith('usd-loan', 10, 'subtract', '2026-09-24');
  });

  it('moves a loan only once when that loan is also the account the money left', async () => {
    const recordBalanceLink = jest.fn(() => Promise.resolve());
    await applyCategorizeAdjustments({
      created: [{ id: 'a', date: '2026-09-23' }],
      effects: [
        { txnType: 'expense', tripId: null, liabilityAccountId: 'loan', fromAccountId: 'loan', movedMyr: 15 },
      ],
      accounts: [loan()],
      rates: {},
      today: '2026-10-03',
      setTransactionsTrip: jest.fn(() => Promise.resolve()),
      recordBalanceLink,
    });
    expect(recordBalanceLink).toHaveBeenCalledTimes(1);
    expect(recordBalanceLink).toHaveBeenCalledWith('loan', 15, 'subtract', '2026-09-23');
  });
});
