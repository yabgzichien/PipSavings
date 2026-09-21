import { activityInitialState } from '../src/lib/askPip/activityFilters';

describe('activityInitialState', () => {
  it('turns chat filters into Activity initial controls', () => {
    expect(activityInitialState({
      query: 'OpenAI',
      transactionType: 'expense',
      month: '2026-08',
      dateFrom: '2026-08-28',
      dateTo: '2026-08-28',
    })).toEqual({
      query: 'OpenAI',
      transactionType: 'expense',
      months: ['2026-08'],
      dateFrom: '2026-08-28',
      dateTo: '2026-08-28',
    });
  });

  it('uses safe empty defaults when filters are absent', () => {
    expect(activityInitialState({})).toEqual({
      query: '',
      transactionType: 'all',
      months: [],
      dateFrom: '',
      dateTo: '',
    });
  });
});
