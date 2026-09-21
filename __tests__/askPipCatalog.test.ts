import { isOutOfCatalog, matchLocalAskPipAction, parseAskPipAction, ASK_PIP_VIEWS } from '../src/lib/askPip/catalog';

describe('isOutOfCatalog', () => {
  it('refuses advice and diagnosis', () => {
    expect(isOutOfCatalog('Should I buy Bitcoin?')).toBe(true);
    expect(isOutOfCatalog('Why am I broke')).toBe(true);
    expect(isOutOfCatalog('What is a good budget percent')).toBe(true);
    expect(isOutOfCatalog('给我投资建议')).toBe(true);
  });

  it('allows view and entry asks', () => {
    expect(isOutOfCatalog('Who owes me')).toBe(false);
    expect(isOutOfCatalog('Singapore trip spending')).toBe(false);
    expect(isOutOfCatalog('lunch 12')).toBe(false);
  });
});

describe('parseAskPipAction', () => {
  it('parses a closed show_view', () => {
    expect(parseAskPipAction({
      type: 'show_view', view: 'transactions', filters: {
        query: 'OpenAI', transactionType: 'expense', dateFrom: '2026-08-28', dateTo: '2026-08-28',
      },
    })).toEqual({
      type: 'show_view', view: 'transactions', filters: {
        query: 'OpenAI', transactionType: 'expense', dateFrom: '2026-08-28', dateTo: '2026-08-28',
      },
    });
  });

  it('rejects unknown transaction filter types', () => {
    expect(() => parseAskPipAction({
      type: 'show_view', view: 'transactions', filters: { transactionType: 'transfer' },
    })).toThrow();
  });

  it('rejects unknown views and paywall', () => {
    expect(() => parseAskPipAction({ type: 'show_view', view: 'admin', filters: {} })).toThrow();
    expect(() => parseAskPipAction({ type: 'show_view', view: 'paywall', filters: {} })).toThrow();
  });

  it('drops amount-like captions', () => {
    const a = parseAskPipAction({
      type: 'show_view', view: 'owed', filters: {}, caption: 'You are owed RM 120',
    });
    expect(a.type).toBe('show_view');
    if (a.type === 'show_view') expect(a.caption).toBeUndefined();
  });

  it('parses start_entry.quick_add without inventing a save', () => {
    expect(parseAskPipAction({
      type: 'start_entry', kind: 'quick_add', text: 'lunch 12',
    })).toEqual({ type: 'start_entry', kind: 'quick_add', text: 'lunch 12' });
  });

  it('parses a split-bill draft as a review flow', () => {
    expect(parseAskPipAction({
      type: 'start_entry', kind: 'split_bill', text: 'dinner 80',
    })).toEqual({ type: 'start_entry', kind: 'split_bill', text: 'dinner 80' });
  });

  it('parses a validated confirmation-first trip draft', () => {
    expect(parseAskPipAction({
      type: 'start_trip', name: 'Singapore', startDate: '2026-09-29', endDate: '2026-09-30',
    })).toEqual({
      type: 'start_trip', name: 'Singapore', startDate: '2026-09-29', endDate: '2026-09-30',
    });
    expect(() => parseAskPipAction({
      type: 'start_trip', name: 'Singapore', startDate: '2026-09-30', endDate: '2026-09-29',
    })).toThrow();
  });

  it('parses a greeting say and a dark appearance pref', () => {
    expect(parseAskPipAction({ type: 'say', kind: 'greeting' })).toEqual({
      type: 'say',
      kind: 'greeting',
    });
    expect(parseAskPipAction({
      type: 'set_pref', pref: 'colorScheme', value: 'dark',
    })).toEqual({ type: 'set_pref', pref: 'colorScheme', value: 'dark' });
  });
});

describe('matchLocalAskPipAction', () => {
  it('treats a bare hi as a greeting without sending it to the model', () => {
    expect(matchLocalAskPipAction('hi')).toEqual({ type: 'say', kind: 'greeting' });
    expect(matchLocalAskPipAction('Hello!')).toEqual({ type: 'say', kind: 'greeting' });
    expect(matchLocalAskPipAction('你好')).toEqual({ type: 'say', kind: 'greeting' });
  });

  it('does not swallow a greeting that also names a view', () => {
    expect(matchLocalAskPipAction('hi, who owes me')).toBeNull();
  });

  it('turns delete requests into a filtered review view without deleting', () => {
    expect(matchLocalAskPipAction('delete openai transaction')).toEqual({
      type: 'show_view',
      view: 'transactions',
      filters: { query: 'openai' },
      caption: 'Review the matching transaction, then tap Delete to confirm.',
    });
    expect(matchLocalAskPipAction('remove the transaction')).toEqual({
      type: 'show_view',
      view: 'transactions',
      filters: {},
      caption: 'Choose a transaction, then tap Delete to confirm.',
    });
  });

  it('maps appearance-to-black onto the dark color scheme', () => {
    expect(matchLocalAskPipAction('I want to change the appearance to black')).toEqual({
      type: 'set_pref',
      pref: 'colorScheme',
      value: 'dark',
    });
    expect(matchLocalAskPipAction('switch to dark mode')).toEqual({
      type: 'set_pref',
      pref: 'colorScheme',
      value: 'dark',
    });
  });

  it('routes clear-all requests to Settings without exposing a destructive action', () => {
    expect(matchLocalAskPipAction('clear all my data')).toEqual({
      type: 'show_view',
      view: 'settings',
      filters: {},
      caption: 'For safety, clear all data is only available in Settings.',
    });
    expect(matchLocalAskPipAction('factory reset the app')).toEqual({
      type: 'show_view',
      view: 'settings',
      filters: {},
      caption: 'For safety, clear all data is only available in Settings.',
    });
    for (const utterance of ['remove all transactions', 'wipe my entire history', 'purge the ledger']) {
      expect(matchLocalAskPipAction(utterance)).toEqual({
        type: 'show_view',
        view: 'settings',
        filters: {},
        caption: 'For safety, clear all data is only available in Settings.',
      });
    }
  });
});

describe('analytics actions', () => {
  it('parses a deterministic daily-statistics request', () => {
    expect(parseAskPipAction({
      type: 'analyze',
      measure: 'expense',
      statistic: 'daily_mean',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-07',
      categoryId: 'food',
    })).toEqual({
      type: 'analyze',
      request: {
        measure: 'expense',
        statistic: 'daily_mean',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-07',
        categoryId: 'food',
      },
    });
  });

  it('parses comparisons and rejects malformed analytics requests', () => {
    expect(parseAskPipAction({
      type: 'analyze',
      measure: 'income',
      statistic: 'total',
      comparison: 'difference',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-21',
      compareFrom: '2026-08-01',
      compareTo: '2026-08-21',
    })).toEqual(expect.objectContaining({ type: 'analyze' }));

    expect(() => parseAskPipAction({
      type: 'analyze',
      measure: 'expense',
      statistic: 'daily_mean',
      dateFrom: '2026-09-07',
      dateTo: '2026-09-01',
    })).toThrow();
    expect(() => parseAskPipAction({
      type: 'reset_all_data',
    })).toThrow();
  });
});

describe('ASK_PIP_VIEWS', () => {
  it('includes the grilling hosts and not home', () => {
    expect(ASK_PIP_VIEWS).toEqual(expect.arrayContaining([
      'owed', 'trips', 'tripDetail', 'networth', 'commitments', 'budget', 'calendar',
      'settings',
    ]));
    expect(ASK_PIP_VIEWS).not.toContain('home');
    expect(ASK_PIP_VIEWS).not.toContain('paywall');
  });
});
