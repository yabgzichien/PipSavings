import { resolveFilters } from '../src/lib/askPip/resolve';

const world = {
  trips: [
    { id: 't1', name: 'Singapore', archived: false },
    { id: 't2', name: 'Singapore Work', archived: false },
    { id: 't3', name: 'Penang', archived: false },
  ],
  people: [
    { id: 'p1', name: 'Ali' },
    { id: 'p2', name: 'Aliya' },
  ],
  categories: [
    { id: 'food', label: 'Food' },
    { id: 'petrol', label: 'Petrol' },
  ],
};

describe('resolveFilters', () => {
  it('resolves a unique trip name to an id', () => {
    const r = resolveFilters({ tripQuery: 'Penang' }, world);
    expect(r).toEqual({ status: 'ok', filters: { tripId: 't3' } });
  });

  it('does not guess between two Singapore trips', () => {
    const r = resolveFilters({ tripQuery: 'Singapore' }, world);
    expect(r.status).toBe('clarify');
    if (r.status === 'clarify') {
      expect(r.field).toBe('trip');
      expect(r.choices.map((c) => c.id).sort()).toEqual(['t1', 't2']);
    }
  });

  it('does not guess Ali vs Aliya', () => {
    const r = resolveFilters({ personQuery: 'Ali' }, world);
    expect(r.status).toBe('clarify');
  });

  it('keeps an already-valid tripId', () => {
    const r = resolveFilters({ tripId: 't1' }, world);
    expect(r).toEqual({ status: 'ok', filters: { tripId: 't1' } });
  });

  it('keeps YYYY-MM month and YYYY-MM-DD date range filters', () => {
    const r = resolveFilters(
      {
        month: '2026-09', dateFrom: '2026-09-01', dateTo: '2026-09-30',
        query: 'OpenAI', transactionType: 'expense',
      },
      world,
    );
    expect(r).toEqual({
      status: 'ok',
      filters: {
        month: '2026-09', dateFrom: '2026-09-01', dateTo: '2026-09-30',
        query: 'OpenAI', transactionType: 'expense',
      },
    });
  });

  it('clarifies a reversed date range instead of silently applying it', () => {
    const r = resolveFilters({ dateFrom: '2026-09-30', dateTo: '2026-09-01' }, world);
    expect(r).toEqual({ status: 'invalid', field: 'dateRange' });
  });

  it('drops month and date filters that are not ISO shapes', () => {
    const r = resolveFilters(
      { month: 'September', dateFrom: 'last month', dateTo: '2026/09/30', tripId: 't1' },
      world,
    );
    expect(r).toEqual({ status: 'ok', filters: { tripId: 't1' } });
  });
});
