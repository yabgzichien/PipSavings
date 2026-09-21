// src/lib/offerRestorePurchases.ts
// After a backup restore, data is back but store entitlements are not. Ask once whether to
// restore purchases via RevenueCat; skippable ("Not now" = cancel).
import type { Tier } from '../billing/entitlementCache';

export interface OfferRestorePurchasesDeps {
  confirmAction: (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void | Promise<void>,
    neutralAction?: unknown,
    cancelLabel?: string
  ) => void;
  restore: () => Promise<Tier>;
  refresh: () => Promise<void>;
  notify: (title: string, message?: string) => void;
  title: string;
  body: string;
  confirmLabel: string;
  skipLabel: string;
  nothingToRestore: string;
  storeUnreachable: string;
}

export function offerRestorePurchases(deps: OfferRestorePurchasesDeps): void {
  deps.confirmAction(
    deps.title,
    deps.body,
    deps.confirmLabel,
    async () => {
      try {
        const tier = await deps.restore();
        await deps.refresh();
        if (tier === 'free') deps.notify(deps.nothingToRestore);
      } catch {
        deps.notify(deps.storeUnreachable);
      }
    },
    undefined,
    deps.skipLabel
  );
}
