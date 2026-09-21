import type { ProFeatureId } from './proFeatures';

export type PaywallEventName =
  | 'paywall_impression'
  | 'paywall_plan_selected'
  | 'paywall_cta_tapped'
  | 'paywall_store_outcome'
  | 'paywall_restore_outcome';

export type PaywallPlan = 'annual' | 'monthly';
export type PaywallOutcome = 'success' | 'cancelled' | 'failed' | 'nothing_to_restore';

export interface PaywallEvent {
  name: PaywallEventName;
  featureId?: ProFeatureId;
  plan?: PaywallPlan;
  outcome?: PaywallOutcome;
  appVersion?: string;
  experimentVariant?: 'control' | 'trial_7d' | 'trial_14d';
}

const EVENT_NAMES: readonly string[] = [
  'paywall_impression',
  'paywall_plan_selected',
  'paywall_cta_tapped',
  'paywall_store_outcome',
  'paywall_restore_outcome',
];
const FEATURE_IDS: readonly string[] = [
  'unlimited_scans',
  'reports_exports',
  'premium_app_icons',
  'premium_widget_styles',
  'multi_currency',
  'networth_history',
  'live_holdings',
];
const PLANS: readonly string[] = ['annual', 'monthly'];
const OUTCOMES: readonly string[] = ['success', 'cancelled', 'failed', 'nothing_to_restore'];
const VARIANTS: readonly string[] = ['control', 'trial_7d', 'trial_14d'];
const KEYS = new Set([
  'name',
  'featureId',
  'plan',
  'outcome',
  'appVersion',
  'experimentVariant',
]);

function optionalEnum(value: unknown, allowed: readonly string[]): boolean {
  return value === undefined || (typeof value === 'string' && allowed.includes(value));
}

export function validatePaywallEvent(value: unknown): PaywallEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((key) => !KEYS.has(key))) return null;
  if (typeof event.name !== 'string' || !EVENT_NAMES.includes(event.name)) return null;
  if (!optionalEnum(event.featureId, FEATURE_IDS)) return null;
  if (!optionalEnum(event.plan, PLANS)) return null;
  if (!optionalEnum(event.outcome, OUTCOMES)) return null;
  if (!optionalEnum(event.experimentVariant, VARIANTS)) return null;
  if (
    event.appVersion !== undefined &&
    (typeof event.appVersion !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(event.appVersion))
  ) {
    return null;
  }
  return event as unknown as PaywallEvent;
}
