const mockGetActive = jest.fn();
const mockExtract = jest.fn();

jest.mock('../src/lib/askPip/keyStore', () => {
  const actual = jest.requireActual('../src/lib/askPip/keyStore') as object;
  return {
    ...actual,
    defaultAskPipKeyStore: () => ({ getActive: mockGetActive }),
  };
});

jest.mock('../src/llm/fallback', () => ({
  getLLM: async () => ({
    extract: mockExtract,
    extractReceipt: jest.fn(),
    extractSnapshot: jest.fn(),
  }),
}));

jest.mock('../src/db/metaRepo', () => ({
  getMeta: jest.fn(async () => 'anon-install-123'),
  setMeta: jest.fn(async () => undefined),
}));

jest.mock('../src/billing/purchases', () => ({
  fetchAppUserId: jest.fn(async () => null),
}));

import { submitScan } from '../src/billing/scanProxy';
import { LLMError } from '../src/llm/types';
import { Platform } from 'react-native';

describe('BYOK local scan', () => {
  const originalFetch = global.fetch;
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    mockGetActive.mockReset();
    mockExtract.mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: originalPlatform });
  });

  it('calls the user key locally and never posts to the worker', async () => {
    mockGetActive.mockResolvedValue({
      id: 'k1',
      providerId: 'groq',
      apiKey: 'gsk_user',
      createdAt: '2026-01-01',
    });
    mockExtract.mockResolvedValue([{ merchant: 'Coffee', amount: 4.5, type: 'expense', currency: 'MYR', date: null }]);

    const res = await submitScan({ imageBase64: 'abc', mimeType: 'image/jpeg' }, 'free');

    expect(mockExtract).toHaveBeenCalledWith({
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      categories: undefined,
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.items).toEqual([{ merchant: 'Coffee', amount: 4.5, type: 'expense', currency: 'MYR', date: null }]);
    expect(res.allowance.tier).toBe('free');
    expect(res.allowance.monthLimit).toBe(Number.POSITIVE_INFINITY);
    expect(res.quotaBlocked).toBe(false);
  });

  it('falls back to the worker when the user key reaches its provider limit', async () => {
    mockGetActive.mockResolvedValue({
      id: 'k1',
      providerId: 'groq',
      apiKey: 'gsk_user',
      createdAt: '2026-01-01',
    });
    mockExtract.mockRejectedValue(new LLMError('rate_limit', 'Rate limit reached.'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        items: [{ merchant: 'Fallback Coffee', amount: 5, type: 'expense', currency: 'MYR', date: null }],
        allowance: { tier: 'free', monthUsed: 4, dayUsed: 2 },
      }),
    } as never);

    const res = await submitScan({ imageBase64: 'abc', mimeType: 'image/jpeg' }, 'free');

    expect(res.ok).toBe(true);
    expect(res.items[0]?.merchant).toBe('Fallback Coffee');
    expect(res.byokRateLimited).toBe(true);
    expect(res.serverFallbackAttempted).toBe(true);
    expect(res.allowance.dayUsed).toBe(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('requires a user key on web instead of posting a keyless scan to the worker', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'web' });
    mockGetActive.mockResolvedValue(null);

    const res = await submitScan({ imageBase64: 'abc', mimeType: 'image/jpeg' }, 'free');

    expect(res.ok).toBe(false);
    expect(res.webByokRequired).toBe(true);
    expect(res.error).toBe('Add your API key in Settings to use AI scans on web.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not post to the worker when a web BYOK provider is rate limited', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'web' });
    mockGetActive.mockResolvedValue({
      id: 'k1',
      providerId: 'groq',
      apiKey: 'gsk_user',
      createdAt: '2026-01-01',
    });
    mockExtract.mockRejectedValue(new LLMError('rate_limit', 'Rate limit reached.'));

    const res = await submitScan({ imageBase64: 'abc', mimeType: 'image/jpeg' }, 'free');

    expect(res.ok).toBe(false);
    expect(res.webByokRequired).toBe(true);
    expect(res.byokRateLimited).toBe(true);
    expect(res.serverFallbackAttempted).not.toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(['auth', 'network', 'bad_response'] as const)(
    'does not consume Pip allowance when the user key fails with %s',
    async (code) => {
      mockGetActive.mockResolvedValue({
        id: 'k1',
        providerId: 'groq',
        apiKey: 'gsk_user',
        createdAt: '2026-01-01',
      });
      mockExtract.mockRejectedValue(new LLMError(code, `${code} failure`));

      const res = await submitScan({ imageBase64: 'abc', mimeType: 'image/jpeg' }, 'free');

      expect(res.ok).toBe(false);
      expect(res.byokRateLimited).not.toBe(true);
      expect(res.serverFallbackAttempted).not.toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );
});
