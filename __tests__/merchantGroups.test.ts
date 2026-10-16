import { buildMerchantGroups, canonicalMerchantName, merchantSuggestions, placesForCategory } from '../src/lib/merchantGroups';
import type { Transaction } from '../src/lib/types';

describe('canonicalMerchantName', () => {
  test('folds case, apostrophes and punctuation so spellings of one brand meet', () => {
    expect(canonicalMerchantName("McDonald's")).toBe('mcdonalds');
    expect(canonicalMerchantName('MCDONALDS')).toBe('mcdonalds');
    expect(canonicalMerchantName('McDonald’s')).toBe('mcdonalds');
  });

  test('drops a branch or location suffix after a separator', () => {
    expect(canonicalMerchantName('ZUS Coffee - KLCC')).toBe('zus coffee');
    expect(canonicalMerchantName('Tealive @ Sunway')).toBe('tealive');
    expect(canonicalMerchantName('Mr DIY (Midvalley)')).toBe('mr diy');
    expect(canonicalMerchantName('Shell | Jalan Ipoh')).toBe('shell');
  });

  test('keeps card-network noise out, as merchantKey already does', () => {
    expect(canonicalMerchantName('GRAB*RIDE 8F2K')).toBe('grab');
  });

  test('keeps a hyphen inside a name rather than treating it as a branch separator', () => {
    expect(canonicalMerchantName('7-Eleven')).toBe('7 eleven');
  });

  test('keeps non-Latin names', () => {
    expect(canonicalMerchantName('  老王 面馆 ')).toBe('老王 面馆');
  });

  test('returns an empty string for a blank label', () => {
    expect(canonicalMerchantName('   ')).toBe('');
  });
});

describe('buildMerchantGroups', () => {
  const rows = (...names: string[]) => names.map((merchantRaw) => ({ merchantRaw }));

  test('merges a whole-word prefix into its longer spellings', () => {
    const groups = buildMerchantGroups(rows('ZUS', 'Zus Coffee', 'ZUS COFFEE - KLCC'));
    expect(groups.keyOf('ZUS')).toBe(groups.keyOf('Zus Coffee'));
    expect(groups.keyOf('ZUS COFFEE - KLCC')).toBe(groups.keyOf('Zus Coffee'));
  });

  test('does not merge a prefix that stops mid-word', () => {
    const groups = buildMerchantGroups(rows('Zus', 'Zuskin Spa'));
    expect(groups.keyOf('Zus')).not.toBe(groups.keyOf('Zuskin Spa'));
  });

  test('needs at least three characters before a prefix can absorb other names', () => {
    const groups = buildMerchantGroups(rows('KK', 'KK Mart'));
    expect(groups.keyOf('KK')).not.toBe(groups.keyOf('KK Mart'));
  });

  test('never lets a generic word swallow unrelated places', () => {
    const groups = buildMerchantGroups(rows('Cafe', 'Cafe Amazon', 'The', 'The Coffee Bean', 'Restoran', 'Restoran Rebung'));
    expect(groups.keyOf('Cafe')).not.toBe(groups.keyOf('Cafe Amazon'));
    expect(groups.keyOf('The')).not.toBe(groups.keyOf('The Coffee Bean'));
    expect(groups.keyOf('Restoran')).not.toBe(groups.keyOf('Restoran Rebung'));
  });

  test('keeps genuinely different places apart', () => {
    const groups = buildMerchantGroups(rows("McDonald's", 'Mcdonalds KLCC', 'KFC'));
    expect(groups.keyOf("McDonald's")).toBe(groups.keyOf('Mcdonalds KLCC'));
    expect(groups.keyOf('KFC')).not.toBe(groups.keyOf("McDonald's"));
  });

  test('names a group after the spelling typed most often, without its branch suffix', () => {
    const groups = buildMerchantGroups(rows('zus', 'ZUS Coffee - KLCC', 'ZUS Coffee - KLCC', 'Zus Coffee'));
    expect(groups.nameOf(groups.keyOf('zus')!)).toBe('ZUS Coffee');
  });

  test('breaks a spelling tie toward the longer, then alphabetically first, spelling', () => {
    const groups = buildMerchantGroups(rows('ZUS', 'Zus Coffee'));
    expect(groups.nameOf(groups.keyOf('ZUS')!)).toBe('Zus Coffee');
  });

  test('has no group for a blank merchant', () => {
    const groups = buildMerchantGroups(rows('', '  '));
    expect(groups.keyOf('')).toBeNull();
    expect(groups.keyOf('   ')).toBeNull();
  });

  test('resolves a label it has never seen by its own canonical name', () => {
    const groups = buildMerchantGroups(rows('Zus Coffee'));
    expect(groups.keyOf('zus coffee')).toBe(groups.keyOf('Zus Coffee'));
    expect(groups.keyOf('Brand New Place')).toBe('brand new place');
  });
});

function row(merchantRaw: string, date: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `${merchantRaw}-${date}-${Math.random()}`, merchantRaw, merchantKey: merchantRaw.toLowerCase(), amount: 10,
    currency: 'MYR', type: 'expense', date, categoryId: 'food', createdAt: `${date}T10:00:00.000Z`, source: 'manual',
    ...overrides,
  };
}

describe('placesForCategory', () => {
  const history = [
    row('ZUS Coffee', '2026-08-01'), row('Zus Coffee - KLCC', '2026-08-02'), row('ZUS Coffee', '2026-08-03'),
    row('McDonalds', '2026-08-01'), row('McDonalds', '2026-08-01'),
    row('Kenny Rogers', '2026-08-04'), row('Kenny Rogers', '2026-08-05'),
    row('Mr DIY', '2026-08-01', { categoryId: 'shopping' }),
    row('Employer', '2026-08-01', { type: 'income', categoryId: 'food' }),
    row('  ', '2026-08-06'),
  ];

  it('lists the category’s places by visits, one visit per day, under their usual spelling', () => {
    expect(placesForCategory(history, 'food')).toEqual(['ZUS Coffee', 'Kenny Rogers', 'McDonalds']);
  });

  it('breaks a visit tie toward the more recent place', () => {
    const tie = [row('Alpha', '2026-08-01'), row('Beta', '2026-08-09')];
    expect(placesForCategory(tie, 'food')).toEqual(['Beta', 'Alpha']);
  });

  it('keeps to the category and to expenses, and caps the list', () => {
    expect(placesForCategory(history, 'shopping')).toEqual(['Mr DIY']);
    const many = Array.from({ length: 8 }, (_, index) => row(`Place ${index}`, `2026-08-0${index + 1}`));
    expect(placesForCategory(many, 'food')).toHaveLength(5);
    expect(placesForCategory(many, 'food', 2)).toHaveLength(2);
  });
});

describe('merchantSuggestions', () => {
  const history = [
    row('ZUS Coffee', '2026-08-01'), row('ZUS Coffee', '2026-08-02'),
    row('Zara', '2026-08-03', { categoryId: 'shopping' }),
    row('Sushi Zanmai', '2026-08-04'),
    row('Pizza Hut', '2026-08-05'),
  ];

  it('completes from the start of any word, most-visited first', () => {
    expect(merchantSuggestions(history, 'z')).toEqual(['ZUS Coffee', 'Zara', 'Sushi Zanmai']);
    expect(merchantSuggestions(history, 'zan')).toEqual(['Sushi Zanmai']);
    expect(merchantSuggestions(history, 'cof')).toEqual(['ZUS Coffee']);
  });

  it('ignores case and punctuation in what was typed', () => {
    expect(merchantSuggestions(history, 'PIZZA-')).toEqual(['Pizza Hut']);
  });

  it('suggests nothing for blank text or once the name is complete', () => {
    expect(merchantSuggestions(history, '  ')).toEqual([]);
    expect(merchantSuggestions(history, 'zus coffee')).toEqual([]);
  });
});
