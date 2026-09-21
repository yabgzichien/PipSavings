import { canonicalIdempotencyKey } from '../src/idempotencyKey';

describe('canonicalIdempotencyKey', () => {
  it('changes when the image payload changes', async () => {
    const a = await canonicalIdempotencyKey('inst-1', 'transactions', '', 'IMAGE_A');
    const b = await canonicalIdempotencyKey('inst-1', 'transactions', '', 'IMAGE_B');
    expect(a).not.toBe(b);
  });

  it('is stable for the same installation, type, and body', async () => {
    const a = await canonicalIdempotencyKey('inst-1', 'receipt', 'ocr', '');
    const b = await canonicalIdempotencyKey('inst-1', 'receipt', 'ocr', '');
    expect(a).toBe(b);
  });
});
