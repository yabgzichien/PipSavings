import { AGING_DAYS, daysBetween } from '../split';

export type NeedsYouKind = 'commitments_overdue' | 'owed_overdue' | 'commitments_due' | 'owed_open';

export interface NeedsYouSlot {
  kind: NeedsYouKind;
  total: number;
  count: number;
  oldestName?: string;
  oldestDays?: number;
}

export function pickNeedsYou(input: {
  shares: { outstanding: number; billDate: string | null; personName: string }[];
  occurrences: { status: string; dueDate: string; month: string; amount: number }[];
  today: string;
  currentMonth: string;
}): NeedsYouSlot | null {
  const unpaid = input.occurrences.filter(
    (o) => o.status === 'scheduled' && (o.dueDate < input.today || o.month === input.currentMonth),
  );
  const commitments = {
    count: unpaid.length,
    total: unpaid.reduce((sum, o) => sum + o.amount, 0),
    overdue: unpaid.some((o) => o.dueDate < input.today),
  };

  let oldestDays = 0;
  let oldestName = '';
  for (const share of input.shares) {
    const age = daysBetween(share.billDate, input.today) ?? 0;
    if (age > oldestDays) {
      oldestDays = age;
      oldestName = share.personName;
    }
  }
  const owed = {
    total: input.shares.reduce((sum, share) => sum + share.outstanding, 0),
    count: input.shares.length,
    oldestDays,
    oldestName,
    overdue: oldestDays >= AGING_DAYS,
  };

  if (commitments.overdue) {
    return { kind: 'commitments_overdue', total: commitments.total, count: commitments.count };
  }
  if (owed.overdue) {
    return {
      kind: 'owed_overdue',
      total: owed.total,
      count: owed.count,
      oldestName: owed.oldestName,
      oldestDays: owed.oldestDays,
    };
  }
  if (commitments.count > 0) {
    return { kind: 'commitments_due', total: commitments.total, count: commitments.count };
  }
  if (owed.total > 0) {
    return { kind: 'owed_open', total: owed.total, count: owed.count };
  }
  return null;
}

export function needsYouBannerKind(slot: NeedsYouSlot | null): 'commitments' | 'owed' | null {
  if (slot === null) return null;
  if (slot.kind === 'commitments_overdue' || slot.kind === 'commitments_due') return 'commitments';
  return 'owed';
}
