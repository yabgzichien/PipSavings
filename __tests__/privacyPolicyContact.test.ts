import { readFileSync } from 'fs';
import { join } from 'path';

describe('privacy policy contact', () => {
  const policy = readFileSync(
    join(__dirname, '../docs/privacy-policy.md'),
    'utf8'
  );

  it('lists the real privacy contact email', () => {
    expect(policy).toContain('zichienyang@gmail.com');
  });

  it('does not advertise a mailbox that does not exist', () => {
    expect(policy).not.toContain('support@pipfinance.app');
  });
});
