import { readFileSync } from 'fs';
import { join } from 'path';

describe('Ask Pip privacy policy', () => {
  const policy = readFileSync(join(__dirname, '../docs/privacy-policy.md'), 'utf8');

  it('names Ask Pip as the BYOK exception and keeps the ledger on device', () => {
    expect(policy).toContain('Last updated: 20 September 2026');
    expect(policy).toContain('**Ask Pip (optional, your API key).**');
    expect(policy).toMatch(/directly/);
    expect(policy).toMatch(/Gemini \/ Groq \/ OpenRouter/);
    expect(policy).toMatch(/does not proxy them and does not keep them/);
    expect(policy).toMatch(/local ledger stay on device/);
  });

  it('lists the BYOK providers as parties that may receive data', () => {
    const parties = policy.slice(policy.indexOf('## Parties that may receive data'));
    expect(parties).toMatch(/Gemini/);
    expect(parties).toMatch(/Groq/);
    expect(parties).toMatch(/OpenRouter/);
  });
});
