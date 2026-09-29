import { clampToMonth, occurrencesFor, findCommitmentMatch, occurrenceMyr, monthTimelineOccurrences } from '../src/lib/commitments';
import type { Commitment, CommitmentOccurrence } from '../src/lib/commitments';
import type { Transaction } from '../src/lib/types';

function commitment(over: Partial<Commitment>): Commitment {
  return {
    id: 'c1', label: 'Maxis', merchantKey: 'maxis', kind: 'expense', amount: 89,
    categoryId: 'communications', fromAccountId: 'a1', toAccountId: null,
    dueDay: 5, startMonth: '2026-06', endMonth: null, archived: false,
    createdAt: '2026-06-01T00:00:00.000Z', reliefCode: null, currency: 'MYR', ...over,
  };
}

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    merchantRaw: 'Maxis', merchantKey: 'maxis', amount: 89, currency: 'MYR',
    type: 'expense', date: '2026-06-05', categoryId: 'communications',
    createdAt: '2026-06-05T10:00:00.000Z', source: 'manual', ...over,
  };
}

describe('clampToMonth', () => {
  it('keeps a normal day', () => {
    expect(clampToMonth('2026-06', 15)).toBe('2026-06-15');
  });
  it('clamps a day-of-month past the end of a short month', () => {
    expect(clampToMonth('2026-02', 31)).toBe('2026-02-28');
  });
  it('clamps into a leap February', () => {
    expect(clampToMonth('2028-02', 31)).toBe('2028-02-29');
  });
});

describe('occurrencesFor', () => {
  it('generates the horizon of months starting at max(startMonth, fromMonth)', () => {
    const c = commitment({ startMonth: '2026-06', dueDay: 5 });
    const occs = occurrencesFor(c, '2026-06', 3);
    expect(occs.map((o) => o.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(occs.map((o) => o.dueDate)).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
    expect(occs.every((o) => o.amount === 89)).toBe(true);
  });

  it('does not backfill: starts from fromMonth even if startMonth is older', () => {
    const c = commitment({ startMonth: '2020-01' });
    const occs = occurrencesFor(c, '2026-06', 2);
    expect(occs.map((o) => o.month)).toEqual(['2026-06', '2026-07']);
  });

  it('starts from startMonth when it is later than fromMonth', () => {
    const c = commitment({ startMonth: '2026-09' });
    const occs = occurrencesFor(c, '2026-06', 3);
    expect(occs.map((o) => o.month)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('stops at endMonth', () => {
    const c = commitment({ startMonth: '2026-06', endMonth: '2026-07' });
    const occs = occurrencesFor(c, '2026-06', 6);
    expect(occs.map((o) => o.month)).toEqual(['2026-06', '2026-07']);
  });

  it('produces nothing once endMonth has already passed', () => {
    const c = commitment({ startMonth: '2026-01', endMonth: '2026-03' });
    const occs = occurrencesFor(c, '2026-06', 3);
    expect(occs).toEqual([]);
  });
});

describe('findCommitmentMatch', () => {
  const c = commitment({ amount: 89, merchantKey: 'maxis' });

  it('matches a same-merchant transaction within the amount and day tolerance', () => {
    const t = txn({ amount: 88.5, date: '2026-06-03' });
    expect(findCommitmentMatch([t], c, '2026-06-05')).toBe(t);
  });

  it('rejects an amount outside the 5% tolerance', () => {
    const t = txn({ amount: 120 });
    expect(findCommitmentMatch([t], c, '2026-06-05')).toBeNull();
  });

  it('rejects a date more than 7 days from the due date', () => {
    const t = txn({ date: '2026-06-20' });
    expect(findCommitmentMatch([t], c, '2026-06-05')).toBeNull();
  });

  it('rejects a different merchant', () => {
    const t = txn({ merchantKey: 'celcom' });
    expect(findCommitmentMatch([t], c, '2026-06-05')).toBeNull();
  });

  it('skips a candidate already excluded (already linked elsewhere)', () => {
    const t = txn({ id: 'txn-1' });
    expect(findCommitmentMatch([t], c, '2026-06-05', new Set(['txn-1']))).toBeNull();
  });
});

describe('foreign currency commitments', () => {
  it('freezes each occurrence at the rate current when it was generated', () => {
    const march = occurrenceMyr(2000, 0.63);
    const april = occurrenceMyr(2000, 0.65);
    expect(march).toBe(1260);
    expect(april).toBe(1300);
    expect(march).not.toBe(april);
  });

  it('leaves the occurrences of a MYR commitment unconverted', () => {
    expect(occurrenceMyr(2000, 1)).toBe(2000);
  });
});

import { formatTimelineDateHeader } from '../src/lib/dates';

describe('formatTimelineDateHeader', () => {
  const today = '2026-09-01';

  it('formats Today, Tomorrow, and Yesterday accurately', () => {
    expect(formatTimelineDateHeader('2026-09-01', today, false)).toBe('Today SEP 1');
    expect(formatTimelineDateHeader('2026-09-02', today, false)).toBe('Tomorrow SEP 2');
    expect(formatTimelineDateHeader('2026-08-31', today, false)).toBe('Yesterday AUG 31');
  });

  it('formats specific days of week and month dates matching the design reference', () => {
    expect(formatTimelineDateHeader('2026-09-07', today, false)).toBe('Monday SEP 7');
    expect(formatTimelineDateHeader('2026-09-19', today, false)).toBe('Saturday SEP 19');
    expect(formatTimelineDateHeader('2026-10-01', today, false)).toBe('Thursday OCT 1');
    expect(formatTimelineDateHeader('2026-10-09', today, false)).toBe('Friday OCT 9');
    expect(formatTimelineDateHeader('2026-10-18', today, false)).toBe('Sunday OCT 18');
  });

  it('formats in Chinese accurately when isZh is true', () => {
    expect(formatTimelineDateHeader('2026-09-01', today, true)).toBe('今天 9月1日');
    expect(formatTimelineDateHeader('2026-09-02', today, true)).toBe('明天 9月2日');
    expect(formatTimelineDateHeader('2026-09-07', today, true)).toBe('周一 9月7日');
    expect(formatTimelineDateHeader('2026-09-19', today, true)).toBe('周六 9月19日');
    expect(formatTimelineDateHeader('2026-10-01', today, true)).toBe('周四 10月1日');
  });
});

import { defaultLinkEffect, applyEffect } from '../src/lib/networth';

describe('instalment commitments with liability reduction', () => {
  it('correctly models a car loan or mortgage instalment with fromAccountId and toAccountId', () => {
    const carInstalment = commitment({
      label: 'Proton X50 Loan',
      kind: 'expense',
      amount: 1100,
      categoryId: 'travelling',
      fromAccountId: 'bank-savings-id',
      toAccountId: 'car-loan-liability-id',
      dueDay: 15,
    });

    expect(carInstalment.kind).toBe('expense');
    expect(carInstalment.fromAccountId).toBe('bank-savings-id');
    expect(carInstalment.toAccountId).toBe('car-loan-liability-id');
    expect(carInstalment.amount).toBe(1100);

    // Paying the instalment reduces the liability balance
    const liabilityEffect = defaultLinkEffect('liability', 'expense');
    expect(liabilityEffect).toBe('subtract');

    const outstandingLoan = 55000;
    const nextOutstanding = applyEffect(outstandingLoan, carInstalment.amount, liabilityEffect);
    expect(nextOutstanding).toBe(53900);

    // Paying the instalment also reduces the funding bank account balance
    const assetEffect = defaultLinkEffect('asset', 'expense');
    expect(assetEffect).toBe('subtract');

    const bankBalance = 15000;
    const nextBankBalance = applyEffect(bankBalance, carInstalment.amount, assetEffect);
    expect(nextBankBalance).toBe(13900);
  });

  it('generates up to 24 months of future occurrences for seamless month-to-month navigation', () => {
    const stream = commitment({ label: 'Netflix', startMonth: '2026-01', dueDay: 10 });
    const occs = occurrencesFor(stream, '2026-08');
    expect(occs.length).toBe(24);
    expect(occs[0].month).toBe('2026-08');
    expect(occs[0].dueDate).toBe('2026-08-10');
    expect(occs[23].month).toBe('2028-07');
    expect(occs[23].dueDate).toBe('2028-07-10');
  });

  it('preserves historical occurrences prior to the cancellation month and drops forward ones', () => {
    // When OpenAI subscription is deleted on August 2026, endMonth is capped to 2026-07
    const openAI = commitment({ label: 'ChatGPT Plus', startMonth: '2026-01', endMonth: '2026-07', dueDay: 20 });
    
    // Past months (e.g. from 2026-01) still produce their occurrences up through 2026-07
    const historicalOccs = occurrencesFor(openAI, '2026-01', 24);
    expect(historicalOccs.map((o) => o.month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'
    ]);

    // From August 2026 onwards, no future occurrences are generated
    const futureOccs = occurrencesFor(openAI, '2026-08', 24);
    expect(futureOccs).toEqual([]);
  });
});

describe('monthTimelineOccurrences', () => {
  const rows = [{ id: 'overdue' }, { id: 'later' }];

  it('drops overdue rows from the current month, because that section already lists them', () => {
    expect(monthTimelineOccurrences(rows, new Set(['overdue']), true)).toEqual([{ id: 'later' }]);
  });

  it('keeps every row when viewing another month', () => {
    expect(monthTimelineOccurrences(rows, new Set(['overdue']), false)).toEqual(rows);
  });
});



