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
