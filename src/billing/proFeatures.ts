import type { GateTrigger } from './gates';

export type ProFeatureId =
  | 'unlimited_scans'
  | 'reports_exports'
  | 'premium_app_icons'
  | 'premium_widget_styles'
  | 'multi_currency'
  | 'networth_history'
  | 'live_holdings';

export interface ProFeature {
  id: ProFeatureId;
  gateTrigger: GateTrigger;
  labelKey: string;
  descKey: string;
  icon: 'scan' | 'file' | 'sparkles' | 'sliders' | 'swap' | 'chart' | 'trending';
  shipped: boolean;
}

export type ProFeatureAvailability = Record<ProFeatureId, boolean>;

export const PRO_FEATURES: Record<ProFeatureId, ProFeature> = {
  unlimited_scans: {
    id: 'unlimited_scans',
    gateTrigger: 'scan_quota',
    labelKey: 'proBenefitScans',
    descKey: 'proBenefitScansDesc',
    icon: 'scan',
    shipped: true,
  },
  reports_exports: {
    id: 'reports_exports',
    gateTrigger: 'report_export',
    labelKey: 'proBenefitReports',
    descKey: 'proBenefitReportsDesc',
    icon: 'file',
    shipped: true,
  },
  premium_app_icons: {
    id: 'premium_app_icons',
    gateTrigger: 'widget_custom',
    labelKey: 'proBenefitIcons',
    descKey: 'proBenefitIconsDesc',
    icon: 'sparkles',
    shipped: false,
  },
  premium_widget_styles: {
    id: 'premium_widget_styles',
    gateTrigger: 'widget_custom',
    labelKey: 'proBenefitWidgets',
    descKey: 'proBenefitWidgetsDesc',
    icon: 'sliders',
    shipped: true,
  },
  multi_currency: {
    id: 'multi_currency',
    gateTrigger: 'multi_currency',
    labelKey: 'proBenefitCurrency',
    descKey: 'proBenefitCurrencyDesc',
    icon: 'swap',
    shipped: true,
  },
  networth_history: {
    id: 'networth_history',
    gateTrigger: 'networth_history',
    labelKey: 'proBenefitHistory',
    descKey: 'proBenefitHistoryDesc',
    icon: 'chart',
    shipped: true,
  },
  live_holdings: {
    id: 'live_holdings',
    gateTrigger: 'live_holdings',
    labelKey: 'proBenefitHoldings',
    descKey: 'proBenefitHoldingsDesc',
    icon: 'trending',
    shipped: true,
  },
};

const DEFAULT_BENEFIT_ORDER: ProFeatureId[] = [
  'unlimited_scans',
  'reports_exports',
  'premium_app_icons',
  'premium_widget_styles',
  'live_holdings',
  'multi_currency',
  'networth_history',
];

const TRIGGER_FEATURE: Record<GateTrigger, ProFeatureId> = {
  scan_quota: 'unlimited_scans',
  tax_export: 'reports_exports',
  report_export: 'reports_exports',
  multi_currency: 'multi_currency',
  networth_history: 'networth_history',
  widget_custom: 'premium_widget_styles',
  live_holdings: 'live_holdings',
};

export function proFeatureForTrigger(trigger: GateTrigger): ProFeature {
  return PRO_FEATURES[TRIGGER_FEATURE[trigger]];
}

export function paywallBenefitsForTrigger(
  trigger: GateTrigger,
  overrides: Partial<ProFeatureAvailability> = {}
): ProFeature[] {
  const available = (id: ProFeatureId) => overrides[id] ?? PRO_FEATURES[id].shipped;
  const first = TRIGGER_FEATURE[trigger];
  const ordered = [first, ...DEFAULT_BENEFIT_ORDER.filter((id) => id !== first)];
  return ordered.filter(available).slice(0, 4).map((id) => PRO_FEATURES[id]);
}
