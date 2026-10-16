import { currentMonthKey, txnMonthKey } from './budget';
import { buildMerchantGroups } from './merchantGroups';
import type { Trip } from './trips';
import type { Transaction } from './types';
import {
  detectStoryHighlight,
  type RecapStoryHighlight,
  type RecapStoryHighlightKind,
} from './recapStoryHighlight';

export type { RecapStoryHighlight, RecapStoryHighlightKind };
export { detectStoryHighlight };

export type RecapStoryKind = 'full' | 'short';

export interface RecapStoryPlace { name: string; visits: number }

export type RecapStoryCliffhanger =
  | { kind: 'challenger'; name: string; visits: number }
  | { kind: 'crown'; name: string }
  | { kind: 'missesYou'; name: string };

/** Everything between the cow and the finale; the scenes a short story can show as locked. */
export type RecapStoryContentSceneId =
  | 'topSpot' | 'foodPodium' | 'shoppingRegular' | 'discoveries' | 'rideOrDie' | 'ghosted'
  | 'biggestDay' | 'spotlight' | 'versusLastMonth';

export interface RecapStoryCollage {
  topSpot?: RecapStoryPlace;
  foodPodium?: string[];
  biggestDay?: { day: string; total: number };
  versusChange?: number;
}

/**
 * The story is private by default: it names places and shows display-currency amounts. Sharing
 * can mask every amount (see `RecapStoryFrame`'s `hideAmounts`). It never carries notes,
 * account details or raw descriptions.
 */
export type RecapStoryScene =
  | { id: 'ritual'; type: 'ritual' }
  | { id: 'topSpot'; type: 'topSpot'; name: string; visits: number; total: number; categoryId: string;
      /** "About once every N days" across the calendar month. */
      everyDays: number }
  | { id: 'foodPodium'; type: 'foodPodium'; places: RecapStoryPlace[]; topIsTopSpot: boolean }
  | { id: 'shoppingRegular'; type: 'shoppingRegular'; name: string; visits: number }
  | { id: 'discoveries'; type: 'discoveries'; count: number; bestFind: RecapStoryPlace }
  | { id: 'rideOrDie'; type: 'rideOrDie'; name: string; months: number }
  | { id: 'ghosted'; type: 'ghosted'; name: string; previousVisits: number }
  | { id: 'biggestDay'; type: 'biggestDay'; day: string; total: number; stops: number }
  | { id: 'spotlight'; type: 'spotlight'; highlight: RecapStoryHighlight }
  | { id: 'versusLastMonth'; type: 'versusLastMonth'; total: number; previousTotal: number; change: number;
      movedCategory?: { categoryId: string; change: number } }
  | { id: 'finale'; type: 'finale'; collage: RecapStoryCollage; cliffhanger: RecapStoryCliffhanger | null;
      locked: RecapStoryContentSceneId[] };

/** Narrative order: the order scenes play, and the order selected cards are saved in. */
export const RECAP_STORY_SCENE_ORDER: readonly RecapStoryScene['id'][] = [
  'ritual', 'topSpot', 'foodPodium', 'shoppingRegular', 'discoveries', 'rideOrDie', 'ghosted', 'biggestDay',
  'spotlight', 'versusLastMonth', 'finale',
];

export interface RecapStoryModel {
  month: string;
  kind: RecapStoryKind;
  /** The display currency every amount in `scenes` is already converted to. */
  currency: string;
  scenes: RecapStoryScene[];
  defaultSelectedSceneIds: RecapStoryScene['id'][];
}

type SpendOf = (txn: { amount: number; currency: string; nativeAmount?: number | null }) => number;

export interface BuildRecapStoryInput {
  transactions: Transaction[];
  month: string;
  now?: Date;
  /** Saved trips. Spending dated in `month` names the On the Move spotlight. */
  trips?: readonly Trip[];
  /** Display-currency spend, so story amounts match the Recap screen. */
  spendOf?: SpendOf;
  /** Code of the currency `spendOf` converts to. */
  currency?: string;
}

/** Recurring bills: never a favourite place, a loyal streak or a discovery. */
const BILL_CATEGORY_IDS = new Set(['rental', 'utilities', 'phoneBill', 'insurance', 'subscriptions']);
const MIN_TOP_SPOT_VISITS = 3;
const MIN_FOOD_PLACES = 3;
const MIN_SHOPPING_VISITS = 2;
const MIN_RIDE_OR_DIE_MONTHS = 3;
const MIN_GHOSTED_VISITS = 3;
const MIN_BIGGEST_DAY_ACTIVE_DAYS = 5;
const MIN_CHALLENGER_VISITS = 2;
const MIN_FULL_CONTENT_SCENES = 3;
/** The scenes a short story teases as locked, most enticing first. */
const LOCKABLE_SCENES: RecapStoryContentSceneId[] = ['topSpot', 'foodPodium', 'biggestDay', 'discoveries'];
const MAX_LOCKED = 3;

const identitySpend: SpendOf = (txn) => Math.abs(txn.amount);

export function isCompletedStoryMonth(month: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}$/.test(month) && month < currentMonthKey(now);
}

export function transactionDay(txn: Transaction): string {
  return (txn.date ?? txn.createdAt).slice(0, 10);
}

function categoryId(txn: Transaction): string {
  return txn.categoryId ?? 'other';
}

function shiftMonth(month: string, delta: number): string {
  const [year, calendarMonth] = month.split('-').map(Number);
  const date = new Date(year, calendarMonth - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(month: string): number {
  const [year, calendarMonth] = month.split('-').map(Number);
  return new Date(year, calendarMonth, 0).getDate();
}

/** Sums in cents so ties and totals do not carry floating-point residue. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface PlaceTally {
  key: string;
  days: Set<string>;
  total: number;
  categoryCounts: Map<string, number>;
}

/** Visits are distinct days: two receipts at one place on one day are one visit. */
function tallyPlaces(
  expenses: readonly Transaction[],
  keyOf: (raw: string) => string | null,
  spendOf: SpendOf,
  include: (txn: Transaction) => boolean = () => true,
): Map<string, PlaceTally> {
  const tallies = new Map<string, PlaceTally>();
  for (const txn of expenses) {
    if (!include(txn)) continue;
    const key = keyOf(txn.merchantRaw);
    if (!key) continue;
    const tally = tallies.get(key) ?? { key, days: new Set<string>(), total: 0, categoryCounts: new Map() };
    tally.days.add(transactionDay(txn));
    tally.total += spendOf(txn);
    tally.categoryCounts.set(categoryId(txn), (tally.categoryCounts.get(categoryId(txn)) ?? 0) + 1);
    tallies.set(key, tally);
  }
  return tallies;
}

function rankPlaces(tallies: Iterable<PlaceTally>, nameOf: (key: string) => string): PlaceTally[] {
  return [...tallies].sort((a, b) =>
    b.days.size - a.days.size || money(b.total) - money(a.total) || compareText(nameOf(a.key), nameOf(b.key)));
}

function mainCategory(tally: PlaceTally): string {
  return [...tally.categoryCounts.entries()].sort(([a, countA], [b, countB]) => countB - countA || compareText(a, b))[0][0];
}

function isBill(txn: Transaction): boolean {
  return BILL_CATEGORY_IDS.has(categoryId(txn));
}

/** Whether a card prints money, and so offers the share sheet's hide-amounts toggle. */
export function sceneHasAmounts(scene: RecapStoryScene): boolean {
  switch (scene.type) {
    case 'topSpot':
    case 'biggestDay':
    case 'versusLastMonth':
      return true;
    case 'finale':
      return !!scene.collage.biggestDay || scene.collage.versusChange !== undefined;
    default:
      return false;
  }
}

/** A deterministic copy variant, so a month replays the same words and the next month reads fresh. */
export function recapStoryVariant(month: string, sceneId: string, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (const char of `${month}:${sceneId}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % count;
}

export function buildRecapStoryModel({
  transactions,
  month,
  now = new Date(),
  trips = [],
  spendOf = identitySpend,
  currency = 'MYR',
}: BuildRecapStoryInput): RecapStoryModel | null {
  if (!isCompletedStoryMonth(month, now)) return null;

  const monthTransactions = transactions.filter((txn) => txn.type !== 'transfer' && txnMonthKey(txn) === month);
  if (monthTransactions.length === 0) return null;

  const allExpenses = transactions.filter((txn) => txn.type === 'expense');
  const groups = buildMerchantGroups(allExpenses);
  const nameOf = (key: string) => groups.nameOf(key);
  const keyOf = (raw: string) => groups.keyOf(raw);
  const expensesIn = (key: string) => allExpenses.filter((txn) => txnMonthKey(txn) === key);
  const expenses = expensesIn(month);
  const previousMonth = shiftMonth(month, -1);
  const previousExpenses = expensesIn(previousMonth);
  const hasEarlierMonth = transactions.some((txn) => txn.type !== 'transfer' && (txnMonthKey(txn) ?? '') < month);

  const places = rankPlaces(tallyPlaces(expenses, keyOf, spendOf, (txn) => !isBill(txn)).values(), nameOf);

  // #1 spot
  const top = places[0] && places[0].days.size >= MIN_TOP_SPOT_VISITS ? places[0] : null;
  const topSpot: Extract<RecapStoryScene, { id: 'topSpot' }> | null = top ? {
    id: 'topSpot', type: 'topSpot', name: nameOf(top.key), visits: top.days.size, total: money(top.total),
    categoryId: mainCategory(top), everyDays: Math.max(1, Math.round(daysInMonth(month) / top.days.size)),
  } : null;

  // Food podium
  const food = rankPlaces(tallyPlaces(expenses, keyOf, spendOf, (txn) => categoryId(txn) === 'food').values(), nameOf);
  const foodPodium: Extract<RecapStoryScene, { id: 'foodPodium' }> | null = food.length >= MIN_FOOD_PLACES ? {
    id: 'foodPodium', type: 'foodPodium',
    places: food.slice(0, 3).map((tally) => ({ name: nameOf(tally.key), visits: tally.days.size })),
    topIsTopSpot: !!top && food[0].key === top.key,
  } : null;

  // Shopping regular
  const [shop] = rankPlaces(tallyPlaces(expenses, keyOf, spendOf, (txn) => categoryId(txn) === 'shopping').values(), nameOf);
  const shoppingRegular: Extract<RecapStoryScene, { id: 'shoppingRegular' }> | null =
    shop && shop.days.size >= MIN_SHOPPING_VISITS && shop.key !== top?.key
      ? { id: 'shoppingRegular', type: 'shoppingRegular', name: nameOf(shop.key), visits: shop.days.size }
      : null;

  // New discoveries
  const seenBefore = new Set(allExpenses
    .filter((txn) => (txnMonthKey(txn) ?? '') < month)
    .map((txn) => keyOf(txn.merchantRaw))
    .filter((key): key is string => !!key));
  const newPlaces = hasEarlierMonth ? places.filter((tally) => !seenBefore.has(tally.key)) : [];
  const discoveries: Extract<RecapStoryScene, { id: 'discoveries' }> | null = newPlaces.length > 0 ? {
    id: 'discoveries', type: 'discoveries', count: newPlaces.length,
    bestFind: { name: nameOf(newPlaces[0].key), visits: newPlaces[0].days.size },
  } : null;

  // Ride or die: consecutive months ending this month.
  const monthsByPlace = new Map<string, Set<string>>();
  for (const txn of allExpenses) {
    if (isBill(txn)) continue;
    const key = keyOf(txn.merchantRaw);
    const txnMonth = txnMonthKey(txn);
    if (!key || !txnMonth) continue;
    const seen = monthsByPlace.get(key) ?? new Set<string>();
    seen.add(txnMonth);
    monthsByPlace.set(key, seen);
  }
  const streaks = places.map((tally) => {
    const seen = monthsByPlace.get(tally.key) ?? new Set<string>();
    let months = 0;
    while (seen.has(shiftMonth(month, -months))) months += 1;
    return { tally, months };
  }).filter(({ months }) => months >= MIN_RIDE_OR_DIE_MONTHS)
    .sort((a, b) => b.months - a.months || b.tally.days.size - a.tally.days.size
      || compareText(nameOf(a.tally.key), nameOf(b.tally.key)));
  const rideOrDie: Extract<RecapStoryScene, { id: 'rideOrDie' }> | null = streaks[0]
    ? { id: 'rideOrDie', type: 'rideOrDie', name: nameOf(streaks[0].tally.key), months: streaks[0].months }
    : null;

  // The one you ghosted
  const thisMonthKeys = new Set(expenses.map((txn) => keyOf(txn.merchantRaw)).filter(Boolean));
  const [ghost] = rankPlaces(tallyPlaces(previousExpenses, keyOf, spendOf, (txn) => !isBill(txn)).values(), nameOf)
    .filter((tally) => tally.days.size >= MIN_GHOSTED_VISITS && !thisMonthKeys.has(tally.key));
  const ghosted: Extract<RecapStoryScene, { id: 'ghosted' }> | null = ghost
    ? { id: 'ghosted', type: 'ghosted', name: nameOf(ghost.key), previousVisits: ghost.days.size }
    : null;

  // Biggest day
  const byDay = new Map<string, { total: number; stops: number }>();
  for (const txn of expenses) {
    const day = transactionDay(txn);
    const entry = byDay.get(day) ?? { total: 0, stops: 0 };
    entry.total += spendOf(txn);
    entry.stops += 1;
    byDay.set(day, entry);
  }
  const [biggest] = [...byDay.entries()].sort(([dayA, a], [dayB, b]) => money(b.total) - money(a.total) || compareText(dayA, dayB));
  const biggestDay: Extract<RecapStoryScene, { id: 'biggestDay' }> | null = biggest && byDay.size >= MIN_BIGGEST_DAY_ACTIVE_DAYS
    ? { id: 'biggestDay', type: 'biggestDay', day: biggest[0], total: money(biggest[1].total), stops: biggest[1].stops }
    : null;

  // Spotlight: life events. Café stops and lone big buys now belong to the place and day scenes.
  const highlight = detectStoryHighlight(transactions, month, trips, spendOf);
  const spotlight: Extract<RecapStoryScene, { id: 'spotlight' }> | null = highlight
    ? { id: 'spotlight', type: 'spotlight', highlight }
    : null;

  // Versus last month
  let versusLastMonth: Extract<RecapStoryScene, { id: 'versusLastMonth' }> | null = null;
  if (expenses.length > 0 && previousExpenses.length > 0) {
    const byCategory = new Map<string, number>();
    const add = (rows: Transaction[], sign: number) => {
      for (const txn of rows) byCategory.set(categoryId(txn), (byCategory.get(categoryId(txn)) ?? 0) + sign * spendOf(txn));
    };
    add(expenses, 1);
    add(previousExpenses, -1);
    const [moved] = [...byCategory.entries()]
      .map(([id, change]) => ({ categoryId: id, change: money(change) }))
      .filter(({ change }) => change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || compareText(a.categoryId, b.categoryId));
    const total = money(expenses.reduce((sum, txn) => sum + spendOf(txn), 0));
    const previousTotal = money(previousExpenses.reduce((sum, txn) => sum + spendOf(txn), 0));
    versusLastMonth = {
      id: 'versusLastMonth', type: 'versusLastMonth', total, previousTotal, change: money(total - previousTotal),
      ...(moved ? { movedCategory: moved } : {}),
    };
  }

  const content = [topSpot, foodPodium, shoppingRegular, discoveries, rideOrDie, ghosted, biggestDay, spotlight, versusLastMonth]
    .filter((scene): scene is NonNullable<typeof scene> => scene !== null);
  const kind: RecapStoryKind = content.length >= MIN_FULL_CONTENT_SCENES ? 'full' : 'short';
  const present = new Set(content.map((scene) => scene.id));

  const challenger = newPlaces.find((tally) => tally.key !== top?.key && tally.days.size >= MIN_CHALLENGER_VISITS);
  const cliffhanger: RecapStoryCliffhanger | null = kind === 'short' ? null
    : challenger ? { kind: 'challenger', name: nameOf(challenger.key), visits: challenger.days.size }
    : topSpot ? { kind: 'crown', name: topSpot.name }
    : ghosted ? { kind: 'missesYou', name: ghosted.name }
    : null;

  const collage: RecapStoryCollage = {
    ...(topSpot ? { topSpot: { name: topSpot.name, visits: topSpot.visits } } : {}),
    ...(foodPodium ? { foodPodium: foodPodium.places.map((place) => place.name) } : {}),
    ...(biggestDay ? { biggestDay: { day: biggestDay.day, total: biggestDay.total } } : {}),
    ...(versusLastMonth ? { versusChange: versusLastMonth.change } : {}),
  };
  const finale: Extract<RecapStoryScene, { id: 'finale' }> = {
    id: 'finale', type: 'finale', collage, cliffhanger,
    locked: kind === 'short' ? LOCKABLE_SCENES.filter((id) => !present.has(id)).slice(0, MAX_LOCKED) : [],
  };

  return {
    month,
    kind,
    currency,
    scenes: [{ id: 'ritual', type: 'ritual' }, ...content, finale],
    defaultSelectedSceneIds: topSpot ? ['topSpot', 'finale'] : ['finale'],
  };
}

export function shouldShowRecapStoryInvitation(
  transactions: Transaction[],
  now: Date,
  handledMonth: string | null,
): { visible: boolean; month: string } {
  const month = shiftMonth(currentMonthKey(now), -1);
  const inWindow = now.getDate() >= 1 && now.getDate() <= 7;
  return {
    month,
    visible: inWindow && handledMonth !== month &&
      buildRecapStoryModel({ transactions, month, now }) !== null,
  };
}
