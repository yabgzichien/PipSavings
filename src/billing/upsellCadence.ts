// src/billing/upsellCadence.ts
// Frequency governor for the one ambient upsell surface. Pip already comments on spending, so
// an occasional in-character line about Pro reads as content rather than an advert. That only
// holds while it stays rare and never repeats itself, which is what this file enforces.
export const UPSELL_STATE_KEY = 'upsell_state';
export const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

export interface UpsellState {
  lastShownAt: number;
  lastIndex: number;
}

export function shouldShowUpsell(state: UpsellState | null, now: number): boolean {
  if (!state) return true;
  return now - state.lastShownAt >= WEEKLY_MS;
}

export function pickLine(lines: string[], lastIndex: number): number {
  if (lines.length <= 1) return 0;
  const offset = 1 + Math.floor(Math.random() * (lines.length - 1));
  return (lastIndex + offset) % lines.length;
}
