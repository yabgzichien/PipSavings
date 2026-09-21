import type { ExtractedTxn } from './types';

const WEEKDAYS =['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  // Morning 06:00–11:59 · Afternoon 12:00–17:59 · Evening 18:00–05:59
  if (h >= 6 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** e.g. "Tuesday · 1 June" */
export function longDate(d: Date = new Date()): string {
  return `${WEEKDAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** e.g. "1 Jun"; accepts ISO date or datetime, empty string on bad input. */
export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** e.g. "1 Jun 2026"; accepts ISO date or datetime, empty string on bad input. */
export function fullDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** e.g. "Monday, 1 Jun 2026"; accepts ISO date or datetime, empty string on bad input. */
export function fullDateWithWeekday(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Strict `YYYY-MM-DD` matcher  the only date-string shape this module rewrites. */
export const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True if `s` is a strict `YYYY-MM-DD` string AND a *genuinely* valid calendar date 
 * not just something `Date` parses via silent rollover (e.g. `new Date('2026-13-45')`
 * doesn't throw or produce `Invalid Date`, it rolls over to 2027-02-14). We guard
 * against that by round-tripping: construct the UTC date from the captured numbers
 * and verify the components survive unchanged.
 */
export function isValidIsoDate(s: string | null | undefined): boolean {
  if (!s) return false;
  const m = s.match(ISO_DATE_RE);
  if (!m) return false;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/** Pull the 4-digit year out of a strict, *genuinely valid* `YYYY-MM-DD` string, or null. */
function yearOf(iso: string | null): number | null {
  if (!iso || !isValidIsoDate(iso)) return null;
  const m = iso.match(ISO_DATE_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** Replace the year component of a strict `YYYY-MM-DD` string, keeping month/day. */
function withYear(iso: string, year: number): string {
  return `${String(year).padStart(4, '0')}${iso.slice(4)}`;
}

/**
 * Apply a user's edit to one transaction's date, with year-propagation:
 * receipts/screenshots are almost always one statement period, so if the user
 * corrects the *year* of one item, that correction is very likely true for the
 * whole batch  apply the new year (month/day untouched) to every other item
 * that has a parseable date.
 *
 * - The edited item gets `newDate` verbatim (year, month, day all replaced).
 * - Propagation only fires when the edited item's *original* date was a
 *   parseable `YYYY-MM-DD` string AND `newDate` is also parseable AND the
 *   year actually changed  with no original year, there's nothing to "change".
 * - Items with `date: null` or unparseable dates are left as-is (nothing to rewrite).
 * - Returns a new array; does not mutate `items`.
 */
export function applyDateEdit(items: ExtractedTxn[], editedIndex: number, newDate: string | null): ExtractedTxn[] {
  const original = items[editedIndex];
  const next = items.map((it, i) => (i === editedIndex ? { ...it, date: newDate } : { ...it }));

  const oldYear = original ? yearOf(original.date) : null;
  const newYear = yearOf(newDate);
  if (oldYear === null || newYear === null || oldYear === newYear) return next;

  for (let i = 0; i < next.length; i++) {
    if (i === editedIndex) continue;
    const d = next[i].date;
    if (d && isValidIsoDate(d)) {
      next[i] = { ...next[i], date: withYear(d, newYear) };
    }
  }
  return next;
}

/** True if the ISO date/datetime falls in the same calendar month as `now`. */
export function isThisMonth(iso?: string | null, now: Date = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** Current month name, e.g. "June". */
export function monthName(now: Date = new Date()): string {
  return MONTHS[now.getMonth()];
}

/** Days remaining in the current calendar month, today counted as remaining (1..31). */
export function daysLeftInMonth(now: Date = new Date()): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate() + 1;
}

/** Number of days in the calendar month of `now`. */
export function daysInMonth(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/**
 * How far through the current calendar month we are, as an integer 0–100.
 * Uses day-of-month / days-in-month (today counts as elapsed). Last day is always 100,
 * matching "no days left after today" completeness even though `daysLeftInMonth` is still 1.
 */
export function monthProgressPct(now: Date = new Date()): number {
  const total = daysInMonth(now);
  const day = now.getDate();
  if (day >= total || daysLeftInMonth(now) <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((day / total) * 100)));
}

/** True if `year` is a Gregorian leap year. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in the calendar year of `now` (365 or 366). */
export function daysInYear(now: Date = new Date()): number {
  return isLeapYear(now.getFullYear()) ? 366 : 365;
}

/** 1-based day of year for `now` (Jan 1 → 1). */
export function dayOfYear(now: Date = new Date()): number {
  const start = Date.UTC(now.getFullYear(), 0, 1);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - start) / 86400000) + 1;
}

/** Days remaining in the calendar year, today counted as remaining (1..366). */
export function daysLeftInYear(now: Date = new Date()): number {
  return daysInYear(now) - dayOfYear(now) + 1;
}

/**
 * How far through the current calendar year we are, as an integer 0–100.
 * Same inclusive-today rule as `monthProgressPct`; Dec 31 is always 100.
 */
export function yearProgressPct(now: Date = new Date()): number {
  const total = daysInYear(now);
  const day = dayOfYear(now);
  if (day >= total || daysLeftInYear(now) <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((day / total) * 100)));
}

/** A 'YYYY-MM' key as a readable label, e.g. "June 2026" (full=false → "Jun 2026"). */
export function monthLabel(monthKey: string, full = true): string {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthKey;
  const year = m[1];
  const idx = parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) return monthKey;
  return full ? `${MONTHS[idx]} ${year}` : `${MONTHS_SHORT[idx]} ${year}`;
}

/** Add `months` calendar months to an ISO 'YYYY-MM-DD' date, clamping to the target month's
 *  last day (handles e.g. Jan 31 + 1mo -> Feb 28). Shared by the loan repayment scheduler and
 *  the recurring-commitment occurrence generator so month-end clamping stays in one place. */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDayOfTargetMonth));
  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const ZH_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** Format date for recurring timeline headers: e.g. "Tomorrow SEP 1", "Wednesday SEP 2", "Saturday SEP 19" */
export function formatTimelineDateHeader(dueDate: string, today: string, isZh = false): string {
  const [y, m, d] = dueDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  if (!y || !m || !d) return dueDate;

  const dueUTC = Date.UTC(y, m - 1, d);
  const todayUTC = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.round((dueUTC - todayUTC) / 86400000);
  const dateObj = new Date(dueUTC);
  const dayOfWeek = dateObj.getUTCDay();
  const monthShort = MONTHS_SHORT[m - 1] ? MONTHS_SHORT[m - 1].toUpperCase() : '';

  if (isZh) {
    if (diffDays === 0) return `今天 ${m}月${d}日`;
    if (diffDays === 1) return `明天 ${m}月${d}日`;
    if (diffDays === -1) return `昨天 ${m}月${d}日`;
    return `周${ZH_WEEKDAYS[dayOfWeek]} ${m}月${d}日`;
  }

  if (diffDays === 0) return `Today ${monthShort} ${d}`;
  if (diffDays === 1) return `Tomorrow ${monthShort} ${d}`;
  if (diffDays === -1) return `Yesterday ${monthShort} ${d}`;
  return `${WEEKDAYS[dayOfWeek]} ${monthShort} ${d}`;
}
