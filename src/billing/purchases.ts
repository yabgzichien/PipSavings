// src/billing/purchases.ts
// Thin wrapper over the RevenueCat SDK. Everything that can be decided without the native
// module lives in entitlementCache.ts and scanQuota.ts instead, so the bulk of the billing
// logic stays unit-testable.
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import type { Tier } from './entitlementCache';

/** Must match the entitlement identifier configured in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'pip_pro';

/** Public Google Play SDK key. Safe to ship in the app; never a secret REST key. */
export const PLAY_SDK_KEY = 'goog_hpSMipvvTGqFCQqOwKVRZpByPZH';
const TEST_STORE_KEY = 'test_nozSKPpVXCRtIAflLFMjFmsHkon';

export function resolveSdkKey(
  envKey: string,
  opts: { dev: boolean; platform: string } = { dev: Boolean(__DEV__), platform: Platform.OS }
): string {
  const key = envKey.trim();
  if (opts.platform === 'web') return '';
  if (opts.dev) {
    if (key.startsWith('test_') || key.startsWith('goog_') || key.startsWith('appl_')) return key;
    return key || TEST_STORE_KEY;
  }
  if (key.startsWith('test_') || !key) return PLAY_SDK_KEY;
  return key;
}

function configuredKey(): string {
  return resolveSdkKey(
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || ''
  );
}

let configureOnce: Promise<void> | null = null;

async function doConfigurePurchases(): Promise<void> {
  const apiKey = configuredKey();
  if (Platform.OS === 'web' || !apiKey) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  await Purchases.configure({ apiKey });
}

export async function configurePurchases(): Promise<void> {
  if (!configureOnce) configureOnce = doConfigurePurchases();
  await configureOnce;
}

export function tierFromCustomerInfo(info: CustomerInfo): Tier {
  return info.entitlements.active[PRO_ENTITLEMENT] ? 'pro' : 'free';
}

/** Throws on lookup failure. Callers MUST catch and fall back to the cached tier: resolving a
 *  network error to 'free' here would silently downgrade a paying user who is offline. */
export async function fetchTier(): Promise<Tier> {
  return tierFromCustomerInfo(await Purchases.getCustomerInfo());
}

export async function fetchAppUserId(): Promise<string | null> {
  try {
    const id = await Purchases.getAppUserID();
    return id?.trim() ? id : null;
  } catch {
    return null;
  }
}

export async function fetchCurrentOffering(
  getOfferings: () => Promise<{ current: PurchasesOffering | null }>,
  opts: { attempts?: number; delay?: (ms: number) => Promise<void> } = {}
): Promise<PurchasesOffering | null> {
  const attempts = opts.attempts ?? 3;
  const delay = opts.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let i = 0; i < attempts; i += 1) {
    try {
      const current = (await getOfferings()).current ?? null;
      if (current) return current;
    } catch {
      // Play Billing is often briefly unavailable right after configure on a fresh install.
    }
    if (i < attempts - 1) await delay(400 * (i + 1));
  }
  return null;
}

export async function fetchOfferings(): Promise<PurchasesOffering | null> {
  await configurePurchases();
  return fetchCurrentOffering(() => Purchases.getOfferings());
}

export type BuyResult = {
  ok: boolean;
  cancelled: boolean;
  pending: boolean;
  alreadyOwned: boolean;
  tier: Tier;
};

function emptyBuy(partial: Partial<BuyResult> = {}): BuyResult {
  return { ok: false, cancelled: false, pending: false, alreadyOwned: false, tier: 'free', ...partial };
}

function errorCode(e: unknown): string | undefined {
  return (e as PurchasesError)?.code;
}

/** `cancelled` separates a user backing out from a real failure, because only the latter
 *  should ever surface an alert. Success requires an active `pip_pro` entitlement. */
export async function buy(pkg: PurchasesPackage): Promise<BuyResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const tier = tierFromCustomerInfo(customerInfo);
    return emptyBuy({ ok: tier === 'pro', tier });
  } catch (e) {
    const code = errorCode(e);
    if ((e as { userCancelled?: boolean })?.userCancelled || code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return emptyBuy({ cancelled: true });
    }
    if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
      return emptyBuy({ pending: true });
    }
    if (code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) {
      try {
        const tier = await restore();
        return emptyBuy({ ok: tier === 'pro', alreadyOwned: true, tier });
      } catch {
        return emptyBuy({ alreadyOwned: true });
      }
    }
    return emptyBuy();
  }
}

export async function restore(): Promise<Tier> {
  return tierFromCustomerInfo(await Purchases.restorePurchases());
}

/** Store page where the user can cancel. Null when there is no store subscription to manage. */
export async function fetchManagementURL(): Promise<string | null> {
  try {
    const url = (await Purchases.getCustomerInfo()).managementURL;
    return url?.trim() ? url : null;
  } catch {
    return null;
  }
}

export async function presentCustomerCenter(): Promise<boolean> {
  try {
    const ui = require('react-native-purchases-ui')?.default;
    if (!ui?.presentCustomerCenter) return false;
    await ui.presentCustomerCenter();
    return true;
  } catch {
    return false;
  }
}
