import { decimalsFor } from './currencies';

/**
 * Format a number with thousands separators at a given number of decimal places.
 * Implemented manually rather than via Intl to avoid locale-data gaps in Hermes.
 */
export function fmtDecimals(n: number, decimals: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + grouped + (decPart ? '.' + decPart : '');
}

/**
 * Format a number as a 2-decimal amount with thousands separators,
 * e.g. 2000 -> "2,000.00".
 */
export function fmt(n: number): string {
  return fmtDecimals(n, 2);
}

function trimTrailingZeros(s: string): string {
  return s.replace(/\.?0+$/, '');
}

/**
 * Like `fmt`, but abbreviates very large amounts (K from 100,000, M from 1,000,000) so a hero
 * number stays a hero number instead of overflowing its card. Ordinary transaction/budget/net
 * worth figures (well under 100K) are untouched — this only matters for the rare very-large
 * input, not everyday amounts.
 */
export function fmtCompact(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const negative = value < 0;
  const abs = Math.abs(value);
  const sign = negative ? '-' : '';

  if (abs < 100_000) return fmt(value);

  const asM = abs / 1_000_000;
  if (asM >= 1) return `${sign}${trimTrailingZeros(asM.toFixed(1))}M`;

  // Rounding a value just under 1,000,000 to one decimal of "K" can itself round up to
  // "1000.0K"  bump to M in that case rather than printing four zeros past the decimal point.
  const asK = abs / 1_000;
  if (Number(asK.toFixed(1)) >= 1000) return `${sign}${trimTrailingZeros(asM.toFixed(1))}M`;
  return `${sign}${trimTrailingZeros(asK.toFixed(1))}K`;
}

/**
 * Format a compact amount for small calendar cells.
 * - For 0: returns empty string.
 * - For values >= 1000: abbreviates to K (e.g. 1500 → "1.5K", 1000 → "1K").
 * - For fractional amounts in currencies that support decimals: shows formatted decimals (e.g. 23.5 → "23.50").
 * - For whole numbers (or 0-subunit currencies like JPY): keeps clean integers (e.g. 20 → "20").
 */
export function compactAmt(n: number, currencyCode?: string): string {
  if (n === 0) return '';
  if (n >= 1000) {
    const asK = n / 1000;
    return `${trimTrailingZeros(asK.toFixed(1))}K`;
  }

  const decimals = currencyCode ? decimalsFor(currencyCode) : 2;
  if (decimals > 0) {
    const rounded = Number(n.toFixed(decimals));
    if (Math.abs(rounded - Math.round(rounded)) > 1e-4) {
      return rounded.toFixed(decimals);
    }
  }
  return String(Math.round(n));
}

/**
 * The prefix a currency renders under. MYR keeps the local "RM" convention; everything else
 * uses the 3-letter code, because symbols are ambiguous (the yen sign covers both JPY and
 * CNY) and Hermes has patchy symbol font coverage.
 *
 * This exists so the literal "RM" lives in exactly one place. Every UI that needs a bare
 * currency label without a number beside it — a segmented toggle, a standalone prefix glyph
 * next to an input field — must call this rather than hardcoding 'RM', which is precisely
 * how those labels came to ignore the user's chosen display currency.
 */
export function currencyPrefix(currency: string): string {
  return currency === 'MYR' ? 'RM' : currency;
}

/**
 * Format an amount with its currency prefix, e.g. "RM 1,200.00" or "SGD 340.50".
 */
export function fmtMoney(amount: number, currency: string): string {
  return `${currencyPrefix(currency)} ${fmtDecimals(amount, decimalsFor(currency))}`;
}

/** Currency-aware money formatting that abbreviates values from 100K without losing the prefix. */
export function fmtCompactMoney(amount: number, currency: string): string {
  if (Math.abs(amount) < 100_000) return fmtMoney(amount, currency);
  return `${currencyPrefix(currency)} ${fmtCompact(amount)}`;
}

/**
 * "RM 3,200.00 · USD 450.00" — a per-currency breakdown line. Renders in the object's own
 * key order, which callers (`nativeAccountTotalsByCurrency`, `nativeTransactionTotalsByCurrency`)
 * already guarantee puts MYR first.
 */
export function formatCurrencyBreakdown(totals: Record<string, number>): string {
  return Object.entries(totals)
    .map(([code, amount]) => fmtMoney(amount, code))
    .join(' · ');
}

/**
 * "Read in 6 seconds" — the Saved screen's payoff line (docs/ui-engagement-plan.md Step 2).
 * Rounds to the nearest second and floors at 1: a sub-second extraction reading "0 seconds"
 * would undercut the claim it's making rather than support it. An honest 22 beats a rounded 6.
 */
export function readTimeLabel(elapsedMs: number): string {
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  return `Read in ${seconds} second${seconds === 1 ? '' : 's'}`;
}
