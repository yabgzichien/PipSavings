// worker/src/quota.ts
export const FREE_MONTHLY_LIMIT = 20;
export const FREE_DAILY_LIMIT = 3;
export const RESERVATION_TTL_MS = 60_000; // 1 minute
/** Free scans one network address may spend per UTC day, across every install behind it. */
export const FREE_IP_DAILY_LIMIT = 40;

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ results?: T[]; success: boolean }>>;
}

export function getUtcKeys(timestamp: number): { dayKey: string; monthKey: string } {
  const d = new Date(timestamp);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return {
    dayKey: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`,
  };
}

export async function hashInstallationId(id: string, salt: string = 'pip_quota_salt_2026'): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${id}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getUsage(
  db: D1Database,
  hash: string,
  dayKey: string,
  monthKey: string
): Promise<{ dayUsed: number; monthUsed: number }> {
  const { results } = await db
    .prepare(
      `SELECT period_type, used_count FROM quota_usage WHERE installation_hash = ? AND ((period_type = 'day' AND period_key = ?) OR (period_type = 'month' AND period_key = ?))`
    )
    .bind(hash, dayKey, monthKey)
    .all<{ period_type: string; used_count: number }>();

  let dayUsed = 0;
  let monthUsed = 0;
  for (const row of results || []) {
    if (row.period_type === 'day') dayUsed = row.used_count;
    else if (row.period_type === 'month') monthUsed = row.used_count;
  }

  return { dayUsed, monthUsed };
}

/**
 * Reservations still in flight for this install today. They have not been committed yet, so
 * `getUsage` cannot see them; without counting them, N parallel scans all read the same
 * `used_count` and every one of them passes the limit.
 */
export async function countActiveReservations(
  db: D1Database,
  hash: string,
  dayKey: string,
  now: number
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM reservations
       WHERE installation_hash = ? AND day_key = ? AND status = 'reserved' AND expires_at > ?`
    )
    .bind(hash, dayKey, now)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * The network a request comes from, as the unit the daily cap counts. One IPv6 connection
 * normally controls a whole /64, billions of addresses, so hashing the full address would let a
 * script walk through it. IPv4 and IPv4-mapped IPv6 stay per address.
 */
export function ipBucketKey(ip: string): string {
  const raw = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  if (!raw.includes(':')) return raw;

  // Expand `::` so the first four groups (the /64) are the same however the address is written.
  const [head, tail] = raw.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const missing = Math.max(0, 8 - headGroups.length - tailGroups.length);
  const groups = tail === undefined ? headGroups : [...headGroups, ...Array(missing).fill('0'), ...tailGroups];
  const prefix = groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '') || '0');
  while (prefix.length < 4) prefix.push('0');
  return `${prefix.join(':')}::/64`;
}

export interface IpSlot {
  /** False when this network is over its daily cap. */
  ok: boolean;
  /** True when a slot was actually taken and must be released if the scan does not complete. */
  held: boolean;
}

/**
 * Takes one of the network's daily slots *before* any model call. Increment-then-check, in one
 * statement, so a burst of parallel requests each get a distinct count rather than all reading
 * the same stale number. Over the cap, the increment is handed straight back.
 *
 * Fails open: this is an abuse brake, and a missing table or a D1 hiccup must not stop real
 * users from scanning.
 */
export async function claimIpSlot(
  db: D1Database,
  ipHash: string,
  dayKey: string,
  limit: number
): Promise<IpSlot> {
  try {
    const row = await db
      .prepare(
        `INSERT INTO ip_usage (ip_hash, day_key, used_count) VALUES (?, ?, 1)
         ON CONFLICT(ip_hash, day_key) DO UPDATE SET used_count = used_count + 1
         RETURNING used_count`
      )
      .bind(ipHash, dayKey)
      .first<{ used_count: number }>();
    const count = row?.used_count ?? 1;
    if (count > limit) {
      await releaseIpSlot(db, ipHash, dayKey);
      return { ok: false, held: false };
    }
    return { ok: true, held: true };
  } catch (e) {
    console.warn('ip_usage unavailable, skipping network cap:', e instanceof Error ? e.message : e);
    return { ok: true, held: false };
  }
}

/** Gives a slot back when the scan it was taken for did not complete (or was never charged). */
export async function releaseIpSlot(db: D1Database, ipHash: string, dayKey: string): Promise<void> {
  try {
    await db
      .prepare(
        'UPDATE ip_usage SET used_count = MAX(used_count - 1, 0) WHERE ip_hash = ? AND day_key = ?'
      )
      .bind(ipHash, dayKey)
      .run();
  } catch {
    // Worst case the network loses one slot for the day.
  }
}

export interface ReserveResult {
  ok: boolean;
  blockedBy: 'daily' | 'monthly' | null;
  dayUsed: number;
  monthUsed: number;
  alreadyCommitted?: boolean;
  /**
   * Blocked only because other scans for this install are still in flight, not because the
   * allowance is spent. The caller should say "try again in a moment", not "daily limit".
   */
  busy?: boolean;
}

export async function checkAndReserve(
  db: D1Database,
  hash: string,
  idempotencyKey: string,
  isPro: boolean,
  now: number = Date.now()
): Promise<ReserveResult> {
  const { dayKey, monthKey } = getUtcKeys(now);

  // Check idempotency first
  const existing = await db
    .prepare('SELECT status, expires_at FROM reservations WHERE idempotency_key = ?')
    .bind(idempotencyKey)
    .first<{ status: string; expires_at: number }>();

  if (existing) {
    if (existing.status === 'committed') {
      const usage = isPro ? { dayUsed: 0, monthUsed: 0 } : await getUsage(db, hash, dayKey, monthKey);
      return { ok: true, blockedBy: null, dayUsed: usage.dayUsed, monthUsed: usage.monthUsed, alreadyCommitted: true };
    }
    if (existing.status === 'reserved' && existing.expires_at > now) {
      // Active reservation exists
      const usage = isPro ? { dayUsed: 0, monthUsed: 0 } : await getUsage(db, hash, dayKey, monthKey);
      return { ok: true, blockedBy: null, dayUsed: usage.dayUsed, monthUsed: usage.monthUsed };
    }
  }

  // Pro users bypass quota entirely and don't consume quota
  if (isPro) {
    await db
      .prepare(
        'INSERT OR REPLACE INTO reservations (idempotency_key, installation_hash, day_key, month_key, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(idempotencyKey, hash, dayKey, monthKey, now, now + RESERVATION_TTL_MS, 'reserved')
      .run();

    return { ok: true, blockedBy: null, dayUsed: 0, monthUsed: 0 };
  }

  // Free users: check current counts
  const usage = await getUsage(db, hash, dayKey, monthKey);

  if (usage.dayUsed >= FREE_DAILY_LIMIT) {
    return { ok: false, blockedBy: 'daily', dayUsed: usage.dayUsed, monthUsed: usage.monthUsed };
  }

  if (usage.monthUsed >= FREE_MONTHLY_LIMIT) {
    return { ok: false, blockedBy: 'monthly', dayUsed: usage.dayUsed, monthUsed: usage.monthUsed };
  }

  // Insert first, then count: two parallel requests each see the other's reservation, so the
  // limit holds even though D1 gives us no cross-statement transaction. The failure mode is
  // over-blocking (both are turned away as "busy" and the user simply scans again), never
  // letting extras through.
  await db
    .prepare(
      'INSERT OR REPLACE INTO reservations (idempotency_key, installation_hash, day_key, month_key, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(idempotencyKey, hash, dayKey, monthKey, now, now + RESERVATION_TTL_MS, 'reserved')
    .run();

  const inFlight = await countActiveReservations(db, hash, dayKey, now);
  if (usage.dayUsed + inFlight > FREE_DAILY_LIMIT || usage.monthUsed + inFlight > FREE_MONTHLY_LIMIT) {
    await rollbackReservation(db, idempotencyKey);
    // This scan alone would have fit; it only lost because of the others in flight.
    return { ok: false, blockedBy: null, dayUsed: usage.dayUsed, monthUsed: usage.monthUsed, busy: true };
  }

  return { ok: true, blockedBy: null, dayUsed: usage.dayUsed, monthUsed: usage.monthUsed };
}

export async function commitReservation(
  db: D1Database,
  idempotencyKey: string,
  isPro: boolean,
  now: number = Date.now(),
  meta?: { hash?: string; dayKey?: string; monthKey?: string }
): Promise<void> {
  let installationHash = meta?.hash;
  let dayKey = meta?.dayKey;
  let monthKey = meta?.monthKey;

  if (!installationHash || !dayKey || !monthKey) {
    const res = await db
      .prepare('SELECT installation_hash, day_key, month_key, status FROM reservations WHERE idempotency_key = ?')
      .bind(idempotencyKey)
      .first<{ installation_hash: string; day_key: string; month_key: string; status: string }>();

    if (!res || res.status !== 'reserved') return;
    installationHash = res.installation_hash;
    dayKey = res.day_key;
    monthKey = res.month_key;
  }

  // Atomically update reservation ONLY if it is currently 'reserved'.
  // If another concurrent request already committed or rolled it back, changes will be 0.
  const updateRes = await db
    .prepare("UPDATE reservations SET status = 'committed' WHERE idempotency_key = ? AND status = 'reserved'")
    .bind(idempotencyKey)
    .run();

  if (!updateRes.meta?.changes) {
    return;
  }

  if (!isPro && installationHash && dayKey && monthKey) {
    const stmts: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO quota_usage (installation_hash, period_type, period_key, used_count, updated_at)
           VALUES (?, 'day', ?, 1, ?)
           ON CONFLICT(installation_hash, period_type, period_key)
           DO UPDATE SET used_count = used_count + 1, updated_at = excluded.updated_at`
        )
        .bind(installationHash, dayKey, now),
      db
        .prepare(
          `INSERT INTO quota_usage (installation_hash, period_type, period_key, used_count, updated_at)
           VALUES (?, 'month', ?, 1, ?)
           ON CONFLICT(installation_hash, period_type, period_key)
           DO UPDATE SET used_count = used_count + 1, updated_at = excluded.updated_at`
        )
        .bind(installationHash, monthKey, now),
    ];
    await db.batch(stmts);
  }
}

export async function rollbackReservation(db: D1Database, idempotencyKey: string): Promise<void> {
  await db
    .prepare("UPDATE reservations SET status = 'rolled_back' WHERE idempotency_key = ? AND status = 'reserved'")
    .bind(idempotencyKey)
    .run();
}
