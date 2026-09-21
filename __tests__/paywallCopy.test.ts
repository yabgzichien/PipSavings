import {
  annualPerMonthText,
  firstChargeDate,
  formatOriginalAnnualPrice,
  planPackagesFromOffering,
  trialDaysFromPackage,
} from '../src/billing/paywallCopy';

describe('trialDaysFromPackage', () => {
  it('reads a free intro period in days', () => {
    expect(
      trialDaysFromPackage({
        product: { introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 14, cycles: 1 } },
      } as never)
    ).toBe(14);
  });

  it('is null when there is no free trial on the package', () => {
    expect(trialDaysFromPackage({ product: { introPrice: null } } as never)).toBeNull();
    expect(trialDaysFromPackage(null)).toBeNull();
  });
});

describe('formatOriginalAnnualPrice', () => {
  it('does not invent a price when the offering has not loaded', () => {
    expect(formatOriginalAnnualPrice(null)).toBeNull();
  });

  it('annualizes the monthly store price', () => {
    expect(
      formatOriginalAnnualPrice({
        product: { price: 9.9, priceString: 'RM9.90', currencyCode: 'MYR' },
      } as never)
    ).toBe('RM118.80');
  });
});

describe('annualPerMonthText', () => {
  it('uses the store monthly equivalent instead of a hardcoded RM amount', () => {
    expect(
      annualPerMonthText({
        product: { pricePerMonthString: 'RM5.58' },
      } as never)
    ).toBe('RM5.58');
  });
});

describe('firstChargeDate', () => {
  it('lands 14 days after the trial starts', () => {
    const start = new Date('2026-09-15T10:00:00Z');
    expect(firstChargeDate(start, 14).toISOString().slice(0, 10)).toBe('2026-09-29');
  });
});

describe('planPackagesFromOffering', () => {
  const annual = { identifier: '$rc_annual', packageType: 'ANNUAL' };
  const monthly = { identifier: '$rc_monthly', packageType: 'MONTHLY' };

  it('uses the annual and monthly shortcuts when RevenueCat set them', () => {
    expect(planPackagesFromOffering({ annual, monthly, availablePackages: [] } as never)).toEqual({
      annual,
      monthly,
    });
  });

  it('falls back to package identifiers when the shortcuts are missing', () => {
    expect(
      planPackagesFromOffering({
        annual: null,
        monthly: null,
        availablePackages: [monthly, annual],
      } as never)
    ).toEqual({ annual, monthly });
  });
});
