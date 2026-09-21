/** Meta keys for “last seen” % so the home/calendar bars only count up when the day (hence %) changed. */
export const MONTH_PROGRESS_SEEN_KEY = 'timeProgress.lastMonthPct';
export const YEAR_PROGRESS_SEEN_KEY = 'timeProgress.lastYearPct';

/** Home month caption: days left stays fixed; % may animate separately in the UI. */
export function monthProgressCaption(daysLeft: number, pct: number, isZh: boolean): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return isZh ? `还剩 ${daysLeft} 天 · ${p}%` : `${daysLeft} days left · ${p}%`;
}

/** Calendar year caption under the year title. */
export function yearProgressCaption(daysLeft: number, pct: number, isZh: boolean): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return isZh ? `${p}% · 还剩 ${daysLeft} 天` : `${p}% · ${daysLeft} days left`;
}

/**
 * Whether the fill + % count-up should play. Animate when we have never stored a value,
 * or when the stored % differs from today's (typically a new calendar day).
 */
export function shouldAnimateTimeProgress(lastSeenPct: number | null, currentPct: number): boolean {
  if (lastSeenPct === null || Number.isNaN(lastSeenPct)) return true;
  return lastSeenPct !== currentPct;
}

export function parseSeenPct(raw: string | null): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
