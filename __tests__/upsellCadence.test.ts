// __tests__/upsellCadence.test.ts
import { WEEKLY_MS, firstActivityAt, pickLine, shouldShowUpsell } from '../src/billing/upsellCadence';

const NOW = Date.parse('2026-09-15T10:00:00Z');
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

describe('shouldShowUpsell', () => {
  it('stays quiet on a first run with no recorded state or activity', () => {
    expect(shouldShowUpsell(null, NOW)).toBe(false);
  });

  it('stays quiet until the user has been around for two weeks', () => {
    expect(shouldShowUpsell({ firstSeenAt: NOW - TWO_WEEKS_MS + 1, lastIndex: 0 }, NOW)).toBe(false);
  });

  it('shows once two weeks have passed and nothing has been shown yet', () => {
    expect(shouldShowUpsell({ firstSeenAt: NOW - TWO_WEEKS_MS, lastIndex: 0 }, NOW)).toBe(true);
  });

  it('shows a long-time user even with no stored cadence state', () => {
    expect(shouldShowUpsell(null, NOW, NOW - TWO_WEEKS_MS)).toBe(true);
  });

  it('stays quiet when saved activity is still recent', () => {
    expect(shouldShowUpsell(null, NOW, NOW - 1000)).toBe(false);
  });

  it('uses the earlier of first seen and first saved activity', () => {
    expect(shouldShowUpsell(
      { firstSeenAt: NOW - 1000, lastIndex: 0 },
      NOW,
      NOW - TWO_WEEKS_MS,
    )).toBe(true);
  });

  it('stays quiet inside the weekly window', () => {
    expect(shouldShowUpsell({ lastShownAt: NOW - 1000, lastIndex: 0 }, NOW)).toBe(false);
  });

  it('shows again once a week has passed', () => {
    expect(shouldShowUpsell({ lastShownAt: NOW - WEEKLY_MS - 1, lastIndex: 0 }, NOW)).toBe(true);
  });
});

describe('firstActivityAt', () => {
  it('returns null when there are no transactions', () => {
    expect(firstActivityAt([])).toBeNull();
  });

  it('returns the earliest createdAt timestamp', () => {
    expect(firstActivityAt([
      { createdAt: '2026-09-10T12:00:00.000Z' },
      { createdAt: '2026-08-01T08:00:00.000Z' },
      { createdAt: '2026-09-12T00:00:00.000Z' },
    ])).toBe(Date.parse('2026-08-01T08:00:00.000Z'));
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
