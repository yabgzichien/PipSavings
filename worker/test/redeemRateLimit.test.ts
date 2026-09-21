import { redeemRetryAllowed } from '../src/redeemRateLimit';

describe('redeemRetryAllowed', () => {
  const WINDOW_MS = 15 * 60 * 1000;

  it('allows the first few failed guesses', () => {
    expect(redeemRetryAllowed({ failCount: 0, windowStart: 1000, now: 1000, windowMs: WINDOW_MS, maxFails: 5 })).toBe(
      true
    );
    expect(redeemRetryAllowed({ failCount: 4, windowStart: 1000, now: 2000, windowMs: WINDOW_MS, maxFails: 5 })).toBe(
      true
    );
  });

  it('blocks after too many failures in the window', () => {
    expect(redeemRetryAllowed({ failCount: 5, windowStart: 1000, now: 2000, windowMs: WINDOW_MS, maxFails: 5 })).toBe(
      false
    );
  });

  it('opens a new window after the lockout expires', () => {
    expect(
      redeemRetryAllowed({
        failCount: 9,
        windowStart: 1000,
        now: 1000 + WINDOW_MS + 1,
        windowMs: WINDOW_MS,
        maxFails: 5,
      })
    ).toBe(true);
  });
});
