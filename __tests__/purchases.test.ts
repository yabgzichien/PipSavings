// __tests__/purchases.test.ts
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    getAppUserID: jest.fn(),
  },
  LOG_LEVEL: { ERROR: 'ERROR', DEBUG: 'DEBUG' },
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    PRODUCT_ALREADY_PURCHASED_ERROR: '6',
    PAYMENT_PENDING_ERROR: '20',
  },
}));

import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import {
  PLAY_SDK_KEY,
  PRO_ENTITLEMENT,
  buy,
  fetchCurrentOffering,
  fetchManagementURL,
  fetchOfferings,
  fetchTier,
  resolveSdkKey,
  restore,
  tierFromCustomerInfo,
} from '../src/billing/purchases';

const withPro = { entitlements: { active: { [PRO_ENTITLEMENT]: { isActive: true } } } } as never;
const withoutPro = { entitlements: { active: {} } } as never;

describe('resolveSdkKey', () => {
  it('uses the Play public key in release when env is missing or a Test Store key', () => {
    expect(resolveSdkKey('', { dev: false, platform: 'android' })).toBe(PLAY_SDK_KEY);
    expect(resolveSdkKey('test_abc', { dev: false, platform: 'android' })).toBe(PLAY_SDK_KEY);
  });

  it('keeps a Play key from env in release', () => {
    expect(resolveSdkKey(PLAY_SDK_KEY, { dev: false, platform: 'android' })).toBe(PLAY_SDK_KEY);
  });

  it('allows the Test Store key only in development', () => {
    expect(resolveSdkKey('', { dev: true, platform: 'android' }).startsWith('test_')).toBe(true);
  });
});

describe('tierFromCustomerInfo', () => {
  it('reads pro from the active entitlement', () => {
    expect(tierFromCustomerInfo(withPro)).toBe('pro');
  });

  it('reads free when the entitlement is absent', () => {
    expect(tierFromCustomerInfo(withoutPro)).toBe('free');
  });
});

describe('fetchTier', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves the tier from a successful lookup', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(withPro);
    expect(await fetchTier()).toBe('pro');
  });

  // Callers distinguish "definitely free" from "could not tell" by catching, so a network
  // failure must propagate rather than silently resolving to free and downgrading a payer.
  it('rethrows when the lookup fails', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(fetchTier()).rejects.toThrow('offline');
  });
});

describe('buy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports success only when the returned customer has the Pro entitlement', async () => {
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({ customerInfo: withPro });
    expect(await buy({} as never)).toEqual({
      ok: true,
      cancelled: false,
      pending: false,
      alreadyOwned: false,
      tier: 'pro',
    });
  });

  it('does not treat a completed store sheet as Pro when the entitlement is missing', async () => {
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({ customerInfo: withoutPro });
    expect(await buy({} as never)).toMatchObject({ ok: false, tier: 'free' });
  });

  // A user tapping the system "cancel" is not an error and must never raise an alert.
  it('reports a user cancellation without treating it as a failure', async () => {
    (Purchases.purchasePackage as jest.Mock).mockRejectedValue({ userCancelled: true });
    expect(await buy({} as never)).toMatchObject({ ok: false, cancelled: true });
  });

  it('reports a real failure as not cancelled', async () => {
    (Purchases.purchasePackage as jest.Mock).mockRejectedValue({ userCancelled: false });
    expect(await buy({} as never)).toMatchObject({ ok: false, cancelled: false, pending: false });
  });

  it('restores when the store says the product is already purchased', async () => {
    (Purchases.purchasePackage as jest.Mock).mockRejectedValue({
      code: PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR,
    });
    (Purchases.restorePurchases as jest.Mock).mockResolvedValue(withPro);
    expect(await buy({} as never)).toMatchObject({ ok: true, alreadyOwned: true, tier: 'pro' });
  });

  it('marks a pending store payment without claiming success', async () => {
    (Purchases.purchasePackage as jest.Mock).mockRejectedValue({
      code: PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR,
    });
    expect(await buy({} as never)).toMatchObject({ ok: false, pending: true });
  });
});

describe('fetchManagementURL', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the store management URL', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
      ...withoutPro,
      managementURL: 'https://play.google.com/store/account/subscriptions',
    });
    expect(await fetchManagementURL()).toBe(
      'https://play.google.com/store/account/subscriptions'
    );
  });

  it('returns null when the store has no management URL', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
      ...withoutPro,
      managementURL: null,
    });
    expect(await fetchManagementURL()).toBeNull();
  });

  it('returns null when the lookup fails', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
    expect(await fetchManagementURL()).toBeNull();
  });
});

describe('restore', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the tier the store knows about', async () => {
    (Purchases.restorePurchases as jest.Mock).mockResolvedValue(withoutPro);
    expect(await restore()).toBe('free');
  });
});

describe('fetchCurrentOffering', () => {
  it('returns the current offering on the first successful lookup', async () => {
    const getOfferings = jest.fn(async () => ({ current: { identifier: 'default' } }));
    const delay = jest.fn(async () => {});
    await expect(fetchCurrentOffering(getOfferings, { delay })).resolves.toEqual({ identifier: 'default' });
    expect(getOfferings).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('retries when Play has not published products yet', async () => {
    const getOfferings = jest
      .fn()
      .mockResolvedValueOnce({ current: null })
      .mockRejectedValueOnce(new Error('not configured'))
      .mockResolvedValueOnce({ current: { identifier: 'default' } });
    const delay = jest.fn(async () => {});
    await expect(fetchCurrentOffering(getOfferings, { delay })).resolves.toEqual({ identifier: 'default' });
    expect(getOfferings).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });
});

describe('fetchOfferings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('configures Purchases before asking the store for packages', async () => {
    (Purchases.getOfferings as jest.Mock).mockResolvedValue({ current: { identifier: 'default' } });
    await expect(fetchOfferings()).resolves.toEqual({ identifier: 'default' });
    expect(Purchases.configure).toHaveBeenCalled();
    expect(Purchases.getOfferings).toHaveBeenCalled();
  });
});
