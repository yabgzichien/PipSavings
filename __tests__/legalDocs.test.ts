import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('privacy policy', () => {
  const policy = read('docs/privacy-policy.md');
  const html = existsSync(join(root, 'legal/privacy.html'))
    ? read('legal/privacy.html')
    : '';

  it('lists the real privacy contact email', () => {
    expect(policy).toContain('zichienyang@gmail.com');
    expect(html).toContain('zichienyang@gmail.com');
  });

  it('does not advertise a mailbox that does not exist', () => {
    expect(policy).not.toContain('support@pipfinance.app');
  });

  it('uses the name PipSavings, with Pip as the short name', () => {
    expect(policy).toMatch(/PipSavings/);
    expect(html).toMatch(/PipSavings/);
    expect(policy).toMatch(/“Pip”/);
    expect(html).toMatch(/“Pip”/);
  });

  it('admits the local database is not encrypted at rest', () => {
    expect(policy.toLowerCase()).toMatch(/not encrypted at rest/);
    expect(html.toLowerCase()).toMatch(/not encrypted at rest/);
  });

  it('discloses optional scan images leaving the device', () => {
    expect(policy).toMatch(/Cloudflare/i);
    expect(policy).toMatch(/image/i);
    expect(html).toMatch(/Cloudflare/i);
  });

  it('discloses Google Drive backup and Sign-In email', () => {
    expect(policy).toMatch(/Google Drive/i);
    expect(policy.toLowerCase()).toMatch(/email/);
    expect(html).toMatch(/Google Drive/i);
  });

  it('discloses RevenueCat, Sentry, and Yahoo Finance', () => {
    expect(policy).toMatch(/RevenueCat/);
    expect(policy).toMatch(/Sentry/);
    expect(policy).toMatch(/Yahoo Finance/);
    expect(html).toMatch(/RevenueCat/);
    expect(html).toMatch(/Sentry/);
    expect(html).toMatch(/Yahoo Finance/);
  });

  it('says crash diagnostics is on by default and can be turned off', () => {
    expect(policy.toLowerCase()).toMatch(/on by default/);
    expect(html.toLowerCase()).toMatch(/on by default/);
    expect(policy).not.toMatch(/off unless you turn them on/);
    expect(html).not.toMatch(/off unless you turn them on/);
  });

  it('says Pip is not directed at children', () => {
    expect(policy.toLowerCase()).toMatch(/not directed at children|not intended for children/);
    expect(html.toLowerCase()).toMatch(/not directed at children|not intended for children/);
  });

  it('does not name optional on-device OCR', () => {
    expect(policy).not.toMatch(/ML Kit/);
    expect(html).not.toMatch(/ML Kit/);
  });

  it('does not claim external models never train on scans', () => {
    expect(policy).toMatch(/External AI models may use scan images and extracted rows/);
    expect(html).toMatch(/External AI models may use scan images and extracted rows/);
    expect(policy).not.toMatch(/are not used to train external AI models/);
    expect(html).not.toMatch(/are not used to train external AI models/);
  });
});

describe('terms of use', () => {
  const terms = read('docs/terms.md');
  const html = existsSync(join(root, 'legal/terms.html'))
    ? read('legal/terms.html')
    : '';

  it('lists the contact email', () => {
    expect(terms).toContain('zichienyang@gmail.com');
    expect(html).toContain('zichienyang@gmail.com');
  });

  it('uses the name PipSavings, with Pip as the short name', () => {
    expect(terms).toMatch(/PipSavings/);
    expect(html).toMatch(/PipSavings/);
  });

  it('disclaims financial and tax advice and LHDN filing', () => {
    expect(terms.toLowerCase()).toMatch(/not financial advice|does not give financial advice/);
    expect(terms.toLowerCase()).toMatch(/not tax advice/);
    expect(terms).toMatch(/LHDN/);
    expect(html.toLowerCase()).toMatch(/not tax advice/);
    expect(html).toMatch(/LHDN/);
  });

  it('covers auto-renewing Play subscriptions and promo codes', () => {
    expect(terms).toMatch(/Google Play/);
    expect(terms.toLowerCase()).toMatch(/renew/);
    expect(terms.toLowerCase()).toMatch(/promo/);
  });

  it('limits liability and names governing law', () => {
    expect(terms.toLowerCase()).toMatch(/as is/);
    expect(terms).toMatch(/Malaysia/);
    expect(html).toMatch(/Malaysia/);
  });
});

describe('README legal links', () => {
  const readme = read('README.md');

  it('points readers at the privacy policy and terms of use', () => {
    expect(readme).toMatch(/docs\/privacy-policy\.md/);
    expect(readme).toMatch(/docs\/terms\.md/);
    expect(readme).toMatch(/PipSavings/);
  });
});

describe('Play Data safety worksheet', () => {
  const sheet = read('docs/play-data-safety.md');

  it('tells Console to use the hosted privacy URL', () => {
    expect(sheet).toContain('https://yabgzichien.github.io/PipFinance/privacy.html');
  });

  it('declares the data types the app actually transmits', () => {
    expect(sheet).toMatch(/Photos/);
    expect(sheet).toMatch(/Email address/);
    expect(sheet).toMatch(/Purchase history/);
    expect(sheet).toMatch(/Other financial info/);
    expect(sheet).toMatch(/Crash logs/);
    expect(sheet).toMatch(/Device or other IDs/);
  });

  it('says data is encrypted in transit but the on-device ledger is not encrypted at rest', () => {
    expect(sheet.toLowerCase()).toMatch(/encrypted in transit/);
    expect(sheet.toLowerCase()).toMatch(/not encrypted at rest/);
  });

  it('says crash logs are on by default and can be turned off', () => {
    expect(sheet.toLowerCase()).toMatch(/on by default/);
    expect(sheet).not.toMatch(/Crash diagnostics is \*\*off\*\* by default/);
  });
});
