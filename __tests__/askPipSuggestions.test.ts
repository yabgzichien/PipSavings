import { restingSuggestions } from '../src/lib/askPip/suggestions';

describe('Ask Pip resting suggestions', () => {
  it('returns contextual chips plus the current month chip', () => {
    expect(
      restingSuggestions({
        hasOwed: true,
        tripName: 'Singapore',
        hasHoldings: true,
        currentMonth: '2026-09',
      })
    ).toEqual([
      {
        id: 'owed',
        action: { type: 'show_view', view: 'owed', filters: {} },
      },
      {
        id: 'trip',
        action: {
          type: 'show_view',
          view: 'tripDetail',
          filters: { tripQuery: 'Singapore' },
        },
      },
      {
        id: 'holdings',
        action: { type: 'show_view', view: 'networth', filters: {} },
      },
      {
        id: 'month',
        action: {
          type: 'show_view',
          view: 'breakdown',
          filters: { month: '2026-09' },
        },
      },
    ]);
  });

  it('returns only the current month chip without contextual data', () => {
    expect(
      restingSuggestions({
        hasOwed: false,
        tripName: null,
        hasHoldings: false,
        currentMonth: '2026-09',
      })
    ).toEqual([
      {
        id: 'month',
        action: {
          type: 'show_view',
          view: 'breakdown',
          filters: { month: '2026-09' },
        },
      },
    ]);
  });
});
