// src/billing/entitlement.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Purchases, { type CustomerInfo } from 'react-native-purchases';
import { computeCanScan, FREE_DAILY_SCANS, FREE_MONTHLY_SCANS, type ScanAllowance } from './scanQuota';
import { fetchAllowance, fetchServerEntitlement } from './scanProxy';
import { defaultAskPipKeyStore } from '../lib/askPip/keyStore';
import { readCachedTier, writeCachedTier, type Tier } from './entitlementCache';
import { configurePurchases, fetchTier, tierFromCustomerInfo } from './purchases';
import {
  GRANT_CACHE_KEY,
  isGrantActive,
  mergeTiers,
  parseCachedGrant,
  type PromoGrant,
} from './promoGrants';
import { getMeta, setMeta } from '../db/metaRepo';

/** Live result wins when we get one. Only a thrown lookup falls back to the cache, so a
 *  cancelled or lapsed subscription downgrades immediately rather than lingering for a week. */
export async function resolveTier(
  fetch: () => Promise<Tier>,
  cached: () => Promise<Tier>,
  onLive: (tier: Tier) => Promise<void> = async () => {}
): Promise<Tier> {
  try {
    const tier = await fetch();
    await onLive(tier);
    return tier;
  } catch {
    return await cached();
  }
}

async function readCachedGrant(): Promise<PromoGrant | null> {
  return parseCachedGrant(await getMeta(GRANT_CACHE_KEY));
}

async function writeCachedGrant(grant: PromoGrant | null): Promise<void> {
  if (!grant) {
    await setMeta(GRANT_CACHE_KEY, '');
    return;
  }
  await setMeta(GRANT_CACHE_KEY, JSON.stringify(grant));
}

export async function resolveGrant(
  fetch: () => Promise<PromoGrant | null>,
  cached: () => Promise<PromoGrant | null>,
  onLive: (grant: PromoGrant | null) => Promise<void> = async () => {}
): Promise<PromoGrant | null> {
  try {
    const grant = await fetch();
    await onLive(grant);
    return grant;
  } catch {
    return await cached();
  }
}

export interface EntitlementState {
  tier: Tier;
  isPro: boolean;
  scansUsed: number;
  scansLimit: number;
  scansRemaining: number;
  dailyScansUsed: number;
  dailyScansLimit: number;
  dailyScansRemaining: number;
  canScan: boolean;
  hasByok: boolean;
  quotaBlockedBy: 'daily' | 'monthly' | null;
  refreshAllowance: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshByok: () => Promise<void>;
}

const FALLBACK: EntitlementState = {
  tier: 'free',
  isPro: false,
  scansUsed: 0,
  scansLimit: FREE_MONTHLY_SCANS,
  scansRemaining: FREE_MONTHLY_SCANS,
  dailyScansUsed: 0,
  dailyScansLimit: FREE_DAILY_SCANS,
  dailyScansRemaining: FREE_DAILY_SCANS,
  canScan: true,
  hasByok: false,
  quotaBlockedBy: null,
  refreshAllowance: async () => {},
  refresh: async () => {},
  refreshByok: async () => {},
};

const Ctx = createContext<EntitlementState>(FALLBACK);

function readDevForcePro(): boolean {
  if (!__DEV__) return false;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('pip_dev_force_pro') === '1';
  } catch {
    return false;
  }
}

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [rcTier, setRcTier] = useState<Tier>('free');
  const [grant, setGrant] = useState<PromoGrant | null>(null);
  const [allowance, setAllowance] = useState<ScanAllowance | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [devForcePro] = useState(readDevForcePro);
  const [hasByok, setHasByok] = useState(false);

  const refreshByok = useCallback(async () => {
    const active = await defaultAskPipKeyStore().getActive();
    setHasByok(Boolean(active?.apiKey));
  }, []);

  const tier = devForcePro ? 'pro' : mergeTiers(rcTier, isGrantActive(grant));

  const refreshGrant = useCallback(async (): Promise<PromoGrant | null> => {
    const next = await resolveGrant(
      async () => {
        const remote = await fetchServerEntitlement();
        if (!remote.active || !remote.kind || !remote.source) return null;
        return {
          kind: remote.kind,
          expiresAt: remote.expiresAt ?? null,
          source: remote.source,
        };
      },
      readCachedGrant,
      writeCachedGrant
    );
    const active = isGrantActive(next) ? next : null;
    setGrant(active);
    return active;
  }, []);

  const refresh = useCallback(async () => {
    const nextRc = await resolveTier(fetchTier, readCachedTier, writeCachedTier);
    setRcTier(nextRc);
    const nextGrant = await refreshGrant();
    const nextTier = mergeTiers(nextRc, isGrantActive(nextGrant));
    setAllowance(await fetchAllowance(nextTier));
    await refreshByok();
  }, [refreshGrant, refreshByok]);

  const refreshAllowance = useCallback(async () => {
    setAllowance(await fetchAllowance(tier));
  }, [tier]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [cachedTier, cachedGrant] = await Promise.all([readCachedTier(), readCachedGrant()]);
      if (cancelled) return;
      setRcTier(cachedTier);
      setGrant(isGrantActive(cachedGrant) ? cachedGrant : null);
      setHydrated(true);
      await configurePurchases();
      if (cancelled) return;
      await refresh();
    })();

    const customerInfoListener = (info: CustomerInfo | null) => {
      if (info) {
        const next = tierFromCustomerInfo(info);
        setRcTier(next);
        void writeCachedTier(next);
      }
    };

    Purchases.addCustomerInfoUpdateListener?.(customerInfoListener);

    const handleAppStateChange = (nextStatus: AppStateStatus) => {
      if (nextStatus === 'active') void refresh();
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener?.(customerInfoListener);
      sub.remove();
    };
  }, [refresh]);

  const value = useMemo<EntitlementState>(() => {
    const isPro = tier === 'pro';
    const limit = isPro ? Number.POSITIVE_INFINITY : FREE_MONTHLY_SCANS;
    const dailyLimit = isPro ? Number.POSITIVE_INFINITY : FREE_DAILY_SCANS;
    const monthUsed = isPro ? 0 : allowance?.monthUsed ?? 0;
    const dayUsed = isPro ? 0 : allowance?.dayUsed ?? 0;
    const remaining = isPro ? Number.POSITIVE_INFINITY : Math.max(0, limit - monthUsed);
    const dailyRemaining = isPro ? Number.POSITIVE_INFINITY : Math.max(0, dailyLimit - dayUsed);
    return {
      tier,
      isPro,
      scansUsed: monthUsed,
      scansLimit: limit,
      scansRemaining: remaining,
      dailyScansUsed: dayUsed,
      dailyScansLimit: dailyLimit,
      dailyScansRemaining: dailyRemaining,
      canScan: computeCanScan({
        isPro,
        hasByok,
        monthRemaining: remaining,
        dailyRemaining,
      }),
      hasByok,
      quotaBlockedBy: isPro || hasByok ? null : allowance?.blockedBy ?? null,
      refreshAllowance,
      refresh,
      refreshByok,
    };
  }, [tier, allowance, hasByok, refreshAllowance, refresh, refreshByok]);

  if (!hydrated) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlement(): EntitlementState {
  return useContext(Ctx);
}
