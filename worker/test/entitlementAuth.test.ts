import { hasRevenueCatPro } from '../src/entitlementAuth';

describe('hasRevenueCatPro', () => {
  const secret = 'sk_test';
  const projectId = 'proj_test';

  it('is not pro when the app user id is missing', async () => {
    const fetchImpl = jest.fn();
    expect(
      await hasRevenueCatPro({
        appUserId: null,
        secretKey: secret,
        projectId,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is pro when RevenueCat lists pip_pro as active', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ entitlement_id: 'pip_pro', expires_at: Date.now() + 86_400_000 }],
      }),
    });
    expect(
      await hasRevenueCatPro({
        appUserId: '$RCAnonymousID:abc',
        secretKey: secret,
        projectId,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(true);
  });

  it('is not pro when RevenueCat returns no matching entitlement', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    expect(
      await hasRevenueCatPro({
        appUserId: 'user-1',
        secretKey: secret,
        projectId,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
  });

  it('fails closed when RevenueCat is unreachable', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('timeout'));
    expect(
      await hasRevenueCatPro({
        appUserId: 'user-1',
        secretKey: secret,
        projectId,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
  });
});

describe('resolveRevenueCatPro', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createMockD1 } = require('./mockD1');
  const { resolveRevenueCatPro } = require('../src/entitlementAuth');
  const base = { appUserId: '$RCAnonymousID:abc', secretKey: 'sk_test', projectId: 'proj' };
  const proBody = { ok: true, status: 200, json: async () => ({ items: [{ entitlement_id: 'pip_pro' }] }) };
  const down = { ok: false, status: 503, json: async () => ({}) };

  it('keeps a customer RevenueCat recently confirmed as Pro when RevenueCat is down', async () => {
    const db = createMockD1();
    const t0 = 1_000_000;
    const up = jest.fn().mockResolvedValue(proBody);
    expect(await resolveRevenueCatPro(db, { ...base, fetchImpl: up }, t0)).toBe(true);

    const fail = jest.fn().mockResolvedValue(down);
    // Past the fresh window so it must ask again, then fall back to the stored answer.
    expect(await resolveRevenueCatPro(db, { ...base, fetchImpl: fail }, t0 + 60 * 60 * 1000)).toBe(true);
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('does not extend the grace past a day, and never invents Pro for unknown callers', async () => {
    const db = createMockD1();
    const t0 = 1_000_000;
    await resolveRevenueCatPro(db, { ...base, fetchImpl: jest.fn().mockResolvedValue(proBody) }, t0);
    const fail = jest.fn().mockResolvedValue(down);
    expect(await resolveRevenueCatPro(db, { ...base, fetchImpl: fail }, t0 + 25 * 60 * 60 * 1000)).toBe(false);
    expect(await resolveRevenueCatPro(createMockD1(), { ...base, fetchImpl: fail }, t0)).toBe(false);
  });

  it('drops Pro as soon as RevenueCat says the entitlement ended', async () => {
    const db = createMockD1();
    const t0 = 1_000_000;
    await resolveRevenueCatPro(db, { ...base, fetchImpl: jest.fn().mockResolvedValue(proBody) }, t0);
    const none = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) });
    expect(await resolveRevenueCatPro(db, { ...base, fetchImpl: none }, t0 + 10 * 60 * 1000)).toBe(false);
  });

  it('serves a fresh positive answer without calling RevenueCat again', async () => {
    const db = createMockD1();
    const t0 = 1_000_000;
    const f = jest.fn().mockResolvedValue(proBody);
    await resolveRevenueCatPro(db, { ...base, fetchImpl: f }, t0);
    await resolveRevenueCatPro(db, { ...base, fetchImpl: f }, t0 + 60_000);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
