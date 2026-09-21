import type { AskPipFilters } from './catalog';

export type ActivityTransactionType = 'all' | 'expense' | 'income';

export interface ActivityInitialState {
  query: string;
  transactionType: ActivityTransactionType;
  months: string[];
  dateFrom: string;
  dateTo: string;
}

export function activityInitialState(filters: AskPipFilters): ActivityInitialState {
  return {
    query: filters.query ?? '',
    transactionType: filters.transactionType ?? 'all',
    months: filters.month ? [filters.month] : [],
    dateFrom: filters.dateFrom ?? '',
    dateTo: filters.dateTo ?? '',
  };
}
