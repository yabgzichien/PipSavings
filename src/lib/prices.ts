// src/lib/prices.ts
// Pure, deterministic helpers for live-priced holdings (Yahoo Finance). No
// network/UI/DB  the network adapter lives in src/prices/. All unit-tested.
import { currentValue } from './networth';
import type { Account, BalanceEntry, PriceQuote } from './types';

export interface TickerResult {
  id: string; // Yahoo symbol, e.g. 'BTC-USD', 'AAPL', '1155.KL'
  ticker: string; // display, e.g. 'BTC', 'AAPL'
  name: string;
  type: string; // Yahoo quoteType, e.g. 'CRYPTOCURRENCY', 'EQUITY'
}

/** Parse a Yahoo /v1/finance/search response, optionally filtering by quote type. */
export function parseYahooSearch(json: unknown, allowedTypes?: string[]): TickerResult[] {
  const quotes = (json as { quotes?: unknown })?.quotes;
  if (!Array.isArray(quotes)) return [];
  const out: TickerResult[] = [];
  for (const q of quotes) {
    const o = q as Record<string, unknown>;
    const symbol = typeof o.symbol === 'string' ? o.symbol : '';
    const type = typeof o.quoteType === 'string' ? o.quoteType : '';
    if (!symbol) continue;
    if (allowedTypes && !allowedTypes.includes(type)) continue;
    const name = (typeof o.shortname === 'string' && o.shortname) || (typeof o.longname === 'string' && o.longname) || symbol;
    const ticker = type === 'CRYPTOCURRENCY' ? symbol.split('-')[0] : symbol;
    out.push({ id: symbol, ticker, name: String(name), type });
  }
  return out;
}

/** Crypto picker: keep only USD-quoted pairs (BTC-USD, not BTC-GBP) and drop the trailing currency from the name. */
export function cryptoUsdResults(results: TickerResult[]): TickerResult[] {
  return results
    .filter((r) => r.id.endsWith('-USD'))
    .map((r) => ({ ...r, name: r.name.replace(/\s+[A-Z]{3}$/, '') }));
}

/** The only supported commodities  one canonical entry each (avoids Yahoo's many gold/silver futures). */
export const COMMODITIES: TickerResult[] = [
  { id: 'GC=F', ticker: 'Gold', name: 'Gold', type: 'COMMODITY' },
  { id: 'SI=F', ticker: 'Silver', name: 'Silver', type: 'COMMODITY' },
];

/** Canonical gold/silver entries whose name matches the query. */
export function matchedCommodities(query: string): TickerResult[] {
  const s = query.trim().toLowerCase();
  if (!s) return [];
  const goldMatch = s.includes('gold') || s.includes('黄金') || s.includes('金') || s === 'gc';
  const silverMatch = s.includes('silver') || s.includes('白银') || s.includes('银') || s === 'si';
  return COMMODITIES.filter((c) => {
    if (c.id === 'GC=F' && goldMatch) return true;
    if (c.id === 'SI=F' && silverMatch) return true;
    return c.name.toLowerCase().includes(s);
  });
}

/** The holding sub-category implied by a Yahoo quote type. */
export function subFromType(type: string): 'crypto' | 'stock' | 'commodity' {
  if (type === 'CRYPTOCURRENCY') return 'crypto';
  if (type === 'COMMODITY') return 'commodity';
  return 'stock';
}

/** A Yahoo quote type for a holding sub-category (inverse of subFromType). */
export function typeFromSub(sub: string | null): string {
  if (sub === 'crypto') return 'CRYPTOCURRENCY';
  if (sub === 'commodity') return 'COMMODITY';
  return 'EQUITY';
}

// Gold/silver futures are priced per troy ounce; we hold them in grams.
export const GRAM_SYMBOLS = new Set(['GC=F', 'SI=F']);
export const TROY_OUNCE_GRAMS = 31.1034768;

/** Convert a symbol's MYR price to the unit the quantity is measured in (per-gram for gold/silver). */
export function toQuantityUnitPrice(symbol: string, priceMYR: number): number {
  return GRAM_SYMBOLS.has(symbol) ? priceMYR / TROY_OUNCE_GRAMS : priceMYR;
}

/** Pick the search result matching a scanned ticker (exact ticker preferred, else the top hit). */
export function pickTickerMatch(ticker: string, results: TickerResult[]): TickerResult | null {
  const up = ticker.toUpperCase();
  return results.find((r) => r.ticker.toUpperCase() === up) ?? results[0] ?? null;
}

export interface YahooQuote {
  price: number;
  currency: string;
  prevClose: number | null;
}

/** Parse the meta block of a Yahoo /v8/finance/chart response. */
export function parseYahooChart(json: unknown): YahooQuote | null {
  const meta = (json as any)?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') return null;
  return {
    price: meta.regularMarketPrice,
    currency: typeof meta.currency === 'string' ? meta.currency : 'USD',
    prevClose: typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : null,
  };
}

/** Convert a native-currency price to MYR using a currency→MYR rate table. Returns null if unconvertible. */
export function priceToMYR(price: number, currency: string, fx: Record<string, number>): number | null {
  if (currency === 'MYR') return price;
  const rate = fx[currency];
  return typeof rate === 'number' && rate > 0 ? Math.round(price * rate * 1e6) / 1e6 : null;
}

/** 24h percentage change from the previous close, or null. */
export function change24Pct(price: number, prevClose: number | null): number | null {
  if (prevClose == null || prevClose === 0) return null;
  return ((price - prevClose) / prevClose) * 100;
}

/** Holding value in MYR = quantity × price, rounded to cents. */
export function holdingValue(quantity: number, priceMYR: number): number {
  return Math.round(quantity * priceMYR * 100) / 100;
}

/** Day-over-day move that earns the launch toast. Strictly above this, not equal. */
export const INVESTMENT_SOAR_THRESHOLD_PCT = 1.5;

/**
 * Value-weighted 24h change across live holdings, in percent.
 *
 * A holding with no previous close is left out of both the weight and the move, so a missing
 * quote cannot dilute a real one or invent a number. Archived rows and anything that is not a
 * live holding are ignored. Returns null when nothing measurable is up for weighing.
 */
export function portfolioChange24Pct(
  accounts: readonly Account[],
  prices: Record<string, PriceQuote>
): number | null {
  let weighted = 0;
  let weight = 0;
  for (const account of accounts) {
    if (account.archived || !isHolding(account)) continue;
    const quote = prices[account.symbol as string];
    if (!quote || quote.change24 == null || !Number.isFinite(quote.change24)) continue;
    const value = holdingValue(account.quantity as number, quote.priceMYR);
    if (!(value > 0)) continue;
    weighted += value * quote.change24;
    weight += value;
  }
  if (!(weight > 0)) return null;
  return weighted / weight;
}

/** One decimal, without a trailing ".0", for the soar toast. */
export function formatSoarPct(pct: number): string {
  const text = (Math.round(pct * 10) / 10).toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

export interface Profit {
  profit: number; // current value − invested (MYR)
  pct: number | null; // profit as % of invested; null when no cost recorded
}

/** Profit of a holding vs its invested amount. Returns null pct when cost is missing/zero. */
export function holdingProfit(value: number, cost: number | null): Profit {
  if (cost == null || cost <= 0) return { profit: Math.round(value * 100) / 100, pct: null };
  return { profit: Math.round((value - cost) * 100) / 100, pct: ((value - cost) / cost) * 100 };
}

/** Aggregate profit for active live holdings that have a recorded MYR cost basis. */
export function aggregateHoldingProfit(
  accounts: Account[],
  valueById: Record<string, number>,
): Profit | null {
  let totalValue = 0;
  let totalCost = 0;
  let included = 0;
  for (const account of accounts) {
    if (
      account.archived ||
      account.cls !== 'investments' ||
      !isHolding(account) ||
      account.cost == null ||
      account.cost <= 0
    ) continue;
    totalValue += valueById[account.id] ?? 0;
    totalCost += account.cost;
    included += 1;
  }
  return included > 0 ? holdingProfit(totalValue, totalCost) : null;
}

/** True when an account is a live-priced holding (has a symbol + quantity). */
export function isHolding(a: Account): boolean {
  return !!a.symbol && a.quantity != null;
}

/** Current MYR value of an account: qty × live price for holdings, else its latest balance entry. */
export function accountValue(account: Account, entries: BalanceEntry[], priceBySymbol: Record<string, PriceQuote>): number {
  if (isHolding(account)) {
    const q = priceBySymbol[account.symbol as string];
    return q ? holdingValue(account.quantity as number, q.priceMYR) : 0;
  }
  return currentValue(entries.filter((e) => e.accountId === account.id));
}

/** Value per account id across all accounts. */
export function mergeAccountValues(
  accounts: Account[],
  entries: BalanceEntry[],
  priceBySymbol: Record<string, PriceQuote>
): Record<string, number> {
  const byAccount: Record<string, BalanceEntry[]> = {};
  for (const e of entries) (byAccount[e.accountId] ??= []).push(e);
  const out: Record<string, number> = {};
  for (const a of accounts) {
    out[a.id] = isHolding(a)
      ? (priceBySymbol[a.symbol as string] ? holdingValue(a.quantity as number, priceBySymbol[a.symbol as string].priceMYR) : 0)
      : currentValue(byAccount[a.id] ?? []);
  }
  return out;
}

export interface HoldingGroup {
  symbol: string;
  ticker: string;
  name: string;
  sub: string;
  accounts: Account[]; // the individual lots, newest-added last
  quantity: number; // total units
  value: number; // total MYR
  cost: number | null; // total invested (sum of lots that recorded a cost; null if none)
}

/** Combine same-symbol holding lots into one group each, sorted by value (high → low). */
export function groupHoldings(holdings: Account[], valueById: Record<string, number>): HoldingGroup[] {
  const map = new Map<string, HoldingGroup>();
  for (const a of holdings) {
    const key = a.symbol as string;
    let g = map.get(key);
    if (!g) {
      g = { symbol: key, ticker: a.ticker ?? key, name: a.name, sub: a.sub ?? '', accounts: [], quantity: 0, value: 0, cost: null };
      map.set(key, g);
    }
    g.accounts.push(a);
    g.quantity = Math.round((g.quantity + (a.quantity ?? 0)) * 1e8) / 1e8;
    g.value = Math.round((g.value + (valueById[a.id] ?? 0)) * 100) / 100;
    if (a.cost != null) g.cost = Math.round(((g.cost ?? 0) + a.cost) * 100) / 100;
  }
  return [...map.values()].sort((x, y) => y.value - x.value);
}

export interface ScannedHolding {
  ticker: string;
  quantity: number;
}

/** Coerce a raw `{ticker, quantity}` row array (already-parsed JSON) into valid holdings, dropping bad rows. */
export function coerceHoldingsRows(rows: unknown): ScannedHolding[] {
  const arr = Array.isArray(rows) ? rows : [];
  const out: ScannedHolding[] = [];
  for (const r of arr) {
    const o = r as Record<string, unknown>;
    const ticker = typeof o.ticker === 'string' ? o.ticker.trim().toUpperCase() : '';
    const quantity = typeof o.quantity === 'number' ? o.quantity : typeof o.quantity === 'string' ? Number(o.quantity.replace(/[^0-9.]/g, '')) : NaN;
    if (ticker && Number.isFinite(quantity) && quantity > 0) out.push({ ticker, quantity });
  }
  return out;
}

/** Defensive parser for the crypto-wallet extraction reply: {holdings:[{ticker,quantity}]}. */
export function parseCryptoHoldings(content: string): ScannedHolding[] {
  const cleaned = stripFences(content).trim();
  if (!cleaned) return [];
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { holdings?: unknown }).holdings)
      ? (data as { holdings: unknown[] }).holdings
      : [];
  return coerceHoldingsRows(rows);
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}
