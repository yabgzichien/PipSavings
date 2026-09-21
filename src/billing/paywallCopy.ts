// src/billing/paywallCopy.ts
import type { PurchasesPackage } from 'react-native-purchases';
import { currencyPrefix } from '../lib/format';

export function trialDaysFromPackage(pkg: PurchasesPackage | null | undefined): number | null {
  const intro = pkg?.product?.introPrice;
  if (!intro || intro.price > 0) return null;
  const units = intro.periodNumberOfUnits;
  if (typeof units !== 'number' || units <= 0) return null;
  const unit = String(intro.periodUnit || '').toUpperCase();
  if (unit === 'DAY' || unit === 'DAYS') return units * (intro.cycles || 1);
  if (unit === 'WEEK' || unit === 'WEEKS') return units * 7 * (intro.cycles || 1);
  if (unit === 'MONTH' || unit === 'MONTHS') return units * 30 * (intro.cycles || 1);
  return null;
}

export function formatOriginalAnnualPrice(monthlyPkg: PurchasesPackage | null): string | null {
  if (!monthlyPkg?.product || typeof monthlyPkg.product.price !== 'number' || monthlyPkg.product.price <= 0) {
    return null;
  }
  const raw = monthlyPkg.product.price * 12;
  const currency = monthlyPkg.product.currencyCode || 'MYR';
  if (currency === 'MYR' || monthlyPkg.product.priceString?.startsWith('RM')) {
    return `RM${raw.toFixed(2)}`;
  }
  return `${currencyPrefix(currency)} ${raw.toFixed(2)}`;
}

export function annualPerMonthText(annualPkg: PurchasesPackage | null): string | null {
  const formatted = annualPkg?.product?.pricePerMonthString?.trim();
  return formatted || null;
}

export function firstChargeDate(start: Date, trialDays: number): Date {
  const d = new Date(start.getTime());
  d.setUTCDate(d.getUTCDate() + trialDays);
  return d;
}

type OfferingPlans = {
  annual?: PurchasesPackage | null;
  monthly?: PurchasesPackage | null;
  availablePackages?: PurchasesPackage[];
};

function packageFromList(
  packages: PurchasesPackage[],
  ids: string[]
): PurchasesPackage | null {
  return (
    packages.find(
      (pkg) =>
        ids.includes(pkg.identifier) ||
        ids.includes(String((pkg as { packageType?: string }).packageType || ''))
    ) ?? null
  );
}

/** RevenueCat only fills `annual` / `monthly` when those package types are set in the dashboard. */
export function planPackagesFromOffering(
  offering: OfferingPlans | null | undefined
): { annual: PurchasesPackage | null; monthly: PurchasesPackage | null } {
  if (!offering) return { annual: null, monthly: null };
  const packages = offering.availablePackages ?? [];
  return {
    annual: offering.annual ?? packageFromList(packages, ['$rc_annual', 'annual', 'ANNUAL']),
    monthly: offering.monthly ?? packageFromList(packages, ['$rc_monthly', 'monthly', 'MONTHLY']),
  };
}
