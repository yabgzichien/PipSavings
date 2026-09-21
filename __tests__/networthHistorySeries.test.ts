// __tests__/networthHistorySeries.test.ts
import {
  netWorthSeries,
  resolveArchivedAt,
  classValuesAsOf,
} from '../src/lib/networth';
import { rankClassMovers } from '../src/lib/netWorthPresentation';
import type { Account, BalanceEntry } from '../src/lib/types';

function acct(over: Partial<Account>): Account {
  return {
    id: 'a1',
    name: 'Acct',
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
    id: Math.random().toString(36).slice(2),
    accountId: 'a1',
    value: 100,
    asOf: '2026-05-01',
    createdAt: '2026-05-01T00:00:00.000Z',
    source: 'manual',
    ...over,
  };
}

describe('resolveArchivedAt', () => {
  it('is null for active accounts', () => {
    expect(resolveArchivedAt(acct({}), [])).toBeNull();
  });

  it('uses archivedAt when present', () => {
    expect(resolveArchivedAt(acct({ archived: true, archivedAt: '2026-04-15' }), [])).toBe('2026-04-15');
  });

  it('falls back to the last balance entry date when archivedAt is missing', () => {
    const entries = [
      entry({ asOf: '2026-02-01', value: 50 }),
      entry({ asOf: '2026-03-20', value: 80 }),
    ];
    expect(resolveArchivedAt(acct({ archived: true }), entries)).toBe('2026-03-20');
  });
});

describe('netWorthSeries measured + archived history', () => {
  it('marks a month measured when any manual reading lands in that month', () => {
    const accounts = [acct({ id: 'cash1' })];
    const entries = [
      entry({ accountId: 'cash1', value: 1000, asOf: '2026-04-15', source: 'manual' }),
      entry({ accountId: 'cash1', value: 1100, asOf: '2026-05-10', source: 'linked' }),
      entry({ accountId: 'cash1', value: 1200, asOf: '2026-06-01', source: 'price' }),
    ];
    const series = netWorthSeries(accounts, entries, ['2026-04', '2026-05', '2026-06']);
    expect(series.map((p) => [p.monthKey, p.measured, p.net])).toEqual([
      ['2026-04', true, 1000],
      ['2026-05', false, 1100],
      ['2026-06', false, 1200],
    ]);
  });

  it('treats legacy entries without source as manual (measured)', () => {
    const accounts = [acct({ id: 'cash1' })];
    const entries = [entry({ accountId: 'cash1', value: 500, asOf: '2026-04-01', source: undefined })];
    expect(netWorthSeries(accounts, entries, ['2026-04'])[0].measured).toBe(true);
  });

  it('keeps an archived account in history through its archive month, then drops it', () => {
    const accounts = [
      acct({ id: 'cash1' }),
      acct({ id: 'old', archived: true, archivedAt: '2026-05-10' }),
    ];
    const entries = [
      entry({ accountId: 'cash1', value: 1000, asOf: '2026-04-01' }),
      entry({ accountId: 'old', value: 500, asOf: '2026-04-01' }),
    ];
    const series = netWorthSeries(accounts, entries, ['2026-04', '2026-05', '2026-06']);
    expect(series.map((p) => [p.monthKey, p.net])).toEqual([
      ['2026-04', 1500],
      ['2026-05', 1500],
      ['2026-06', 1000],
    ]);
  });

  it('does not let an archived account inflate the present when archivedAt has passed', () => {
    const accounts = [acct({ id: 'old', archived: true, archivedAt: '2026-03-01' })];
    const entries = [entry({ accountId: 'old', value: 9999, asOf: '2026-02-15' })];
    expect(netWorthSeries(accounts, entries, ['2026-04'])[0].net).toBe(0);
  });
});

describe('classValuesAsOf for drill-down movers', () => {
  it('returns MYR values per account as of a month end', () => {
    const accounts = [
      acct({ id: 'cash1', cls: 'cash' }),
      acct({ id: 'loan', kind: 'liability', cls: 'personal' }),
    ];
    const entries = [
      entry({ accountId: 'cash1', value: 1000, asOf: '2026-04-15' }),
      entry({ accountId: 'cash1', value: 1500, asOf: '2026-05-10' }),
      entry({ accountId: 'loan', value: 400, asOf: '2026-04-20' }),
      entry({ accountId: 'loan', value: 200, asOf: '2026-05-05' }),
    ];
    const april = classValuesAsOf(accounts, entries, '2026-04', {});
    const may = classValuesAsOf(accounts, entries, '2026-05', {});
    expect(april).toEqual({ cash1: 1000, loan: 400 });
    expect(may).toEqual({ cash1: 1500, loan: 200 });
    const movers = rankClassMovers(accounts, may, april);
    expect(movers[0]).toMatchObject({ cls: 'cash', delta: 500 });
  });
});
