// src/lib/currencies.ts
// The fixed set of currencies the app can convert. MYR is the base and is never
// converted. `decimals` matters: rendering "JPY 1,200.00" reads as a bug, because
// the yen has no subunit in everyday use.

export interface CurrencyMeta {
  code: string;
  label: string;
  decimals: number;
}

export const BASE_CURRENCY = 'MYR';

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'MYR', label: 'Malaysian Ringgit', decimals: 2 },
  { code: 'SGD', label: 'Singapore Dollar', decimals: 2 },
  { code: 'USD', label: 'US Dollar', decimals: 2 },
  { code: 'CNY', label: 'Chinese Yuan', decimals: 2 },
  { code: 'TWD', label: 'New Taiwan Dollar', decimals: 2 },
  { code: 'HKD', label: 'Hong Kong Dollar', decimals: 2 },
  { code: 'JPY', label: 'Japanese Yen', decimals: 0 },
  { code: 'KRW', label: 'South Korean Won', decimals: 0 },
  { code: 'GBP', label: 'British Pound', decimals: 2 },
  { code: 'EUR', label: 'Euro', decimals: 2 },
  { code: 'TRY', label: 'Turkish Lira', decimals: 2 },
  { code: 'CHF', label: 'Swiss Franc', decimals: 2 },
  { code: 'AUD', label: 'Australian Dollar', decimals: 2 },
  { code: 'CAD', label: 'Canadian Dollar', decimals: 2 },
  { code: 'NZD', label: 'New Zealand Dollar', decimals: 2 },
  { code: 'THB', label: 'Thai Baht', decimals: 2 },
  { code: 'IDR', label: 'Indonesian Rupiah', decimals: 0 },
  { code: 'PHP', label: 'Philippine Peso', decimals: 2 },
  { code: 'VND', label: 'Vietnamese Dong', decimals: 0 },
  { code: 'BND', label: 'Brunei Dollar', decimals: 2 },
  { code: 'AED', label: 'UAE Dirham', decimals: 2 },
  { code: 'KHR', label: 'Cambodian Riel', decimals: 0 },
  { code: 'LAK', label: 'Lao Kip', decimals: 0 },
  { code: 'MMK', label: 'Myanmar Kyat', decimals: 0 },
  { code: 'TND', label: 'Tunisian Dinar', decimals: 3 },
  { code: 'INR', label: 'Indian Rupee', decimals: 2 },
  { code: 'KZT', label: 'Kazakhstani Tenge', decimals: 2 },
  { code: 'RUB', label: 'Russian Ruble', decimals: 2 },
  { code: 'UZS', label: 'Uzbekistani Som', decimals: 2 },
  { code: 'PLN', label: 'Polish Złoty', decimals: 2 },
];

const BY_CODE: Record<string, CurrencyMeta> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c])
);

export function currencyMeta(code: string): CurrencyMeta | null {
  return BY_CODE[code] ?? null;
}

/** Decimal places for a code, defaulting to 2 for anything unrecognised. */
export function decimalsFor(code: string): number {
  return BY_CODE[code]?.decimals ?? 2;
}
