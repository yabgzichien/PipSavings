// src/billing/gates.ts
import type { Translations } from '../i18n/types';

export const GATE_TRIGGERS = [
  'scan_quota',
  'tax_export',
  'report_export',
  'multi_currency',
  'networth_history',
  'widget_custom',
  'live_holdings',
] as const;

export type GateTrigger = (typeof GATE_TRIGGERS)[number];

/** Each gate gets its own headline. The moment a user hits a wall is the highest-intent
 *  moment in the funnel, and a generic "Upgrade to Pro" throws that away. */
export function gateHeadline(trigger: GateTrigger, t: Translations): string {
  switch (trigger) {
    case 'scan_quota':
      return t.gateScanQuota;
    case 'tax_export':
      return t.gateTaxExport;
    case 'report_export':
      return t.gateReportExport;
    case 'multi_currency':
      return t.gateMultiCurrency;
    case 'networth_history':
      return t.gateNetWorthHistory;
    case 'widget_custom':
      return t.gateWidgetCustom;
    case 'live_holdings':
      return t.gateLiveHoldings;
  }
}

/** One calm, contextual sentence for the minimal paywall hero. */
export function gateContextLine(trigger: GateTrigger, t: Translations): string {
  switch (trigger) {
    case 'scan_quota': return t.gateContextScanQuota;
    case 'tax_export': return t.gateContextTaxExport;
    case 'report_export': return t.gateContextReportExport;
    case 'multi_currency': return t.gateContextMultiCurrency;
    case 'networth_history': return t.gateContextNetWorthHistory;
    case 'widget_custom': return t.gateContextWidgetCustom;
    case 'live_holdings': return t.gateContextLiveHoldings;
  }
}
