// worker/src/grants.ts
import type { D1Database } from './quota';

export type GrantKind = 'lifetime' | 'timed';
export type GrantSource = 'promo' | 'referral';

export interface ActiveGrant {
  kind: GrantKind;
  expiresAt: number | null;
  source: GrantSource;
}

export interface PromoCodeRow {
  code: string;
  grant_kind: GrantKind;
  duration_days: number | null;
  max_redemptions: number;
  redemption_count: number;
  disabled: number;
}

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isGrantActive(
  grant: { grant_kind: string; expires_at: number | null } | null | undefined,
  now: number
): boolean {
  if (!grant) return false;
  if (grant.grant_kind === 'lifetime') return true;
  return typeof grant.expires_at === 'number' && grant.expires_at > now;
}

export async function getActiveGrant(
  db: D1Database,
  installationHash: string,
  now: number = Date.now()
): Promise<ActiveGrant | null> {
  const row = await db
    .prepare(
      'SELECT source, grant_kind, expires_at FROM entitlement_grants WHERE installation_hash = ?'
    )
    .bind(installationHash)
    .first<{ source: GrantSource; grant_kind: GrantKind; expires_at: number | null }>();

  if (!isGrantActive(row, now) || !row) return null;
  return {
    kind: row.grant_kind,
    expiresAt: row.expires_at,
    source: row.source,
  };
}

export type RedeemError = 'invalid' | 'disabled' | 'already_used' | 'already_granted';

export type RedeemResult =
  | { ok: true; grant: ActiveGrant }
  | { ok: false; error: RedeemError };

export async function redeemPromoCode(
  db: D1Database,
  installationHash: string,
  rawCode: string,
  now: number = Date.now()
): Promise<RedeemResult> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { ok: false, error: 'invalid' };

  const existing = await getActiveGrant(db, installationHash, now);
  if (existing) return { ok: false, error: 'already_granted' };

  const promo = await db
    .prepare(
      `SELECT code, grant_kind, duration_days, max_redemptions, redemption_count, disabled
       FROM promo_codes WHERE code = ?`
    )
    .bind(code)
    .first<PromoCodeRow>();

  if (!promo) return { ok: false, error: 'invalid' };
  if (promo.disabled) return { ok: false, error: 'disabled' };
  if (promo.redemption_count >= promo.max_redemptions) return { ok: false, error: 'already_used' };

  const grantKind: GrantKind = promo.grant_kind === 'timed' ? 'timed' : 'lifetime';
  const expiresAt =
    grantKind === 'timed' && typeof promo.duration_days === 'number'
      ? now + promo.duration_days * 24 * 60 * 60 * 1000
      : null;

  const consume = await db
    .prepare(
      `UPDATE promo_codes
       SET redemption_count = redemption_count + 1
       WHERE code = ? AND disabled = 0 AND redemption_count < max_redemptions`
    )
    .bind(code)
    .run();

  if ((consume.meta?.changes ?? 0) !== 1) {
    return { ok: false, error: 'already_used' };
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO entitlement_grants
        (installation_hash, source, grant_kind, expires_at, code, referrer_installation_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(installationHash, 'promo', grantKind, expiresAt, code, null, now, now)
    .run();

  return {
    ok: true,
    grant: { kind: grantKind, expiresAt, source: 'promo' },
  };
}
