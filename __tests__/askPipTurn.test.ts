import { emptySession } from '../src/lib/askPip/session';
import { runAskPipTurn } from '../src/lib/askPip/turn';
import type { Transaction } from '../src/lib/types';

const world = { trips: [], people: [], categories: [] };

describe('runAskPipTurn', () => {
  it('refuses advice without calling the model', async () => {
    const model = jest.fn();
    const { session } = await runAskPipTurn({
      utterance: 'Should I buy Bitcoin?',
      world,
      session: emptySession(),
      model,
    });
    expect(model).not.toHaveBeenCalled();
    expect(session.refuse).toBe(true);
    expect(session.stack).toHaveLength(0);
  });

  it('maps lunch 12 to start_entry and never receives a saved flag', async () => {
    const model = jest.fn(async () => ({ type: 'start_entry', kind: 'quick_add', text: 'lunch 12', amount: 12 }));
    const { session } = await runAskPipTurn({
      utterance: 'lunch 12',
      world,
      session: emptySession(),
      model,
    });
    const top = session.stack[0];
    expect(top.entryKind).toBe('quick_add');
    expect(top).not.toHaveProperty('amount');
  });

  it('clarifies two Singapore trips instead of picking', async () => {
    const model = jest.fn(async () => ({ type: 'show_view', view: 'tripDetail', filters: { tripQuery: 'Singapore' } }));
    const { session } = await runAskPipTurn({
      utterance: 'Singapore trip',
      world: {
        trips: [
          { id: 't1', name: 'Singapore', archived: false },
          { id: 't2', name: 'Singapore Work', archived: false },
        ],
        people: [],
        categories: [],
      },
      session: emptySession(),
      model,
    });
    expect(session.pendingClarify?.choices).toHaveLength(2);
    expect(session.pendingClarify?.choices[0].action).toEqual({
      type: 'show_view',
      view: 'tripDetail',
      filters: { tripId: 't1' },
    });
    expect(session.stack).toHaveLength(0);
  });

  it('maps start_entry.settle without shareId to the owed view', async () => {
    const model = jest.fn(async () => ({ type: 'start_entry', kind: 'settle' }));
    const { session } = await runAskPipTurn({
      utterance: 'who owes me',
      world,
      session: emptySession(),
      model,
    });
    const top = session.stack[0];
    expect(top.view).toBe('owed');
    expect(top.entryKind).toBeUndefined();
    expect(top.settleShareId).toBeUndefined();
  });

  it('keeps start_entry.settle when shareId is present', async () => {
    const model = jest.fn(async () => ({ type: 'start_entry', kind: 'settle', shareId: 's1' }));
    const { session } = await runAskPipTurn({
      utterance: 'settle this bill',
      world,
      session: emptySession(),
      model,
    });
    const top = session.stack[0];
    expect(top.entryKind).toBe('settle');
    expect(top.settleShareId).toBe('s1');
  });

  it('replies to hi locally without calling the model', async () => {
    const model = jest.fn();
    const { session } = await runAskPipTurn({
      utterance: 'hi',
      world,
      session: emptySession(),
      model,
    });
    expect(model).not.toHaveBeenCalled();
    expect(session.sayKind).toBe('greeting');
    expect(session.refuse).toBe(false);
    expect(session.stack).toHaveLength(0);
  });

  it('opens a filtered transaction review for delete requests without calling the model', async () => {
    const model = jest.fn();
    const { session } = await runAskPipTurn({
      utterance: 'delete openai transaction',
      world,
      session: emptySession(),
      model,
    });
    expect(model).not.toHaveBeenCalled();
    expect(session.stack[0]).toEqual(expect.objectContaining({
      view: 'transactions',
      filters: { query: 'openai' },
    }));
  });

  it('applies dark appearance locally and opens settings', async () => {
    const model = jest.fn();
    const { session } = await runAskPipTurn({
      utterance: 'I want to change the appearance to black',
      world,
      session: emptySession(),
      model,
    });
    expect(model).not.toHaveBeenCalled();
    expect(session.pendingPref).toEqual({ pref: 'colorScheme', value: 'dark' });
    expect(session.sayKind).toBe('themeDark');
    expect(session.stack[0]?.view).toBe('settings');
  });

  it('calculates analysis locally from ledger data and exposes matching filters', async () => {
    const transaction: Transaction = {
      id: 'expense-1',
      type: 'expense',
      amount: 42,
      currency: 'MYR',
      merchantRaw: 'Lunch',
      merchantKey: 'lunch',
      categoryId: 'food',
      date: '2026-09-20',
      createdAt: '2026-09-20T12:00:00.000Z',
      source: 'manual',
    };
    const model = jest.fn(async () => ({
      type: 'analyze',
      measure: 'expense',
      statistic: 'daily_mean',
      dateFrom: '2026-09-19',
      dateTo: '2026-09-20',
    }));
    const { session } = await runAskPipTurn({
      utterance: 'average daily spending for the last two days',
      world: { ...world, transactions: [transaction] },
      session: emptySession(),
      model,
      today: '2026-09-21',
    });
    expect(session.stack[0]?.analysis).toEqual(expect.objectContaining({
      value: 21,
      dayCount: 2,
      basis: 'daily_totals_including_zero_days',
    }));
    expect(session.stack[0]).toEqual(expect.objectContaining({
      view: 'transactions',
      filters: {
        dateFrom: '2026-09-19',
        dateTo: '2026-09-20',
        transactionType: 'expense',
      },
    }));
  });

  it('routes clear-all requests to Settings locally and never calls the model', async () => {
    const model = jest.fn();
    const { session } = await runAskPipTurn({
      utterance: 'clear all my data',
      world,
      session: emptySession(),
      model,
    });
    expect(model).not.toHaveBeenCalled();
    expect(session.stack[0]).toEqual(expect.objectContaining({
      view: 'settings',
      caption: 'For safety, clear all data is only available in Settings.',
    }));
  });

  it('resolves a named analysis category so the matching transaction view stays filtered', async () => {
    const model = jest.fn(async () => ({
      type: 'analyze',
      measure: 'income',
      statistic: 'total',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-21',
      categoryQuery: 'salary',
    }));
    const { session } = await runAskPipTurn({
      utterance: 'salary this month',
      world: { ...world, categories: [{ id: 'salary-id', label: 'Salary' }] },
      session: emptySession(),
      model,
      today: '2026-09-21',
    });
    expect(session.stack[0]?.analysis?.request.categoryId).toBe('salary-id');
    expect(session.stack[0]?.filters.categoryId).toBe('salary-id');
  });
});
