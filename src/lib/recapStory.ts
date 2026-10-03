import { currentMonthKey, txnMonthKey } from './budget';
import type { Trip } from './trips';
import type { Transaction } from './types';
import {
  detectStoryHighlight,
  type RecapStoryHighlight,
  type RecapStoryHighlightKind,
} from './recapStoryHighlight';

export type { RecapStoryHighlight, RecapStoryHighlightKind };
export { detectStoryHighlight };

export type RecapStoryKind = 'sparse' | 'full';
export const RECAP_PERSONA_KEYS = [
  'food', 'shopping', 'entertainment', 'travelling', 'learning', 'family', 'medical',
  'utilities', 'subscriptions', 'rental', 'phoneBill', 'insurance', 'other', 'consistent',
  'explorer', 'smallChapter', 'incomeOnly',
] as const;
export type RecapPersonaKey = typeof RECAP_PERSONA_KEYS[number];

export type RecapBadgeKey =
  | 'fiveExpenses' | 'threeDays' | 'threeWeeks' | 'fourWeeks' | 'fourCategories'
  | 'weekendRhythm' | 'weekdayRhythm' | 'firstChapter';

export type RecapStoryScene =
  | { id: 'ritual'; type: 'ritual' }
  | { id: 'identity'; type: 'identity'; persona: RecapPersonaKey; activityDays: number }
  | { id: 'pattern'; type: 'pattern'; categoryId: string; recordedSharePercent: number;
      previousRecordedSharePercent?: number; changeDirection?: 'higher' | 'lower' | 'same';
      merchantCameo?: string }
  | { id: 'spotlight'; type: 'spotlight'; highlight: RecapStoryHighlight }
  | { id: 'habit'; type: 'habit'; activityDays: number; activityWeeks: number }
  | { id: 'finale'; type: 'finale'; badges: RecapBadgeKey[] };

export interface RecapStoryModel {
  month: string;
  kind: RecapStoryKind;
  scenes: RecapStoryScene[];
  defaultSelectedSceneIds: RecapStoryScene['id'][];
}

export interface BuildRecapStoryInput {
  transactions: Transaction[];
  month: string;
  now?: Date;
  merchantCameo?: string | null;
  /** Saved trips. Spending dated in `month` names the On the Move spotlight. */
  trips?: readonly Trip[];
  /** Display-currency spend, so trip order matches Trips this month. */
  spendOf?: (txn: { amount: number; currency: string; nativeAmount?: number | null }) => number;
}

const PERSONA_CATEGORY_IDS = new Set<RecapPersonaKey>([
  'food', 'shopping', 'entertainment', 'travelling', 'learning', 'family', 'medical',
  'utilities', 'subscriptions', 'rental', 'phoneBill', 'insurance',
]);

export const RECAP_BADGE_KEYS: RecapBadgeKey[] = [
  // A full story necessarily proves these two facts, so keep them ahead of optional badges.
  'fiveExpenses', 'threeDays', 'fourWeeks', 'threeWeeks', 'fourCategories',
  'weekendRhythm', 'weekdayRhythm', 'firstChapter',
];

const MONEY_SCALE = 1_000_000;

export function isCompletedStoryMonth(month: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}$/.test(month) && month < currentMonthKey(now);
}

export function transactionDay(txn: Transaction): string {
  return (txn.date ?? txn.createdAt).slice(0, 10);
}

function categoryId(txn: Transaction): string {
  return txn.categoryId ?? 'other';
}

function mondayWeekKey(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateDayOfWeek(day: string): number {
  return new Date(`${day}T12:00:00`).getDay();
}

function expensesByCategory(transactions: Transaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const id = categoryId(transaction);
    totals.set(id, (totals.get(id) ?? 0) + Math.round(Math.abs(transaction.amount) * MONEY_SCALE));
  }
  return totals;
}

function winningCategory(totals: Map<string, number>): { id: string; total: number } | null {
  let winner: { id: string; total: number } | null = null;
  for (const [id, total] of totals) {
    if (!winner || total > winner.total || (total === winner.total && id < winner.id)) {
      winner = { id, total };
    }
  }
  return winner;
}

function personaForCategory(id: string): RecapPersonaKey {
  return PERSONA_CATEGORY_IDS.has(id as RecapPersonaKey) ? id as RecapPersonaKey : 'other';
}

function previousMonthKey(month: string): string {
  const [year, calendarMonth] = month.split('-').map(Number);
  const date = new Date(year, calendarMonth - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function comparisonFor(
  transactions: Transaction[],
  month: string,
  category: string,
  currentSharePercent: number,
): Pick<Extract<RecapStoryScene, { id: 'pattern' }>, 'previousRecordedSharePercent' | 'changeDirection'> {
  const previousExpenses = transactions.filter((transaction) =>
    transaction.type === 'expense' && txnMonthKey(transaction) === previousMonthKey(month),
  );
  const totals = expensesByCategory(previousExpenses);
  const previousTotal = [...totals.values()].reduce((sum, total) => sum + total, 0);
  if (previousTotal === 0) return {};

  const previousShare = Math.round(((totals.get(category) ?? 0) / previousTotal) * 100);
  const changeDirection = currentSharePercent > previousShare ? 'higher'
    : currentSharePercent < previousShare ? 'lower' : 'same';
  return { previousRecordedSharePercent: previousShare, changeDirection };
}

function storyBadges(
  expenseCount: number,
  activityDays: number,
  activityWeeks: number,
  expenseCategoryCount: number,
  activityDayKeys: Set<string>,
  isFirstRecordedMonth: boolean,
): RecapBadgeKey[] {
  const weekendDays = [...activityDayKeys].filter((day) => {
    const weekday = dateDayOfWeek(day);
    return weekday === 0 || weekday === 6;
  }).length;
  const weekdayDays = activityDayKeys.size - weekendDays;
  const earned = new Set<RecapBadgeKey>();
  if (expenseCount >= 5) earned.add('fiveExpenses');
  if (activityWeeks >= 4) earned.add('fourWeeks');
  if (activityWeeks >= 3) earned.add('threeWeeks');
  if (expenseCategoryCount >= 4) earned.add('fourCategories');
  if (weekendDays >= 3 && weekendDays > weekdayDays) earned.add('weekendRhythm');
  if (weekdayDays >= 3 && weekdayDays > weekendDays) earned.add('weekdayRhythm');
  if (activityDays >= 3) earned.add('threeDays');
  if (isFirstRecordedMonth) earned.add('firstChapter');
  return RECAP_BADGE_KEYS.filter((badge) => earned.has(badge)).slice(0, 3);
}

/**
 * Returns user-disclosable merchant labels only when the caller explicitly asks for the
 * optional cameo picker. The default story builder intentionally never calls this helper.
 */
export function recapStoryMerchantCandidates(
  transactions: Transaction[],
  month: string,
  requestedCategoryId: string,
): string[] {
  const occurrences = new Map<string, number>();
  for (const transaction of transactions) {
    const merchant = transaction.merchantRaw.trim();
    if (
      transaction.type !== 'expense'
      || txnMonthKey(transaction) !== month
      || categoryId(transaction) !== requestedCategoryId
      || !merchant
    ) continue;
    occurrences.set(merchant, (occurrences.get(merchant) ?? 0) + 1);
  }
  return [...occurrences.entries()]
    .sort(([leftName, leftCount], [rightName, rightCount]) =>
      rightCount - leftCount || (leftName < rightName ? -1 : leftName > rightName ? 1 : 0),
    )
    .map(([merchant]) => merchant);
}

export function buildRecapStoryModel({
  transactions,
  month,
  now = new Date(),
  merchantCameo,
  trips = [],
  spendOf,
}: BuildRecapStoryInput): RecapStoryModel | null {
  if (!isCompletedStoryMonth(month, now)) return null;

  const monthTransactions = transactions.filter((transaction) =>
    transaction.type !== 'transfer' && txnMonthKey(transaction) === month,
  );
  if (monthTransactions.length === 0) return null;

  const expenses = monthTransactions.filter((transaction) => transaction.type === 'expense');
  const expenseDays = new Set(expenses.map(transactionDay));
  const activityDays = new Set(monthTransactions.map(transactionDay));
  const activityWeeks = new Set([...activityDays].map(mondayWeekKey)).size;
  const categoryTotals = expensesByCategory(expenses);
  const winner = winningCategory(categoryTotals);
  const totalExpenseAmount = [...categoryTotals.values()].reduce((sum, total) => sum + total, 0);
  const recordedSharePercent = winner && totalExpenseAmount > 0
    ? Math.round((winner.total / totalExpenseAmount) * 100)
    : 0;
  const persona = winner && recordedSharePercent >= 35 ? personaForCategory(winner.id)
    : activityWeeks >= 3 ? 'consistent'
    : categoryTotals.size >= 4 ? 'explorer'
    : expenses.length === 0 ? 'incomeOnly' : 'smallChapter';
  const priorRecordedTransactions = transactions.some((transaction) =>
    transaction.type !== 'transfer' && (txnMonthKey(transaction) ?? '') < month,
  );
  const badges = storyBadges(
    expenses.length,
    activityDays.size,
    activityWeeks,
    categoryTotals.size,
    activityDays,
    !priorRecordedTransactions,
  );
  const identity: Extract<RecapStoryScene, { id: 'identity' }> = {
    id: 'identity', type: 'identity', persona, activityDays: activityDays.size,
  };
  const finale: Extract<RecapStoryScene, { id: 'finale' }> = { id: 'finale', type: 'finale', badges };

  const highlight = detectStoryHighlight(transactions, month, trips, spendOf);

  if (expenses.length < 5 || expenseDays.size < 3 || !winner) {
    const sparseScenes: RecapStoryScene[] = [
      { id: 'ritual', type: 'ritual' },
      identity,
      ...(highlight ? [{ id: 'spotlight' as const, type: 'spotlight' as const, highlight }] : []),
      finale,
    ];
    return {
      month,
      kind: 'sparse',
      scenes: sparseScenes,
      defaultSelectedSceneIds: ['identity', 'finale'],
    };
  }

  const hasCameo = !!merchantCameo?.trim();
  const pattern: Extract<RecapStoryScene, { id: 'pattern' }> = {
    id: 'pattern',
    type: 'pattern',
    categoryId: winner.id,
    recordedSharePercent,
    ...comparisonFor(transactions, month, winner.id, recordedSharePercent),
    ...(hasCameo ? { merchantCameo: merchantCameo! } : {}),
  };
  const fullScenes: RecapStoryScene[] = [
    { id: 'ritual', type: 'ritual' },
    identity,
    pattern,
    ...(highlight ? [{ id: 'spotlight' as const, type: 'spotlight' as const, highlight }] : []),
    { id: 'habit', type: 'habit', activityDays: activityDays.size, activityWeeks },
    finale,
  ];
  return {
    month,
    kind: 'full',
    scenes: fullScenes,
    defaultSelectedSceneIds: ['identity', 'finale'],
  };
}

export function shouldShowRecapStoryInvitation(
  transactions: Transaction[],
  now: Date,
  handledMonth: string | null,
): { visible: boolean; month: string } {
  const month = previousMonthKey(currentMonthKey(now));
  const inWindow = now.getDate() >= 1 && now.getDate() <= 7;
  return {
    month,
    visible: inWindow && handledMonth !== month &&
      buildRecapStoryModel({ transactions, month, now }) !== null,
  };
}

