import {
  paywallBenefitsForTrigger,
  proFeatureForTrigger,
  type ProFeatureAvailability,
} from '../src/billing/proFeatures';

describe('Pip Pro feature catalog', () => {
  it('puts the feature that opened the paywall first', () => {
    expect(paywallBenefitsForTrigger('multi_currency').map((item) => item.id)).toEqual([
      'multi_currency',
      'unlimited_scans',
      'reports_exports',
      'premium_widget_styles',
    ]);
  });

  it('does not advertise future premium icons before artwork ships', () => {
    expect(paywallBenefitsForTrigger('scan_quota').map((item) => item.id)).toEqual([
      'unlimited_scans',
      'reports_exports',
      'premium_widget_styles',
      'live_holdings',
    ]);
  });

  it('leads with live holdings when that gate opened the paywall', () => {
    expect(paywallBenefitsForTrigger('live_holdings').map((item) => item.id)).toEqual([
      'live_holdings',
      'unlimited_scans',
      'reports_exports',
      'premium_widget_styles',
    ]);
  });

  it('includes premium icons once the released catalog marks them shipped', () => {
    const availability: Partial<ProFeatureAvailability> = { premium_app_icons: true };

    expect(paywallBenefitsForTrigger('scan_quota', availability).map((item) => item.id)).toEqual([
      'unlimited_scans',
      'reports_exports',
      'premium_app_icons',
      'premium_widget_styles',
    ]);
  });

  it('maps every gate trigger to a feature', () => {
    expect(proFeatureForTrigger('scan_quota').id).toBe('unlimited_scans');
    expect(proFeatureForTrigger('tax_export').id).toBe('reports_exports');
    expect(proFeatureForTrigger('report_export').id).toBe('reports_exports');
    expect(proFeatureForTrigger('widget_custom').id).toBe('premium_widget_styles');
    expect(proFeatureForTrigger('networth_history').id).toBe('networth_history');
    expect(proFeatureForTrigger('live_holdings').id).toBe('live_holdings');
  });
});
