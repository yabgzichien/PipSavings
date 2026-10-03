// Per-row trip and liability choices made while categorizing a scanned batch.
// Manual entry already records both. A statement review has to do the same, and the
// kept rows have to stay lined up with commitCategorized, which drops skipped items.

import { BASE_CURRENCY, deriveNative, round2 } from './currency';
import { rateFor } from './fx';
import { defaultLinkEffect, type LinkEffect } from './networth';
import { DROP, type Account, type TxnType } from './types';

export interface CategorizeAdjustment {
  tripId: string | null;
  liabilityAccountId: string | null;
  /** Account the money left, or arrived in. Null when the user left it as None. */
  fromAccountId: string | null;
}

export interface KeptCategorizeEffect {
  txnType: TxnType | string;
  tripId: string | null;
  /** Loan this expense pays down, if the user picked one. */
  liabilityAccountId: string | null;
  fromAccountId: string | null;
  /** MYR that should move. Split rows use the gross, not the payer's share. */
  movedMyr: number;
}

interface ReviewedItem {
  type: TxnType | string;
  amount: number;
  currency?: string | null;
  fxRate?: number | null;
}

/** Native amount → MYR using the rate frozen on the row. A MYR row is already there. */
export function reviewedAmountMyr(amount: number, currency: string | null | undefined, fxRate: number | null | undefined): number {
  if (!currency || currency === BASE_CURRENCY) return round2(amount);
  if (fxRate == null || !(fxRate > 0)) return round2(amount);
  return round2(amount * fxRate);
}

/**
 * One effect per row that will actually be saved, in the same order commitCategorized inserts.
 * Income never carries a trip or a loan payment. A missing adjustment slot is treated as "none".
 */
export function keptCategorizeEffects(
  items: readonly ReviewedItem[],
  assignments: readonly (string | null)[],
  adjustments: readonly CategorizeAdjustment[],
  splitGross: readonly (number | null)[],
): KeptCategorizeEffect[] {
  const out: KeptCategorizeEffect[] = [];
  for (let i = 0; i < items.length; i++) {
    if (assignments[i] === DROP) continue;
    const item = items[i];
    const expense = item.type === 'expense';
    const adj = adjustments[i];
    const native = splitGross[i] ?? item.amount;
    out.push({
      txnType: item.type,
      tripId: expense ? (adj?.tripId ?? null) : null,
      liabilityAccountId: expense ? (adj?.liabilityAccountId ?? null) : null,
      fromAccountId: adj?.fromAccountId ?? null,
      movedMyr: reviewedAmountMyr(native, item.currency, item.fxRate),
    });
  }
  return out;
}

/**
 * A non-MYR pay-from or loan account with no cached rate. Null when every chosen
 * account can be converted. A loan that is also the pay-from account is checked once.
 */
export function liabilityCurrencyMissingRate(
  effects: readonly KeptCategorizeEffect[],
  accounts: readonly Account[],
  rates: Record<string, number>,
): string | null {
  for (const effect of effects) {
    const ids = [effect.fromAccountId, effect.liabilityAccountId];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const account = accounts.find((a) => a.id === id);
      if (!account || account.currency === BASE_CURRENCY) continue;
      if (rateFor(rates, account.currency) == null) return account.currency;
    }
  }
  return null;
}

/** Attach the chosen trips and pay down the chosen loans for a batch that has just been saved. */
export async function applyCategorizeAdjustments(input: {
  created: readonly { id: string; date: string | null }[];
  effects: readonly KeptCategorizeEffect[];
  accounts: readonly Account[];
  rates: Record<string, number>;
  today: string;
  setTransactionsTrip: (ids: string[], tripId: string) => Promise<void>;
  recordBalanceLink: (accountId: string, amount: number, effect: LinkEffect, asOf: string) => Promise<void>;
}): Promise<void> {
  const byTrip = new Map<string, string[]>();
  const count = Math.min(input.created.length, input.effects.length);
  for (let i = 0; i < count; i++) {
    const tripId = input.effects[i].tripId;
    if (!tripId) continue;
    const list = byTrip.get(tripId) ?? [];
    list.push(input.created[i].id);
    byTrip.set(tripId, list);
  }
  for (const [tripId, ids] of byTrip) {
    await input.setTransactionsTrip(ids, tripId);
  }

  for (let i = 0; i < count; i++) {
    const effect = input.effects[i];
    const when = input.created[i].date ?? input.today;
    const from = effect.fromAccountId ? input.accounts.find((a) => a.id === effect.fromAccountId) : undefined;
    if (from) {
      const rate = from.currency === BASE_CURRENCY ? null : rateFor(input.rates, from.currency);
      await input.recordBalanceLink(
        from.id,
        deriveNative(effect.movedMyr, from.currency, rate),
        defaultLinkEffect(from.kind, effect.txnType === 'income' ? 'income' : 'expense'),
        when,
      );
    }
    const loanId = effect.liabilityAccountId;
    // Paying the loan directly already moved it. A second subtract would double-count.
    if (!loanId || loanId === effect.fromAccountId) continue;
    const loan = input.accounts.find((a) => a.id === loanId);
    if (!loan) continue;
    const rate = loan.currency === BASE_CURRENCY ? null : rateFor(input.rates, loan.currency);
    await input.recordBalanceLink(
      loan.id,
      deriveNative(effect.movedMyr, loan.currency, rate),
      'subtract',
      when,
    );
  }
}
