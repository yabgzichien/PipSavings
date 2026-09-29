// src/lib/quickParse.ts
// The offline half of quick add. Pure and dependency-free so it can be unit-tested and so it
// keeps working with no API key and no signal — see the spec's core principle: the LLM is an
// enhancement, never a dependency. This parser never categorises; that is the caller's job
// (learned memory first, model second).

import { BASE_CURRENCY, SUPPORTED_CURRENCIES, currencyMeta } from './currencies';
import type { CategorySuggestion, TxnType } from './types';

export interface QuickDraft {
  label: string;
  amount: number;
  type: TxnType;
  /** ISO date, or null meaning "the caller's today". */
  date: string | null;
  /** 3-letter code, or null meaning base currency. */
  currency: string | null;
  /** Always null out of this parser. */
  categoryId: string | null;
  /** Always null out of this parser; set by resolveQuickAdd once a category is resolved, so the
   *  UI can show the same "auto categorised" indicator quick-add gets on its batch path. */
  categorySource: CategorySuggestion['source'] | null;
}

export interface QuickParseResult {
  drafts: QuickDraft[];
  /** True only when EVERY segment had exactly one amount and a non-empty label. */
  confident: boolean;
}

export interface QuickParseOptions {
  /** Currencies the user has switched on. A code outside this list is ignored. */
  activeCurrencies: string[];
  /** Today as ISO, injected rather than read from the clock so this stays pure. */
  today: string;
}

export const CURRENCY_ALIASES: Record<string, string> = {
  // SGD & common typos / aliases
  sdg: 'SGD',
  sgd: 'SGD',
  's$': 'SGD',
  'sg$': 'SGD',
  sing: 'SGD',
  新币: 'SGD',
  坡币: 'SGD',

  // MYR & common typos / aliases
  rm: 'MYR',
  myr: 'MYR',
  mry: 'MYR',
  ringgit: 'MYR',
  ringit: 'MYR',
  马币: 'MYR',
  令吉: 'MYR',

  // USD & common typos / aliases
  usd: 'USD',
  uds: 'USD',
  'us$': 'USD',
  美金: 'USD',
  美元: 'USD',

  // CNY & common typos / aliases
  cny: 'CNY',
  cyn: 'CNY',
  rmb: 'CNY',
  yuan: 'CNY',
  renminbi: 'CNY',
  人民币: 'CNY',
  元: 'CNY',
  块: 'CNY',
  块钱: 'CNY',

  // TWD & common typos / aliases
  twd: 'TWD',
  tdw: 'TWD',
  ntd: 'TWD',
  'nt$': 'TWD',
  台币: 'TWD',
  新台币: 'TWD',

  // HKD & common typos / aliases
  hkd: 'HKD',
  hdk: 'HKD',
  'hk$': 'HKD',
  港币: 'HKD',
  港元: 'HKD',

  // JPY & aliases
  jpy: 'JPY',
  yen: 'JPY',
  日元: 'JPY',
  日币: 'JPY',

  // KRW & common typos / aliases
  krw: 'KRW',
  kwr: 'KRW',
  won: 'KRW',
  韩元: 'KRW',
  韩币: 'KRW',

  // EUR & GBP & common typos / aliases
  eur: 'EUR',
  eru: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  欧元: 'EUR',
  gbp: 'GBP',
  pound: 'GBP',
  pounds: 'GBP',
  pnd: 'GBP',
  英镑: 'GBP',

  // Turkish lira
  tl: 'TRY',
  lira: 'TRY',
  'turkish lira': 'TRY',
  '₺': 'TRY',

  // CHF, AUD, CAD, NZD
  chf: 'CHF',
  法郎: 'CHF',
  瑞士法郎: 'CHF',
  aud: 'AUD',
  adu: 'AUD',
  'a$': 'AUD',
  澳币: 'AUD',
  澳元: 'AUD',
  cad: 'CAD',
  cda: 'CAD',
  'c$': 'CAD',
  加币: 'CAD',
  加元: 'CAD',
  nzd: 'NZD',
  'nz$': 'NZD',
  纽币: 'NZD',
  新西兰元: 'NZD',

  // Regional
  thb: 'THB',
  tbh: 'THB',
  baht: 'THB',
  bath: 'THB',
  泰铢: 'THB',
  idr: 'IDR',
  ird: 'IDR',
  rp: 'IDR',
  rupiah: 'IDR',
  印尼盾: 'IDR',
  php: 'PHP',
  peso: 'PHP',
  pesos: 'PHP',
  vnd: 'VND',
  dong: 'VND',
  越盾: 'VND',
  bnd: 'BND',
  aed: 'AED',
  dirham: 'AED',
  dirhams: 'AED',
  dhs: 'AED',
  'uae dirham': 'AED',
  inr: 'INR',
  rupee: 'INR',
  rupees: 'INR',
  卢比: 'INR',

  // Currency symbols
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'CNY',
  '￥': 'CNY',
  '₩': 'KRW',
  '฿': 'THB',
  '₹': 'INR',
  '₫': 'VND',
  '₱': 'PHP',
};

export function resolveCurrencyToken(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase();
  if (CURRENCY_ALIASES[clean]) {
    return CURRENCY_ALIASES[clean];
  }
  const direct = raw.trim();
  if (CURRENCY_ALIASES[direct]) {
    return CURRENCY_ALIASES[direct];
  }
  const upper = clean.toUpperCase();
  if (currencyMeta(upper)) {
    return upper;
  }
  return null;
}

function resolveStandaloneCurrencyToken(raw: string): string | null {
  // TRY is a valid ISO code but "try" is also a common English verb. Require uppercase
  // when it stands alone; attached forms such as try450 remain unambiguous currency input.
  if (raw.trim() === 'try') return null;
  return resolveCurrencyToken(raw);
}

function stripMultiwordCurrencyAliases(input: string, current: string | null): { text: string; currency: string | null } {
  let text = input;
  let currency = current;
  for (const [alias, code] of Object.entries(CURRENCY_ALIASES)) {
    if (!alias.includes(' ') || !/^[a-z ]+$/i.test(alias)) continue;
    const pattern = new RegExp(`\\b${alias.trim().split(/\s+/).join('\\s+')}\\b`, 'gi');
    text = text.replace(pattern, () => {
      if (!currency) currency = code;
      return ' ';
    });
  }
  return { text, currency };
}

/** Stops a pasted paragraph from spawning a hundred drafts. Not a meaningful number. */
export const MAX_SEGMENTS = 10;

/**
 * Words that mean income and nothing else.
 *
 * Deliberately excludes "income", "interest" and "allowance" (and 利息 / 津贴): each points
 * both ways depending on context — income TAX and loan INTEREST are expenses, and an
 * allowance is income to a student but an expense to the parent paying it. Guessing wrong
 * here is worse than not guessing, because a confidently-parsed segment never reaches the
 * model that could have disambiguated it. Those cases stay `expense` and, having no learned
 * category, are exactly the ones resolveQuickAdd hands to the LLM.
 */
const INCOME_WORDS = [
  'salary', 'wage', 'wages', 'refund', 'refunded', 'refunds', 'bonus', 'payout',
  'reimbursement', 'reimbursed', 'dividend', 'dividends',
  '工资', '薪水', '退款', '奖金', '收入', '报销', '分红',
];

/**
 * Weekday words, keyed longest-first within each day so "tuesday" is consumed before "tue".
 *
 * The abbreviations "sun", "sat" and "wed" are deliberately absent: they are ordinary English
 * words ("sun protection", "sat at cafe", "wed"), and reading them as dates both invented a
 * date and removed a token from the label — which changes the merchantKey, so the same phrase
 * could never accumulate a learned category. The full names carry no such ambiguity.
 */
const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, thursday: 4, thurs: 4, thu: 4, friday: 5, fri: 5,
  saturday: 6,
  '星期日': 0, '周日': 0, '星期一': 1, '周一': 1, '星期二': 2, '周二': 2,
  '星期三': 3, '周三': 3, '星期四': 4, '周四': 4, '星期五': 5, '周五': 5,
  '星期六': 6, '周六': 6,
};

/** Matches an income word as a whole word for ASCII, and as a substring for CJK, which has
 *  no word boundaries. Built once rather than per segment. */
const INCOME_MATCHERS: Array<{ test: (haystack: string) => boolean }> = INCOME_WORDS.map((w) => {
  if (/^[a-z]+$/.test(w)) {
    const re = new RegExp(`\\b${w}\\b`, 'i');
    return { test: (h: string) => re.test(h) };
  }
  return { test: (h: string) => h.includes(w) };
});

/** A comma between digits is a decimal or thousands mark, not a segment break. Swapped for a
 *  sentinel before splitting, then swapped back. */
const COMMA_SENTINEL = '\u0000';

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "1,200.50" -> 1200.5 ; "12,50" -> 12.5 ; "1,200" -> 1200 */
function toNumber(token: string): number {
  let t = token.replace(/,(?=\d{3}(?!\d))/g, '');
  t = t.replace(',', '.');
  return parseFloat(t);
}

function splitSegments(text: string): string[] {
  const protectedText = text.replace(/(\d),(\d)/g, `$1${COMMA_SENTINEL}$2`);
  return protectedText
    .split(/[,;\n；，、]+/)
    .map((s) => s.split(COMMA_SENTINEL).join(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

interface SegmentParse {
  draft: QuickDraft | null;
  confident: boolean;
}

function parseSegment(segment: string, opts: QuickParseOptions): SegmentParse {
  let rest = ` ${segment} `;
  const active = new Set(opts.activeCurrencies.map((c) => c.toUpperCase()));

  // --- currency: check attached suffix (e.g. 3sdg, 3sgd, 9.20rm), attached prefix (e.g. sdg3, rm9.20),
  // or standalone currency code/alias (e.g. "usd 20 dinner", "dinner 3 in sgd").
  let currency: string | null = null;

  ({ text: rest, currency } = stripMultiwordCurrencyAliases(rest, currency));

  // 1. Suffix attached to number: "3sdg", "15cny", "50rmb", "50元", "50新币", "20€", "100¥"
  rest = rest.replace(/(\b\d+(?:[.,]\d+)*)\s*([A-Za-z$€£¥￥₩฿₹₫₱₺]{1,7}|[\u4e00-\u9fff]{1,4})(?:\b|\s|$)/gi, (whole, num, token) => {
    const resolved = resolveCurrencyToken(token);
    if (resolved && !currency) {
      currency = resolved;
      return `${num} `;
    }
    return whole;
  });

  // 2. Prefix attached to number: "€50", "$15", "¥100", "cny50", "sdg3", "新币50"
  rest = rest.replace(/(?:^|\s|\b)([A-Za-z$€£¥￥₩฿₹₫₱₺]{1,7}|[\u4e00-\u9fff]{1,4})\s*(\d+(?:[.,]\d+)*\b)/gi, (whole, token, num) => {
    const resolved = resolveCurrencyToken(token);
    if (resolved && !currency) {
      currency = resolved;
      return ` ${num}`;
    }
    return whole;
  });

  // 3. Standalone currency code or alias: "usd 20 dinner", "dinner 3 in sgd", "50 cny dinner"
  rest = rest.replace(/\b([A-Za-z$€£¥￥₩฿₹₫₱₺]{1,7})\b/gi, (whole, token) => {
    const resolved = resolveStandaloneCurrencyToken(token);
    if (resolved) {
      if (!currency) currency = resolved;
      return ' ';
    }
    return whole;
  });
  // Also check standalone multi-character Chinese currency words (e.g. "新币", "马币", "人民币", "美金")
  for (const [alias, code] of Object.entries(CURRENCY_ALIASES)) {
    if (/[\u4e00-\u9fff]{2,}/.test(alias) && rest.includes(alias)) {
      if (!currency) currency = code;
      rest = rest.replace(alias, ' ');
    }
  }

  // --- date words.
  let date: string | null = null;
  const dateWord = (re: RegExp, resolve: () => string) => {
    rest = rest.replace(re, () => {
      if (!date) date = resolve();
      return ' ';
    });
  };
  dateWord(/\byesterday\b|昨天|昨日/gi, () => shiftIso(opts.today, -1));
  dateWord(/\btoday\b|今天|今日/gi, () => opts.today);
  for (const [word, target] of Object.entries(WEEKDAYS)) {
    const re = /^[a-z]+$/.test(word)
      ? new RegExp(`\\b${word}\\b`, 'gi')
      : new RegExp(word, 'g');
    dateWord(re, () => {
      const diff = (isoWeekday(opts.today) - target + 7) % 7;
      return shiftIso(opts.today, -diff);
    });
  }

  // --- amount. Every remaining standalone number is a candidate; more than one means "not confident".
  const numbers = rest.match(/\b\d+(?:[.,]\d+)*\b/g) ?? [];
  if (numbers.length === 0 || !numbers[0]) return { draft: null, confident: false };
  const amount = toNumber(numbers[0]);
  if (!Number.isFinite(amount) || amount <= 0) return { draft: null, confident: false };
  rest = rest.replace(/\b\d+(?:[.,]\d+)*\b/, ' ');

  // --- type.
  const lowered = rest.toLowerCase();
  const type: TxnType = INCOME_MATCHERS.some((m) => m.test(lowered)) ? 'income' : 'expense';

  // --- label: whatever survives, minus currency symbols and punctuation noise.
  const label = rest
    .replace(/[$€£¥₩฿₹₽₸₺]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    draft: { label, amount, type, date, currency, categoryId: null, categorySource: null },
    confident: numbers.length === 1 && label.length > 0,
  };
}

/**
 * Parse typed text into drafts, offline. Returns every segment that yielded an amount;
 * a segment with no amount is dropped entirely rather than guessed at.
 *
 * `confident` is the gate the caller uses to decide whether to spend an LLM call: it is
 * false if any segment was ambiguous, even when every category resolved from memory,
 * because a wrong amount is worse than a wrong category.
 */
export function parseQuickText(text: string, opts: QuickParseOptions): QuickParseResult {
  const segments = splitSegments(text).slice(0, MAX_SEGMENTS);
  const drafts: QuickDraft[] = [];
  let confident = segments.length > 0;
  for (const segment of segments) {
    const { draft, confident: ok } = parseSegment(segment, opts);
    if (draft) drafts.push(draft);
    if (!ok) confident = false;
  }
  return { drafts, confident: confident && drafts.length > 0 };
}

/**
 * Extract a draft without requiring an amount.
 * Used when a quick-add input has no amount so the user can be brought straight to manual entry
 * with the merchant prefilled and category auto-selected.
 */
export function parseQuickSegmentWithoutAmount(segment: string, opts: QuickParseOptions): QuickDraft {
  let rest = ` ${segment} `;
  const active = new Set(opts.activeCurrencies.map((c) => c.toUpperCase()));

  // --- currency: any supported currency code, alias, or symbol
  let currency: string | null = null;
  ({ text: rest, currency } = stripMultiwordCurrencyAliases(rest, currency));
  rest = rest.replace(/\b([A-Za-z$€£¥￥₩฿₹₫₱₺]{1,7})\b/gi, (whole, token) => {
    const resolved = resolveStandaloneCurrencyToken(token);
    if (resolved && !currency) {
      currency = resolved;
      return ' ';
    }
    return whole;
  });
  for (const [alias, code] of Object.entries(CURRENCY_ALIASES)) {
    if (/[\u4e00-\u9fff]{2,}/.test(alias) && rest.includes(alias)) {
      if (!currency) currency = code;
      rest = rest.replace(alias, ' ');
    }
  }

  // --- date words
  let date: string | null = null;
  const dateWord = (re: RegExp, resolve: () => string) => {
    rest = rest.replace(re, () => {
      if (!date) date = resolve();
      return ' ';
    });
  };
  dateWord(/\byesterday\b|昨天|昨日/gi, () => shiftIso(opts.today, -1));
  dateWord(/\btoday\b|今天|今日/gi, () => opts.today);
  for (const [word, target] of Object.entries(WEEKDAYS)) {
    const re = /^[a-z]+$/.test(word)
      ? new RegExp(`\\b${word}\\b`, 'gi')
      : new RegExp(word, 'g');
    dateWord(re, () => {
      const diff = (isoWeekday(opts.today) - target + 7) % 7;
      return shiftIso(opts.today, -diff);
    });
  }

  // --- strip any standalone numbers
  rest = rest.replace(/\b\d+(?:[.,]\d+)*\b/g, ' ');

  // --- type
  const lowered = rest.toLowerCase();
  const type: TxnType = INCOME_MATCHERS.some((m) => m.test(lowered)) ? 'income' : 'expense';

  // --- label: whatever survives, minus currency symbols and punctuation noise.
  let label = rest
    .replace(/[$€£¥￥₩฿₹₫₱₸₺]/g, ' ')
    .replace(/[,\-_:;!?#@%&*+=/\\|<>(){}[\]~`"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!label) {
    label = segment.trim();
  }

  if (label && /^[a-z]/i.test(label)) {
    label = label.charAt(0).toUpperCase() + label.slice(1);
  }

  return {
    label,
    amount: 0,
    type,
    date,
    currency,
    categoryId: null,
    categorySource: null,
  };
}

/**
 * Returns true if the text consists only of numeric values, currencies, and delimiters
 * without any merchant or descriptive words. For pure number entries, we never call an LLM.
 */
export function isNumberOnlyInput(text: string, activeCurrencies: string[] = []): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Must contain at least one digit
  if (!/\d/.test(trimmed)) return false;

  // Strip currency symbols: $, €, £, ¥, ₩, ฿, ₹, ₽, ₸, etc.
  let stripped = trimmed.replace(/[$€£¥￥₩฿₹₫₱₸₺]/g, ' ');

  // Strip Chinese currency terms
  stripped = stripped.replace(/(新币|坡币|马币|令吉|人民币|块钱|美金|美元|日元|日币|韩元|韩币|泰铢|台币|新台币|港币|港元|欧元|英镑|澳币|澳元|加币|加元|纽币|新西兰元|法郎|瑞士法郎|元|块)/g, ' ');

  // Strip currency codes and aliases (including sdg, sgd, rm, usd, and all supported currencies)
  const currencies = Array.from(
    new Set([
      'RM',
      'MYR',
      'SDG',
      ...Object.keys(CURRENCY_ALIASES).filter((k) => /^[a-z0-9$]+$/i.test(k)).map((k) => k.toUpperCase()),
      ...SUPPORTED_CURRENCIES.map((c) => c.code),
      ...activeCurrencies.map((c) => c.toUpperCase()),
    ])
  );
  currencies.sort((a, b) => b.length - a.length);
  const escaped = currencies.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const currencyPattern = new RegExp(`(?:^|\\b|\\d)(${escaped.join('|')})(?:\\b|\\d|$)`, 'gi');
  stripped = stripped.replace(currencyPattern, ' ');

  // Strip digits, punctuation marks used in numbers (. , + -), and whitespace
  stripped = stripped.replace(/[\d.,\s+\-]/g, '');

  return stripped.length === 0;
}
