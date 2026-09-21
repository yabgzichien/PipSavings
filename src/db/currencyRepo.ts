// src/db/currencyRepo.ts
// The two app_meta keys that drive multi-currency, plus activation.
import { getMeta, setMeta } from './metaRepo';
import { saveFxRate } from './fxRepo';
import { fetchRateMYR } from '../prices/fx';
import { BASE_CURRENCY, parseActiveCurrencies } from '../lib/currency';

const ACTIVE_KEY = 'active_currencies';
const ENTRY_KEY = 'entry_currency';
const DISPLAY_KEY = 'display_currency';

export async function getActiveCurrencies(): Promise<string[]> {
  return parseActiveCurrencies(await getMeta(ACTIVE_KEY));
}

export async function setActiveCurrencies(codes: string[]): Promise<void> {
  await setMeta(ACTIVE_KEY, JSON.stringify(parseActiveCurrencies(JSON.stringify(codes))));
}

export async function getEntryCurrency(): Promise<string> {
  const stored = (await getMeta(ENTRY_KEY)) || (await getMeta(DISPLAY_KEY));
  if (!stored) return BASE_CURRENCY;
  const active = await getActiveCurrencies();
  // A currency deactivated while it was the entry default falls back to ringgit rather
  // than leaving entry pointed at a currency the picker no longer offers.
  return active.includes(stored) ? stored : BASE_CURRENCY;
}

export async function setEntryCurrency(code: string): Promise<void> {
  await setMeta(ENTRY_KEY, code);
}

/**
 * The currency headline totals render in. Falls back to MYR the same way entry currency
 * does when the stored value is no longer active — a deactivated display currency must
 * never leave a screen unable to render its total.
 */
export async function getDisplayCurrency(): Promise<string> {
  const stored = await getMeta(DISPLAY_KEY);
  if (!stored) return BASE_CURRENCY;
  const active = await getActiveCurrencies();
  return active.includes(stored) ? stored : BASE_CURRENCY;
}

export async function setDisplayCurrency(code: string): Promise<void> {
  await setMeta(DISPLAY_KEY, code);
  await setMeta(ENTRY_KEY, code);
}

/**
 * Fetch and cache a currency's FX rate without adding it to the picker. Import paths need
 * this for currencies that appear on rows but cannot join a Free user's active set.
 */
export async function ensureFxRate(code: string): Promise<boolean> {
  if (code === BASE_CURRENCY) return true;
  const rate = await fetchRateMYR(code);
  if (rate == null) return false;
  await saveFxRate(code, rate);
  return true;
}

/**
 * Turn a currency on. Fetching and caching its rate is part of activation, and failure
 * aborts it: this is the network gate that guarantees every activatable currency already
 * has a cached rate, which is what lets transaction entry stay fully offline.
 *
 * Returns false when the rate could not be fetched, so the caller can show a message.
 */
export async function activateCurrency(code: string): Promise<boolean> {
  if (!(await ensureFxRate(code))) return false;
  const active = await getActiveCurrencies();
  if (!active.includes(code)) await setActiveCurrencies([...active, code]);
  return true;
}

/** Add already-cached currencies to the picker without fetching again. */
export async function addActiveCurrencies(codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  const active = await getActiveCurrencies();
  const next = [...active];
  for (const code of codes) {
    if (code !== BASE_CURRENCY && !next.includes(code)) next.push(code);
  }
  if (next.length !== active.length) await setActiveCurrencies(next);
}

/**
 * Turn a currency off. This only removes it from the entry picker: existing transactions
 * keep their currency and keep displaying it, and the cached rate is kept so historical
 * balances still convert. Nothing is deleted or rewritten.
 */
export async function deactivateCurrency(code: string): Promise<void> {
  if (code === BASE_CURRENCY) return;
  const active = await getActiveCurrencies();
  await setActiveCurrencies(active.filter((c) => c !== code));
  if ((await getMeta(ENTRY_KEY)) === code) await setEntryCurrency(BASE_CURRENCY);
  if ((await getMeta(DISPLAY_KEY)) === code) await setDisplayCurrency(BASE_CURRENCY);
}

/**
 * Refresh every active currency's cached rate. Best-effort and non-blocking: a failed
 * fetch leaves the previous cached rate in place, which is why entry never needs the
 * network. Piggybacks the existing price refresh trigger.
 */
export async function refreshFxRates(): Promise<void> {
  const active = await getActiveCurrencies();
  await Promise.all(
    active
      .filter((code) => code !== BASE_CURRENCY)
      .map(async (code) => {
        const rate = await fetchRateMYR(code);
        if (rate != null) await saveFxRate(code, rate);
      })
  );
}
