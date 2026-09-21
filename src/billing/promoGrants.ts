// src/billing/promoGrants.ts
// Server-backed promo / referral grants. Merged with RevenueCat for the app-wide Pro tier.
import type { Tier } from './entitlementCache';

export const GRANT_CACHE_KEY = 'promo_grant_cache';

export type GrantKind = 'lifetime' | 'timed';
export type GrantSource = 'promo' | 'referral';

export interface PromoGrant {
  kind: GrantKind;
  expiresAt: number | null;
  source: GrantSource;
}

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function mergeTiers(revenueCatTier: Tier, grantActive: boolean): Tier {
  return revenueCatTier === 'pro' || grantActive ? 'pro' : 'free';
}

export function isGrantActive(
  grant: Pick<PromoGrant, 'kind' | 'expiresAt'> | null | undefined,
  now: number = Date.now()
): boolean {
  if (!grant) return false;
  if (grant.kind === 'lifetime') return true;
  return typeof grant.expiresAt === 'number' && grant.expiresAt > now;
}

export function parseCachedGrant(raw: string | null | undefined): PromoGrant | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PromoGrant>;
    if (parsed.kind !== 'lifetime' && parsed.kind !== 'timed') return null;
    if (parsed.source !== 'promo' && parsed.source !== 'referral') return null;
    if (parsed.expiresAt != null && typeof parsed.expiresAt !== 'number') return null;
    return {
      kind: parsed.kind,
      expiresAt: parsed.expiresAt ?? null,
      source: parsed.source,
    };
  } catch {
    return null;
  }
}
