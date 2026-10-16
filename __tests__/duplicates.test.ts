import { findBatchCopy, findDuplicate, todayISO, undatedWindow } from '../src/lib/duplicates';
import type { ExtractedTxn, Transaction } from '../src/lib/types';

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2),
    merchantRaw: 'ABC Trading',
    merchantKey: 'abc trading',
    amount: 10,
    currency: 'MYR',
    type: 'expense',
    date: '2026-05-12',
    categoryId: 'shopping',
    createdAt: '2026-05-12T19:00:00.000Z',
    source: 'manual',
    ...over,
  };
}

const TODAY = '2026-06-01';

describe('findDuplicate', () => {
  const saved = [txn({ merchantRaw: 'ABC Trading', merchantKey: 'abc trading', amount: 10, date: '2026-05-12' })];

  it('flags same merchant + amount + day', () => {
    const hit = findDuplicate(saved, { merchant: 'ABC Trading', amount: 10, date: '2026-05-12' }, TODAY);
    expect(hit).not.toBeNull();
  });

  it('is case/space tolerant on the merchant', () => {
    const hit = findDuplicate(saved, { merchant: '  abc   trading ', amount: 10, date: '2026-05-12' }, TODAY);
    expect(hit).not.toBeNull();
  });

  it('does not flag a different amount', () => {
    expect(findDuplicate(saved, { merchant: 'ABC Trading', amount: 12, date: '2026-05-12' }, TODAY)).toBeNull();
  });

  it('does not flag a different day', () => {
    expect(findDuplicate(saved, { merchant: 'ABC Trading', amount: 10, date: '2026-05-13' }, TODAY)).toBeNull();
  });

  it('does not flag a different merchant', () => {
    expect(findDuplicate(saved, { merchant: 'XYZ Mart', amount: 10, date: '2026-05-12' }, TODAY)).toBeNull();
  });

  it('tolerates float noise in amount', () => {
    const s = [txn({ amount: 10.0 })];
    expect(findDuplicate(s, { merchant: 'ABC Trading', amount: 10.004, date: '2026-05-12' }, TODAY)).not.toBeNull();
  });

  it('looks back 30 days for an undated candidate when no window is known', () => {
    const sToday = [txn({ date: TODAY, createdAt: `${TODAY}T10:00:00.000Z` })];
    expect(findDuplicate(sToday, { merchant: 'ABC Trading', amount: 10, date: null }, TODAY)).not.toBeNull();
    // 20 days back is inside the look-back...
    expect(findDuplicate(saved, { merchant: 'ABC Trading', amount: 10, date: null }, TODAY)).not.toBeNull();
    // ...45 days back is not.
    const old = [txn({ date: '2026-04-17' })];
    expect(findDuplicate(old, { merchant: 'ABC Trading', amount: 10, date: null }, TODAY)).toBeNull();
  });

  it('confines an undated candidate to the window its neighbours give it', () => {
    const s = [txn({ date: '2026-05-12' })];
    const cand = { merchant: 'ABC Trading', amount: 10, date: null };
    expect(findDuplicate(s, cand, TODAY, { window: { from: '2026-05-10', to: '2026-05-13' } })).not.toBeNull();
    expect(findDuplicate(s, cand, TODAY, { window: { from: '2026-05-14', to: '2026-05-20' } })).toBeNull();
  });

  it('falls back to createdAt day when saved.date is null', () => {
    const s = [txn({ date: null, createdAt: '2026-05-12T19:00:00.000Z' })];
    expect(findDuplicate(s, { merchant: 'ABC Trading', amount: 10, date: '2026-05-12' }, TODAY)).not.toBeNull();
  });

  it('does not flag duplicates when candidate has no merchant', () => {
    const s = [txn({ merchantRaw: '', merchantKey: '', amount: 10, date: '2026-05-12' })];
    expect(findDuplicate(s, { merchant: '', amount: 10, date: '2026-05-12' }, TODAY)).toBeNull();
    expect(findDuplicate(saved, { merchant: '', amount: 10, date: '2026-05-12' }, TODAY)).toBeNull();
  });
});

describe('findDuplicate: stricter matching', () => {
  it('matches the full bill of a split row, not just the saved share', () => {
    const f2f = txn({ id: 'f2f', merchantRaw: 'F2F NOODLE HOUSE SEPANG', merchantKey: 'f2f noodle house sepang', amount: 12.61, date: '2026-10-14' });
    const splits = [{ txnId: 'f2f', gross: 60.75, ownShare: 12.61 }];
    const hit = findDuplicate([f2f], { merchant: 'F2F NOODLE HOUSE SEPANG', amount: 60.75, date: '2026-10-14' }, TODAY, { splits });
    expect(hit?.txn.id).toBe('f2f');
    expect(hit?.split).toEqual({ gross: 60.75, ownShare: 12.61 });
    // The saved share itself still matches, without split context.
    expect(findDuplicate([f2f], { merchant: 'F2F NOODLE HOUSE SEPANG', amount: 12.61, date: '2026-10-14' }, TODAY, { splits })?.split).toBeNull();
  });

  it('ignores stray symbols in the merchant', () => {
    const s = [txn({ merchantRaw: 'XM Sepang', merchantKey: 'xm sepang', amount: 9.5, date: '2026-10-15' })];
    expect(findDuplicate(s, { merchant: 'XM Sepang ▪', amount: 9.5, date: '2026-10-15' }, TODAY)).not.toBeNull();
  });

  it('matches when one merchant name contains the other', () => {
    const s = [txn({ merchantRaw: '33 Food Court Botanic', merchantKey: '33 food court botanic', amount: 3, date: '2026-10-12' })];
    expect(findDuplicate(s, { merchant: 'Food Court Botanic', amount: 3, date: '2026-10-12' }, TODAY)).not.toBeNull();
  });

  it('does not treat a short name as contained in a longer one', () => {
    const s = [txn({ merchantRaw: 'Grab Food', merchantKey: 'grab food', amount: 10, date: '2026-05-12' })];
    expect(findDuplicate(s, { merchant: 'Grab', amount: 10, date: '2026-05-12' }, TODAY)).toBeNull();
  });

  it('compares a foreign row by its native amount', () => {
    const s = [txn({ amount: 35.2, currency: 'SGD', nativeAmount: 10, fxRate: 3.52 })];
    expect(findDuplicate(s, { merchant: 'ABC Trading', amount: 10, date: '2026-05-12' }, TODAY)).not.toBeNull();
  });

  it('notes a matching time without requiring one', () => {
    const s = [txn({ time: '12:55' })];
    expect(findDuplicate(s, { merchant: 'ABC Trading', amount: 10, date: '2026-05-12', time: '12:55' }, TODAY)?.sameTime).toBe(true);
    // A different time still warns: a misread clock must never hide a repeat.
    const other = findDuplicate(s, { merchant: 'ABC Trading', amount: 10, date: '2026-05-12', time: '18:20' }, TODAY);
    expect(other).not.toBeNull();
    expect(other?.sameTime).toBe(false);
  });

  it('does not match an income row against an expense', () => {
    const s = [txn({ type: 'expense' })];
    expect(findDuplicate(s, { merchant: 'ABC Trading', amount: 10, date: '2026-05-12', type: 'income' }, TODAY)).toBeNull();
  });
});

describe('findBatchCopy', () => {
  const row = (over: Partial<ExtractedTxn>): ExtractedTxn => ({
    merchant: 'XM Sepang',
    amount: 9.5,
    type: 'expense',
    date: '2026-10-15',
    time: '18:23',
    method: null,
    currency: 'MYR',
    ...over,
  });

  it('flags an undated row that repeats a dated row from the same scan', () => {
    const items = [
      row({}),
      row({ merchant: '33 Food Court Botanic', amount: 3, date: '2026-10-12', time: '18:59' }),
      row({ merchant: 'Food Court Botanic', amount: 3, date: null, time: null }),
      row({ merchant: 'XM Sepang ▪', date: null, time: null }),
    ];
    expect(findBatchCopy(items, 2)).toBe(1);
    expect(findBatchCopy(items, 3)).toBe(0);
  });

  it('never flags a dated row', () => {
    const items = [row({}), row({ time: '19:00' })];
    expect(findBatchCopy(items, 1)).toBeNull();
  });

  it('needs the same amount and type', () => {
    const items = [row({}), row({ date: null, time: null, amount: 9.6 }), row({ date: null, time: null, type: 'income' })];
    expect(findBatchCopy(items, 1)).toBeNull();
    expect(findBatchCopy(items, 2)).toBeNull();
  });
});

describe('undatedWindow', () => {
  const row = (date: string | null): ExtractedTxn => ({ merchant: 'x', amount: 1, type: 'expense', date, method: null, currency: 'MYR' });

  it('spans the dated rows on either side', () => {
    const items = [row('2026-10-15'), row(null), row('2026-10-12')];
    expect(undatedWindow(items, 1)).toEqual({ from: '2026-10-12', to: '2026-10-15' });
  });

  it('is unknown when the row is not boxed in', () => {
    expect(undatedWindow([row('2026-10-15'), row(null)], 1)).toBeNull();
    expect(undatedWindow([row(null), row(null)], 0)).toBeNull();
  });
});

describe('todayISO', () => {
  it('formats YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 5, 1))).toBe('2026-06-01');
  });
});
