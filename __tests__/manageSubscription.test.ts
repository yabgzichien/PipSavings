import { resolveManageSubscriptionAction } from '../src/billing/manageSubscription';

describe('resolveManageSubscriptionAction', () => {
  it('sends a free user to the paywall', () => {
    expect(
      resolveManageSubscriptionAction({ isPro: false, managementURL: null })
    ).toBe('paywall');
  });

  it('sends a free user to the paywall even if a leftover store URL exists', () => {
    expect(
      resolveManageSubscriptionAction({
        isPro: false,
        managementURL: 'https://play.google.com/store/account/subscriptions',
      })
    ).toBe('paywall');
  });

  it('opens the store page for a subscribed Pro user', () => {
    expect(
      resolveManageSubscriptionAction({
        isPro: true,
        managementURL: 'https://play.google.com/store/account/subscriptions',
      })
    ).toBe('open-store');
  });

  it('tells lifetime and promo Pro to open Customer Center', () => {
    expect(
      resolveManageSubscriptionAction({ isPro: true, managementURL: null })
    ).toBe('customer-center');
  });

  it('treats a blank store URL as Customer Center', () => {
    expect(
      resolveManageSubscriptionAction({ isPro: true, managementURL: '  ' })
    ).toBe('customer-center');
  });
});
