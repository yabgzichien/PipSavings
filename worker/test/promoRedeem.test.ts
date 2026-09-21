import worker from '../src/index';
import { createMockD1 } from './mockD1';
import { hashInstallationId } from '../src/quota';

describe('promo code redeem', () => {
  let db: ReturnType<typeof createMockD1>;

  beforeEach(async () => {
    db = createMockD1();
    await db
      .prepare(
        `INSERT INTO promo_codes (code, grant_kind, duration_days, max_redemptions, redemption_count, disabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('PIP-A7K2', 'lifetime', null, 1, 0, 0, Date.now())
      .run();
  });

  it('redeems a valid one-time code and grants lifetime pro', async () => {
    const req = new Request('https://proxy.pip.local/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'friend-001',
      },
      body: JSON.stringify({ code: 'pip-a7k2' }),
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      grant: { kind: 'lifetime', expiresAt: null },
    });

    const entitlementRes = await worker.fetch(
      new Request('https://proxy.pip.local/entitlement', {
        method: 'GET',
        headers: { 'x-installation-id': 'friend-001' },
      }),
      { DB: db }
    );
    expect(entitlementRes.status).toBe(200);
    expect(await entitlementRes.json()).toEqual({
      active: true,
      kind: 'lifetime',
      expiresAt: null,
      source: 'promo',
    });
  });

  it('rejects a second redeem of the same code', async () => {
    const first = new Request('https://proxy.pip.local/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'friend-001',
      },
      body: JSON.stringify({ code: 'PIP-A7K2' }),
    });
    expect((await worker.fetch(first, { DB: db })).status).toBe(200);

    const second = new Request('https://proxy.pip.local/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'friend-002',
      },
      body: JSON.stringify({ code: 'PIP-A7K2' }),
    });
    const res = await worker.fetch(second, { DB: db });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: 'already_used' });
  });

  it('treats a granted install as pro on /allowance without x-entitlement header', async () => {
    await worker.fetch(
      new Request('https://proxy.pip.local/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-installation-id': 'friend-003',
        },
        body: JSON.stringify({ code: 'PIP-A7K2' }),
      }),
      { DB: db }
    );

    const res = await worker.fetch(
      new Request('https://proxy.pip.local/allowance', {
        method: 'GET',
        headers: { 'x-installation-id': 'friend-003' },
      }),
      { DB: db }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe('pro');
    expect(json.canScan).toBe(true);
  });

  it('rejects redeem when install already has an active grant', async () => {
    const hash = await hashInstallationId('friend-004');
    await db
      .prepare(
        `INSERT INTO entitlement_grants
          (installation_hash, source, grant_kind, expires_at, code, referrer_installation_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(hash, 'promo', 'lifetime', null, 'OLD', null, Date.now(), Date.now())
      .run();

    await db
      .prepare(
        `INSERT INTO promo_codes (code, grant_kind, duration_days, max_redemptions, redemption_count, disabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('PIP-NEW1', 'lifetime', null, 1, 0, 0, Date.now())
      .run();

    const res = await worker.fetch(
      new Request('https://proxy.pip.local/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-installation-id': 'friend-004',
        },
        body: JSON.stringify({ code: 'PIP-NEW1' }),
      }),
      { DB: db }
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: 'already_granted' });
  });

  it('rate-limits repeated failed guesses from the same install', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await worker.fetch(
        new Request('https://proxy.pip.local/redeem', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-installation-id': 'brute-001',
          },
          body: JSON.stringify({ code: `NOPE-${i}` }),
        }),
        { DB: db }
      );
      expect(res.status).toBe(400);
    }

    const blocked = await worker.fetch(
      new Request('https://proxy.pip.local/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-installation-id': 'brute-001',
        },
        body: JSON.stringify({ code: 'PIP-A7K2' }),
      }),
      { DB: db }
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ ok: false, error: 'rate_limited' });
  });
});
