// src/billing/scanQuota.ts
// Quota constants and allowance normalizer for the freemium AI scan allowance.
// Free: 20 successful scans per UTC calendar month, up to 3 per UTC calendar day.
// Pro: Unlimited with no product daily or monthly quota.

export const FREE_MONTHLY_SCANS = 20;
export const FREE_DAILY_SCANS = 3;

export interface ScanAllowance {
  tier: 'free' | 'pro';
  monthUsed: number;
  monthLimit: number; // 20 or Infinity in the client representation
  dayUsed: number;
  dayLimit: number;   // 3 or Infinity in the client representation
  canScan: boolean;
  blockedBy: 'daily' | 'monthly' | null;
}

export function normalizeAllowance(raw: any): ScanAllowance {
  const tier: 'free' | 'pro' = raw?.tier === 'pro' ? 'pro' : 'free';
  const isPro = tier === 'pro';
  const monthLimit = isPro ? Number.POSITIVE_INFINITY : FREE_MONTHLY_SCANS;
  const dayLimit = isPro ? Number.POSITIVE_INFINITY : FREE_DAILY_SCANS;
  const monthUsed = typeof raw?.monthUsed === 'number' && Number.isFinite(raw.monthUsed) ? Math.max(0, raw.monthUsed) : 0;
  const dayUsed = typeof raw?.dayUsed === 'number' && Number.isFinite(raw.dayUsed) ? Math.max(0, raw.dayUsed) : 0;

  let blockedBy: 'daily' | 'monthly' | null = null;
  let canScan = true;

  if (!isPro) {
    if (dayUsed >= dayLimit) {
      blockedBy = 'daily';
      canScan = false;
    } else if (monthUsed >= monthLimit) {
      blockedBy = 'monthly';
      canScan = false;
    }
  }

  return {
    tier,
    monthUsed,
    monthLimit,
    dayUsed,
    dayLimit,
    canScan,
    blockedBy,
  };
}

export function computeCanScan(opts: {
  isPro: boolean;
  hasByok: boolean;
  monthRemaining: number;
  dailyRemaining: number;
}): boolean {
  if (opts.isPro || opts.hasByok) return true;
  return opts.monthRemaining > 0 && opts.dailyRemaining > 0;
}

export function byokAllowance(tier: 'free' | 'pro'): ScanAllowance {
  return {
    tier,
    monthUsed: 0,
    monthLimit: Number.POSITIVE_INFINITY,
    dayUsed: 0,
    dayLimit: Number.POSITIVE_INFINITY,
    canScan: true,
    blockedBy: null,
  };
}
