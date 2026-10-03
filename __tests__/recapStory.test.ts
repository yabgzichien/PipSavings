import type { Trip } from '../src/lib/trips';
import type { Transaction } from '../src/lib/types';
import {
  buildRecapStoryModel,
  isCompletedStoryMonth,
  RECAP_PERSONA_KEYS,
  recapStoryMerchantCandidates,
  shouldShowRecapStoryInvitation,
  transactionDay,
} from '../src/lib/recapStory';

const now = new Date(2026, 8, 15, 12);
let sequence = 0;

function txn(overrides: Partial<Transaction> = {}): Transaction {
  sequence += 1;
  return {
    id: `txn-${sequence}`,
    merchantRaw: 'Private shop',
    merchantKey: 'private-shop',
    amount: 10,
    currency: 'MYR',
    type: 'expense',
    date: '2026-08-03',
    categoryId: 'food',
    createdAt: '2026-08-03T10:00:00.000Z',
    source: 'manual',
    ...overrides,
  };
}

function fullMonth(overrides: Partial<Transaction> = {}): Transaction[] {
  return [
    txn({ date: '2026-08-03', ...overrides }),
    txn({ date: '2026-08-10', ...overrides }),
    txn({ date: '2026-08-17', ...overrides }),
    txn({ date: '2026-08-17', ...overrides }),
    txn({ date: '2026-08-24', ...overrides }),
  ];
}

function scene<T extends ReturnType<typeof buildRecapStoryModel>, Id extends string>(
  model: T,
  id: Id,
) {
  return model?.scenes.find((candidate) => candidate.id === id);
}

const prohibitedKeys = /amount|income|balance|worth|debt|budget|account|merchant|description|currency/i;
function assertPrivate(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(key).not.toMatch(prohibitedKeys);
    if (typeof child === 'string') expect(child).not.toMatch(/(?:RM|MYR|SGD|USD|\$)\s*\d/i);
    assertPrivate(child);
  }
}

describe('buildRecapStoryModel', () => {
  beforeEach(() => { sequence = 0; });

  it('exports each recap persona key exactly once', () => {
    expect(RECAP_PERSONA_KEYS).toEqual([
      'food', 'shopping', 'entertainment', 'travelling', 'learning', 'family', 'medical',
      'utilities', 'subscriptions', 'rental', 'phoneBill', 'insurance', 'other', 'consistent',
      'explorer', 'smallChapter', 'incomeOnly',
    ]);
    expect(new Set(RECAP_PERSONA_KEYS).size).toBe(RECAP_PERSONA_KEYS.length);
  });

  it('accepts only completed, non-empty months and distinguishes sparse and full stories', () => {
    const income = txn({ type: 'income', categoryId: 'salary' });
    const transfers = [txn({ type: 'transfer' })];
    const fiveOnThreeDays = [
      txn({ date: '2026-08-01' }), txn({ date: '2026-08-01' }),
      txn({ date: '2026-08-02' }), txn({ date: '2026-08-03' }), txn({ date: '2026-08-03' }),
    ];
    const fiveOnTwoDays = [
      txn({ date: '2026-08-01' }), txn({ date: '2026-08-01' }), txn({ date: '2026-08-01' }),
      txn({ date: '2026-08-02' }), txn({ date: '2026-08-02' }),
    ];

    expect(buildRecapStoryModel({ transactions: [], month: '2026-08', now })).toBeNull();
    expect(buildRecapStoryModel({ transactions: transfers, month: '2026-08', now })).toBeNull();
    expect(buildRecapStoryModel({ transactions: [income], month: '2026-08', now })?.kind).toBe('sparse');
    expect(buildRecapStoryModel({ transactions: fiveOnThreeDays, month: '2026-08', now })?.scenes).toHaveLength(5);
    expect(buildRecapStoryModel({ transactions: fiveOnTwoDays, month: '2026-08', now })?.scenes).toHaveLength(3);
    expect(buildRecapStoryModel({ transactions: fullMonth().slice(0, 4), month: '2026-08', now })?.kind).toBe('sparse');
    expect(buildRecapStoryModel({ transactions: fullMonth(), month: '2026-09', now })).toBeNull();
    expect(buildRecapStoryModel({ transactions: fullMonth(), month: '2026-10', now })).toBeNull();
  });

  it('uses date before createdAt and correctly recognizes completed month keys', () => {
    const createdLater = txn({ date: '2026-08-01', createdAt: '2026-09-01T00:30:00.000Z' });
    expect(transactionDay(createdLater)).toBe('2026-08-01');
    expect(transactionDay(txn({ date: null, createdAt: '2026-08-30T23:30:00.000Z' }))).toBe('2026-08-30');
    expect(isCompletedStoryMonth('2026-08', now)).toBe(true);
    expect(isCompletedStoryMonth('2026-09', now)).toBe(false);
    expect(isCompletedStoryMonth('2026-9', now)).toBe(false);
  });

  it('uses Monday-start calendar weeks without merging across a month boundary', () => {
    const model = buildRecapStoryModel({
      transactions: fullMonth({ categoryId: 'custom' }).map((row, index) => ({
        ...row,
        date: ['2026-08-01', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'][index],
      })),
      month: '2026-08', now,
    });
    expect(scene(model, 'habit')).toMatchObject({ activityDays: 5, activityWeeks: 5 });
  });

  it('uses a rounded recorded share at the dominance boundary and stable category ties', () => {
    const boundary = [
      txn({ amount: 35, categoryId: 'food' }), txn({ amount: 30, categoryId: 'shopping' }),
      txn({ amount: 20, categoryId: 'entertainment', date: '2026-08-04' }),
      txn({ amount: 10, categoryId: 'learning', date: '2026-08-05' }),
      txn({ amount: 5, categoryId: 'medical', date: '2026-08-06' }),
    ];
    const tie = fullMonth().map((row, index) => ({ ...row, categoryId: index < 2 ? 'food' : 'shopping', amount: index < 2 ? 15 : 10 }));
    const boundaryModel = buildRecapStoryModel({ transactions: boundary, month: '2026-08', now });
    const tieModel = buildRecapStoryModel({ transactions: tie, month: '2026-08', now });

    expect(scene(boundaryModel, 'identity')).toMatchObject({ persona: 'food' });
    expect(scene(boundaryModel, 'pattern')).toMatchObject({ categoryId: 'food', recordedSharePercent: 35 });
    expect(scene(tieModel, 'pattern')).toMatchObject({ categoryId: 'food', recordedSharePercent: 50 });
  });

  it('breaks decimal monetary ties by category id instead of floating-point residue', () => {
    const decimalTie = [
      txn({ categoryId: 'food', amount: 0.30, date: '2026-08-03' }),
      txn({ categoryId: 'shopping', amount: 0.10, date: '2026-08-04' }),
      txn({ categoryId: 'shopping', amount: 0.20, date: '2026-08-05' }),
      txn({ categoryId: 'other', amount: 0.01, date: '2026-08-05' }),
      txn({ categoryId: 'other', amount: 0.01, date: '2026-08-05' }),
    ];

    expect(scene(buildRecapStoryModel({ transactions: decimalTie, month: '2026-08', now }), 'pattern'))
      .toMatchObject({ categoryId: 'food' });
  });

  it('prioritizes consistency before explorer when no category reaches 35 percent', () => {
    const rows = [
      txn({ categoryId: 'food', amount: 10, date: '2026-08-03' }),
      txn({ categoryId: 'shopping', amount: 10, date: '2026-08-10' }),
      txn({ categoryId: 'entertainment', amount: 10, date: '2026-08-17' }),
      txn({ categoryId: 'learning', amount: 10, date: '2026-08-24' }),
      txn({ categoryId: 'medical', amount: 10, date: '2026-08-31' }),
    ];
    expect(scene(buildRecapStoryModel({ transactions: rows, month: '2026-08', now }), 'identity')).toMatchObject({ persona: 'consistent' });
  });

  it('compares only category shares when both adjacent completed months contain expenses', () => {
    const current = fullMonth().map((row, index) => ({ ...row, amount: index < 3 ? 30 : 5 }));
    const previous = [
      txn({ date: '2026-07-01', categoryId: 'food', amount: 20 }),
      txn({ date: '2026-07-02', categoryId: 'shopping', amount: 80 }),
    ];
    const model = buildRecapStoryModel({ transactions: [...current, ...previous], month: '2026-08', now });
    expect(scene(model, 'pattern')).toMatchObject({ previousRecordedSharePercent: 20, changeDirection: 'higher' });

    const noPreviousExpense = buildRecapStoryModel({ transactions: [...current, txn({ type: 'income', date: '2026-07-01' })], month: '2026-08', now });
    expect(scene(noPreviousExpense, 'pattern')).not.toHaveProperty('previousRecordedSharePercent');
    expect(scene(noPreviousExpense, 'pattern')).not.toHaveProperty('changeDirection');
  });

  it('derives ordered, capped badges from calendar and activity facts', () => {
    const weekend = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29']
      .map((date) => txn({ date, categoryId: 'custom' }));
    const weekday = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']
      .map((date) => txn({ date, categoryId: 'custom' }));
    expect(scene(buildRecapStoryModel({ transactions: weekend, month: '2026-08', now }), 'finale')).toMatchObject({
      badges: ['fiveExpenses', 'threeDays', 'fourWeeks'],
    });
    expect(scene(buildRecapStoryModel({ transactions: weekday, month: '2026-08', now }), 'finale')).toMatchObject({
      badges: ['fiveExpenses', 'threeDays', 'fourWeeks'],
    });
  });

  it('awards every full story its factual five-expense and three-day badges', () => {
    const full = buildRecapStoryModel({ transactions: fullMonth(), month: '2026-08', now });
    const fourExpenses = buildRecapStoryModel({ transactions: fullMonth().slice(0, 4), month: '2026-08', now });

    expect(scene(full, 'finale'))
      .toMatchObject({ badges: ['fiveExpenses', 'threeDays', 'fourWeeks'] });
    expect(scene(fourExpenses, 'finale')).not.toMatchObject({ badges: expect.arrayContaining(['fiveExpenses']) });
  });

  it('keeps default models free of private financial and merchant data', () => {
    const full = buildRecapStoryModel({ transactions: fullMonth(), month: '2026-08', now });
    const sparse = buildRecapStoryModel({ transactions: [txn({ categoryId: 'custom' })], month: '2026-08', now });
    const incomeOnly = buildRecapStoryModel({ transactions: [txn({ type: 'income', categoryId: 'salary' })], month: '2026-08', now });
    assertPrivate(full);
    assertPrivate(sparse);
    assertPrivate(incomeOnly);
    expect(scene(full, 'identity')).toMatchObject({ persona: 'food' });
    expect(scene(sparse, 'identity')).toMatchObject({ persona: 'other' });
    expect(scene(incomeOnly, 'identity')).toMatchObject({ persona: 'incomeOnly' });
    expect(full?.scenes.map((item) => item.id)).toEqual(['ritual', 'identity', 'pattern', 'habit', 'finale']);
    expect(sparse?.scenes.map((item) => item.id)).toEqual(['ritual', 'identity', 'finale']);
    expect(full?.defaultSelectedSceneIds).toEqual(['identity', 'finale']);
  });

  it('allows a merchant cameo only through explicit disclosure and enumerates candidates separately', () => {
    const rows = [
      ...fullMonth({ merchantRaw: 'Zeta Market', merchantKey: 'zeta' }),
      txn({ categoryId: 'food', merchantRaw: 'Alpha Cafe', merchantKey: 'alpha' }),
      txn({ categoryId: 'food', merchantRaw: 'Alpha Cafe', merchantKey: 'alpha' }),
      txn({ categoryId: 'shopping', merchantRaw: 'Wrong category', merchantKey: 'wrong' }),
      txn({ categoryId: 'food', merchantRaw: '   ', merchantKey: 'blank' }),
    ];
    const defaultModel = buildRecapStoryModel({ transactions: rows, month: '2026-08', now });
    const disclosedModel = buildRecapStoryModel({ transactions: rows, month: '2026-08', now, merchantCameo: ' Alpha Cafe ' });

    expect(defaultModel).not.toHaveProperty('merchantCameo');
    expect(scene(defaultModel, 'pattern')).not.toHaveProperty('merchantCameo');
    expect(scene(disclosedModel, 'pattern')).toMatchObject({ merchantCameo: ' Alpha Cafe ' });
    expect(recapStoryMerchantCandidates(rows, '2026-08', 'food')).toEqual(['Zeta Market', 'Alpha Cafe']);
  });

  it('shows the invitation on days 1 through 7 for the previous eligible month', () => {
    const txns = [txn({ date: '2026-08-15' })];
    const day1 = new Date(2026, 8, 1, 10);
    const day7 = new Date(2026, 8, 7, 23, 59);
    const day8 = new Date(2026, 8, 8, 0, 1);

    expect(shouldShowRecapStoryInvitation(txns, day1, null)).toEqual({
      month: '2026-08',
      visible: true,
    });
    expect(shouldShowRecapStoryInvitation(txns, day7, null)).toEqual({
      month: '2026-08',
      visible: true,
    });
    expect(shouldShowRecapStoryInvitation(txns, day8, null)).toEqual({
      month: '2026-08',
      visible: false,
    });
    expect(shouldShowRecapStoryInvitation(txns, day1, '2026-08')).toEqual({
      month: '2026-08',
      visible: false,
    });
    expect(shouldShowRecapStoryInvitation([], day1, null)).toEqual({
      month: '2026-08',
      visible: false,
    });
    expect(shouldShowRecapStoryInvitation([txn({ type: 'transfer', date: '2026-08-15' })], day1, null)).toEqual({
      month: '2026-08',
      visible: false,
    });
    expect(shouldShowRecapStoryInvitation([txn({ date: '2026-09-01' })], day1, null)).toEqual({
      month: '2026-08',
      visible: false,
    });
  });

  it('includes a spotlight scene when unusual spending or special moments occur', () => {
    const withMacBook = [
      ...fullMonth(),
      txn({ merchantRaw: 'Apple', remark: 'MacBook Pro', amount: 5000, date: '2026-08-25' }),
    ];
    const model = buildRecapStoryModel({ transactions: withMacBook, month: '2026-08', now });
    expect(model?.scenes).toHaveLength(6);
    expect(model?.scenes.map((s) => s.id)).toEqual(['ritual', 'identity', 'pattern', 'spotlight', 'habit', 'finale']);
    expect(scene(model, 'spotlight')).toMatchObject({
      id: 'spotlight',
      type: 'spotlight',
      highlight: { kind: 'techUpgrade', itemLabel: 'MacBook', iconName: 'sparkles' },
    });
    assertPrivate(model);
  });

  it('names this month’s trips on the spotlight ahead of a car purchase', () => {
    const trips: Trip[] = [{
      id: 'tokyo', name: 'Tokyo', createdAt: '2026-08-01T00:00:00.000Z',
      archived: false, startDate: null, endDate: null, icon: null,
    }];
    const model = buildRecapStoryModel({
      transactions: [
        ...fullMonth(),
        txn({ merchantRaw: 'Honda', remark: 'Car deposit', amount: 4000, date: '2026-08-20', tripId: 'tokyo' }),
      ],
      month: '2026-08',
      now,
      trips,
    });
    expect(scene(model, 'spotlight')).toMatchObject({
      highlight: { kind: 'tripAdventure', places: ['Tokyo'], iconName: 'pin' },
    });
    assertPrivate(model);
  });

  it('includes a spotlight in sparse story when a major milestone is present', () => {
    const sparseMilestone = [
      txn({ type: 'expense', merchantRaw: 'Apple Store', remark: 'MacBook Air', amount: 3500, date: '2026-08-10' }),
    ];
    const model = buildRecapStoryModel({ transactions: sparseMilestone, month: '2026-08', now });
    expect(model?.kind).toBe('sparse');
    expect(model?.scenes.map((s) => s.id)).toEqual(['ritual', 'identity', 'spotlight', 'finale']);
    expect(scene(model, 'spotlight')).toMatchObject({
      id: 'spotlight',
      type: 'spotlight',
      highlight: { kind: 'techUpgrade', itemLabel: 'MacBook' },
    });
    assertPrivate(model);
  });
});
