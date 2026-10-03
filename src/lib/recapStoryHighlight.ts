import { txnMonthKey } from './budget';
import type { Trip } from './trips';
import { tripMonthTotals } from './trips';
import type { Transaction } from './types';

export type RecapStoryHighlightKind =
  | 'techUpgrade'
  | 'vehicleMilestone'
  | 'homeMilestone'
  | 'giftCelebration'
  | 'incomeBoost'
  | 'selfCare'
  | 'dates'
  | 'cafeRhythm'
  | 'tripAdventure'
  | 'outlierSpend';

export interface RecapStoryHighlight {
  kind: RecapStoryHighlightKind;
  itemLabel?: string;
  /** Trip names shown on On the Move, highest spend first, at most three. */
  places?: string[];
  /** Trips beyond the three named places. */
  moreCount?: number;
  occasion?: string;
  count?: number;
  percentChange?: number;
  categoryId?: string;
  iconName: string;
}

function prevMonthKey(month: string): string {
  const [year, calendarMonth] = month.split('-').map(Number);
  const date = new Date(year, calendarMonth - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function combinedText(txn: Transaction): string {
  return `${txn.merchantRaw || ''} ${txn.remark || ''}`.toLowerCase();
}

const TECH_KEYWORDS = [
  'macbook', 'apple', 'laptop', 'ipad', 'iphone', 'computer', 'pc', 'samsung', 'gadget',
  'playstation', 'ps5', 'nintendo', 'switch', 'camera', 'sony', 'asus', 'lenovo', 'dell',
  'airpods', 'smartwatch', 'tablet', 'electronics',
  '电脑', '手机', '平板', '笔记本', '苹果', '相机', '游戏机', '主机', '耳机', '智能手表',
];

const VEHICLE_KEYWORDS = [
  'car', 'motorcycle', 'downpayment', 'deposit', 'honda', 'toyota', 'proton', 'perodua',
  'bmw', 'mercedes', 'vehicle', 'auto', 'road tax', 'workshop',
  '买车', '汽车', '首付', '车贷', '机车', '新车', '定金',
];

const HOME_KEYWORDS = [
  'house', 'furniture', 'renovation', 'ikea', 'sofa', 'bed', 'fridge', 'aircond',
  'refrigerator', 'washing machine', 'dryer', 'mattress', 'cabinet', 'interior', 'appliance',
  '装修', '买房', '家私', '家具', '家电', '沙发', '床垫', '冰箱', '冷气', '洗衣机',
];

const GIFT_KEYWORDS = [
  'gift', 'gifts', 'present', 'birthday', 'bday', 'anniversary', 'wedding', 'treat',
  'party', 'celebration', 'for mom', 'for dad', 'for friend', 'farewell',
  '礼物', '生日', '结婚', '周年', '请客', '红包', '送礼', '送朋友', '给妈妈', '给爸爸',
];

const INCOME_BOOST_KEYWORDS = [
  'bonus', 'raise', 'increment', 'commission', 'dividend', 'allowance', 'angpow', 'windfall',
  '加薪', '涨薪', '奖金', '花红', '分红', '提成',
];

const WELLNESS_KEYWORDS = [
  'massage', 'spa', 'facial', 'wellness', 'salon', 'haircut', 'manicure', 'pedicure',
  'treat myself', 'healthland', 'therapy', 'gym', 'pilates', 'yoga',
  '按摩', '水疗', '美容', '理发', '剪发', '做脸', '推拿', '美甲', '养生', '瑜伽',
];

const DATE_KEYWORDS = [
  'date', 'date night', 'candlelight', 'anniversary dinner',
  '约会', '七夕', '情人节',
];

const CAFE_KEYWORDS = [
  'coffee', 'cafe', 'starbucks', 'zus', 'chagee', 'boba', 'kopi', 'tealive', 'gigi coffee',
  'cappuccino', 'latte', 'espresso', 'flat white',
  '咖啡', '奶茶', '下午茶',
];

function canonicalTechLabel(text: string): string {
  if (text.includes('macbook')) return 'MacBook';
  if (text.includes('ipad')) return 'iPad';
  if (text.includes('iphone')) return 'iPhone';
  if (text.includes('laptop') || text.includes('笔记本')) return 'Laptop';
  if (text.includes('playstation') || text.includes('nintendo') || text.includes('游戏机')) return 'Gaming';
  return 'Tech';
}

function canonicalOccasion(text: string): string {
  if (text.includes('birthday') || text.includes('bday') || text.includes('生日')) return 'birthday';
  if (text.includes('wedding') || text.includes('结婚')) return 'wedding';
  if (text.includes('anniversary') || text.includes('周年')) return 'anniversary';
  return 'celebration';
}

type SpendOf = (txn: { amount: number; currency: string; nativeAmount?: number | null }) => number;

const identitySpend: SpendOf = (txn) => Math.abs(txn.amount);

function tripAdventureHighlight(
  transactions: Transaction[],
  month: string,
  trips: readonly Trip[],
  spendOf: SpendOf,
): RecapStoryHighlight | null {
  const rows = tripMonthTotals(transactions, [...trips], month, spendOf)
    .filter((row) => row.trip.name.trim().length > 0);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 3);
  const moreCount = rows.length - shown.length;
  return {
    kind: 'tripAdventure',
    places: shown.map((row) => row.trip.name.trim()),
    ...(moreCount > 0 ? { moreCount } : {}),
    iconName: 'pin',
  };
}

export function detectStoryHighlight(
  transactions: Transaction[],
  month: string,
  trips: readonly Trip[] = [],
  spendOf: SpendOf = identitySpend,
): RecapStoryHighlight | null {
  const places = tripAdventureHighlight(transactions, month, trips, spendOf);
  if (places) return places;

  const monthTxns = transactions.filter((t) => t.type !== 'transfer' && txnMonthKey(t) === month);
  if (monthTxns.length === 0) return null;

  const expenses = monthTxns.filter((t) => t.type === 'expense');
  const incomes = monthTxns.filter((t) => t.type === 'income');

  // Sort expenses by amount descending
  const sortedExpenses = [...expenses].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const totalExpenseAmount = sortedExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const medianExpenseAmount = sortedExpenses.length > 0
    ? Math.abs(sortedExpenses[Math.floor(sortedExpenses.length / 2)].amount)
    : 0;

  // 1. Tech Upgrade Check
  for (const txn of sortedExpenses) {
    const text = combinedText(txn);
    if (TECH_KEYWORDS.some((kw) => text.includes(kw))) {
      return {
        kind: 'techUpgrade',
        itemLabel: canonicalTechLabel(text),
        categoryId: txn.categoryId ?? 'shopping',
        iconName: 'sparkles',
      };
    }
  }

  // 2. Vehicle Milestone Check
  for (const txn of sortedExpenses) {
    const text = combinedText(txn);
    if (VEHICLE_KEYWORDS.some((kw) => text.includes(kw))) {
      return {
        kind: 'vehicleMilestone',
        itemLabel: 'Car',
        categoryId: txn.categoryId ?? 'travelling',
        iconName: 'car',
      };
    }
  }

  // 3. Home Milestone Check
  for (const txn of sortedExpenses) {
    const text = combinedText(txn);
    if (HOME_KEYWORDS.some((kw) => text.includes(kw))) {
      return {
        kind: 'homeMilestone',
        itemLabel: 'Home & Living',
        categoryId: txn.categoryId ?? 'shopping',
        iconName: 'home',
      };
    }
  }

  // 4. Gifts & Celebrations
  for (const txn of sortedExpenses) {
    const text = combinedText(txn);
    if (GIFT_KEYWORDS.some((kw) => text.includes(kw)) || txn.categoryId === 'family') {
      if (GIFT_KEYWORDS.some((kw) => text.includes(kw)) || Math.abs(txn.amount) >= medianExpenseAmount) {
        return {
          kind: 'giftCelebration',
          occasion: canonicalOccasion(text),
          categoryId: txn.categoryId ?? 'family',
          iconName: 'gift',
        };
      }
    }
  }

  // 5. Income Boost / Salary Raise / Bonus
  const previousMonth = prevMonthKey(month);
  const previousIncomes = transactions.filter((t) => t.type === 'income' && txnMonthKey(t) === previousMonth);
  const totalPrevIncome = previousIncomes.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalCurrentIncome = incomes.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  if (totalPrevIncome > 0 && totalCurrentIncome >= totalPrevIncome * 1.15) {
    const percentChange = Math.round(((totalCurrentIncome - totalPrevIncome) / totalPrevIncome) * 100);
    return {
      kind: 'incomeBoost',
      percentChange,
      iconName: 'wallet',
    };
  }

  for (const inc of incomes) {
    const text = combinedText(inc);
    if (INCOME_BOOST_KEYWORDS.some((kw) => text.includes(kw))) {
      return {
        kind: 'incomeBoost',
        iconName: 'wallet',
      };
    }
  }

  // 6. Wellness & Self-Care (Massage, Spa, Pampering)
  for (const txn of sortedExpenses) {
    const text = combinedText(txn);
    if (WELLNESS_KEYWORDS.some((kw) => text.includes(kw))) {
      return {
        kind: 'selfCare',
        itemLabel: text.includes('massage') || text.includes('按摩') || text.includes('推拿') ? 'Massage' : 'Self-Care',
        categoryId: txn.categoryId ?? 'medical',
        iconName: 'heart',
      };
    }
  }

  // 7. Date Nights
  const dateTxns = sortedExpenses.filter((t) => {
    const text = combinedText(t);
    return DATE_KEYWORDS.some((kw) => text.includes(kw));
  });
  if (dateTxns.length >= 1) {
    return {
      kind: 'dates',
      count: dateTxns.length,
      iconName: 'heart',
    };
  }

  // 8. Cafe Rhythm (4+ cafe stops)
  const cafeTxns = sortedExpenses.filter((t) => {
    const text = combinedText(t);
    return CAFE_KEYWORDS.some((kw) => text.includes(kw));
  });
  if (cafeTxns.length >= 4) {
    return {
      kind: 'cafeRhythm',
      count: cafeTxns.length,
      iconName: 'utensils',
    };
  }

  // 9. Statistical Outlier Spend (Fallback when no keywords matched, requires at least 3 expenses)
  if (sortedExpenses.length >= 3 && totalExpenseAmount > 0) {
    const top = sortedExpenses[0];
    const topAmount = Math.abs(top.amount);
    const topShare = topAmount / totalExpenseAmount;
    if (topShare >= 0.35 || (medianExpenseAmount > 0 && topAmount >= medianExpenseAmount * 3)) {
      return {
        kind: 'outlierSpend',
        categoryId: top.categoryId ?? 'shopping',
        iconName: 'sparkles',
      };
    }
  }

  return null;
}
