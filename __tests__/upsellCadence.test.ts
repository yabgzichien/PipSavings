// __tests__/upsellCadence.test.ts
import { WEEKLY_MS, pickLine, shouldShowUpsell } from '../src/billing/upsellCadence';

const NOW = Date.parse('2026-09-15T10:00:00Z');

describe('shouldShowUpsell', () => {
  it('shows on a first run with no recorded state', () => {
    expect(shouldShowUpsell(null, NOW)).toBe(true);
  });

  it('stays quiet inside the weekly window', () => {
    expect(shouldShowUpsell({ lastShownAt: NOW - 1000, lastIndex: 0 }, NOW)).toBe(false);
  });

  it('shows again once a week has passed', () => {
    expect(shouldShowUpsell({ lastShownAt: NOW - WEEKLY_MS - 1, lastIndex: 0 }, NOW)).toBe(true);
  });
});

describe('pickLine', () => {
  const lines = ['a', 'b', 'c'];

  // Seeing the same joke twice running is how a mascot stops being charming.
  it('never returns the line that was shown last', () => {
    for (let last = 0; last < lines.length; last++) {
      expect(pickLine(lines, last)).not.toBe(last);
    }
  });

  it('returns a valid index', () => {
    const i = pickLine(lines, 0);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(lines.length);
  });

  it('handles a single-line catalog without looping forever', () => {
    expect(pickLine(['only'], 0)).toBe(0);
  });
});
