// src/billing/entitlementCache.ts
// The offline fallback for entitlement state. RevenueCat's SDK caches internally, but Pip is a
// no-account, fully on-device app that people open on planes and on bad connections, so the
// failure mode "paying user is locked out because a network call failed" has to be designed out
// explicitly rather than hoped away.
//
// Direction matters: a cached PRO is honoured for a week, a cached FREE is never upgraded. The
// grace window can only ever be generous to the user, never to us.
import { getMeta, setMeta } from '../db/metaRepo';

export const ENTITLEMENT_CACHE_KEY = 'entitlement_cache';
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type Tier = 'free' | 'pro';

export interface CachedEntitlement {
  tier: Tier;
  /** Epoch milliseconds of the last successful RevenueCat lookup. */
  checkedAt: number;
}

export function parseCachedEntitlement(raw: string | null): CachedEntitlement | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedEntitlement>;
    if (parsed?.tier !== 'free' && parsed?.tier !== 'pro') return null;
    if (typeof parsed.checkedAt !== 'number' || !Number.isFinite(parsed.checkedAt)) return null;
    return { tier: parsed.tier, checkedAt: parsed.checkedAt };
  } catch {
    return null;
  }
}

export function tierFromCache(cached: CachedEntitlement | null, now: number): Tier {
  if (!cached || cached.tier !== 'pro') return 'free';
  return now - cached.checkedAt > GRACE_MS ? 'free' : 'pro';
}

export async function readCachedTier(now: number = Date.now()): Promise<Tier> {
  return tierFromCache(parseCachedEntitlement(await getMeta(ENTITLEMENT_CACHE_KEY)), now);
}

export async function writeCachedTier(tier: Tier, now: number = Date.now()): Promise<void> {
  await setMeta(ENTITLEMENT_CACHE_KEY, JSON.stringify({ tier, checkedAt: now }));
}
