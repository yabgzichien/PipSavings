// src/lib/parseReceipt.ts
// Defensive parser for the "read this paper receipt" reply. Pure and tested: the model is
// asked for printed AMOUNTS (which is what a receipt actually shows), and the surcharge
// percentages the split sheet edits are derived back out of them here.
import { BASE_CURRENCY, normalizeCurrency } from './currency';
import { DEFAULT_SURCHARGES, type DiscountTiming, type Surcharges } from './split';

export interface ScannedItem {
  label: string;
  /** The line total, quantity already multiplied in. */
  amount: number;
  quantity: number | null;
}

/** A voucher or discount the receipt printed, read as the amount actually taken off. */
export interface ScannedDiscount {
  amount: number;
  /** Where on the receipt it applied: before or after service charge and tax. */
  timing: DiscountTiming;
}

export interface ScannedReceipt {
  merchant: string | null;
  /** 3-letter code every amount on this receipt is denominated in, normalised so it is
   *  never a bad/unrecognised code. One receipt has one currency, so this lives at the
   *  receipt level rather than per item. */
  currency: string;
  items: ScannedItem[];
  subtotal: number | null;
  serviceCharge: number | null;
  tax: number | null;
  total: number | null;
  discount: ScannedDiscount | null;
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}

/** A plain number out of a number or a "RM 1,234.50" string, or null. Keeps a leading minus. */
function coerceAmount(raw: unknown): number | null {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string') {
    const negative = /-/.test(raw.trim().charAt(0)) || /^\(.*\)$/.test(raw.trim());
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (!/[0-9]/.test(cleaned)) return null;
    n = Number(cleaned) * (negative ? -1 : 1);
  } else {
    return null;
  }
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function coerceLabel(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 60) : fallback;
}

function coerceQuantity(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A discount only counts if it has a readable amount; an unreadable timing defaults to 'before'
 *  since that is the far more common placement, and a guess there beats dropping the discount. */
function coerceDiscount(raw: unknown): ScannedDiscount | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const amount = coerceAmount(r.amount);
  if (amount === null || amount <= 0) return null;
  const timing: DiscountTiming = r.timing === 'after' ? 'after' : 'before';
  return { amount, timing };
}

const EMPTY: ScannedReceipt = {
  merchant: null,
  currency: BASE_CURRENCY,
  items: [],
  subtotal: null,
  serviceCharge: null,
  tax: null,
  total: null,
  discount: null,
};

export function parseReceipt(content: string): ScannedReceipt {
  const cleaned = stripFences(content).trim();
  if (!cleaned) return EMPTY;
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return EMPTY;
  }
  if (!data || typeof data !== 'object') return EMPTY;
  const o = data as Record<string, unknown>;

  const rows = Array.isArray(o.items) ? o.items : [];
  const items: ScannedItem[] = [];
  rows.forEach((row, i) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    const amount = coerceAmount(r.amount);
    if (amount === null || amount === 0) return; // a row with no readable price cannot be assigned to anyone
    items.push({ label: coerceLabel(r.label, `Item ${i + 1}`), amount, quantity: coerceQuantity(r.quantity) });
  });

  return {
    merchant: typeof o.merchant === 'string' && o.merchant.trim() ? o.merchant.trim() : null,
    currency: normalizeCurrency(o.currency),
    items,
    subtotal: coerceAmount(o.subtotal),
    serviceCharge: coerceAmount(o.serviceCharge),
    tax: coerceAmount(o.tax),
    total: coerceAmount(o.total),
    discount: coerceDiscount(o.discount),
  };
}

/** The items subtotal: what the receipt printed if it did, otherwise the lines added up. */
export function receiptSubtotal(receipt: ScannedReceipt): number {
  if (receipt.subtotal !== null && receipt.subtotal > 0) return receipt.subtotal;
  return Math.round(receipt.items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
}

/**
 * Back out the percentages the split sheet edits from the amounts the receipt printed.
 *
 * Service charge is read against the base and tax against base-plus-service, matching the
 * order the receipt itself computes them in. A receipt that printed neither falls back to
 * ZERO rather than the 10/6 convention: inventing a charge the paper never showed would
 * silently inflate what everyone at the table owes. The defaults are offered in the UI as a
 * toggle instead, which is a choice the user can see.
 *
 * The base is the printed subtotal MINUS a 'before' voucher, because a voucher applied at
 * the till was already off when the register computed service and tax. Dividing by the full
 * subtotal instead understates both percentages, and `computeItemizedTotalCents` in
 * lib/split.ts then subtracts the same voucher a second time before applying them — so the
 * itemised total lands short of what the card was actually charged and the gap surfaces as a
 * phantom "difference", which gets shared equally rather than riding proportionally on what
 * each person ordered. An 'after' discount is a line printed below the tax, so there the
 * subtotal really is the base and nothing is subtracted here.
 *
 * Percentages are snapped to a whole number when they land within a rounding cent of one, so
 * the usual 10% and 6% come back as "10" and "6" instead of "9.97".
 */
export function derivedSurcharges(receipt: ScannedReceipt): Surcharges {
  const discount: Surcharges['discount'] = receipt.discount
    ? { unit: 'amount', value: receipt.discount.amount, timing: receipt.discount.timing }
    : null;

  const subtotal = receiptSubtotal(receipt);
  const base =
    receipt.discount && receipt.discount.timing === 'before'
      ? Math.round((subtotal - receipt.discount.amount) * 100) / 100
      : subtotal;
  // A voucher that swallowed the whole bill leaves nothing to read a percentage against.
  if (base <= 0) return { serviceChargePct: 0, taxPct: 0, discount };

  const service = receipt.serviceCharge ?? 0;
  const tax = receipt.tax ?? 0;
  const serviceChargePct = service > 0 ? snap((service / base) * 100) : 0;
  const taxBase = base + service;
  const taxPct = tax > 0 && taxBase > 0 ? snap((tax / taxBase) * 100) : 0;
  return { serviceChargePct, taxPct, discount };
}

/** Round to one decimal, then to a whole number when that is within 0.15 of it. */
function snap(pct: number): number {
  const whole = Math.round(pct);
  if (Math.abs(pct - whole) <= 0.15) return whole;
  return Math.round(pct * 10) / 10;
}

export { DEFAULT_SURCHARGES };
