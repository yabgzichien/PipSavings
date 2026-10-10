const mockSubmitReceiptScan = jest.fn();

jest.mock('../src/billing/scanProxy', () => ({
  submitReceiptScan: (...args: unknown[]) => mockSubmitReceiptScan(...args),
}));

import { scanReceiptImage } from '../src/lib/scanReceipt';

const receipt = {
  merchant: 'Kopitiam',
  currency: 'MYR',
  items: [{ label: 'Coffee', amount: 3, quantity: 1 }],
  subtotal: 3,
  serviceCharge: null,
  tax: null,
  total: 3,
  discount: null,
};

describe('scanReceiptImage result metadata', () => {
  beforeEach(() => mockSubmitReceiptScan.mockReset());

  it('reports when a rate-limited user key caused the scan to use Pip allowance', async () => {
    mockSubmitReceiptScan.mockResolvedValue({
      ok: true,
      receipt,
      quotaBlocked: false,
      byokRateLimited: true,
      serverFallbackAttempted: true,
      allowance: { tier: 'free', monthUsed: 4, dayUsed: 2 },
    });

    await expect(
      scanReceiptImage({ uri: 'file:///receipt.jpg', base64: 'abc', mime: 'image/jpeg' }),
    ).resolves.toEqual({ receipt, usedPipAllowance: true });
  });

  it('does not label a normal user-key scan as Pip allowance usage', async () => {
    mockSubmitReceiptScan.mockResolvedValue({
      ok: true,
      receipt,
      quotaBlocked: false,
      allowance: { tier: 'free', monthUsed: 0, dayUsed: 0 },
    });

    await expect(
      scanReceiptImage({ uri: 'file:///receipt.jpg', base64: 'abc', mime: 'image/jpeg' }),
    ).resolves.toEqual({ receipt, usedPipAllowance: false });
  });

  it('asks the model to read a rescan and leaves the on-device text behind', async () => {
    mockSubmitReceiptScan.mockResolvedValue({
      ok: true,
      receipt,
      quotaBlocked: false,
      allowance: { tier: 'free', monthUsed: 1, dayUsed: 1 },
    });
    const prefetched = { status: 'ok' as const, text: 'garbled' };

    await scanReceiptImage(
      { uri: 'file:///receipt.jpg', base64: 'abc', mime: 'image/jpeg' },
      'free',
      prefetched,
      Promise.resolve(null),
      true,
    );

    expect(mockSubmitReceiptScan).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///receipt.jpg',
        imageBase64: 'abc',
        forceModel: true,
        prefetchedOcr: undefined,
        prefetchedTallOcr: undefined,
      }),
      'free',
    );
  });
});
