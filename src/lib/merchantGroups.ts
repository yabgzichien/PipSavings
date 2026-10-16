import { merchantKey } from './normalize';
import type { Transaction } from './types';

/**
 * Story-grade merchant grouping. `merchantKey` is the strict key the category memory learns
 * from; this is looser on purpose, so "ZUS", "Zus Coffee" and "ZUS COFFEE - KLCC" read as one
 * place when the monthly story counts visits. It never feeds category learning.
 */

/** Branch or location tails people type after a name: "ZUS Coffee - KLCC", "Tealive @ Sunway". */
const BRANCH_SEPARATOR = /\s+[-–—@|]\s+|\s*[(|]/;

/** Words too generic to stand for one place, so they never absorb longer names. */
const GENERIC_WORDS = new Set([
  'the', 'cafe', 'kafe', 'coffee', 'restoran', 'restaurant', 'kedai', 'warung', 'gerai',
  'kopitiam', 'mr', 'mrs', 'shop', 'store', 'mart', 'food', 'stall',
]);

const MIN_PREFIX_LENGTH = 3;

function withoutBranch(label: string): string {
  return label.replace(/\*.*/, '').split(BRANCH_SEPARATOR)[0];
}

/** Lowercased, punctuation-free, branch-free form of a merchant label. */
export function canonicalMerchantName(raw: string): string {
  return merchantKey(withoutBranch(String(raw)))
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The label as the user typed it, minus branch noise and stray spacing. */
function displaySpelling(raw: string): string {
  return withoutBranch(raw).replace(/\s+/g, ' ').trim();
}

function canAbsorb(prefix: string): boolean {
  return prefix.length >= MIN_PREFIX_LENGTH && !GENERIC_WORDS.has(prefix) && !/^\p{N}+$/u.test(prefix);
}

export interface MerchantGroups {
  /** The group a label belongs to, or null for a blank label. */
  keyOf(raw: string): string | null;
  /** The spelling to show for a group: the one typed most often. */
  nameOf(key: string): string;
}

export function buildMerchantGroups(rows: readonly { merchantRaw: string }[]): MerchantGroups {
  const spellings = new Map<string, Map<string, number>>();
  for (const { merchantRaw } of rows) {
    const canonical = canonicalMerchantName(merchantRaw);
    if (!canonical) continue;
    const spelling = displaySpelling(merchantRaw);
    const counts = spellings.get(canonical) ?? new Map<string, number>();
    counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
    spellings.set(canonical, counts);
  }

  // Shortest first, so the first absorbing prefix found is the root of its whole chain.
  const roots = [...spellings.keys()].filter(canAbsorb).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  const rootOf = (canonical: string): string =>
    roots.find((root) => canonical.startsWith(`${root} `)) ?? canonical;

  const names = new Map<string, Map<string, number>>();
  for (const [canonical, counts] of spellings) {
    const root = rootOf(canonical);
    const merged = names.get(root) ?? new Map<string, number>();
    for (const [spelling, count] of counts) merged.set(spelling, (merged.get(spelling) ?? 0) + count);
    names.set(root, merged);
  }

  return {
    keyOf(raw) {
      const canonical = canonicalMerchantName(raw);
      return canonical ? rootOf(canonical) : null;
    },
    nameOf(key) {
      const counts = names.get(key);
      if (!counts) return key;
      return [...counts.entries()].sort(([a, countA], [b, countB]) =>
        countB - countA || b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))[0][0];
    },
  };
}

interface PlaceRank { key: string; name: string; visits: number; lastDay: string }

/** Places in `rows`, grouped as the story groups them, with visits counted once per day. */
function rankPlaces(rows: readonly Transaction[]): PlaceRank[] {
  const expenses = rows.filter((txn) => txn.type === 'expense');
  const groups = buildMerchantGroups(expenses);
  const tallies = new Map<string, { days: Set<string>; lastDay: string }>();
  for (const txn of expenses) {
    const key = groups.keyOf(txn.merchantRaw);
    if (!key) continue;
    const day = (txn.date ?? txn.createdAt).slice(0, 10);
    const tally = tallies.get(key) ?? { days: new Set<string>(), lastDay: day };
    tally.days.add(day);
    if (day > tally.lastDay) tally.lastDay = day;
    tallies.set(key, tally);
  }
  return [...tallies.entries()]
    .map(([key, { days, lastDay }]) => ({ key, name: groups.nameOf(key), visits: days.size, lastDay }))
    .sort((a, b) => b.visits - a.visits || (a.lastDay < b.lastDay ? 1 : a.lastDay > b.lastDay ? -1 : 0));
}

const MAX_SUGGESTIONS = 5;

/** The user's own most-visited places in one category, for one-tap merchant entry. */
export function placesForCategory(
  transactions: readonly Transaction[],
  categoryId: string,
  limit = MAX_SUGGESTIONS,
): string[] {
  return rankPlaces(transactions.filter((txn) => txn.categoryId === categoryId))
    .slice(0, limit)
    .map((place) => place.name);
}

/** Known places whose name has a word starting with what was typed, most-visited first. */
export function merchantSuggestions(
  transactions: readonly Transaction[],
  typed: string,
  limit = MAX_SUGGESTIONS,
): string[] {
  const query = canonicalMerchantName(typed);
  if (!query) return [];
  return rankPlaces(transactions)
    .map((place) => ({ ...place, canonical: canonicalMerchantName(place.name) }))
    .filter((place) => place.canonical !== query && ` ${place.canonical}`.includes(` ${query}`))
    // Same visits: a name that starts with the text reads as a better completion than a later word.
    .sort((a, b) => b.visits - a.visits
      || Number(b.canonical.startsWith(query)) - Number(a.canonical.startsWith(query)))
    .slice(0, limit)
    .map((place) => place.name);
}
