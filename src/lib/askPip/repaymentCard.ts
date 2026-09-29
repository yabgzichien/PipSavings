import { isValidIsoDate } from '../dates';
import { round2 } from '../currency';
import { receivableMyr } from '../split';

export interface RepaymentSlots {
  personQuery: string;
  amount: number;
  currency: string;
  accountQuery: string;
  arrivalCurrency: string;
  merchantHint?: string;
  cashAmount?: number;
  paidOn?: string;
}

export interface RepaymentDebt {
  shareId: string;
  personName: string;
  outstanding: number;
  currency: string;
  fxRate: number | null;
  merchant: string;
  remark: string | null;
}

export interface RepaymentAccount {
  id: string;
  name: string;
  currency: string;
  archived: boolean;
  balance: number;
}

export type RepaymentBlock =
  | 'missing_debt'
  | 'pick_debt'
  | 'missing_rate'
  | 'missing_account'
  | 'pick_account'
  | 'currency_mismatch'
  | 'future_date'
  | 'empty_amount';

export interface RepaymentCard {
  slots: RepaymentSlots;
  debt: RepaymentDebt | null;
  debtChoices: RepaymentDebt[];
  account: RepaymentAccount | null;
  accountChoices: RepaymentAccount[];
  mismatchAccount: { name: string; currency: string } | null;
  storedConversion: number | null;
  fxRate: number | null;
  amount: number | null;
  paidOn: string;
  balanceBefore: number | null;
  balanceAfter: number | null;
  block: RepaymentBlock | null;
  applyEnabled: boolean;
  /** False when the named account does not exist, so picking another account cannot enable Apply. */
  accountSelectable: boolean;
}

function sameMoney(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

function includesQuery(haystack: string, needle: string): boolean {
  const query = needle.trim().toLowerCase();
  if (!query) return false;
  return haystack.toLowerCase().includes(query);
}

function codesEqual(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export function storedRepaymentConversion(debt: RepaymentDebt, arrivalCurrency: string): number | null {
  if (codesEqual(debt.currency, arrivalCurrency)) return round2(debt.outstanding);
  if (!codesEqual(arrivalCurrency, 'MYR')) return null;
  if (debt.fxRate == null || !Number.isFinite(debt.fxRate)) return null;
  return receivableMyr(debt.outstanding, debt.fxRate);
}

function statedAmount(slots: RepaymentSlots, stored: number | null): number | null {
  if (slots.cashAmount !== undefined) {
    if (!Number.isFinite(slots.cashAmount) || slots.cashAmount <= 0) return null;
    return round2(slots.cashAmount);
  }
  return stored;
}

function statedDay(slots: RepaymentSlots, today: string): string {
  if (slots.paidOn && isValidIsoDate(slots.paidOn)) return slots.paidOn;
  return today;
}

function eligibleDebts(slots: RepaymentSlots, debts: RepaymentDebt[]): RepaymentDebt[] {
  return debts.filter((debt) =>
    debt.outstanding > 0
    && includesQuery(debt.personName, slots.personQuery)
    && codesEqual(debt.currency, slots.currency)
    && sameMoney(debt.outstanding, slots.amount),
  );
}

function narrowDebts(debts: RepaymentDebt[], hint: string | undefined): RepaymentDebt[] {
  if (debts.length <= 1 || !hint?.trim()) return debts;
  const narrowed = debts.filter((debt) =>
    includesQuery(debt.merchant, hint) || includesQuery(debt.remark ?? '', hint),
  );
  if (narrowed.length === 0) return debts;
  return narrowed;
}

function withBalances(card: Omit<RepaymentCard, 'balanceBefore' | 'balanceAfter'>): RepaymentCard {
  const balanceBefore = card.account ? card.account.balance : null;
  const balanceAfter = card.account && card.amount != null && card.amount > 0
    ? round2(card.account.balance + card.amount)
    : null;
  return { ...card, balanceBefore, balanceAfter };
}

function blockFor(card: Omit<RepaymentCard, 'block' | 'applyEnabled' | 'balanceBefore' | 'balanceAfter'>, today: string): RepaymentBlock | null {
  if (!card.debt && card.debtChoices.length === 0) return 'missing_debt';
  if (!card.debt) return 'pick_debt';
  if (card.storedConversion == null) return 'missing_rate';
  if (!card.account && !card.accountSelectable && card.mismatchAccount == null) return 'missing_account';
  if (!card.account && card.mismatchAccount) return 'currency_mismatch';
  if (!card.account) return 'pick_account';
  if (card.paidOn > today) return 'future_date';
  if (card.amount == null || card.amount <= 0) return 'empty_amount';
  return null;
}

function finalize(card: Omit<RepaymentCard, 'block' | 'applyEnabled' | 'balanceBefore' | 'balanceAfter'>, today: string): RepaymentCard {
  const block = blockFor(card, today);
  return withBalances({ ...card, block, applyEnabled: block === null });
}

export function resolveRepaymentCard(input: {
  slots: RepaymentSlots;
  debts: RepaymentDebt[];
  accounts: RepaymentAccount[];
  today: string;
}): RepaymentCard {
  const { slots, today } = input;
  const choices = narrowDebts(eligibleDebts(slots, input.debts), slots.merchantHint);
  const debt = choices.length === 1 ? choices[0] : null;
  const storedConversion = debt ? storedRepaymentConversion(debt, slots.arrivalCurrency) : null;
  const arrival = input.accounts.filter((account) =>
    !account.archived && codesEqual(account.currency, slots.arrivalCurrency),
  );
  const named = input.accounts.filter((account) =>
    !account.archived && includesQuery(account.name, slots.accountQuery),
  );
  const eligibleAccounts = named.filter((account) => codesEqual(account.currency, slots.arrivalCurrency));
  const foreign = named.find((account) => !codesEqual(account.currency, slots.arrivalCurrency)) ?? null;
  const account = eligibleAccounts.length === 1 ? eligibleAccounts[0] : null;
  return finalize({
    slots,
    debt,
    debtChoices: choices,
    account,
    accountChoices: arrival,
    mismatchAccount: eligibleAccounts.length === 0 && foreign
      ? { name: foreign.name, currency: foreign.currency }
      : null,
    storedConversion,
    fxRate: debt && !codesEqual(debt.currency, slots.arrivalCurrency) ? debt.fxRate : null,
    amount: statedAmount(slots, storedConversion),
    paidOn: statedDay(slots, today),
    accountSelectable: named.length > 0 && arrival.length > 0,
  }, today);
}

export function editRepaymentCard(
  card: RepaymentCard,
  edit: { paidOn?: string; amount?: number | null; accountId?: string | null },
  today: string,
): RepaymentCard {
  let account = card.account;
  let accountSelectable = card.accountSelectable;
  if (edit.accountId !== undefined && card.accountSelectable) {
    account = card.accountChoices.find((choice) => choice.id === edit.accountId) ?? card.account;
    accountSelectable = true;
  }
  const amount = edit.amount !== undefined
    ? (edit.amount != null && Number.isFinite(edit.amount) && edit.amount > 0 ? round2(edit.amount) : null)
    : card.amount;
  const paidOn = edit.paidOn !== undefined && isValidIsoDate(edit.paidOn) ? edit.paidOn : card.paidOn;
  return finalize({
    ...card,
    account,
    accountSelectable,
    mismatchAccount: account ? null : card.mismatchAccount,
    amount,
    paidOn,
  }, today);
}

export function selectRepaymentDebt(card: RepaymentCard, shareId: string, today: string): RepaymentCard {
  const debt = card.debtChoices.find((choice) => choice.shareId === shareId);
  if (!debt) return card;
  const storedConversion = storedRepaymentConversion(debt, card.slots.arrivalCurrency);
  return finalize({
    ...card,
    debt,
    debtChoices: [debt],
    storedConversion,
    fxRate: !codesEqual(debt.currency, card.slots.arrivalCurrency) ? debt.fxRate : null,
    amount: statedAmount(card.slots, storedConversion),
  }, today);
}
