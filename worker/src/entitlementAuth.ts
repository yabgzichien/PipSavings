// worker/src/entitlementAuth.ts
// Server-side Pro check. The Worker must never trust a client `x-entitlement` header.
import type { D1Database } from './quota';

export const PRO_ENTITLEMENT_ID = 'pip_pro';

/** A positive answer is reused this long, so a busy minute does not become a RevenueCat call per scan. */
export const PRO_CACHE_FRESH_MS = 5 * 60 * 1000;
/**
 * When RevenueCat cannot be reached, a customer it confirmed as Pro within this window is still
 * treated as Pro. Only ever generous to a customer we already verified; unknown or free callers
 * still fail closed.
 */
export const PRO_CACHE_STALE_OK_MS = 24 * 60 * 60 * 1000;

interface LookupArgs {
  appUserId: string | null | undefined;
  secretKey: string | undefined;
  projectId: string | undefined;
  entitlementId?: string;
  fetchImpl?: typeof fetch;
}

/** true / false when RevenueCat answered; null when it could not be asked or did not answer. */
export async function lookupRevenueCatPro(args: LookupArgs): Promise<boolean | null> {
  const appUserId = args.appUserId?.trim();
  const secretKey = args.secretKey?.trim();
  const projectId = args.projectId?.trim();
  const entitlementId = args.entitlementId?.trim() || PRO_ENTITLEMENT_ID;
  if (!appUserId || !secretKey || !projectId) return false;

  const url =
    `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}` +
    `/customers/${encodeURIComponent(appUserId)}/active_entitlements`;

  try {
    const fetchImpl = args.fetchImpl ?? fetch;
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    // A customer RevenueCat has never heard of is simply not Pro. Anything else non-2xx
    // (429, 5xx) says nothing about the customer.
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: Array<{ entitlement_id?: string }> };
    return (data.items ?? []).some((item) => item.entitlement_id === entitlementId);
  } catch {
    return null;
  }
}

export async function hasRevenueCatPro(args: LookupArgs): Promise<boolean> {
  return (await lookupRevenueCatPro(args)) === true;
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * `hasRevenueCatPro` with a small D1-backed memory. Raw customer ids are never stored.
 * Free answers are not cached: someone who just paid must be recognised on their next scan.
 */
export async function resolveRevenueCatPro(
  db: D1Database,
  args: LookupArgs,
  now: number = Date.now()
): Promise<boolean> {
  const appUserId = args.appUserId?.trim();
  if (!appUserId || !args.secretKey?.trim() || !args.projectId?.trim()) return false;

  const key = await sha256Hex(`rc:${appUserId}`);
  let cached: { is_pro: number; checked_at: number } | null = null;
  try {
    cached = await db
      .prepare('SELECT is_pro, checked_at FROM entitlement_cache WHERE app_user_hash = ?')
      .bind(key)
      .first<{ is_pro: number; checked_at: number }>();
  } catch {
    cached = null;
  }

  if (cached?.is_pro === 1 && now - cached.checked_at < PRO_CACHE_FRESH_MS) return true;

  const live = await lookupRevenueCatPro(args);
  if (live === true) {
    try {
      await db
        .prepare(
          `INSERT INTO entitlement_cache (app_user_hash, is_pro, checked_at) VALUES (?, 1, ?)
           ON CONFLICT(app_user_hash) DO UPDATE SET is_pro = 1, checked_at = excluded.checked_at`
        )
        .bind(key, now)
        .run();
    } catch {
      // The cache is an optimisation; a failed write must not turn a paying user away.
    }
    return true;
  }
  if (live === false) {
    if (cached) {
      try {
        await db.prepare('DELETE FROM entitlement_cache WHERE app_user_hash = ?').bind(key).run();
      } catch {
        // see above
      }
    }
    return false;
  }

  // RevenueCat did not answer. Honour a recent confirmation, otherwise fail closed.
  return cached?.is_pro === 1 && now - cached.checked_at < PRO_CACHE_STALE_OK_MS;
}
