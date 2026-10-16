// src/lib/split.ts
// Pure, deterministic bill-splitting math and settlement matching. No UI/DB imports  unit-tested.
//
// Two invariants hold everywhere in this file:
//   1. Shares always sum to EXACTLY the gross. Anything else and the receivable stops
//      reconciling against what actually left the account.
//   2. The payer absorbs every rounding residue. RM100 across three people is
//      33.33 / 33.33 / 33.34, with the extra cent on the person who fronted the money.
import { round2 } from './currency';
import { damerauLevenshtein } from './categoryKeywords';
import { merchantKey } from './normalize';
import type { ShareStatus, SplitMethod } from './types';

/** Ringgit to whole cents. Every internal calculation runs in cents to dodge float drift. */
export function toCents(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

/** Whole cents back to ringgit. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Convert a native debt amount to MYR at a frozen split FX rate. */
export function receivableMyr(nativeAmount: number, fxRate: number): number {
  return round2(nativeAmount * fxRate);
}

/**
 * Splits `totalCents` across `weights` as whole cents that sum to EXACTLY `totalCents`.
 *
 * Rounding each share independently is what a naive version does, and it silently drifts:
 * three shares each rounding up a third of a cent hands out a cent nobody paid. Assigning
 * against a running cumulative target instead makes the rounding error cancel rather than
 * accumulate, so the total is exact by construction at any number of participants.
 */
export function apportionCents(weights: number[], totalCents: number): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || totalCents <= 0) return weights.map(() => 0);
  const out: number[] = [];
  let cumulative = 0;
  let assigned = 0;
  weights.forEach((w, i) => {
    cumulative += w;
    const target = i === weights.length - 1 ? totalCents : Math.round((totalCents * cumulative) / total);
    out.push(target - assigned);
    assigned = target;
  });
  return out;
}

/**
 * Stands in for the payer wherever people are addressed by id, so the itemiser can hand them
 * a line without needing a `people` row for its own user.
 */
export const SELF = '__self__';

/** One friend at the table. The payer is never in this list; they are `includeSelf`. */
export interface Participant {
  personId: string;
  /** `shares` method: how many portions this person takes. Defaults to 1. */
  weight?: number;
  /** `exact` method: the exact ringgit this person owes. */
  exact?: number;
}

export interface SplitInput {
  /** What actually left the payer's account. */
  gross: number;
  participants: Participant[];
  method: SplitMethod;
  /** False when the payer fronted money for a bill they were not part of (a gift, a group ticket). */
  includeSelf: boolean;
  /** `shares` method: how many portions the payer takes. Defaults to 1. */
  selfWeight?: number;
}

export interface SplitResult {
  /** What the ledger records as the payer's own expense. */
  ownShare: number;
  shares: { personId: string; owed: number }[];
}

/**
 * Divide a bill. The result always satisfies `ownShare + Σ owed === gross`.
 *
 * With the payer in the bill, everyone else is floored to whole cents so no friend is ever
 * asked for more than their arithmetic share, and the payer takes the remainder. With the
 * payer out of it, the friends have to absorb the whole bill between them, so the residue
 * falls on the last participant instead.
 */
export function computeSplit(input: SplitInput): SplitResult {
  const grossCents = Math.max(0, toCents(input.gross));
  const people = input.participants;

  if (input.method === 'exact') {
    const shares = people.map((p) => ({
      personId: p.personId,
      owedCents: Math.max(0, toCents(p.exact ?? 0)),
    }));
    const owedCents = Math.min(
      grossCents,
      shares.reduce((s, x) => s + x.owedCents, 0)
    );
    return {
      ownShare: fromCents(grossCents - owedCents),
      shares: shares.map((x) => ({ personId: x.personId, owed: fromCents(x.owedCents) })),
    };
  }

  const weights = people.map((p) => Math.max(0, Math.round(p.weight ?? 1)));
  const selfWeight = input.includeSelf ? Math.max(0, Math.round(input.selfWeight ?? 1)) : 0;
  const totalWeight = weights.reduce((s, w) => s + w, 0) + selfWeight;

  if (totalWeight <= 0 || grossCents <= 0) {
    return { ownShare: fromCents(grossCents), shares: people.map((p) => ({ personId: p.personId, owed: 0 })) };
  }

  if (selfWeight === 0) {
    const cents = apportionCents(weights, grossCents);
    return {
      ownShare: 0,
      shares: people.map((p, i) => ({ personId: p.personId, owed: fromCents(cents[i]) })),
    };
  }

  const cents = weights.map((w) => Math.floor((grossCents * w) / totalWeight));
  const ownCents = grossCents - cents.reduce((s, c) => s + c, 0);
  return {
    ownShare: fromCents(ownCents),
    shares: people.map((p, i) => ({ personId: p.personId, owed: fromCents(cents[i]) })),
  };
}

/** The per-person portions behind a saved `shares` split, as `computeSplit` would take them. */
export interface RecoveredShares {
  selfWeight: number;
  weights: Record<string, number>;
}

/** Nobody portions a bill 500 ways; past this, the amounts are exact figures, not portions. */
const MAX_RECOVERED_WEIGHT = 500;

/**
 * Recover the per-person portions behind an already-saved `shares` split.
 *
 * A `SplitDraft` (and the `splits` table under it) persists only `{personId, owed}` — there
 * is nowhere for the weights themselves to live. So re-opening a saved split had no portions
 * to restore and fell back to one each, which silently re-cut the bill equally the moment the
 * sheet appeared: a RM120 dinner saved as 30/60/30 redisplayed as 40/40/40, and saving from
 * there wrote those wrong figures to the receivable.
 *
 * The amounts are proportional to the weights, so the ratios are recoverable: divide through
 * by the smallest share and round. What makes that safe rather than a guess is the check at
 * the end — the candidate is only returned if re-running `computeSplit` reproduces the saved
 * amounts to the cent. Anything else (an `exact` split, a manually adjusted one, a ratio too
 * fine to survive cent-rounding) returns null, and the caller shows the saved amounts as
 * exact figures instead of inventing portions that would change them.
 */
export function sharesFromSplit(
  gross: number,
  ownShare: number,
  shares: { personId: string; owed: number }[]
): RecoveredShares | null {
  if (shares.length === 0) return null;

  const ownCents = toCents(ownShare);
  const owedCents = shares.map((s) => toCents(s.owed));
  // A participant owing nothing has no ratio to read, and a weight of 0 is not something the
  // sheet can express anyway (the stepper floors at 1).
  if (owedCents.some((c) => c <= 0)) return null;

  const includeSelf = ownCents > 0;
  const unit = Math.min(...owedCents, includeSelf ? ownCents : Infinity);
  if (unit <= 0) return null;

  const weights = owedCents.map((c) => Math.round(c / unit));
  const selfBase = includeSelf ? Math.round(ownCents / unit) : 0;
  if (weights.some((w) => w < 1 || w > MAX_RECOVERED_WEIGHT)) return null;
  if (selfBase > MAX_RECOVERED_WEIGHT) return null;

  // The payer absorbs every rounding residue (invariant 2 at the top of this file), so their
  // share can read a shade high or low against a clean ratio; the neighbours cover that.
  const candidates = includeSelf ? [selfBase, selfBase - 1, selfBase + 1] : [0];
  for (const selfWeight of candidates) {
    if (includeSelf && selfWeight < 1) continue;
    const replay = computeSplit({
      gross,
      method: 'shares',
      includeSelf,
      selfWeight,
      participants: shares.map((s, i) => ({ personId: s.personId, weight: weights[i] })),
    });
    if (toCents(replay.ownShare) !== ownCents) continue;
    if (replay.shares.some((s, i) => toCents(s.owed) !== owedCents[i])) continue;
    return {
      // With the payer off the bill the weight is unused; report 1 so the sheet's stepper has
      // a legal value to sit on if the user puts themselves back on.
      selfWeight: includeSelf ? selfWeight : 1,
      weights: Object.fromEntries(shares.map((s, i) => [s.personId, weights[i]])),
    };
  }
  return null;
}

/**
 * Why this split cannot be saved, as a sentence the user can act on, or null when it is fine.
 *
 * The `exact` rules differ by whether the payer ate: in the bill, their share is whatever is
 * left over, so the friends' amounts only have to fit inside the gross; out of it, the friends
 * are the whole bill, so their amounts have to land on it exactly.
 */
export function validateSplit(input: SplitInput): string | null {
  if (toCents(input.gross) <= 0) return 'Enter the full bill amount first.';
  if (input.participants.length === 0) return 'Add at least one person to split with.';

  const seen = new Set<string>();
  for (const p of input.participants) {
    if (seen.has(p.personId)) return 'Someone is on this bill twice.';
    seen.add(p.personId);
  }

  if (input.method === 'exact') {
    const grossCents = toCents(input.gross);
    let owedCents = 0;
    for (const p of input.participants) {
      const cents = toCents(p.exact ?? 0);
      if (cents < 0) return 'Amounts cannot be negative.';
      owedCents += cents;
    }
    if (owedCents > grossCents) return 'Those amounts add up to more than the bill.';
    if (!input.includeSelf && owedCents !== grossCents) {
      return "You are not on this bill, so the amounts have to add up to it exactly.";
    }
    return null;
  }

  if (input.method === 'shares') {
    const totalWeight =
      input.participants.reduce((s, p) => s + Math.max(0, Math.round(p.weight ?? 1)), 0) +
      (input.includeSelf ? Math.max(0, Math.round(input.selfWeight ?? 1)) : 0);
    if (totalWeight <= 0) return 'Give at least one person a share.';
  }

  return null;
}

/** What is still owed on a share, in ringgit, never below zero. */
export function outstanding(share: { owed: number; paid: number }): number {
  return fromCents(Math.max(0, toCents(share.owed) - toCents(share.paid)));
}

/** Total open receivable across every share. This is the receivable account's balance. */
export function openReceivableTotal(shares: { owed: number; paid: number; status: ShareStatus }[]): number {
  const cents = shares.reduce(
    (s, share) => (share.status === 'open' ? s + toCents(outstanding(share)) : s),
    0
  );
  return fromCents(cents);
}

/**
 * Apply a repayment to a share. Overpayment is capped at what was owed rather than
 * turning into a negative receivable: a friend who rounds up to a nicer number is
 * making a gift, not lending you money.
 */
export function applyPayment(
  share: { owed: number; paid: number },
  amount: number
): { paid: number; status: ShareStatus } {
  const owedCents = toCents(share.owed);
  const paidCents = Math.min(owedCents, toCents(share.paid) + Math.max(0, toCents(amount)));
  return { paid: fromCents(paidCents), status: paidCents >= owedCents ? 'settled' : 'open' };
}

/* --- Itemised splitting (scan the receipt) -------------------------------- */

/** One printed line on a receipt, and who ate it. */
export interface ReceiptLine {
  id: string;
  label: string;
  /** The line total as printed, before service charge and tax. */
  amount: number;
  /** Person ids (SELF for the payer). Empty means nobody has claimed it yet. */
  assignedTo: string[];
}

/**
 * The two charges a Malaysian restaurant bill adds on top of the items. Order matters:
 * service charge applies to the subtotal, and service tax then applies to the subtotal PLUS
 * the service charge, which is how the receipt itself computes it.
 */
export type DiscountUnit = 'pct' | 'amount';

/**
 * 'before' applies against the items subtotal, ahead of service charge and tax (the usual
 * case for a voucher). 'after' applies against the final total, the way a receipt sometimes
 * prints a discount line below the tax.
 */
export type DiscountTiming = 'before' | 'after';

export interface Discount {
  unit: DiscountUnit;
  /** A ringgit amount when unit is 'amount', a percentage (0-100) when unit is 'pct'. */
  value: number;
  timing: DiscountTiming;
}

export interface Surcharges {
  /** Service charge, conventionally 10%. */
  serviceChargePct: number;
  /** Service tax (SST on F&B), conventionally 6%. */
  taxPct: number;
  /** A voucher or discount, absent when the receipt shows none and nobody has added one. */
  discount?: Discount | null;
}

export const DEFAULT_SURCHARGES: Surcharges = { serviceChargePct: 10, taxPct: 6 };

export interface ItemizedResult {
  ownShare: number;
  shares: { personId: string; owed: number }[];
  /** What the items plus surcharges came to, before reconciling against the bank. */
  computedTotal: number;
  /** charged − computedTotal: a tip, a discount, or a drink added after printing. */
  difference: number;
  /** Lines nobody claimed. They are shared by everyone so the total still reconciles. */
  unassigned: ReceiptLine[];
}

/**
 * The subtotal plus service charge, tax, and a voucher, in cents.
 *
 * A 'before' discount reduces the subtotal first, so service charge and tax land on the
 * discounted base, the way a voucher applied at the till would. An 'after' discount leaves
 * service charge and tax on the full subtotal and comes off the resulting total instead,
 * matching a discount line printed below the tax.
 */
function computeItemizedTotalCents(subtotalCents: number, surcharges: Surcharges): number {
  const discount = surcharges.discount;
  const svcPct = Math.max(0, surcharges.serviceChargePct);
  const taxPct = Math.max(0, surcharges.taxPct);

  if (discount && discount.timing === 'before') {
    const discountCents =
      discount.unit === 'amount' ? toCents(discount.value) : Math.round((subtotalCents * discount.value) / 100);
    const base = Math.max(0, subtotalCents - discountCents);
    const serviceCents = Math.round((base * svcPct) / 100);
    const taxCents = Math.round(((base + serviceCents) * taxPct) / 100);
    return base + serviceCents + taxCents;
  }

  const serviceCents = Math.round((subtotalCents * svcPct) / 100);
  const taxCents = Math.round(((subtotalCents + serviceCents) * taxPct) / 100);
  const rawCents = subtotalCents + serviceCents + taxCents;
  if (!discount) return rawCents;

  const discountCents =
    discount.unit === 'amount' ? toCents(discount.value) : Math.round((rawCents * discount.value) / 100);
  return Math.max(0, rawCents - discountCents);
}

/**
 * Computes the bill total for a set of line items and surcharges in currency units.
 */
export function computeBillTotal(lines: { amount: number }[], surcharges: Surcharges): number {
  const subtotalCents = lines.reduce((s, l) => s + Math.max(0, toCents(l.amount)), 0);
  return fromCents(computeItemizedTotalCents(subtotalCents, surcharges));
}

/**
 * Divide a receipt line by line.
 *
 * Each line is split equally among whoever ate it, then the service charge, tax, and a
 * voucher are allocated in proportion to what each person's items came to. Whatever is left
 * between that and what the bank actually charged becomes a shared line split equally,
 * because the card charge is the only figure that has to reconcile: the ledger is built on
 * what left the account, not on what the paper said.
 *
 * `participants` is the full table with the payer LAST, so every rounding residue lands on
 * the person who fronted the money, exactly as the simpler methods do.
 */
export function computeItemized(
  lines: ReceiptLine[],
  surcharges: Surcharges,
  charged: number,
  participants: string[]
): ItemizedResult {
  const chargedCents = Math.max(0, toCents(charged));
  const people = participants.length > 0 ? participants : [SELF];
  const indexOf: Record<string, number> = {};
  people.forEach((id, i) => (indexOf[id] = i));

  // Per-person item subtotals. A line nobody claimed is everyone's, so the arithmetic still
  // closes rather than quietly dropping the amount.
  const subtotals = people.map(() => 0);
  const unassigned: ReceiptLine[] = [];
  let subtotalCents = 0;

  for (const line of lines) {
    const lineCents = Math.max(0, toCents(line.amount));
    if (lineCents <= 0) continue;
    subtotalCents += lineCents;

    const eaters = line.assignedTo.filter((id) => id in indexOf);
    if (eaters.length === 0) {
      unassigned.push(line);
      const each = apportionCents(people.map(() => 1), lineCents);
      people.forEach((_, i) => (subtotals[i] += each[i]));
      continue;
    }
    const each = apportionCents(eaters.map(() => 1), lineCents);
    eaters.forEach((id, i) => (subtotals[indexOf[id]] += each[i]));
  }

  const computedCents = computeItemizedTotalCents(subtotalCents, surcharges);

  // Everything beyond each person's own items — service charge, tax, and a voucher, whichever
  // way it nets out — rides on each person's own items, same as a surcharge. With no items at
  // all there is nothing to ride on, so it falls back to an even split. It can go negative when
  // a discount outweighs the surcharges, which apportionCents cannot express, so it is split on
  // the absolute value and flipped back, the same trick the reconciliation line below uses.
  const extraCents = computedCents - subtotalCents;
  const extraWeights = subtotalCents > 0 ? subtotals : people.map(() => 1);
  const extraEach = apportionCents(extraWeights, Math.abs(extraCents));
  const extraSign = extraCents < 0 ? -1 : 1;

  // The reconciliation line. Negative when the bank charged less than the paper said (a tip or
  // a discount the extraction missed), which apportionCents cannot express, so it is split on
  // the absolute value and flipped back.
  const diffCents = chargedCents - computedCents;
  const diffEach = apportionCents(people.map(() => 1), Math.abs(diffCents));
  const diffSign = diffCents < 0 ? -1 : 1;

  const totals = people.map((_, i) => subtotals[i] + extraSign * extraEach[i] + diffSign * diffEach[i]);

  const selfIndex = indexOf[SELF];
  return {
    ownShare: selfIndex === undefined ? 0 : fromCents(totals[selfIndex]),
    shares: people
      .map((id, i) => ({ personId: id, owed: fromCents(totals[i]) }))
      .filter((s) => s.personId !== SELF),
    computedTotal: fromCents(computedCents),
    difference: fromCents(diffCents),
    unassigned,
  };
}

/** One line as it appears on a single person's portion of a shared bill. */
export interface ItemizedPersonItem {
  lineId: string;
  label: string;
  /** This person's portion of the line, not the printed line total. */
  amount: number;
  /** How many people shared the line. 1 means it was theirs alone. */
  sharedBy: number;
}

/** What one person ordered, and what rode on top of it. */
export interface ItemizedPersonBreakdown {
  personId: string;
  items: ItemizedPersonItem[];
  itemsSubtotal: number;
  /** Service charge, tax and any bank reconciliation apportioned to this person. */
  surcharge: number;
  /** Always equal to what `computeItemized` gives this person. */
  total: number;
}

/**
 * The same division `computeItemized` performs, kept itemised instead of collapsed to a
 * total — what a group split receipt needs in order to print each person's own order.
 *
 * `computeItemized` stays the authority on the amounts: every `total` here is read straight
 * off it and the surcharge is derived as the remainder, so the two can never disagree about
 * what somebody owes no matter how the apportionment changes.
 */
export function explodeItemized(
  lines: ReceiptLine[],
  surcharges: Surcharges,
  charged: number,
  participants: string[]
): ItemizedPersonBreakdown[] {
  const people = participants.length > 0 ? participants : [SELF];
  const authoritative = computeItemized(lines, surcharges, charged, participants);

  const totalFor = new Map<string, number>([[SELF, authoritative.ownShare]]);
  for (const s of authoritative.shares) totalFor.set(s.personId, s.owed);

  return people.map((id) => {
    const items: ItemizedPersonItem[] = [];
    let subtotalCents = 0;

    for (const line of lines) {
      const lineCents = Math.max(0, toCents(line.amount));
      if (lineCents <= 0) continue;

      // A line nobody claimed belongs to everybody, matching computeItemized.
      const eaters = line.assignedTo.filter((p) => people.includes(p));
      const sharers = eaters.length === 0 ? people : eaters;
      if (!sharers.includes(id)) continue;

      const each = apportionCents(
        sharers.map(() => 1),
        lineCents
      );
      const mine = each[sharers.indexOf(id)];
      subtotalCents += mine;
      items.push({
        lineId: line.id,
        label: line.label,
        amount: fromCents(mine),
        sharedBy: sharers.length,
      });
    }

    const total = totalFor.get(id) ?? 0;
    return {
      personId: id,
      items,
      itemsSubtotal: fromCents(subtotalCents),
      surcharge: fromCents(toCents(total) - subtotalCents),
      total,
    };
  });
}

/* --- Settlement matching ------------------------------------------------- */

/** An unsettled share, flattened with the context needed to recognise its repayment. */
export interface OpenShare {
  shareId: string;
  personId: string;
  personName: string;
  outstanding: number;
  /** The day the bill was paid; a transfer that predates it cannot be settling it. */
  billDate: string | null;
  merchant: string;
  currency?: string;
  fxRate?: number | null;
  /** User note or food/expense description from the parent transaction. */
  remark?: string | null;
  /** Category id from the parent transaction (e.g. food, groceries). */
  categoryId?: string | null;
  /** Full gross bill amount fronted by the payer. */
  gross?: number;
  /** Original amount owed by this person before any partial payments. */
  owed?: number;
  /** Amount already paid against this share. */
  paid?: number;
  /** Status of the share ('open' | 'settled' | 'written_off'). */
  status?: ShareStatus;
  /** Local file URI of the parent transaction's saved receipt photo, if any. */
  receiptUri?: string | null;
  /** The method used to divide the bill ('equal' | 'shares' | 'exact' | 'itemized'). */
  splitMethod?: SplitMethod;
  /** Total number of people sharing this bill (including payer if they took a share). */
  participantCount?: number;
}

/** An extracted inbound row that might be someone paying you back. */
export interface SettlementCandidate {
  merchant: string;
  amount: number;
  date: string | null;
}

export interface SettlementMatch {
  share: OpenShare;
  /** How much of the inbound row goes against this share. */
  amount: number;
  partial: boolean;
  /** `strong` when both the amount and the sender's name line up. */
  confidence: 'strong' | 'likely';
}

/** How long after a bill a repayment is still plausibly for that bill. */
const SETTLEMENT_WINDOW_DAYS = 120;

/**
 * A debt this old is worth chasing, and worth Pip mentioning.
 *
 * Lives here rather than in a screen because three places need to agree on it: the Owed
 * screen's "Overdue" pill, the Dashboard's nudge line, and the reminder scheduler. When they
 * disagreed the app would flag a debt on one screen and stay silent on another.
 */
export const AGING_DAYS = 14;

/** YYYY-MM-DD out of an ISO date/datetime, or null. */
function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** Whole days from `from` to `to`, or null when either is unreadable. */
export function daysBetween(from: string | null, to: string | null): number | null {
  const a = dayOf(from);
  const b = dayOf(to);
  if (!a || !b) return null;
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

/** Everything one person still owes you, rolled up across every bill they are on. */
export interface PersonDebt {
  personId: string;
  name: string;
  total: number;
  shares: OpenShare[];
  /** Age of their oldest unpaid bill, in days. Compare against `AGING_DAYS`. */
  oldestDays: number;
}

/**
 * Open shares grouped by who owes them, biggest debt first, each person's bills oldest first.
 *
 * Totals accumulate through cents so a person on three bills cannot drift a cent away from the
 * sum of their shares. Shared by the Owed screen and the reminder scheduler so a debt the
 * screen calls overdue is exactly the debt that gets a notification.
 */
export function groupOpenSharesByPerson(open: OpenShare[], today: string): PersonDebt[] {
  const map = new Map<string, PersonDebt>();
  for (const share of open) {
    let entry = map.get(share.personId);
    if (!entry) {
      entry = { personId: share.personId, name: share.personName, total: 0, shares: [], oldestDays: 0 };
      map.set(share.personId, entry);
    }
    entry.total = fromCents(toCents(entry.total) + toCents(share.outstanding));
    entry.shares.push(share);
    if (share.status !== 'settled') {
      entry.oldestDays = Math.max(entry.oldestDays, daysBetween(share.billDate, today) ?? 0);
    }
  }
  for (const entry of map.values()) {
    entry.shares.sort((a, b) => {
      const aSettled = a.status === 'settled' ? 1 : 0;
      const bSettled = b.status === 'settled' ? 1 : 0;
      if (aSettled !== bSettled) return aSettled - bSettled;
      return (a.billDate ?? '').localeCompare(b.billDate ?? '');
    });
  }
  return [...map.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
}

/** The age of the oldest unpaid bill across everyone, or 0 when nobody owes you. */
export function oldestOverdueDays(open: OpenShare[], today: string): number {
  return groupOpenSharesByPerson(open, today).reduce((max, p) => Math.max(max, p.oldestDays), 0);
}

/**
 * Wording a bank or e-wallet wraps around the sender's name. Stripped before reading
 * initials or comparing learned labels, so "Receive from" is never mistaken for part of a name.
 */
const TRANSFER_WORDS = new Set([
  'receive', 'received', 'from', 'to', 'transfer', 'trf', 'fund', 'funds', 'duitnow', 'instant',
  'ibg', 'ibft', 'qr', 'payment', 'pay', 'wallet', 'by', 'via',
]);

/** The words of a transfer label that can belong to the sender. */
function senderWords(merchant: string): string[] {
  return merchantKey(merchant)
    .split(/\s+/)
    .filter((w) => w.length > 0 && !TRANSFER_WORDS.has(w));
}

/**
 * True when a friend saved under their initials ("cjx") matches the sender's full name
 * ("Receive from CHOY JIAN XUAN"). The initials must cover consecutive words, in order. Only
 * three or four letters: two-letter initials would match far too many names.
 */
function initialsMatch(merchant: string, personName: string): boolean {
  const initials = personName.toLowerCase().trim();
  if (!/^[a-z]{3,4}$/.test(initials)) return false;
  const words = senderWords(merchant).filter((w) => /^[a-z]/.test(w));
  const k = initials.length;
  for (let i = 0; i + k <= words.length; i++) {
    if (words.slice(i, i + k).map((w) => w[0]).join('') === initials) return true;
  }
  return false;
}

/**
 * True when the transfer's label carries the person's name using fuzzy matching.
 *
 * A DuitNow transfer usually arrives labelled with the sender, which is the strongest
 * signal available on-device. Matched per name token so "ALI BIN HASSAN" still recognises
 * a person saved as "Ali", with two-character tokens skipped so initials cannot match
 * everything. Uses Damerau-Levenshtein for typo resilience (e.g. "ALEE" matches "Ali",
 * "HASAN" matches "Hassan") and containment for concatenated names ("WEILIN" contains "wei").
 */
function nameMatches(merchant: string, personName: string): boolean {
  const hay = merchantKey(merchant);
  if (!hay) return false;
  if (initialsMatch(merchant, personName)) return true;
  const hayNoSpace = hay.replace(/\s+/g, '');
  const pName = personName.toLowerCase().trim();
  const pNameNoSpace = pName.replace(/\s+/g, '');
  const isCjk = /[^\x00-\x7F]/.test(pNameNoSpace);

  // Whole-name containment: CJK >= 2 chars, or ASCII concatenated >= 4 chars (e.g. "fongyanyan", "weilin")
  if ((isCjk && pNameNoSpace.length >= 2) || (pNameNoSpace.length >= 4 && hayNoSpace.includes(pNameNoSpace))) {
    return true;
  }

  const hayTokens = hay.split(/\s+/).filter((t) => t.length >= 2);

  return pName
    .split(/\s+/)
    .filter((tok) => tok.length >= 2)
    .some((nameTok) => {
      // Direct whole-word token match for short 2-char tokens (e.g. "Ng", "Bo", "YY")
      if (nameTok.length === 2) {
        return hayTokens.includes(nameTok);
      }
      // For tokens >= 3: direct token containment in merchant
      if (hay.includes(nameTok)) return true;
      // Token-level fuzzy: check each merchant token against each name token
      return hayTokens.some((mt) => {
        if (mt.length < 3) return false;
        const maxDist = mt.length >= 7 || nameTok.length >= 7 ? 2 : 1;
        return damerauLevenshtein(nameTok, mt, maxDist) <= maxDist;
      });
    });
}

/**
 * Check if the merchant label matches a bank label previously confirmed for the person.
 *
 * This is what recognises a friend saved under a nickname ("Ah Boy") whose transfers arrive
 * under their real name: once one repayment is matched by hand, the label is remembered and
 * counts as a name match from then on. Transfer wording is stripped first, so two different
 * senders who share "Receive from" never match each other.
 */
function learnedNameMatches(
  merchant: string,
  personId: string,
  knownBankLabels: Record<string, string[]>
): boolean {
  const labels = knownBankLabels[personId];
  if (!labels || labels.length === 0) return false;
  const hay = senderWords(merchant).join(' ');
  if (!hay) return false;
  return labels.some((label) => {
    const lk = senderWords(label).join(' ');
    if (!lk) return false;
    if (lk === hay) return true;
    const [short, long] = lk.length <= hay.length ? [lk, hay] : [hay, lk];
    return short.length >= 4 && long.includes(short);
  });
}

/** A per-share allocation within a multi-debt settlement. */
export interface SettlementAllocation {
  share: OpenShare;
  /** How much of the inbound row goes against this share. */
  amount: number;
}

export interface MultiSettlementMatch {
  personName: string;
  personId: string;
  /** Shares being settled, with per-share allocation amounts (oldest first). */
  allocations: SettlementAllocation[];
  /** Total amount going toward debt settlement. */
  settledTotal: number;
  /** Amount exceeding total debts (flows through as income). */
  excess: number;
  /** Whether settlement covers all outstanding or leaves some open. */
  partial: boolean;
  /** `strong` when both amount and name match; `likely` when one matches or amount is close. */
  confidence: 'strong' | 'likely';
}

/**
 * Suggest how an inbound transfer might settle one or more open debts.
 *
 * Groups debts by person, then for each person whose name fuzzy-matches the transfer label:
 * - Allocates the transfer amount across their debts (oldest first)
 * - Supports exact, partial, multi-debt, and excess (overpayment)
 *
 * Confidence tiers:
 * - `strong`: name match + amount exactly equals total outstanding (or single debt)
 * - `likely`: name match + amount within 10% of total, OR exact amount match without name
 * - (weak matches with name but no amount correlation are not surfaced)
 *
 * Returns null when nothing fits. Ties break on highest confidence, then biggest total debt.
 */
export function suggestMultiSettlement(
  open: OpenShare[],
  candidate: SettlementCandidate,
  today: string,
  knownBankLabels: Record<string, string[]> = {}
): MultiSettlementMatch | null {
  const amountCents = toCents(candidate.amount);
  if (amountCents <= 0) return null;
  const day = dayOf(candidate.date) ?? today;

  // Group open shares by person, filtering by date window
  const byPerson = new Map<string, { personId: string; name: string; shares: OpenShare[]; totalCents: number }>();
  for (const share of open) {
    const outstandingCents = toCents(share.outstanding);
    if (outstandingCents <= 0) continue;

    const age = daysBetween(share.billDate, day);
    // Allow repayments within the settlement window in either direction (up to 120 days).
    // In practice, users frequently log debts after a repayment arrived (e.g. backlogged bills,
    // money sent right at the table before entry, or testing against past statements).
    if (age !== null && Math.abs(age) > SETTLEMENT_WINDOW_DAYS) continue;

    const personKey = `${share.personId || ''}:${share.personName.toLowerCase()}`;
    let entry = byPerson.get(personKey);
    if (!entry) {
      entry = { personId: share.personId, name: share.personName, shares: [], totalCents: 0 };
      byPerson.set(personKey, entry);
    }
    entry.shares.push(share);
    entry.totalCents += outstandingCents;
  }

  // Sort each person's shares oldest-first for allocation
  for (const entry of byPerson.values()) {
    entry.shares.sort((a, b) => (a.billDate ?? '').localeCompare(b.billDate ?? ''));
  }

  const matches: MultiSettlementMatch[] = [];

  for (const [, { personId, name, shares, totalCents }] of byPerson) {
    const hasLearnedMatch = learnedNameMatches(candidate.merchant, personId, knownBankLabels);
    const hasNameMatch = hasLearnedMatch || nameMatches(candidate.merchant, name);

    // Check for amount-only match against individual shares (no name needed)
    const exactSingleHit = !hasNameMatch && shares.length > 0 &&
      shares.some((s) => toCents(s.outstanding) === amountCents);

    if (!hasNameMatch && !exactSingleHit) continue;

    const { allocations, remainingCents } = allocateOldestFirst(shares, amountCents);
    if (allocations.length === 0) continue;

    const settledCents = amountCents - remainingCents;
    const excessCents = remainingCents; // what's left after all debts are covered
    const partial = settledCents < totalCents;
    const amountExact = settledCents === totalCents ||
      (allocations.length === 1 && toCents(allocations[0].share.outstanding) === amountCents);
    const amountClose = !amountExact && settledCents > 0 &&
      Math.abs(amountCents - totalCents) / totalCents <= 0.10;

    // Determine confidence
    let confidence: 'strong' | 'likely' | 'weak';
    if (hasNameMatch && amountExact) {
      confidence = 'strong';
    } else if (hasNameMatch && (amountClose || settledCents > 0)) {
      confidence = 'likely';
    } else if (exactSingleHit && !hasNameMatch) {
      confidence = 'likely';
    } else {
      confidence = 'weak';
    }

    // Learned name boost: likely → strong
    if (confidence === 'likely' && hasLearnedMatch) {
      confidence = 'strong';
    }

    // Skip weak matches entirely
    if (confidence === 'weak') continue;

    matches.push({
      personName: name,
      personId,
      allocations,
      settledTotal: fromCents(settledCents),
      excess: fromCents(excessCents),
      partial,
      confidence,
    });
  }

  if (matches.length === 0) return null;

  // Best match: highest confidence first, then biggest debt total
  matches.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'strong' ? -1 : 1;
    return toCents(b.settledTotal) - toCents(a.settledTotal);
  });

  return matches[0];
}

/** Spread an inbound amount across shares already sorted oldest first. */
function allocateOldestFirst(
  shares: OpenShare[],
  amountCents: number
): { allocations: SettlementAllocation[]; remainingCents: number } {
  let remainingCents = amountCents;
  const allocations: SettlementAllocation[] = [];
  for (const share of shares) {
    if (remainingCents <= 0) break;
    const allocCents = Math.min(remainingCents, toCents(share.outstanding));
    if (allocCents <= 0) continue;
    allocations.push({ share, amount: fromCents(allocCents) });
    remainingCents -= allocCents;
  }
  return { allocations, remainingCents };
}

/** One friend who still owes you, for the "Is someone paying you back?" picker. */
export interface OwingPerson {
  personId: string;
  personName: string;
  outstanding: number;
  /** Most recent bill they are on, YYYY-MM-DD, or null. */
  latestBill: string | null;
}

/**
 * Everyone with an open share, closest total to `amount` first, then most recent bill.
 *
 * Backs the hand-pick fallback for a transfer no name or learned label recognised (a friend
 * saved as "Ah Boy" sending as TAN WEI MING), so the likeliest payer sits at the top.
 */
export function peopleOwing(open: OpenShare[], amount: number): OwingPerson[] {
  const byPerson = new Map<string, { personName: string; cents: number; latestBill: string | null }>();
  for (const share of open) {
    const cents = toCents(share.outstanding);
    if (cents <= 0) continue;
    const entry = byPerson.get(share.personId) ?? { personName: share.personName, cents: 0, latestBill: null };
    entry.cents += cents;
    const bill = dayOf(share.billDate);
    if (bill && (!entry.latestBill || bill > entry.latestBill)) entry.latestBill = bill;
    byPerson.set(share.personId, entry);
  }
  const target = toCents(amount);
  return [...byPerson.entries()]
    .map(([personId, e]) => ({ personId, personName: e.personName, outstanding: fromCents(e.cents), latestBill: e.latestBill, gap: Math.abs(e.cents - target) }))
    .sort((a, b) => a.gap - b.gap || (b.latestBill ?? '').localeCompare(a.latestBill ?? ''))
    .map(({ gap: _gap, ...person }) => person);
}

/**
 * The settlement an inbound row makes against one chosen friend's open shares, oldest first,
 * with anything beyond what they owe carried as excess. Null when they owe nothing.
 */
export function settlementForPerson(
  open: OpenShare[],
  personId: string,
  candidate: SettlementCandidate
): MultiSettlementMatch | null {
  const amountCents = toCents(candidate.amount);
  if (amountCents <= 0) return null;
  const shares = open
    .filter((s) => s.personId === personId && toCents(s.outstanding) > 0)
    .sort((a, b) => (a.billDate ?? '').localeCompare(b.billDate ?? ''));
  if (shares.length === 0) return null;
  const totalCents = shares.reduce((sum, s) => sum + toCents(s.outstanding), 0);
  const { allocations, remainingCents } = allocateOldestFirst(shares, amountCents);
  const settledCents = amountCents - remainingCents;
  return {
    personName: shares[0].personName,
    personId,
    allocations,
    settledTotal: fromCents(settledCents),
    excess: fromCents(remainingCents),
    partial: settledCents < totalCents,
    confidence: 'likely',
  };
}

/**
 * The open share an inbound row is most likely settling, or null when nothing fits.
 *
 * Backward-compatible wrapper around `suggestMultiSettlement`. Returns a single-share
 * `SettlementMatch` for callers that don't need multi-debt support.
 */
export function suggestSettlement(
  open: OpenShare[],
  candidate: SettlementCandidate,
  today: string,
  knownBankLabels: Record<string, string[]> = {}
): SettlementMatch | null {
  const multi = suggestMultiSettlement(open, candidate, today, knownBankLabels);
  if (!multi || multi.allocations.length === 0) return null;
  // Legacy single-settlement wrapper does not match inbounds larger than the debt
  if (multi.excess > 0) return null;
  // Legacy single-settlement wrapper rejects transfers strictly before the bill date
  if (candidate.date && daysBetween(multi.allocations[0].share.billDate, candidate.date)! < 0) {
    return null;
  }
  const first = multi.allocations[0];
  return {
    share: first.share,
    amount: first.amount,
    partial: multi.partial,
    confidence: multi.confidence,
  };
}

