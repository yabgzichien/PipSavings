import { BASE_CURRENCY } from '../lib/currency';

export const FREE_CURRENCY_LIMIT = 2;

/** Whether the plan still has a free slot for a currency that is not already active. */
export function canAddAnotherCurrency(active: string[], isPro: boolean): boolean {
  return isPro || active.length < FREE_CURRENCY_LIMIT;
}

/** Whether activating `code` would stay within the plan. Already-active codes always pass. */
export function canActivateCurrency(active: string[], code: string, isPro: boolean): boolean {
  if (code === BASE_CURRENCY || active.includes(code)) return true;
  return canAddAnotherCurrency(active, isPro);
}

/** Foreign currencies a free user should drop so `nextCode` can occupy the single extra slot. */
export function currenciesToReplaceForFreeSlot(active: string[], nextCode: string): string[] {
  return active.filter((code) => code !== BASE_CURRENCY && code !== nextCode);
}

/** Candidates that can join the picker without exceeding the free cap. */
export function pickCurrenciesToActivate(
  active: string[],
  candidates: string[],
  isPro: boolean
): string[] {
  const unique = [...new Set(candidates.filter((code) => code !== BASE_CURRENCY && !active.includes(code)))];
  if (isPro) return unique;
  const slots = Math.max(0, FREE_CURRENCY_LIMIT - active.length);
  return unique.slice(0, slots);
}
