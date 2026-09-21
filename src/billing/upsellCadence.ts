// src/billing/upsellCadence.ts
// Frequency governor for the one ambient upsell surface. Pip already comments on spending, so
// an occasional in-character line about Pro reads as content rather than an advert. That only
// holds while it stays rare and never repeats itself, which is what this file enforces.
export const UPSELL_STATE_KEY = 'upsell_state';
export const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;
export const TENURE_MS = 14 * 24 * 60 * 60 * 1000;

export interface UpsellState {
  lastShownAt?: number;
  lastIndex: number;
  firstSeenAt?: number;
}

export function firstActivityAt(transactions: { createdAt: string }[]): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const txn of transactions) {
    const ms = Date.parse(txn.createdAt);
    if (Number.isFinite(ms) && ms < earliest) earliest = ms;
  }
  return Number.isFinite(earliest) ? earliest : null;
}

export function shouldShowUpsell(
  state: UpsellState | null,
  now: number,
  firstActivityAtMs?: number | null,
): boolean {
  if (state?.lastShownAt != null) {
    return now - state.lastShownAt >= WEEKLY_MS;
  }
  const origin = earliestOrigin(state?.firstSeenAt, firstActivityAtMs);
  if (origin == null) return false;
  return now - origin >= TENURE_MS;
}

function earliestOrigin(firstSeenAt?: number, activityAt?: number | null): number | null {
  const candidates = [firstSeenAt, activityAt].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

export function pickLine(lines: string[], lastIndex: number): number {
  if (lines.length <= 1) return 0;
  const offset = 1 + Math.floor(Math.random() * (lines.length - 1));
  return (lastIndex + offset) % lines.length;
}
