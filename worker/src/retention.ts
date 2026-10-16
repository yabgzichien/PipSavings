// worker/src/retention.ts
// Scheduled cleanup. Cached scan results hold extracted financial rows, so they must not live
// forever, and the tables that only exist to enforce limits should not grow without bound.
import { getUtcKeys, type D1Database } from './quota';
import { REDEEM_WINDOW_MS } from './redeemRateLimit';

const HOUR_MS = 60 * 60 * 1000;
/** How long a finished scan can be replayed from cache instead of re-running the model. */
export const SCAN_RESULT_TTL_MS = 24 * HOUR_MS;
/**
 * Must be shorter than SCAN_RESULT_TTL_MS. A committed reservation that outlives its cached
 * result would let a replay run the model again without being charged; deleting the
 * reservation first means a replay after the cache expires is simply a new, charged scan.
 */
export const RESERVATION_TTL_RETENTION_MS = 23 * HOUR_MS;
export const ENTITLEMENT_CACHE_RETENTION_MS = 24 * HOUR_MS;

export async function purgeExpired(db: D1Database, now: number = Date.now()): Promise<void> {
  const twoDaysAgo = getUtcKeys(now - 2 * 24 * HOUR_MS).dayKey;
  await db.prepare('DELETE FROM reservations WHERE created_at < ?').bind(now - RESERVATION_TTL_RETENTION_MS).run();
  await db.prepare('DELETE FROM scan_results WHERE created_at < ?').bind(now - SCAN_RESULT_TTL_MS).run();
  await db.prepare('DELETE FROM redeem_attempts WHERE window_start < ?').bind(now - REDEEM_WINDOW_MS).run();
  await db.prepare('DELETE FROM ip_usage WHERE day_key < ?').bind(twoDaysAgo).run();
  await db
    .prepare('DELETE FROM entitlement_cache WHERE checked_at < ?')
    .bind(now - ENTITLEMENT_CACHE_RETENTION_MS)
    .run();
}
