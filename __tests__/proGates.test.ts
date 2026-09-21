// __tests__/proGates.test.ts
import { en } from '../src/i18n/translations/en';
import { GATE_TRIGGERS, gateHeadline, type GateTrigger } from '../src/billing/gates';

describe('gateHeadline', () => {
  it('gives every trigger a non-empty headline', () => {
    for (const trigger of GATE_TRIGGERS) {
      expect(gateHeadline(trigger, en).length).toBeGreaterThan(0);
    }
  });

  it('maps the scan quota trigger to its own copy', () => {
    expect(gateHeadline('scan_quota', en)).toBe(en.gateScanQuota);
  });

  it('maps the tax export trigger to its own copy', () => {
    expect(gateHeadline('tax_export', en)).toBe(en.gateTaxExport);
  });

  // A generic headline on every gate wastes the highest-intent moment in the funnel, so each
  // trigger has to resolve to distinct copy.
  it('never reuses the same headline for two triggers', () => {
    const seen = GATE_TRIGGERS.map((g: GateTrigger) => gateHeadline(g, en));
    expect(new Set(seen).size).toBe(GATE_TRIGGERS.length);
  });
});
