import { validatePaywallEvent } from '../src/billing/proAnalytics';

describe('anonymous paywall analytics schema', () => {
  it('accepts an allowlisted event with enumerated properties', () => {
    expect(
      validatePaywallEvent({
        name: 'paywall_store_outcome',
        featureId: 'unlimited_scans',
        plan: 'annual',
        outcome: 'success',
        appVersion: '1.0.15',
      })
    ).toEqual({
      name: 'paywall_store_outcome',
      featureId: 'unlimited_scans',
      plan: 'annual',
      outcome: 'success',
      appVersion: '1.0.15',
    });
  });

  it('rejects unknown properties instead of forwarding possible personal data', () => {
    expect(
      validatePaywallEvent({
        name: 'paywall_impression',
        featureId: 'unlimited_scans',
        merchant: 'A user-authored merchant',
      })
    ).toBeNull();
  });

  it('rejects free-form values outside the allowlists', () => {
    expect(
      validatePaywallEvent({
        name: 'paywall_impression',
        featureId: 'receipt for RM 42.90',
      })
    ).toBeNull();
  });
});
