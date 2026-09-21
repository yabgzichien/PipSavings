// Pure helpers for moving cash between two Cash & Bank accounts.
// UI and the store call these; they do not touch SQLite.
import { round2 } from './currency';
import { applyEffect, currentValue } from './networth';
import type { Account, BalanceEntry } from './types';

export type MoveInput =
  | { kind: 'amount'; amount: number }
  | { kind: 'newTo'; newTo: number }
  | { kind: 'newFrom'; newFrom: number };

export interface MoveProposal {
  amount: number;
  newFrom: number;
  newTo: number;
}

export type MoveError = 'same_account' | 'zero' | 'insufficient' | 'ineligible' | 'currency';

export function isCashAccount(account: Account): boolean {
  return !account.archived && account.kind === 'asset' && account.cls === 'cash';
}

export function eligibleCashAccounts(accounts: Account[]): Account[] {
  return accounts.filter(isCashAccount);
}

export function canMoveCash(accounts: Account[]): boolean {
  return eligibleCashAccounts(accounts).length >= 2;
}

export function pickerAccounts(
  accounts: Account[],
  excludeId: string | null,
  currency: string | null
): Account[] {
  return eligibleCashAccounts(accounts).filter((a) => {
    if (excludeId && a.id === excludeId) return false;
    if (currency && a.currency !== currency) return false;
    return true;
  });
}

export function deriveMove(currentFrom: number, currentTo: number, input: MoveInput): MoveProposal | null {
  let amount: number;
  if (input.kind === 'amount') amount = round2(input.amount);
  else if (input.kind === 'newTo') amount = round2(input.newTo - currentTo);
  else amount = round2(currentFrom - input.newFrom);

  if (!(amount > 0)) return null;
  const newFrom = applyEffect(currentFrom, amount, 'subtract');
  if (newFrom < 0) return null;
  return { amount, newFrom, newTo: applyEffect(currentTo, amount, 'add') };
}

export function validateMove({
  from,
  to,
  amount,
  fromBalance,
}: {
  from: Account;
  to: Account;
  amount: number;
  fromBalance: number;
}): MoveError | null {
  if (from.id === to.id) return 'same_account';
  if (!(amount > 0)) return 'zero';
  if (!isCashAccount(from) || !isCashAccount(to)) return 'ineligible';
  if (from.currency !== to.currency) return 'currency';
  if (applyEffect(fromBalance, amount, 'subtract') < 0) return 'insufficient';
  return null;
}

export function linkedAsOf(latestExisting: string, requested: string): string {
  return !latestExisting || requested > latestExisting ? requested : latestExisting;
}

export function planLinkedMove(
  fromEntries: BalanceEntry[],
  toEntries: BalanceEntry[],
  amount: number,
  asOf: string
): { fromValue: number; toValue: number; fromAsOf: string; toAsOf: string } {
  const fromLatest = fromEntries.reduce((m, e) => (e.asOf > m ? e.asOf : m), '');
  const toLatest = toEntries.reduce((m, e) => (e.asOf > m ? e.asOf : m), '');
  return {
    fromValue: applyEffect(currentValue(fromEntries), amount, 'subtract'),
    toValue: applyEffect(currentValue(toEntries), amount, 'add'),
    fromAsOf: linkedAsOf(fromLatest, asOf),
    toAsOf: linkedAsOf(toLatest, asOf),
  };
}
