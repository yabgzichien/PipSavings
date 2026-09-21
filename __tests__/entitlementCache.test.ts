// __tests__/entitlementCache.test.ts
jest.mock('../src/db/metaRepo', () => ({
  getMeta: jest.fn(),
  setMeta: jest.fn().mockResolvedValue(undefined),
}));

import { getMeta, setMeta } from '../src/db/metaRepo';
import {
  ENTITLEMENT_CACHE_KEY,
  GRACE_MS,
  parseCachedEntitlement,
  readCachedTier,
  tierFromCache,
  writeCachedTier,
} from '../src/billing/entitlementCache';

const NOW = Date.parse('2026-09-15T10:00:00Z');

describe('parseCachedEntitlement', () => {
  it('returns null when nothing is stored', () => {
    expect(parseCachedEntitlement(null)).toBeNull();
  });

  it('reads a well-formed record', () => {
    expect(parseCachedEntitlement(`{"tier":"pro","checkedAt":${NOW}}`)).toEqual({
      tier: 'pro',
      checkedAt: NOW,
    });
  });

  it('returns null on corrupt JSON', () => {
    expect(parseCachedEntitlement('{{{')).toBeNull();
  });

  it('returns null on an unrecognised tier', () => {
    expect(parseCachedEntitlement(`{"tier":"platinum","checkedAt":${NOW}}`)).toBeNull();
  });
});

describe('tierFromCache', () => {
  it('resolves to free with no cache, which is the cold offline first launch', () => {
    expect(tierFromCache(null, NOW)).toBe('free');
  });

  // A paying user on a plane, or on a flaky connection, must not lose what they paid for.
  it('honours a cached pro inside the grace window', () => {
    const cached = { tier: 'pro' as const, checkedAt: NOW - GRACE_MS + 1000 };
    expect(tierFromCache(cached, NOW)).toBe('pro');
  });

  it('downgrades a cached pro once the grace window has passed', () => {
    const cached = { tier: 'pro' as const, checkedAt: NOW - GRACE_MS - 1000 };
    expect(tierFromCache(cached, NOW)).toBe('free');
  });

  it('never upgrades a cached free', () => {
    expect(tierFromCache({ tier: 'free', checkedAt: NOW }, NOW)).toBe('free');
  });
});

describe('readCachedTier / writeCachedTier', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads through the agreed meta key', async () => {
    (getMeta as jest.Mock).mockResolvedValue(`{"tier":"pro","checkedAt":${NOW}}`);
    expect(await readCachedTier(NOW)).toBe('pro');
    expect(getMeta).toHaveBeenCalledWith(ENTITLEMENT_CACHE_KEY);
  });

  it('stamps the write with the check time', async () => {
    await writeCachedTier('pro', NOW);
    expect(setMeta).toHaveBeenCalledWith(
      ENTITLEMENT_CACHE_KEY,
      JSON.stringify({ tier: 'pro', checkedAt: NOW })
    );
  });
});
