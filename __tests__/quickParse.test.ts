import { isNumberOnlyInput, MAX_SEGMENTS, parseQuickText, type QuickParseOptions } from '../src/lib/quickParse';

const opts: QuickParseOptions = { activeCurrencies: ['MYR', 'USD'], today: '2026-08-28' };

describe('parseQuickText — amounts', () => {
  it('reads a plain decimal and keeps the label', () => {
    const r = parseQuickText('lunch 9.2', opts);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].amount).toBe(9.2);
    expect(r.drafts[0].label).toBe('lunch');
    expect(r.confident).toBe(true);
  });

  it('reads a leading amount', () => {
    expect(parseQuickText('9.20 lunch', opts).drafts[0]).toMatchObject({ amount: 9.2, label: 'lunch' });
  });

  it('strips an rm prefix from the amount and the label', () => {
    expect(parseQuickText('rm9.20 lunch', opts).drafts[0]).toMatchObject({ amount: 9.2, label: 'lunch' });
  });

  it('strips a currency symbol without inferring a currency from it', () => {
    const d = parseQuickText('$20 dinner', opts).drafts[0];
    expect(d.amount).toBe(20);
    expect(d.label).toBe('dinner');
    expect(d.currency).toBeNull();

    expect(parseQuickText('₹500 dinner', opts).drafts[0]).toMatchObject({ amount: 500, label: 'dinner' });
    expect(parseQuickText('1000₽ shoes', opts).drafts[0]).toMatchObject({ amount: 1000, label: 'shoes' });
    expect(parseQuickText('₸2000 taxi', opts).drafts[0]).toMatchObject({ amount: 2000, label: 'taxi' });
  });

  it('treats a comma before two digits as a decimal point', () => {
    expect(parseQuickText('lunch 12,50', opts).drafts[0].amount).toBe(12.5);
  });

  it('treats a comma before three digits as a thousands separator', () => {
    expect(parseQuickText('rent 1,200', opts).drafts[0].amount).toBe(1200);
    expect(parseQuickText('rent 1,200.50', opts).drafts[0].amount).toBe(1200.5);
  });

  it('returns no drafts when there is no amount at all', () => {
    expect(parseQuickText('lunch', opts).drafts).toEqual([]);
  });

  it('is not confident when a segment holds two amounts', () => {
    expect(parseQuickText('lunch 9.2 and 4', opts).confident).toBe(false);
  });

  it('is not confident when the label is empty', () => {
    const r = parseQuickText('9.2', opts);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].label).toBe('');
    expect(r.confident).toBe(false);
  });
});

describe('parseQuickText — type', () => {
  it('defaults to expense', () => {
    expect(parseQuickText('lunch 9.2', opts).drafts[0].type).toBe('expense');
  });

  it('flips to income on an English keyword', () => {
    expect(parseQuickText('salary 4200', opts).drafts[0].type).toBe('income');
    expect(parseQuickText('refund 30', opts).drafts[0].type).toBe('income');
  });

  it('flips to income on a Chinese keyword', () => {
    expect(parseQuickText('工资 4200', opts).drafts[0].type).toBe('income');
  });

  // An income keyword is matched as a WORD, not a substring. "interesting" contains
  // "interest"; treating that as income made a book purchase land as earnings.
  it('does not flip on a keyword buried inside a longer English word', () => {
    expect(parseQuickText('interesting book 30', opts).drafts[0].type).toBe('expense');
    expect(parseQuickText('wages', opts).drafts).toEqual([]); // no amount, nothing to classify
    expect(parseQuickText('bonuses swap 12', opts).drafts[0].type).toBe('expense');
  });

  // Words that point both ways depending on context are left to the model rather than
  // guessed at: paying income tax and loan interest are expenses, not earnings.
  it('leaves genuinely ambiguous words as an expense', () => {
    expect(parseQuickText('income tax 500', opts).drafts[0].type).toBe('expense');
    expect(parseQuickText('loan interest 300', opts).drafts[0].type).toBe('expense');
    expect(parseQuickText('allowance for kid 200', opts).drafts[0].type).toBe('expense');
    expect(parseQuickText('贷款利息 300', opts).drafts[0].type).toBe('expense');
  });

  it('still flips on the unambiguous keywords', () => {
    for (const text of ['salary 4200', 'refund 30', 'bonus 500', 'dividend 88', 'payout 20', 'reimbursed 45']) {
      expect(parseQuickText(text, opts).drafts[0].type).toBe('income');
    }
    for (const text of ['工资 4200', '退款 30', '奖金 500', '分红 88', '报销 45']) {
      expect(parseQuickText(text, opts).drafts[0].type).toBe('income');
    }
  });
});

describe('parseQuickText — currency', () => {
  it('reads an active 3-letter code and drops it from the label', () => {
    const d = parseQuickText('usd 20 dinner', opts).drafts[0];
    expect(d.currency).toBe('USD');
    expect(d.label).toBe('dinner');
  });

  it('recognises a supported currency even if not activated in settings', () => {
    const d = parseQuickText('jpy 900 ramen', opts).drafts[0];
    expect(d.currency).toBe('JPY');
    expect(d.amount).toBe(900);
    expect(d.label).toBe('ramen');
  });

  it('reads attached currency suffixes and typo aliases like lunch 3sdg', () => {
    const d = parseQuickText('lunch 3sdg', opts).drafts[0];
    expect(d.currency).toBe('SGD');
    expect(d.amount).toBe(3);
    expect(d.label).toBe('lunch');
  });

  it('reads attached currency prefixes like sgd3 or rm9.20', () => {
    const d1 = parseQuickText('lunch sgd3', opts).drafts[0];
    expect(d1.currency).toBe('SGD');
    expect(d1.amount).toBe(3);
    expect(d1.label).toBe('lunch');

    const d2 = parseQuickText('rm9.20 lunch', opts).drafts[0];
    expect(d2.currency).toBe('MYR');
    expect(d2.amount).toBe(9.2);
    expect(d2.label).toBe('lunch');
  });

  it('ignores an unsupported or unknown currency code', () => {
    const d = parseQuickText('xyz 900 ramen', opts).drafts[0];
    expect(d.currency).toBeNull();
  });

  it('reads rm as the base currency', () => {
    expect(parseQuickText('rm 9.20 lunch', opts).drafts[0].currency).toBe('MYR');
  });

  it('reads Turkish lira codes, names, and symbols', () => {
    expect(parseQuickText('TRY 450 taxi', opts).drafts[0]).toMatchObject({
      currency: 'TRY', amount: 450, label: 'taxi',
    });
    expect(parseQuickText('450 lira taxi', opts).drafts[0]).toMatchObject({
      currency: 'TRY', amount: 450, label: 'taxi',
    });
    expect(parseQuickText('Turkish lira 450 taxi', opts).drafts[0]).toMatchObject({
      currency: 'TRY', amount: 450, label: 'taxi',
    });
    expect(parseQuickText('₺450 taxi', opts).drafts[0]).toMatchObject({
      currency: 'TRY', amount: 450, label: 'taxi',
    });
  });

  it('does not mistake the lowercase English word try for Turkish lira', () => {
    expect(parseQuickText('try new cafe 30', opts).drafts[0]).toMatchObject({
      currency: null, amount: 30, label: 'try new cafe',
    });
  });

  it('reads UAE dirham codes and common names', () => {
    expect(parseQuickText('AED 30 dinner', opts).drafts[0]).toMatchObject({
      currency: 'AED', amount: 30, label: 'dinner',
    });
    expect(parseQuickText('30 dirham dinner', opts).drafts[0]).toMatchObject({
      currency: 'AED', amount: 30, label: 'dinner',
    });
    expect(parseQuickText('UAE dirham 30 dinner', opts).drafts[0]).toMatchObject({
      currency: 'AED', amount: 30, label: 'dinner',
    });
  });
});

describe('parseQuickText — dates', () => {
  it('leaves date null when nothing is said', () => {
    expect(parseQuickText('lunch 9.2', opts).drafts[0].date).toBeNull();
  });

  it('reads yesterday and drops it from the label', () => {
    const d = parseQuickText('lunch 9.2 yesterday', opts).drafts[0];
    expect(d.date).toBe('2026-08-27');
    expect(d.label).toBe('lunch');
  });

  it('reads today', () => {
    expect(parseQuickText('lunch 9.2 today', opts).drafts[0].date).toBe('2026-08-28');
  });

  it('reads Chinese date words', () => {
    expect(parseQuickText('午餐 9.2 昨天', opts).drafts[0].date).toBe('2026-08-27');
    expect(parseQuickText('午餐 9.2 今天', opts).drafts[0].date).toBe('2026-08-28');
  });

  it('reads a weekday name as the most recent past occurrence', () => {
    // 2026-08-28 is a Friday; the most recent Wednesday before it is 2026-08-26.
    expect(parseQuickText('lunch 9.2 wednesday', opts).drafts[0].date).toBe('2026-08-26');
  });

  it('treats a weekday naming today as today', () => {
    expect(parseQuickText('lunch 9.2 friday', opts).drafts[0].date).toBe('2026-08-28');
  });

  // "sun", "sat" and "wed" are ordinary English words. Reading them as weekdays both invented
  // a date and ate a word out of the label — which also corrupts the merchant memory key, so
  // the same phrase would never learn a category.
  it('does not read an abbreviation that is also an ordinary English word', () => {
    for (const [text, label] of [
      ['sun protection 15', 'sun protection'],
      ['sat at cafe 12', 'sat at cafe'],
      ['wed dinner 80', 'wed dinner'],
    ] as const) {
      const d = parseQuickText(text, opts).drafts[0];
      expect(d.date).toBeNull();
      expect(d.label).toBe(label);
    }
  });

  it('still reads the unambiguous weekday abbreviations', () => {
    expect(parseQuickText('lunch 9.2 mon', opts).drafts[0].date).toBe('2026-08-24');
    expect(parseQuickText('lunch 9.2 tue', opts).drafts[0].date).toBe('2026-08-25');
    expect(parseQuickText('lunch 9.2 thu', opts).drafts[0].date).toBe('2026-08-27');
    expect(parseQuickText('lunch 9.2 fri', opts).drafts[0].date).toBe('2026-08-28');
  });
});

describe('parseQuickText — segments', () => {
  it('splits on commas', () => {
    const r = parseQuickText('lunch 9.2, grab 12, coffee 5', opts);
    expect(r.drafts.map((d) => d.label)).toEqual(['lunch', 'grab', 'coffee']);
    expect(r.drafts.map((d) => d.amount)).toEqual([9.2, 12, 5]);
  });

  it('splits on semicolons, newlines, and Chinese punctuation', () => {
    expect(parseQuickText('lunch 9.2; grab 12', opts).drafts).toHaveLength(2);
    expect(parseQuickText('lunch 9.2\ngrab 12', opts).drafts).toHaveLength(2);
    expect(parseQuickText('午餐 9.2、打车 12', opts).drafts).toHaveLength(2);
  });

  it('does not split a decimal comma into two segments', () => {
    expect(parseQuickText('lunch 12,50', opts).drafts).toHaveLength(1);
  });

  it('caps the number of segments', () => {
    const many = Array.from({ length: MAX_SEGMENTS + 5 }, (_, i) => `item${i} ${i + 1}`).join(', ');
    expect(parseQuickText(many, opts).drafts).toHaveLength(MAX_SEGMENTS);
  });

  it('returns an empty, confident-free result for blank input', () => {
    expect(parseQuickText('   ', opts)).toEqual({ drafts: [], confident: false });
  });

  it('always leaves categoryId null — this parser never categorises', () => {
    expect(parseQuickText('lunch 9.2', opts).drafts[0].categoryId).toBeNull();
  });
});

describe('isNumberOnlyInput', () => {
  it('identifies plain numbers as number-only', () => {
    expect(isNumberOnlyInput('25')).toBe(true);
    expect(isNumberOnlyInput('25.50')).toBe(true);
    expect(isNumberOnlyInput('  1000  ')).toBe(true);
    expect(isNumberOnlyInput('1,200.50')).toBe(true);
    expect(isNumberOnlyInput('10, 20')).toBe(true);
  });

  it('identifies numbers with currencies or currency symbols as number-only', () => {
    expect(isNumberOnlyInput('RM 25')).toBe(true);
    expect(isNumberOnlyInput('RM25')).toBe(true);
    expect(isNumberOnlyInput('25 RM')).toBe(true);
    expect(isNumberOnlyInput('$50')).toBe(true);
    expect(isNumberOnlyInput('$ 50.00')).toBe(true);
    expect(isNumberOnlyInput('USD 100', ['USD'])).toBe(true);
    expect(isNumberOnlyInput('100USD', ['USD'])).toBe(true);
    expect(isNumberOnlyInput('€ 75')).toBe(true);
  });

  it('returns false when merchant or descriptive text is present', () => {
    expect(isNumberOnlyInput('lunch 25')).toBe(false);
    expect(isNumberOnlyInput('25 lunch')).toBe(false);
    expect(isNumberOnlyInput('RM 25 coffee')).toBe(false);
    expect(isNumberOnlyInput('$15 grab')).toBe(false);
    expect(isNumberOnlyInput('lunch')).toBe(false);
    expect(isNumberOnlyInput('')).toBe(false);
    expect(isNumberOnlyInput('   ')).toBe(false);
    expect(isNumberOnlyInput('RM')).toBe(false);
    expect(isNumberOnlyInput('$')).toBe(false);
  });
});
