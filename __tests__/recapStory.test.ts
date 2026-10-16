import type { Trip } from '../src/lib/trips';
import type { Transaction } from '../src/lib/types';
import {
  buildRecapStoryModel,
  isCompletedStoryMonth,
  RECAP_STORY_SCENE_ORDER,
  recapStoryVariant,
  sceneHasAmounts,
  shouldShowRecapStoryInvitation,
  transactionDay,
  type RecapStoryModel,
  type RecapStoryScene,
} from '../src/lib/recapStory';

const now = new Date(2026, 8, 15, 12);
const MONTH = '2026-08';
let sequence = 0;

function txn(overrides: Partial<Transaction> = {}): Transaction {
  sequence += 1;
  return {
    id: `txn-${sequence}`,
    merchantRaw: 'Corner shop',
    merchantKey: 'corner shop',
    amount: 10,
    currency: 'MYR',
    type: 'expense',
    date: '2026-08-03',
    categoryId: 'food',
    createdAt: '2026-08-03T10:00:00.000Z',
    source: 'manual',
    ...overrides,
  };
}

/** One expense at `merchant` on each listed day of August (or any `YYYY-MM-DD`). */
function visits(merchant: string, days: (number | string)[], overrides: Partial<Transaction> = {}): Transaction[] {
  return days.map((day) => txn({
    merchantRaw: merchant,
    merchantKey: merchant.toLowerCase(),
    date: typeof day === 'number' ? `2026-08-${String(day).padStart(2, '0')}` : day,
    ...overrides,
  }));
}

function build(transactions: Transaction[], extra: Partial<Parameters<typeof buildRecapStoryModel>[0]> = {}) {
  return buildRecapStoryModel({ transactions, month: MONTH, now, ...extra });
}

function sceneOf<Id extends RecapStoryScene['id']>(model: RecapStoryModel | null, id: Id) {
  return model?.scenes.find((candidate) => candidate.id === id) as Extract<RecapStoryScene, { id: Id }> | undefined;
}

function ids(model: RecapStoryModel | null) {
  return model?.scenes.map((candidate) => candidate.id);
}

/** A busy August: enough for every scene that needs only this month. */
function busyAugust(): Transaction[] {
  return [
    ...visits('ZUS Coffee', [1, 3, 5, 8, 12], { amount: 12 }),
    ...visits('McDonalds', [2, 9], { amount: 20 }),
    ...visits('Nasi Kandar Pelita', [4], { amount: 15 }),
    ...visits('Mr DIY', [6, 13], { categoryId: 'shopping', amount: 30 }),
    ...visits('Uniqlo', [20], { categoryId: 'shopping', amount: 200 }),
  ];
}

beforeEach(() => { sequence = 0; });

describe('eligibility', () => {
  it('uses date before createdAt and recognizes completed month keys', () => {
    expect(transactionDay(txn({ date: '2026-08-01', createdAt: '2026-08-09T10:00:00.000Z' }))).toBe('2026-08-01');
    expect(transactionDay(txn({ date: null, createdAt: '2026-08-30T23:30:00.000Z' }))).toBe('2026-08-30');
    expect(isCompletedStoryMonth('2026-08', now)).toBe(true);
    expect(isCompletedStoryMonth('2026-09', now)).toBe(false);
    expect(isCompletedStoryMonth('2026-9', now)).toBe(false);
  });

  it('has no story for the current month, an empty month or a transfer-only month', () => {
    expect(buildRecapStoryModel({ transactions: busyAugust(), month: '2026-09', now })).toBeNull();
    expect(build([])).toBeNull();
    expect(build([txn({ type: 'transfer' })])).toBeNull();
  });

  it('gives an income-only month a short story', () => {
    const model = build([txn({ type: 'income', categoryId: 'salary', merchantRaw: 'Employer' })]);
    expect(model?.kind).toBe('short');
  });
});

describe('visits', () => {
  it('counts one visit per place per day, however many receipts that day has', () => {
    const model = build([
      ...visits('ZUS Coffee', [1, 1, 1, 2, 3]),
      ...busyAugust().filter((row) => row.merchantRaw !== 'ZUS Coffee'),
    ]);
    expect(sceneOf(model, 'topSpot')).toMatchObject({ name: 'ZUS Coffee', visits: 3 });
  });

  it('groups spellings of one place before counting', () => {
    const model = build([
      ...visits('ZUS', [1]),
      ...visits('Zus Coffee', [2, 3]),
      ...visits('ZUS COFFEE - KLCC', [4]),
      ...visits('McDonalds', [5, 6]),
    ]);
    expect(sceneOf(model, 'topSpot')).toMatchObject({ name: 'Zus Coffee', visits: 4 });
  });

  it('ignores income, transfers and blank merchants when counting places', () => {
    const model = build([
      ...visits('ZUS Coffee', [1, 2, 3]),
      ...visits('Employer', [1, 2, 3, 4], { type: 'income', categoryId: 'salary' }),
      ...visits('Savings', [1, 2, 3, 4], { type: 'transfer' }),
      ...visits('   ', [1, 2, 3, 4, 5]),
    ]);
    expect(sceneOf(model, 'topSpot')).toMatchObject({ name: 'ZUS Coffee', visits: 3 });
  });
});

describe('#1 spot', () => {
  it('names the most-visited place with its visit count, spend and how often that was', () => {
    const model = build(busyAugust());
    expect(sceneOf(model, 'topSpot')).toEqual({
      id: 'topSpot', type: 'topSpot', name: 'ZUS Coffee', visits: 5, total: 60, categoryId: 'food', everyDays: 6,
    });
  });

  it('needs at least three visits', () => {
    const model = build([...visits('ZUS Coffee', [1, 2]), ...visits('Tealive', [3, 4])]);
    expect(sceneOf(model, 'topSpot')).toBeUndefined();
  });

  it('never crowns a bill', () => {
    const model = build([
      ...visits('TNB', [1, 2, 3, 4], { categoryId: 'utilities' }),
      ...visits('Netflix', [1, 2, 3, 4], { categoryId: 'subscriptions' }),
      ...visits('ZUS Coffee', [5, 6, 7]),
    ]);
    expect(sceneOf(model, 'topSpot')).toMatchObject({ name: 'ZUS Coffee' });
  });

  it('breaks a visit tie by spend, then by name', () => {
    const bySpend = build([...visits('Alpha Cafe', [1, 2, 3], { amount: 5 }), ...visits('Beta Bistro', [4, 5, 6], { amount: 9 })]);
    expect(sceneOf(bySpend, 'topSpot')).toMatchObject({ name: 'Beta Bistro' });
    const byName = build([...visits('Beta Bistro', [1, 2, 3]), ...visits('Alpha Cafe', [4, 5, 6])]);
    expect(sceneOf(byName, 'topSpot')).toMatchObject({ name: 'Alpha Cafe' });
  });

  it('totals spend in the caller display currency', () => {
    const model = build(visits('ZUS Coffee', [1, 2, 3], { amount: 10 }), { spendOf: (row) => row.amount / 4 });
    expect(sceneOf(model, 'topSpot')).toMatchObject({ total: 7.5 });
    expect(model?.currency).toBe('MYR');
    expect(build(visits('ZUS Coffee', [1, 2, 3]), { currency: 'SGD' })?.currency).toBe('SGD');
  });
});

describe('food podium', () => {
  it('ranks three food places by visits and notes when #1 is already the top spot', () => {
    const model = build(busyAugust());
    expect(sceneOf(model, 'foodPodium')).toEqual({
      id: 'foodPodium', type: 'foodPodium', topIsTopSpot: true,
      places: [{ name: 'ZUS Coffee', visits: 5 }, { name: 'McDonalds', visits: 2 }, { name: 'Nasi Kandar Pelita', visits: 1 }],
    });
  });

  it('needs three different food places', () => {
    const model = build([...visits('ZUS Coffee', [1, 2, 3]), ...visits('McDonalds', [4])]);
    expect(sceneOf(model, 'foodPodium')).toBeUndefined();
  });

  it('marks a podium whose winner is not the overall top spot', () => {
    const model = build([
      ...visits('Mr DIY', [1, 2, 3, 4], { categoryId: 'shopping' }),
      ...visits('ZUS Coffee', [5, 6]),
      ...visits('McDonalds', [7]),
      ...visits('KFC', [8]),
    ]);
    expect(sceneOf(model, 'foodPodium')).toMatchObject({ topIsTopSpot: false });
  });
});

describe('shopping regular', () => {
  it('names the most-visited shop with two or more visits', () => {
    expect(sceneOf(build(busyAugust()), 'shoppingRegular')).toEqual({
      id: 'shoppingRegular', type: 'shoppingRegular', name: 'Mr DIY', visits: 2,
    });
  });

  it('needs two visits', () => {
    const model = build([...visits('ZUS Coffee', [1, 2, 3]), ...visits('Uniqlo', [4], { categoryId: 'shopping' })]);
    expect(sceneOf(model, 'shoppingRegular')).toBeUndefined();
  });

  it('is skipped when the shop is already the top spot', () => {
    const model = build([...visits('Mr DIY', [1, 2, 3, 4], { categoryId: 'shopping' }), ...visits('ZUS Coffee', [5])]);
    expect(sceneOf(model, 'topSpot')).toMatchObject({ name: 'Mr DIY' });
    expect(sceneOf(model, 'shoppingRegular')).toBeUndefined();
  });
});

describe('new discoveries', () => {
  const july = [...visits('ZUS Coffee', ['2026-07-03', '2026-07-09'])];

  it('counts first-ever places and names the one you went back to most', () => {
    const model = build([
      ...july,
      ...visits('ZUS Coffee', [1, 2]),
      ...visits('Kenny Rogers', [3, 10, 17]),
      ...visits('Sushi King', [4]),
    ]);
    expect(sceneOf(model, 'discoveries')).toEqual({
      id: 'discoveries', type: 'discoveries', count: 2, bestFind: { name: 'Kenny Rogers', visits: 3 },
    });
  });

  it('needs an earlier recorded month, so a first month is not all discoveries', () => {
    const model = build(visits('Kenny Rogers', [3, 10, 17]));
    expect(sceneOf(model, 'discoveries')).toBeUndefined();
  });

  it('does not count a place already seen under another spelling, or a new bill', () => {
    const model = build([
      ...july,
      ...visits('Zus Coffee - Pavilion', [1]),
      ...visits('Unifi', [2], { categoryId: 'utilities' }),
    ]);
    expect(sceneOf(model, 'discoveries')).toBeUndefined();
  });
});

describe('ride or die', () => {
  it('names a place visited every month for three or more months in a row', () => {
    const model = build([
      ...visits('Shell', ['2026-04-02', '2026-05-02', '2026-06-02', '2026-07-02', 2], { categoryId: 'travelling' }),
      ...visits('Tealive', ['2026-06-05', '2026-07-05', 5]),
    ]);
    expect(sceneOf(model, 'rideOrDie')).toEqual({ id: 'rideOrDie', type: 'rideOrDie', name: 'Shell', months: 5 });
  });

  it('stops counting at a missed month', () => {
    const model = build(visits('Shell', ['2026-04-02', '2026-06-02', 2], { categoryId: 'travelling' }));
    expect(sceneOf(model, 'rideOrDie')).toBeUndefined();
  });

  it('never picks a recurring bill', () => {
    const model = build(visits('Netflix', ['2026-05-01', '2026-06-01', '2026-07-01', 1], { categoryId: 'subscriptions' }));
    expect(sceneOf(model, 'rideOrDie')).toBeUndefined();
  });
});

describe('the one you ghosted', () => {
  it('names last month’s three-visit regular that got no visits this month', () => {
    const model = build([
      ...visits('Tealive', ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29', '2026-07-30']),
      ...visits('ZUS Coffee', [1, 2, 3]),
    ]);
    expect(sceneOf(model, 'ghosted')).toEqual({ id: 'ghosted', type: 'ghosted', name: 'Tealive', previousVisits: 6 });
  });

  it('needs three visits last month and none this month', () => {
    const fewer = build([...visits('Tealive', ['2026-07-01', '2026-07-08']), ...visits('ZUS Coffee', [1])]);
    expect(sceneOf(fewer, 'ghosted')).toBeUndefined();
    const stillVisited = build(visits('Tealive', ['2026-07-01', '2026-07-08', '2026-07-15', 9]));
    expect(sceneOf(stillVisited, 'ghosted')).toBeUndefined();
  });
});

describe('biggest day', () => {
  it('finds the day with the most spending and counts its stops', () => {
    const model = build([
      ...busyAugust(),
      ...visits('Pavilion Food Court', [20], { amount: 40 }),
      ...visits('GSC', [20], { categoryId: 'entertainment', amount: 60 }),
    ]);
    expect(sceneOf(model, 'biggestDay')).toEqual({ id: 'biggestDay', type: 'biggestDay', day: '2026-08-20', total: 300, stops: 3 });
  });

  it('needs five days with spending', () => {
    const model = build(visits('ZUS Coffee', [1, 2, 3, 4]));
    expect(sceneOf(model, 'biggestDay')).toBeUndefined();
  });
});

describe('versus last month', () => {
  it('compares real totals and names the category that moved most', () => {
    const model = build([
      ...visits('ZUS Coffee', ['2026-07-01', '2026-07-02'], { amount: 50 }),
      ...visits('Mr DIY', ['2026-07-03'], { categoryId: 'shopping', amount: 100 }),
      ...visits('ZUS Coffee', [1, 2, 3], { amount: 50 }),
      ...visits('Mr DIY', [4], { categoryId: 'shopping', amount: 10 }),
    ]);
    expect(sceneOf(model, 'versusLastMonth')).toEqual({
      id: 'versusLastMonth', type: 'versusLastMonth', total: 160, previousTotal: 200, change: -40,
      movedCategory: { categoryId: 'shopping', change: -90 },
    });
  });

  it('needs expenses in both months', () => {
    expect(sceneOf(build(busyAugust()), 'versusLastMonth')).toBeUndefined();
  });
});

describe('spotlight', () => {
  it('keeps life-event highlights such as trips', () => {
    const trips: Trip[] = [{
      id: 'trip-1', name: 'Penang', startDate: '2026-08-20', endDate: '2026-08-22',
      archived: false, createdAt: '2026-08-01T00:00:00.000Z',
    } as Trip];
    const model = build([...busyAugust(), ...visits('Hotel', [21], { categoryId: 'travelling', tripId: 'trip-1' })], { trips });
    expect(sceneOf(model, 'spotlight')?.highlight).toMatchObject({ kind: 'tripAdventure', places: ['Penang'] });
  });

  it('no longer repeats café stops or a lone big purchase, which the place and day scenes cover', () => {
    const cafes = build(visits('Starbucks', [1, 2, 3, 4, 5]));
    expect(sceneOf(cafes, 'spotlight')).toBeUndefined();
    const outlier = build([...visits('ZUS Coffee', [1, 2, 3], { amount: 5 }), ...visits('Mystery', [4], { amount: 900, categoryId: 'other' })]);
    expect(sceneOf(outlier, 'spotlight')).toBeUndefined();
  });
});

describe('story shape', () => {
  it('plays the full story in narrative order', () => {
    const model = build([
      ...visits('Tealive', ['2026-07-01', '2026-07-08', '2026-07-15']),
      ...visits('ZUS Coffee', ['2026-05-02', '2026-06-02', '2026-07-02']),
      ...busyAugust(),
    ]);
    expect(model?.kind).toBe('full');
    expect(ids(model)).toEqual([
      'ritual', 'topSpot', 'foodPodium', 'shoppingRegular', 'discoveries', 'rideOrDie', 'ghosted', 'biggestDay',
      'versusLastMonth', 'finale',
    ]);
    expect(RECAP_STORY_SCENE_ORDER.filter((id) => ids(model)!.includes(id))).toEqual(ids(model));
  });

  it('preselects the finale and the top spot for sharing', () => {
    expect(build(busyAugust())?.defaultSelectedSceneIds).toEqual(['topSpot', 'finale']);
    expect(build(visits('ZUS Coffee', [1]))?.defaultSelectedSceneIds).toEqual(['finale']);
  });

  it('collects the headline facts on the finale card', () => {
    const finale = sceneOf(build(busyAugust()), 'finale');
    expect(finale?.collage).toEqual({
      topSpot: { name: 'ZUS Coffee', visits: 5 },
      foodPodium: ['ZUS Coffee', 'McDonalds', 'Nasi Kandar Pelita'],
      biggestDay: { day: '2026-08-20', total: 200 },
    });
    expect(finale?.locked).toEqual([]);
  });

  it('plays a short story with locked scenes when fewer than three scenes qualify', () => {
    const model = build([...visits('ZUS Coffee', [1, 2, 3]), ...visits('McDonalds', [4])]);
    expect(model?.kind).toBe('short');
    expect(ids(model)).toEqual(['ritual', 'topSpot', 'finale']);
    expect(sceneOf(model, 'finale')).toMatchObject({ locked: ['foodPodium', 'biggestDay', 'discoveries'], cliffhanger: null });
  });

  it('short stories with no qualified scenes still open and close', () => {
    const model = build([txn()]);
    expect(ids(model)).toEqual(['ritual', 'finale']);
    expect(sceneOf(model, 'finale')?.locked).toEqual(['topSpot', 'foodPodium', 'biggestDay']);
  });
});

describe('cliffhanger', () => {
  it('prefers a rising newcomer with two or more visits', () => {
    const model = build([
      ...visits('Tealive', ['2026-07-01']),
      ...busyAugust(),
      ...visits('Kenny Rogers', [14, 21, 22]),
    ]);
    // ZUS Coffee is new too, but it already holds the crown, so it cannot be its own challenger.
    expect(sceneOf(model, 'finale')?.cliffhanger).toEqual({ kind: 'challenger', name: 'Kenny Rogers', visits: 3 });
  });

  it('then asks whether the top spot keeps its crown', () => {
    expect(sceneOf(build(busyAugust()), 'finale')?.cliffhanger).toEqual({ kind: 'crown', name: 'ZUS Coffee' });
  });

  it('then misses the ghosted place', () => {
    const model = build([
      ...visits('Tealive', ['2026-07-01', '2026-07-08', '2026-07-15']),
      ...visits('McDonalds', [1]),
      ...visits('KFC', [2]),
      ...visits('Sushi King', [3]),
      ...visits('Subway', [4]),
      ...visits('A&W', [5]),
    ]);
    expect(sceneOf(model, 'topSpot')).toBeUndefined();
    expect(sceneOf(model, 'finale')?.cliffhanger).toEqual({ kind: 'missesYou', name: 'Tealive' });
  });
});

describe('privacy', () => {
  it('never carries notes, account details or raw descriptions', () => {
    const model = build(busyAugust().map((row) => ({ ...row, remark: 'secret note', accountId: 'acct-1' } as Transaction)));
    const serialized = JSON.stringify(model);
    expect(serialized).not.toMatch(/secret note|acct-1|remark|account/i);
  });
});

describe('recapStoryVariant', () => {
  it('is stable for a month and scene, and stays within range', () => {
    expect(recapStoryVariant('2026-08', 'topSpot', 3)).toBe(recapStoryVariant('2026-08', 'topSpot', 3));
    for (const month of ['2026-01', '2026-02', '2026-03', '2026-04']) {
      const variant = recapStoryVariant(month, 'ghosted', 3);
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(3);
    }
  });

  it('changes from month to month', () => {
    const variants = new Set(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
      .map((month) => recapStoryVariant(month, 'topSpot', 3)));
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe('shouldShowRecapStoryInvitation', () => {
  const day = (date: number) => new Date(2026, 8, date, 12);

  it('shows on days 1 through 7 for the previous eligible month', () => {
    const rows = [txn({ date: '2026-08-15' })];
    expect(shouldShowRecapStoryInvitation(rows, day(1), null)).toEqual({ month: '2026-08', visible: true });
    expect(shouldShowRecapStoryInvitation(rows, day(7), null)).toEqual({ month: '2026-08', visible: true });
    expect(shouldShowRecapStoryInvitation(rows, day(8), null)).toEqual({ month: '2026-08', visible: false });
    expect(shouldShowRecapStoryInvitation(rows, day(1), '2026-08')).toEqual({ month: '2026-08', visible: false });
    expect(shouldShowRecapStoryInvitation([], day(1), null)).toEqual({ month: '2026-08', visible: false });
    expect(shouldShowRecapStoryInvitation([txn({ type: 'transfer', date: '2026-08-15' })], day(1), null))
      .toEqual({ month: '2026-08', visible: false });
  });
});

describe('sceneHasAmounts', () => {
  it('flags only the cards that print money', () => {
    const model = build([
      ...visits('Tealive', ['2026-07-01', '2026-07-08', '2026-07-15']),
      ...visits('ZUS Coffee', ['2026-05-02', '2026-06-02', '2026-07-02']),
      ...busyAugust(),
    ]);
    const flagged = model!.scenes.filter(sceneHasAmounts).map((scene) => scene.id);
    expect(flagged).toEqual(['topSpot', 'biggestDay', 'versusLastMonth', 'finale']);
  });

  it('does not flag a finale whose collage has no money', () => {
    const model = build(visits('ZUS Coffee', [1, 2, 3]));
    expect(sceneHasAmounts(sceneOf(model, 'finale')!)).toBe(false);
  });
});
