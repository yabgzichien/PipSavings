// __tests__/scanProxy.test.ts
import {
  fetchAllowance,
  fetchServerEntitlement,
  getInstallationId,
  redeemPromoCode,
  submitScan,
  submitReceiptScan,
  submitSnapshotScan,
  computeIdempotencyKey,
  type ScanRequest,
  type ScanResult,
} from '../src/billing/scanProxy';
import { getMeta, setMeta } from '../src/db/metaRepo';

jest.mock('../src/db/metaRepo', () => ({
  getMeta: jest.fn(),
  setMeta: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/billing/purchases', () => ({
  fetchAppUserId: jest.fn(async () => null),
}));
import { fetchAppUserId } from '../src/billing/purchases';

const originalFetch = global.fetch;

describe('getInstallationId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('generates and stores an anonymous installation id on first launch', async () => {
    (getMeta as jest.Mock).mockResolvedValue(null);
    const id = await getInstallationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(setMeta).toHaveBeenCalledWith('installation_id', id);
  });

  it('reuses existing stored installation id', async () => {
    (getMeta as jest.Mock).mockResolvedValue('existing-uuid-1234');
    const id = await getInstallationId();
    expect(id).toBe('existing-uuid-1234');
    expect(setMeta).not.toHaveBeenCalled();
  });
});

describe('fetchAllowance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMeta as jest.Mock).mockResolvedValue('anon-install-123');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches allowance from worker and returns normalized ScanAllowance', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tier: 'free',
        monthUsed: 12,
        dayUsed: 2,
      }),
    } as never);

    const allowance = await fetchAllowance();
    expect(allowance).toEqual({
      tier: 'free',
      monthUsed: 12,
      monthLimit: 20,
      dayUsed: 2,
      dayLimit: 3,
      canScan: true,
      blockedBy: null,
    });
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers['x-entitlement']).toBeUndefined();
    expect(headers['x-installation-id']).toBe('anon-install-123');
  });

  it('sends the RevenueCat app user id so the Worker can verify Pro', async () => {
    (fetchAppUserId as jest.Mock).mockResolvedValue('$RCAnonymousID:abc');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tier: 'pro',
        monthUsed: 0,
        dayUsed: 0,
        monthLimit: 'Infinity',
        dayLimit: 'Infinity',
      }),
    } as never);

    await fetchAllowance();
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers['x-rc-app-user-id']).toBe('$RCAnonymousID:abc');
    expect(headers['x-entitlement']).toBeUndefined();
  });

  it('falls back to safe default if worker is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const allowance = await fetchAllowance();
    expect(allowance.canScan).toBe(true);
    expect(allowance.tier).toBe('free');
  });
});

describe('submitScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMeta as jest.Mock).mockResolvedValue('anon-install-123');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('submits scan payload to worker and parses extracted items and allowance', async () => {
    const mockExtracted = [
      {
        merchant: 'Jaya Grocer',
        amount: 88.5,
        type: 'expense',
        date: '2026-09-13',
        currency: 'MYR',
        method: 'tng',
      },
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        items: mockExtracted,
        allowance: {
          tier: 'free',
          monthUsed: 3,
          dayUsed: 1,
        },
      }),
    } as never);

    const req: ScanRequest = {
      imageBase64: 'base64data',
      mimeType: 'image/jpeg',
      categories: [{ id: 'groceries', label: 'Groceries', kind: 'expense' }],
    };

    const res = await submitScan(req);
    expect(res.ok).toBe(true);
    expect(res.items).toEqual(mockExtracted);
    expect(res.allowance.monthUsed).toBe(3);
    expect(res.allowance.dayUsed).toBe(1);
    expect(res.allowance.canScan).toBe(true);
  });

  it('activates dual-path preprocessing when uri is present even if imageBase64 is also passed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        items: [],
        allowance: { tier: 'free', monthUsed: 1, dayUsed: 1 },
      }),
    } as never);

    const req: ScanRequest = {
      uri: 'file:///photo.jpg',
      imageBase64: 'raw_picker_base64',
      mimeType: 'image/jpeg',
    };

    await submitScan(req);
    expect(global.fetch).toHaveBeenCalled();
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[1].headers['x-client-preprocess']).toBeDefined();
  });

  it('hashes the full payload for idempotency, not just head and tail', async () => {
    const head = 'H'.repeat(20000);
    const tail = 'T'.repeat(20000);
    const a = `${head}MIDDLE_A${tail}`;
    const b = `${head}MIDDLE_B${tail}`;
    const ka = await computeIdempotencyKey('install-1', 'transactions', a);
    const kb = await computeIdempotencyKey('install-1', 'transactions', b);
    expect(ka).not.toBe(kb);
  });

  it('retries once at a smaller image when the worker returns 413', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 413,
        json: async () => ({ error: 'Image payload exceeds 400KB limit' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          items: [{ merchant: 'Rescued', amount: 9, type: 'expense', date: null, currency: 'MYR' }],
          allowance: { tier: 'free', monthUsed: 1, dayUsed: 1 },
        }),
      } as never);

    const res = await submitScan({ uri: 'file:///huge.jpg' });
    expect(res.ok).toBe(true);
    expect(res.items[0].merchant).toBe('Rescued');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });


  it('handles worker quota rejection (e.g. daily limit hit)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        error: 'daily_limit',
        allowance: {
          tier: 'free',
          monthUsed: 15,
          dayUsed: 3,
        },
      }),
    } as never);

    const req: ScanRequest = {
      imageBase64: 'base64data',
      mimeType: 'image/jpeg',
      categories: [],
    };

    const res = await submitScan(req);
    expect(res.ok).toBe(false);
    expect(res.quotaBlocked).toBe(true);
    expect(res.allowance.blockedBy).toBe('daily');
    expect(res.allowance.canScan).toBe(false);
  });

  it('handles worker quota rejection for monthly limit hit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        error: 'monthly_limit',
        allowance: {
          tier: 'free',
          monthUsed: 20,
          dayUsed: 1,
        },
      }),
    } as never);

    const req: ScanRequest = {
      imageBase64: 'base64data',
      mimeType: 'image/jpeg',
      categories: [],
    };

    const res = await submitScan(req);
    expect(res.ok).toBe(false);
    expect(res.quotaBlocked).toBe(true);
    expect(res.allowance.blockedBy).toBe('monthly');
    expect(res.allowance.canScan).toBe(false);
  });
});

describe('submitReceiptScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMeta as jest.Mock).mockResolvedValue('anon-install-123');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('submits receipt scan and returns parsed receipt data', async () => {
    const mockReceipt = {
      merchant: 'FamilyMart',
      currency: 'MYR',
      items: [{ label: 'Oden', amount: 8.5, quantity: 1 }],
      subtotal: 8.5,
      serviceCharge: null,
      tax: 0.51,
      total: 9.01,
      discount: null,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        scanType: 'receipt',
        receipt: mockReceipt,
        allowance: {
          tier: 'free',
          monthUsed: 5,
          dayUsed: 2,
        },
      }),
    } as never);

    const res = await submitReceiptScan({
      imageBase64: 'base64receipt',
      mimeType: 'image/jpeg',
    });

    expect(res.ok).toBe(true);
    expect(res.receipt).toEqual(mockReceipt);
    expect(res.allowance.monthUsed).toBe(5);
  });
});

describe('submitSnapshotScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMeta as jest.Mock).mockResolvedValue('anon-install-123');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('submits snapshot scan and returns parsed balance snapshot', async () => {
    const mockSnapshot = {
      kind: 'balance',
      provider: 'Maybank',
      accountKind: 'asset',
      amount: 1250.8,
      currency: 'MYR',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        scanType: 'snapshot',
        snapshot: mockSnapshot,
        allowance: {
          tier: 'pro',
          monthUsed: 0,
          dayUsed: 0,
        },
      }),
    } as never);

    const res = await submitSnapshotScan(
      { imageBase64: 'base64snap', mimeType: 'image/jpeg' },
      'pro'
    );

    expect(res.ok).toBe(true);
    expect(res.snapshot).toEqual(mockSnapshot);
  });
});

describe('promo redeem client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMeta as jest.Mock).mockResolvedValue('anon-install-123');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('redeems a code and returns the lifetime grant', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        grant: { kind: 'lifetime', expiresAt: null, source: 'promo' },
      }),
    } as never);

    const res = await redeemPromoCode('pip-a7k2');
    expect(res).toEqual({
      ok: true,
      grant: { kind: 'lifetime', expiresAt: null, source: 'promo' },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/redeem'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'pip-a7k2' }),
      })
    );
  });

  it('maps already_used from the worker', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'already_used' }),
    } as never);
    expect(await redeemPromoCode('PIP-USED')).toEqual({ ok: false, error: 'already_used' });
  });

  it('maps rate_limited from the worker', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, error: 'rate_limited' }),
    } as never);
    expect(await redeemPromoCode('PIP-XXXX-XXXX-XXXX')).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('fetches server entitlement for the installation', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        active: true,
        kind: 'lifetime',
        expiresAt: null,
        source: 'promo',
      }),
    } as never);
    expect(await fetchServerEntitlement()).toEqual({
      active: true,
      kind: 'lifetime',
      expiresAt: null,
      source: 'promo',
    });
  });
});
