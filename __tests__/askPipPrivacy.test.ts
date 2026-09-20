import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');

describe('Ask Pip privacy policy', () => {
  const policy = readFileSync(join(root, 'docs/privacy-policy.md'), 'utf8');
  const html = readFileSync(join(root, 'legal/privacy.html'), 'utf8');

  it('names Ask Pip as the BYOK exception and keeps the ledger on device in both copies', () => {
    for (const doc of [policy, html]) {
      expect(doc).toContain('Last updated: 20 September 2026');
      expect(doc).toMatch(/Ask Pip \(optional, your API key\)/);
      expect(doc).toMatch(/directly/);
      expect(doc).toMatch(/Gemini \/ Groq \/ OpenRouter/);
      expect(doc).toMatch(/does not proxy them and does not keep them/);
      expect(doc).toMatch(/local ledger stay on device/);
    }
  });

  it('lists the BYOK providers as parties that may receive data in both copies', () => {
    for (const doc of [policy, html]) {
      const parties = doc.slice(doc.indexOf('Parties that may receive data'));
      expect(parties).toMatch(/Gemini/);
      expect(parties).toMatch(/Groq/);
      expect(parties).toMatch(/OpenRouter/);
    }
  });
});
