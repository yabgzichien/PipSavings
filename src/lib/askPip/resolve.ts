import type { AskPipFilters } from './catalog';
import type { Transaction } from '../types';

export interface AskPipWorld {
  trips: { id: string; name: string; archived: boolean }[];
  people: { id: string; name: string }[];
  categories: { id: string; label: string }[];
  transactions?: Transaction[];
}

export type ResolveResult =
  | { status: 'ok'; filters: AskPipFilters }
  | { status: 'invalid'; field: 'dateRange' }
  | {
      status: 'clarify';
      field: 'trip' | 'person' | 'category';
      choices: { id: string; label: string }[];
    };

function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function resolveFilters(filters: AskPipFilters, world: AskPipWorld): ResolveResult {
  const resolved: AskPipFilters = { ...filters };

  const tripById = filters.tripId
    ? world.trips.find((t) => t.id === filters.tripId)
    : undefined;

  if (tripById) {
    resolved.tripId = filters.tripId;
    delete resolved.tripQuery;
  } else {
    delete resolved.tripId;
    if (filters.tripQuery) {
      const matches = world.trips.filter(
        (t) => !t.archived && includesIgnoreCase(t.name, filters.tripQuery!),
      );
      if (matches.length > 1) {
        return {
          status: 'clarify',
          field: 'trip',
          choices: matches.map((t) => ({ id: t.id, label: t.name })),
        };
      }
      if (matches.length === 1) {
        resolved.tripId = matches[0].id;
      }
      delete resolved.tripQuery;
    }
  }

  const personById = resolved.personId
    ? world.people.find((p) => p.id === resolved.personId)
    : undefined;

  if (personById) {
    delete resolved.personQuery;
  } else {
    delete resolved.personId;
    if (filters.personQuery) {
      const matches = world.people.filter((p) =>
        includesIgnoreCase(p.name, filters.personQuery!),
      );
      if (matches.length > 1) {
        return {
          status: 'clarify',
          field: 'person',
          choices: matches.map((p) => ({ id: p.id, label: p.name })),
        };
      }
      if (matches.length === 1) {
        resolved.personId = matches[0].id;
      }
      delete resolved.personQuery;
    }
  }

  if (resolved.categoryId) {
    const categoryById = world.categories.find((c) => c.id === resolved.categoryId);
    if (!categoryById) {
      delete resolved.categoryId;
    }
  }

  if (resolved.month !== undefined && !/^\d{4}-\d{2}$/.test(resolved.month)) {
    delete resolved.month;
  }
  if (resolved.dateFrom !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(resolved.dateFrom)) {
    delete resolved.dateFrom;
  }
  if (resolved.dateTo !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(resolved.dateTo)) {
    delete resolved.dateTo;
  }
  if (resolved.dateFrom && resolved.dateTo && resolved.dateFrom > resolved.dateTo) {
    return { status: 'invalid', field: 'dateRange' };
  }

  return { status: 'ok', filters: resolved };
}
