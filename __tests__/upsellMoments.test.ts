// __tests__/upsellMoments.test.ts
import {
  RELIEF_THRESHOLD_MYR,
  hasFired,
  markFired,
  reliefThresholdCrossed,
  type UpsellMoment,
} from '../src/billing/moments';

describe('hasFired / markFired', () => {
  it('reports an unseen moment as not yet fired', () => {
    expect(hasFired([], 'first_scan')).toBe(false);
  });

  it('reports a recorded moment as fired', () => {
    expect(hasFired(['first_scan'], 'first_scan')).toBe(true);
  });

  // Once, ever. A prompt that returns on every 7-day streak turns a celebration into nagging.
  it('is idempotent, so marking twice does not duplicate', () => {
    const once = markFired([], 'streak_7');
    expect(markFired(once, 'streak_7')).toEqual(['streak_7']);
  });

  it('preserves moments already recorded', () => {
    expect(markFired(['first_scan'], 'streak_7' as UpsellMoment)).toEqual([
      'first_scan',
      'streak_7',
    ]);
  });
});

describe('reliefThresholdCrossed', () => {
  it('is false below the threshold', () => {
    expect(reliefThresholdCrossed(RELIEF_THRESHOLD_MYR - 0.01)).toBe(false);
  });

  it('is true at the threshold', () => {
    expect(reliefThresholdCrossed(RELIEF_THRESHOLD_MYR)).toBe(true);
  });
});
