// src/billing/manageSubscription.ts
// Decides what Settings → About → Manage subscription does. Cancel itself always
// happens on the store page; this only picks which door to open.

export type ManageSubscriptionAction = 'paywall' | 'open-store' | 'customer-center';

export function resolveManageSubscriptionAction(input: {
  isPro: boolean;
  managementURL: string | null | undefined;
}): ManageSubscriptionAction {
  if (!input.isPro) return 'paywall';
  const url = input.managementURL?.trim();
  return url ? 'open-store' : 'customer-center';
}
