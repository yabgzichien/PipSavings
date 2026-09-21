import { needsYouBannerKind, pickNeedsYou } from '../src/lib/askPip/needsYou';
import { AGING_DAYS } from '../src/lib/split';

const today = '2026-09-20';
const currentMonth = '2026-09';

describe('pickNeedsYou', () => {
  it('prefers an overdue bill over an aged debt', () => {
    const slot = pickNeedsYou({
      today,
      currentMonth,
      shares: [{ outstanding: 80, billDate: '2026-08-01', personName: 'Ali' }],
      occurrences: [{ status: 'scheduled', dueDate: '2026-09-01', month: '2026-09', amount: 50 }],
    });
    expect(slot?.kind).toBe('commitments_overdue');
  });

  it('names an aged debt when there is no overdue bill', () => {
    const slot = pickNeedsYou({
      today,
      currentMonth,
      shares: [{ outstanding: 80, billDate: '2026-08-01', personName: 'Ali' }],
      occurrences: [],
    });
    expect(slot?.kind).toBe('owed_overdue');
    expect(slot?.oldestName).toBe('Ali');
    expect(slot!.oldestDays!).toBeGreaterThanOrEqual(AGING_DAYS);
  });

  it('prefers a due-this-month bill over an open (not aged) debt', () => {
    const slot = pickNeedsYou({
      today,
      currentMonth,
      shares: [{ outstanding: 80, billDate: '2026-09-15', personName: 'Ali' }],
      occurrences: [{ status: 'scheduled', dueDate: '2026-09-25', month: '2026-09', amount: 50 }],
    });
    expect(slot?.kind).toBe('commitments_due');
  });

  it('returns open owed when nothing is due or aged', () => {
    const slot = pickNeedsYou({
      today,
      currentMonth,
      shares: [{ outstanding: 80, billDate: '2026-09-15', personName: 'Ali' }],
      occurrences: [],
    });
    expect(slot?.kind).toBe('owed_open');
    expect(slot?.total).toBe(80);
    expect(slot?.count).toBe(1);
  });

  it('returns null when there is nothing to surface', () => {
    expect(pickNeedsYou({ today, currentMonth, shares: [], occurrences: [] })).toBeNull();
  });
});

describe('needsYouBannerKind', () => {
  it('maps overdue or due commitments to commitments, and either owed kind to owed', () => {
    expect(needsYouBannerKind({ kind: 'commitments_overdue', total: 50, count: 1 })).toBe('commitments');
    expect(needsYouBannerKind({ kind: 'commitments_due', total: 50, count: 1 })).toBe('commitments');
    expect(needsYouBannerKind({ kind: 'owed_overdue', total: 80, count: 1 })).toBe('owed');
    expect(needsYouBannerKind({ kind: 'owed_open', total: 80, count: 1 })).toBe('owed');
    expect(needsYouBannerKind(null)).toBeNull();
  });
});
