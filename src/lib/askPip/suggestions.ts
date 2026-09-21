import type { AskPipAction } from './catalog';

export interface RestingSuggestion {
  id: string;
  action: AskPipAction;
}

export function restingSuggestions(input: {
  hasOwed: boolean;
  tripName: string | null;
  tripId: string | null;
  hasHoldings: boolean;
  currentMonth: string;
}): RestingSuggestion[] {
  const suggestions: RestingSuggestion[] = [];

  if (input.hasOwed) {
    suggestions.push({
      id: 'owed',
      action: { type: 'show_view', view: 'owed', filters: {} },
    });
  }

  if (input.tripName && input.tripId) {
    suggestions.push({
      id: 'trip',
      action: {
        type: 'show_view',
        view: 'tripDetail',
        filters: { tripId: input.tripId },
      },
    });
  }

  if (input.hasHoldings) {
    suggestions.push({
      id: 'holdings',
      action: { type: 'show_view', view: 'networth', filters: {} },
    });
  }

  suggestions.push({
    id: 'month',
    action: {
      type: 'show_view',
      view: 'breakdown',
      filters: { month: input.currentMonth },
    },
  });

  return suggestions;
}
