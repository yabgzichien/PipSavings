import type { Trip } from '../src/lib/trips';
import type { Transaction } from '../src/lib/types';
import {
  detectStoryHighlight,
  type RecapStoryHighlight,
} from '../src/lib/recapStoryHighlight';

let seq = 0;
function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `txn-${seq}`,
    merchantRaw: 'Store',
    merchantKey: 'store',
    amount: 50,
    currency: 'MYR',
    type: 'expense',
    date: '2026-08-10',
    categoryId: 'shopping',
    createdAt: '2026-08-10T12:00:00.000Z',
    source: 'manual',
    ...overrides,
  };
}

function makeTrip(overrides: Partial<Trip> & Pick<Trip, 'id' | 'name'>): Trip {
  return {
    createdAt: '2026-08-01T00:00:00.000Z',
    archived: false,
    startDate: null,
    endDate: null,
    icon: null,
    ...overrides,
  };
}

const prohibitedKeys = /amount|income|balance|worth|debt|budget|account|currency/i;
function assertPrivate(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(key).not.toMatch(prohibitedKeys);
    if (typeof child === 'string') {
      expect(child).not.toMatch(/(?:RM|MYR|SGD|USD|\$)\s*\d/i);
    }
    assertPrivate(child);
  }
}

describe('detectStoryHighlight', () => {
  beforeEach(() => { seq = 0; });

  it('detects a tech upgrade (MacBook) from remark or merchant', () => {
    const txns: Transaction[] = [
      makeTxn({ amount: 30, categoryId: 'food', date: '2026-08-02' }),
      makeTxn({ amount: 25, categoryId: 'food', date: '2026-08-05' }),
      makeTxn({
        merchantRaw: 'Apple Store',
        remark: 'New MacBook M3',
        amount: 4500,
        categoryId: 'shopping',
        date: '2026-08-12',
      }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight).not.toBeNull();
    expect(highlight?.kind).toBe('techUpgrade');
    expect(highlight?.itemLabel).toBe('MacBook');
    expect(highlight?.iconName).toBe('sparkles');
    assertPrivate(highlight);
  });

  it('lists saved trips with spending this month, highest spend first', () => {
    const trips = [
      makeTrip({ id: 'tokyo', name: 'Tokyo' }),
      makeTrip({ id: 'osaka', name: 'Osaka' }),
      makeTrip({ id: 'penang', name: 'Penang' }),
      makeTrip({ id: 'seoul', name: 'Seoul' }),
      makeTrip({ id: 'bali', name: 'Bali' }),
    ];
    const txns: Transaction[] = [
      makeTxn({ tripId: 'tokyo', amount: 300, date: '2026-08-04' }),
      makeTxn({ tripId: 'osaka', amount: 200, date: '2026-08-06' }),
      makeTxn({ tripId: 'penang', amount: 100, date: '2026-08-08' }),
      makeTxn({ tripId: 'seoul', amount: 50, date: '2026-08-10' }),
      makeTxn({ tripId: 'bali', amount: 40, date: '2026-08-12' }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08', trips);
    expect(highlight).toMatchObject({
      kind: 'tripAdventure',
      places: ['Tokyo', 'Osaka', 'Penang'],
      moreCount: 2,
      iconName: 'pin',
    });
    assertPrivate(highlight);
  });

  it('lets saved trips take the spotlight ahead of a car purchase', () => {
    const trips = [makeTrip({ id: 'tokyo', name: 'Tokyo' })];
    const txns: Transaction[] = [
      makeTxn({
        merchantRaw: 'Honda Showroom',
        remark: 'Car downpayment deposit',
        amount: 5000,
        date: '2026-08-02',
      }),
      makeTxn({ tripId: 'tokyo', amount: 80, date: '2026-08-18' }),
    ];

    expect(detectStoryHighlight(txns, '2026-08', trips)?.kind).toBe('tripAdventure');
  });

  it('keeps the car milestone when the month has no trip spending', () => {
    const trips = [makeTrip({ id: 'tokyo', name: 'Tokyo' })];
    const txns: Transaction[] = [
      makeTxn({
        merchantRaw: 'Honda Showroom',
        remark: 'Car downpayment deposit',
        amount: 5000,
        date: '2026-08-08',
      }),
      makeTxn({ tripId: 'tokyo', amount: 80, date: '2026-07-18' }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08', trips);
    expect(highlight?.kind).toBe('vehicleMilestone');
    expect(highlight?.itemLabel).toBe('Car');
  });

  it('ranks trips by the caller spend conversion', () => {
    const trips = [
      makeTrip({ id: 'tokyo', name: 'Tokyo' }),
      makeTrip({ id: 'penang', name: 'Penang' }),
    ];
    const txns = [
      makeTxn({ tripId: 'tokyo', amount: 100, currency: 'USD', date: '2026-08-04' }),
      makeTxn({ tripId: 'penang', amount: 200, currency: 'MYR', date: '2026-08-06' }),
    ];
    const convert = (txn: { amount: number; currency: string }) =>
      txn.currency === 'USD' ? txn.amount * 4 : txn.amount;

    expect(detectStoryHighlight(txns, '2026-08', trips, convert)?.places).toEqual(['Tokyo', 'Penang']);
  });

  it('keeps an archived trip that still has spending this month', () => {
    const trips = [makeTrip({ id: 'penang', name: 'Penang', archived: true })];
    const txns = [makeTxn({ tripId: 'penang', amount: 120, date: '2026-08-09' })];

    expect(detectStoryHighlight(txns, '2026-08', trips)).toMatchObject({
      kind: 'tripAdventure',
      places: ['Penang'],
      iconName: 'pin',
    });
  });

  it('detects a vehicle milestone from keywords', () => {
    const txns: Transaction[] = [
      makeTxn({ amount: 30, categoryId: 'food', date: '2026-08-02' }),
      makeTxn({
        merchantRaw: 'Honda Showroom',
        remark: 'Car downpayment deposit',
        amount: 5000,
        categoryId: 'travelling',
        date: '2026-08-08',
      }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('vehicleMilestone');
    expect(highlight?.itemLabel).toBe('Car');
    expect(highlight?.iconName).toBe('car');
    assertPrivate(highlight);
  });

  it('detects a home renovation or furniture milestone', () => {
    const txns: Transaction[] = [
      makeTxn({ amount: 40, categoryId: 'food', date: '2026-08-02' }),
      makeTxn({
        merchantRaw: 'IKEA Damansara',
        remark: 'New sofa and living room furniture',
        amount: 2200,
        categoryId: 'shopping',
        date: '2026-08-14',
      }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('homeMilestone');
    expect(highlight?.iconName).toBe('home');
    assertPrivate(highlight);
  });

  it('detects birthday gifts and celebrations for family and friends', () => {
    const txns: Transaction[] = [
      makeTxn({ amount: 20, categoryId: 'food', date: '2026-08-03' }),
      makeTxn({
        merchantRaw: 'Gift Shop',
        remark: 'Birthday gift for sister',
        amount: 150,
        categoryId: 'family',
        date: '2026-08-15',
      }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('giftCelebration');
    expect(highlight?.occasion).toBe('birthday');
    expect(highlight?.iconName).toBe('gift');
    assertPrivate(highlight);
  });

  it('detects an income boost from a month-over-month increase >= 15%', () => {
    const txns: Transaction[] = [
      // Previous month income: 4000
      makeTxn({ type: 'income', amount: 4000, date: '2026-07-28', categoryId: 'salary' }),
      // Current month income: 5200 (+30%)
      makeTxn({ type: 'income', amount: 5200, date: '2026-08-28', categoryId: 'salary' }),
      makeTxn({ amount: 50, date: '2026-08-05' }),
      makeTxn({ amount: 60, date: '2026-08-06' }),
      makeTxn({ amount: 40, date: '2026-08-07' }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('incomeBoost');
    expect(highlight?.percentChange).toBe(30);
    expect(highlight?.iconName).toBe('wallet');
    assertPrivate(highlight);
  });

  it('detects an income boost from bonus / raise keywords even without prior month baseline', () => {
    const txns: Transaction[] = [
      makeTxn({
        type: 'income',
        amount: 2500,
        date: '2026-08-25',
        remark: 'Annual performance bonus',
        categoryId: 'salary',
      }),
      makeTxn({ amount: 50, date: '2026-08-05' }),
      makeTxn({ amount: 60, date: '2026-08-06' }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('incomeBoost');
    expect(highlight?.iconName).toBe('wallet');
    assertPrivate(highlight);
  });

  it('detects massage, spa, and wellness self-care', () => {
    const txns: Transaction[] = [
      makeTxn({ amount: 30, date: '2026-08-02' }),
      makeTxn({
        merchantRaw: 'Healthland Wellness',
        remark: 'Thai massage session',
        amount: 120,
        categoryId: 'medical',
        date: '2026-08-18',
      }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('selfCare');
    expect(highlight?.itemLabel).toBe('Massage');
    expect(highlight?.iconName).toBe('heart');
    assertPrivate(highlight);
  });

  it('detects date nights count when recorded', () => {
    const txns: Transaction[] = [
      makeTxn({ amount: 80, remark: 'Date night dinner', categoryId: 'food', date: '2026-08-07' }),
      makeTxn({ amount: 95, remark: 'Movie date night', categoryId: 'entertainment', date: '2026-08-14' }),
      makeTxn({ amount: 110, remark: 'Romantic date night at bistro', categoryId: 'food', date: '2026-08-21' }),
      makeTxn({ amount: 20, date: '2026-08-02' }),
      makeTxn({ amount: 25, date: '2026-08-03' }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('dates');
    expect(highlight?.count).toBe(3);
    expect(highlight?.iconName).toBe('heart');
    assertPrivate(highlight);
  });

  it('detects high cafe / coffee stop frequency when 4+ stops occur', () => {
    const txns: Transaction[] = [
      makeTxn({ merchantRaw: 'Starbucks Coffee', amount: 18, date: '2026-08-01' }),
      makeTxn({ merchantRaw: 'ZUS Coffee', amount: 12, date: '2026-08-04' }),
      makeTxn({ merchantRaw: 'Chagee Tea', amount: 15, date: '2026-08-08' }),
      makeTxn({ merchantRaw: 'Local Cafe', remark: 'Iced latte', amount: 16, date: '2026-08-12' }),
      makeTxn({ amount: 50, date: '2026-08-15' }),
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('cafeRhythm');
    expect(highlight?.count).toBe(4);
    expect(highlight?.iconName).toBe('utensils');
    assertPrivate(highlight);
  });

  it('falls back to standout outlier spend when no specific keywords exist', () => {
    const txns: Transaction[] = [
      makeTxn({ amount: 20, categoryId: 'food', date: '2026-08-01' }),
      makeTxn({ amount: 25, categoryId: 'food', date: '2026-08-02' }),
      makeTxn({ amount: 30, categoryId: 'food', date: '2026-08-03' }),
      makeTxn({ amount: 22, categoryId: 'food', date: '2026-08-04' }),
      makeTxn({ amount: 650, categoryId: 'shopping', date: '2026-08-10' }), // Outlier (>60% of total)
    ];

    const highlight = detectStoryHighlight(txns, '2026-08');
    expect(highlight?.kind).toBe('outlierSpend');
    expect(highlight?.categoryId).toBe('shopping');
    assertPrivate(highlight);
  });

  it('handles Chinese keywords for tech, vehicles, gifts, massage, and dates', () => {
    const techTxn = [makeTxn({ remark: '买了新电脑笔记本', amount: 3000, date: '2026-08-01' })];
    expect(detectStoryHighlight(techTxn, '2026-08')?.kind).toBe('techUpgrade');

    const carTxn = [makeTxn({ remark: '买车首付款', amount: 5000, date: '2026-08-01' })];
    expect(detectStoryHighlight(carTxn, '2026-08')?.kind).toBe('vehicleMilestone');

    const giftTxn = [makeTxn({ remark: '朋友结婚红包礼物', amount: 300, date: '2026-08-01' })];
    expect(detectStoryHighlight(giftTxn, '2026-08')?.kind).toBe('giftCelebration');

    const massageTxn = [makeTxn({ merchantRaw: '盲人推拿按摩店', amount: 80, date: '2026-08-01' })];
    expect(detectStoryHighlight(massageTxn, '2026-08')?.kind).toBe('selfCare');

    const dateTxn = [makeTxn({ remark: '七夕约会晚餐', amount: 200, date: '2026-08-01' })];
    expect(detectStoryHighlight(dateTxn, '2026-08')?.kind).toBe('dates');
  });
});
