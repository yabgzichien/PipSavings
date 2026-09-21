// worker/src/redeemRateLimit.ts
import type { D1Database } from './quota';

export const REDEEM_WINDOW_MS = 15 * 60 * 1000;
export const REDEEM_MAX_FAILS = 5;

export function redeemRetryAllowed(input: {
  failCount: number;
  windowStart: number;
  now: number;
  windowMs: number;
  maxFails: number;
}): boolean {
  if (input.now - input.windowStart > input.windowMs) return true;
  return input.failCount < input.maxFails;
}

export async function redeemBucketHash(installationId: string, ip: string): Promise<string> {
  const data = `${installationId}|${ip || 'unknown'}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isRedeemBlocked(db: D1Database, bucket: string, now: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT fail_count, window_start FROM redeem_attempts WHERE bucket = ?')
    .bind(bucket)
    .first<{ fail_count: number; window_start: number }>();
  if (!row) return false;
  return !redeemRetryAllowed({
    failCount: row.fail_count,
    windowStart: row.window_start,
    now,
    windowMs: REDEEM_WINDOW_MS,
    maxFails: REDEEM_MAX_FAILS,
  });
}

export async function noteRedeemFailure(db: D1Database, bucket: string, now: number): Promise<void> {
  const row = await db
    .prepare('SELECT fail_count, window_start FROM redeem_attempts WHERE bucket = ?')
    .bind(bucket)
    .first<{ fail_count: number; window_start: number }>();
  if (!row || now - row.window_start > REDEEM_WINDOW_MS) {
    await db
      .prepare(
        'INSERT OR REPLACE INTO redeem_attempts (bucket, window_start, fail_count) VALUES (?, ?, ?)'
      )
      .bind(bucket, now, 1)
      .run();
    return;
  }
  await db
    .prepare(
      'INSERT OR REPLACE INTO redeem_attempts (bucket, window_start, fail_count) VALUES (?, ?, ?)'
    )
    .bind(bucket, row.window_start, row.fail_count + 1)
    .run();
}

export async function clearRedeemFailures(db: D1Database, bucket: string): Promise<void> {
  await db.prepare('DELETE FROM redeem_attempts WHERE bucket = ?').bind(bucket).run();
}
