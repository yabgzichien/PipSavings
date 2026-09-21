import {
  GRANT_CACHE_KEY,
  isGrantActive,
  mergeTiers,
  normalizePromoCode,
  parseCachedGrant,
} from '../src/billing/promoGrants';

describe('promo grant helpers', () => {
  it('normalizes promo codes to trimmed uppercase', () => {
    expect(normalizePromoCode('  pip-a7k2 ')).toBe('PIP-A7K2');
  });

  it('merges RevenueCat and server grant into a single tier', () => {
    expect(mergeTiers('free', false)).toBe('free');
    expect(mergeTiers('pro', false)).toBe('pro');
    expect(mergeTiers('free', true)).toBe('pro');
    expect(mergeTiers('pro', true)).toBe('pro');
  });

  it('treats lifetime grants as always active', () => {
    expect(isGrantActive({ kind: 'lifetime', expiresAt: null }, 1_000)).toBe(true);
  });

  it('treats timed grants as active only before expiry', () => {
    expect(isGrantActive({ kind: 'timed', expiresAt: 2_000 }, 1_000)).toBe(true);
    expect(isGrantActive({ kind: 'timed', expiresAt: 2_000 }, 2_000)).toBe(false);
  });

  it('parses a cached grant payload', () => {
    expect(parseCachedGrant(JSON.stringify({ kind: 'lifetime', expiresAt: null, source: 'promo' }))).toEqual({
      kind: 'lifetime',
      expiresAt: null,
      source: 'promo',
    });
    expect(parseCachedGrant(null)).toBeNull();
    expect(parseCachedGrant('{')).toBeNull();
  });

  it('uses a stable cache key', () => {
    expect(GRANT_CACHE_KEY).toBe('promo_grant_cache');
  });
});
