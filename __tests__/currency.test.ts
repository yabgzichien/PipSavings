// __tests__/currency.test.ts
import { BASE_CURRENCY, SUPPORTED_CURRENCIES, currencyMeta, decimalsFor } from '../src/lib/currencies';
import { round2, deriveMyr, parseActiveCurrencies, isMultiCurrency } from '../src/lib/currency';
import { rederiveOnEdit, deriveNative } from '../src/lib/currency';

describe('currency table', () => {
  it('has MYR as the base and lists it first', () => {
    expect(BASE_CURRENCY).toBe('MYR');
    expect(SUPPORTED_CURRENCIES[0].code).toBe('MYR');
  });

  it('has no duplicate codes', () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('marks the zero-subunit currencies as 0 decimals', () => {
    for (const code of ['JPY', 'KRW', 'VND', 'IDR', 'KHR', 'LAK', 'MMK']) {
      expect(decimalsFor(code)).toBe(0);
    }
  });

  it('marks 3-decimal currencies like TND correctly', () => {
    expect(decimalsFor('TND')).toBe(3);
    expect(currencyMeta('TND')).toEqual({ code: 'TND', label: 'Tunisian Dinar', decimals: 3 });
  });

  it('supports INR, KZT, RUB, UZS, and PLN', () => {
    expect(currencyMeta('INR')).toEqual({ code: 'INR', label: 'Indian Rupee', decimals: 2 });
    expect(currencyMeta('KZT')).toEqual({ code: 'KZT', label: 'Kazakhstani Tenge', decimals: 2 });
    expect(currencyMeta('RUB')).toEqual({ code: 'RUB', label: 'Russian Ruble', decimals: 2 });
    expect(currencyMeta('UZS')).toEqual({ code: 'UZS', label: 'Uzbekistani Som', decimals: 2 });
    expect(currencyMeta('PLN')).toEqual({ code: 'PLN', label: 'Polish Złoty', decimals: 2 });
  });

  it('supports Turkish lira and UAE dirham with two decimal places', () => {
    expect(currencyMeta('TRY')).toEqual({ code: 'TRY', label: 'Turkish Lira', decimals: 2 });
    expect(currencyMeta('AED')).toEqual({ code: 'AED', label: 'UAE Dirham', decimals: 2 });
    expect(decimalsFor('TRY')).toBe(2);
    expect(decimalsFor('AED')).toBe(2);
  });

  it('defaults an unknown code to 2 decimals rather than throwing', () => {
    expect(decimalsFor('ZZZ')).toBe(2);
    expect(currencyMeta('ZZZ')).toBeNull();
  });
});

describe('round2', () => {
  it('rounds to two decimal places', () => {
    expect(round2(80.6412)).toBe(80.64);
    expect(round2(80.6456)).toBe(80.65);
  });

  it('kills float artifacts', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });

  it('returns 0 for non-finite input', () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe('deriveMyr', () => {
  it('leaves a MYR amount completely alone', () => {
    expect(deriveMyr(128, 'MYR', null)).toEqual({ amount: 128, nativeAmount: null, fxRate: null });
  });

  it('ignores a supplied rate when the currency is MYR', () => {
    expect(deriveMyr(128, 'MYR', 0.63)).toEqual({ amount: 128, nativeAmount: null, fxRate: null });
  });

  it('converts a foreign amount and keeps the native figure', () => {
    expect(deriveMyr(128, 'CNY', 0.63)).toEqual({ amount: 80.64, nativeAmount: 128, fxRate: 0.63 });
  });

  it('rounds the MYR amount to 2dp exactly once', () => {
    expect(deriveMyr(21.5, 'CNY', 0.6321)).toEqual({ amount: 13.59, nativeAmount: 21.5, fxRate: 0.6321 });
  });

  it('throws on a foreign currency with no rate rather than assuming parity', () => {
    expect(() => deriveMyr(128, 'CNY', null)).toThrow(/rate/i);
  });

  it('throws on a non-positive rate', () => {
    expect(() => deriveMyr(128, 'CNY', 0)).toThrow(/rate/i);
  });
});

describe('deriveNative', () => {
  it('leaves a MYR amount alone', () => {
    expect(deriveNative(128, 'MYR', null)).toBe(128);
  });

  it('ignores a supplied rate when the currency is MYR', () => {
    expect(deriveNative(128, 'MYR', 0.63)).toBe(128);
  });

  it('is the exact inverse of deriveMyr for a foreign currency', () => {
    const { amount } = deriveMyr(128, 'CNY', 0.63);
    expect(deriveNative(amount, 'CNY', 0.63)).toBe(128);
  });

  it('rounds the native amount to 2dp', () => {
    expect(deriveNative(13.59, 'CNY', 0.6321)).toBe(21.5);
  });

  it('throws on a foreign currency with no rate rather than assuming parity', () => {
    expect(() => deriveNative(128, 'CNY', null)).toThrow(/rate/i);
  });

  it('throws on a non-positive rate', () => {
    expect(() => deriveNative(128, 'CNY', 0)).toThrow(/rate/i);
  });
});

describe('parseActiveCurrencies', () => {
  it('defaults to MYR only when nothing is stored', () => {
    expect(parseActiveCurrencies(null)).toEqual(['MYR']);
  });

  it('defaults to MYR only on malformed JSON', () => {
    expect(parseActiveCurrencies('{not json')).toEqual(['MYR']);
  });

  it('always includes MYR even if it was somehow saved without it', () => {
    expect(parseActiveCurrencies('["CNY"]')).toEqual(['MYR', 'CNY']);
  });

  it('drops unsupported codes', () => {
    expect(parseActiveCurrencies('["MYR","CNY","ZZZ"]')).toEqual(['MYR', 'CNY']);
  });

  it('deduplicates', () => {
    expect(parseActiveCurrencies('["MYR","CNY","CNY"]')).toEqual(['MYR', 'CNY']);
  });

  it('keeps Turkish lira and UAE dirham when users activate them', () => {
    expect(parseActiveCurrencies('["TRY","AED"]')).toEqual(['MYR', 'TRY', 'AED']);
  });
});

describe('isMultiCurrency', () => {
  it('is false for a MYR-only user, which is what hides the entire feature', () => {
    expect(isMultiCurrency(['MYR'])).toBe(false);
  });

  it('is true once a second currency is active', () => {
    expect(isMultiCurrency(['MYR', 'CNY'])).toBe(true);
  });
});

describe('rederiveOnEdit', () => {
  it('reuses the frozen rate so correcting a typo does not reprice the row', () => {
    // A March dinner entered at 0.63. Editing it in August must not use August's rate.
    expect(rederiveOnEdit(130, 'CNY', 0.63)).toEqual({ amount: 81.9, nativeAmount: 130, fxRate: 0.63 });
  });

  it('treats the edited number as the native figure, not the MYR figure', () => {
    const result = rederiveOnEdit(130, 'CNY', 0.63);
    expect(result.nativeAmount).toBe(130);
    expect(result.amount).not.toBe(130);
  });

  it('passes a MYR row straight through', () => {
    expect(rederiveOnEdit(130, 'MYR', null)).toEqual({ amount: 130, nativeAmount: null, fxRate: null });
  });

  it('throws when a foreign row has lost its frozen rate rather than assuming parity', () => {
    expect(() => rederiveOnEdit(130, 'CNY', null)).toThrow(/rate/i);
  });
});

describe('MYR-only invisibility', () => {
  it('an all-MYR ledger derives amounts identical to the raw entered values', () => {
    const entered = [12.5, 128, 1234.56, 0.99, 60];
    for (const amount of entered) {
      const d = deriveMyr(amount, 'MYR', null);
      expect(d.amount).toBe(round2(amount));
      expect(d.nativeAmount).toBeNull();
      expect(d.fxRate).toBeNull();
    }
  });

  it('an all-MYR total is unchanged by the conversion path', () => {
    const entered = [12.5, 128, 1234.56];
    const sum = entered.reduce((t, a) => t + deriveMyr(a, 'MYR', null).amount, 0);
    expect(round2(sum)).toBe(1375.06);
  });

  it('keeps the feature hidden with no active currencies configured', () => {
    expect(isMultiCurrency(parseActiveCurrencies(null))).toBe(false);
  });
});

describe('normalizeCurrency', () => {
  const { normalizeCurrency } = require('../src/lib/currency');

  it('normalizes valid uppercase and lowercase codes', () => {
    expect(normalizeCurrency('USD')).toBe('USD');
    expect(normalizeCurrency('sgd ')).toBe('SGD');
    expect(normalizeCurrency('cny')).toBe('CNY');
  });

  it('falls back to default currency when provided', () => {
    expect(normalizeCurrency(null, 'SGD')).toBe('SGD');
    expect(normalizeCurrency('INVALID', 'USD')).toBe('USD');
    expect(normalizeCurrency(undefined, 'EUR')).toBe('EUR');
  });

  it('falls back to MYR when default currency is omitted', () => {
    expect(normalizeCurrency(null)).toBe('MYR');
    expect(normalizeCurrency('INVALID')).toBe('MYR');
  });
});
