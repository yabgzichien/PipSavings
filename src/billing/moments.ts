// src/billing/moments.ts
// One-shot upgrade prompts tied to moments where the user has just succeeded at something.
// Cards are limited to approved post-success moments. Onboarding is excluded.
//
// Every moment fires once and never again. That is the whole reason this file exists: without
// it, "prompt on a 7-day streak" would fire every seventh day forever.
import { getMeta, setMeta } from '../db/metaRepo';

export const MOMENT_KEYS = 'upsell_moments';
export const RELIEF_THRESHOLD_MYR = 1000;

export type UpsellMoment = 'first_scan' | 'streak_7' | 'relief_threshold';

export function hasFired(seen: string[], moment: UpsellMoment): boolean {
  return seen.includes(moment);
}

export function markFired(seen: string[], moment: UpsellMoment): string[] {
  return seen.includes(moment) ? seen : [...seen, moment];
}

export function reliefThresholdCrossed(totalMyr: number): boolean {
  return totalMyr >= RELIEF_THRESHOLD_MYR;
}

export async function readMoments(): Promise<string[]> {
  const raw = await getMeta(MOMENT_KEYS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function fireOnce(moment: UpsellMoment): Promise<boolean> {
  const seen = await readMoments();
  if (hasFired(seen, moment)) return false;
  await setMeta(MOMENT_KEYS, JSON.stringify(markFired(seen, moment)));
  return true;
}

export function getMomentLine(
  moment: UpsellMoment,
  isZh: boolean,
  params?: { reliefAmount?: string | number }
): string {
  if (moment === 'first_scan') {
    return isZh
      ? '首张收据识别成功！升级 Pip Pro 享受每月无限次扫描。'
      : 'First scan sorted! Pip Pro gives you unlimited receipt scans every month.';
  }
  if (moment === 'streak_7') {
    return isZh
      ? '连续记账 7 天！好习惯正在形成，探索 Pip Pro 解锁完整报表与功能。'
      : '7-day streak! Great habit forming. Explore Pip Pro for full financial reports.';
  }
  if (moment === 'relief_threshold') {
    const amount = params?.reliefAmount ?? '1,000';
    return isZh
      ? `今年已记录 RM${amount} 税务减免。使用 Pro 导出完整凭证包。`
      : `You have tracked RM${amount} of relief this year. Export your audit pack with Pro.`;
  }
  return '';
}
