// worker/test/quota.test.ts
import {
  checkAndReserve,
  commitReservation,
  getUsage,
  getUtcKeys,
  hashInstallationId,
  rollbackReservation,
  FREE_DAILY_LIMIT,
  FREE_MONTHLY_LIMIT,
} from '../src/quota';
import { createMockD1 } from './mockD1';

describe('hashInstallationId', () => {
  it('deterministically hashes installation IDs with salt', async () => {
    const hash1 = await hashInstallationId('device-1234', 'saltA');
    const hash2 = await hashInstallationId('device-1234', 'saltA');
    const hash3 = await hashInstallationId('device-1234', 'saltB');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.length).toBe(64); // SHA-256 hex length
  });
});

describe('getUtcKeys', () => {
  it('formats dates in UTC correctly', () => {
    // 2026-09-13T23:30:00Z
    const t1 = Date.parse('2026-09-13T23:30:00Z');
    const keys1 = getUtcKeys(t1);
    expect(keys1.dayKey).toBe('2026-09-13');
    expect(keys1.monthKey).toBe('2026-09');

    // 2026-09-14T00:30:00Z (next day UTC)
    const t2 = Date.parse('2026-09-14T00:30:00Z');
    const keys2 = getUtcKeys(t2);
    expect(keys2.dayKey).toBe('2026-09-14');
    expect(keys2.monthKey).toBe('2026-09');
  });
});

describe('D1 Quota enforcement', () => {
  let db: ReturnType<typeof createMockD1>;
  const hash = 'test_hash_abc';
  const now = Date.parse('2026-09-15T12:00:00Z');

  beforeEach(() => {
    db = createMockD1();
  });

  it('allows up to 3 scans per day, blocking the 4th with daily limit', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await checkAndReserve(db, hash, `req-${i}`, false, now);
      expect(res.ok).toBe(true);
      await commitReservation(db, `req-${i}`, false, now);
    }

    // 4th request must be blocked
    const fourth = await checkAndReserve(db, hash, 'req-4', false, now);
    expect(fourth.ok).toBe(false);
    expect(fourth.blockedBy).toBe('daily');
    expect(fourth.dayUsed).toBe(3);
  });

  it('resets daily allowance on the next UTC day', async () => {
    // Exhaust day 1
    for (let i = 1; i <= 3; i++) {
      await checkAndReserve(db, hash, `req-day1-${i}`, false, now);
      await commitReservation(db, `req-day1-${i}`, false, now);
    }

    const nextDay = now + 24 * 60 * 60 * 1000;
    const day2Req = await checkAndReserve(db, hash, 'req-day2-1', false, nextDay);
    expect(day2Req.ok).toBe(true);
    expect(day2Req.dayUsed).toBe(0);
    expect(day2Req.monthUsed).toBe(3);
  });

  it('allows up to 20 scans per month, blocking the 21st with monthly limit', async () => {
    // Simulate 20 scans across multiple days in the same month
    let time = now;
    for (let i = 1; i <= 20; i++) {
      // Advance to a new day every 3 scans
      if (i > 1 && i % 3 === 1) {
        time += 24 * 60 * 60 * 1000;
      }
      const res = await checkAndReserve(db, hash, `month-req-${i}`, false, time);
      expect(res.ok).toBe(true);
      await commitReservation(db, `month-req-${i}`, false, time);
    }

    // Next scan on a fresh day should hit monthly limit
    time += 24 * 60 * 60 * 1000;
    const res21 = await checkAndReserve(db, hash, 'month-req-21', false, time);
    expect(res21.ok).toBe(false);
    expect(res21.blockedBy).toBe('monthly');
    expect(res21.monthUsed).toBe(20);
  });

  it('allows Pro tier to bypass daily and monthly quotas entirely', async () => {
    // Pro can scan far past 3/day and 20/month
    for (let i = 1; i <= 25; i++) {
      const res = await checkAndReserve(db, hash, `pro-req-${i}`, true, now);
      expect(res.ok).toBe(true);
      await commitReservation(db, `pro-req-${i}`, true, now);
    }

    const usage = await getUsage(db, hash, '2026-09-15', '2026-09');
    // Pro scans do not burn free quota counters
    expect(usage.dayUsed).toBe(0);
    expect(usage.monthUsed).toBe(0);
  });

  it('rolls back quota reservation when provider fails', async () => {
    const res = await checkAndReserve(db, hash, 'failed-req', false, now);
    expect(res.ok).toBe(true);

    // Rollback reservation
    await rollbackReservation(db, 'failed-req');

    // Quota should still be 0 used
    const usage = await getUsage(db, hash, '2026-09-15', '2026-09');
    expect(usage.dayUsed).toBe(0);
    expect(usage.monthUsed).toBe(0);
  });

  it('handles idempotency replay safely without double incrementing', async () => {
    const res1 = await checkAndReserve(db, hash, 'same-key', false, now);
    expect(res1.ok).toBe(true);
    await commitReservation(db, 'same-key', false, now);

    // Replay same key
    const res2 = await checkAndReserve(db, hash, 'same-key', false, now);
    expect(res2.ok).toBe(true);
    expect(res2.alreadyCommitted).toBe(true);

    // Should only have incremented once
    const usage = await getUsage(db, hash, '2026-09-15', '2026-09');
    expect(usage.dayUsed).toBe(1);
    expect(usage.monthUsed).toBe(1);
  });

  it('does not double count quota when commitReservation is called twice with meta keys', async () => {
    const res = await checkAndReserve(db, hash, 'concurrent-key', false, now);
    expect(res.ok).toBe(true);

    const meta = { hash, dayKey: '2026-09-15', monthKey: '2026-09' };
    await commitReservation(db, 'concurrent-key', false, now, meta);
    // Second commit with same key (e.g. concurrent in-flight settled)
    await commitReservation(db, 'concurrent-key', false, now, meta);

    const usage = await getUsage(db, hash, '2026-09-15', '2026-09');
    expect(usage.dayUsed).toBe(1);
    expect(usage.monthUsed).toBe(1);
  });
});

describe('checkAndReserve under concurrency', () => {
  it('does not let parallel requests all pass a limit that only has room for one', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMockD1 } = require('./mockD1');
    const {
      checkAndReserve,
      commitReservation,
      getUtcKeys,
      FREE_DAILY_LIMIT,
    } = require('../src/quota');
    const db = createMockD1();
    const now = Date.UTC(2026, 8, 15, 12);
    const { dayKey, monthKey } = getUtcKeys(now);

    // Leave exactly one scan of room today.
    for (let i = 0; i < FREE_DAILY_LIMIT - 1; i++) {
      const key = `seed-${i}`;
      await checkAndReserve(db, 'h', key, false, now);
      await commitReservation(db, key, false, now, { hash: 'h', dayKey, monthKey });
    }

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => checkAndReserve(db, 'h', `burst-${i}`, false, now))
    );
    // Over-blocking is fine (the client retries); letting more than the remaining room through is not.
    expect(results.filter((r: { ok: boolean }) => r.ok).length).toBeLessThanOrEqual(1);
  });
});

describe('network cap', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createMockD1 } = require('./mockD1');
  const { claimIpSlot, releaseIpSlot, ipBucketKey } = require('../src/quota');

  it('lets exactly `limit` of a large parallel burst through', async () => {
    const db = createMockD1();
    const results = await Promise.all(
      Array.from({ length: 200 }, () => claimIpSlot(db, 'ip-hash', '2026-09-15', 40))
    );
    expect(results.filter((r: { ok: boolean }) => r.ok)).toHaveLength(40);
    // Everything over the cap was handed back, so the counter sits at the limit, not at 200.
    expect((await claimIpSlot(db, 'ip-hash', '2026-09-15', 41)).ok).toBe(true);
  });

  it('returns a slot when the scan it was for does not complete', async () => {
    const db = createMockD1();
    expect((await claimIpSlot(db, 'h', 'd', 1)).ok).toBe(true);
    expect((await claimIpSlot(db, 'h', 'd', 1)).ok).toBe(false);
    await releaseIpSlot(db, 'h', 'd');
    expect((await claimIpSlot(db, 'h', 'd', 1)).ok).toBe(true);
  });

  it('fails open when the table is missing, so a late migration cannot take scanning down', async () => {
    const broken = {
      prepare() {
        throw new Error('no such table: ip_usage');
      },
      batch: async () => [],
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const slot = await claimIpSlot(broken, 'h', 'd', 40);
    expect(slot).toEqual({ ok: true, held: false });
    warn.mockRestore();
  });

  it('counts a whole IPv6 /64 as one network, however the address is written', () => {
    const a = ipBucketKey('2001:db8:abcd:12::1');
    expect(ipBucketKey('2001:0db8:abcd:0012:ffff:ffff:ffff:ffff')).toBe(a);
    expect(ipBucketKey('2001:DB8:ABCD:12:1:2:3:4')).toBe(a);
    expect(ipBucketKey('2001:db8:abcd:13::1')).not.toBe(a);
  });

  it('keeps IPv4 per address and unwraps IPv4-mapped IPv6', () => {
    expect(ipBucketKey('203.0.113.9')).toBe('203.0.113.9');
    expect(ipBucketKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(ipBucketKey('203.0.113.10')).not.toBe(ipBucketKey('203.0.113.9'));
  });
});
