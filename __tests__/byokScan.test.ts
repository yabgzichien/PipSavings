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

describe('BYOK local scan', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetActive.mockReset();
    mockExtract.mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls the user key locally and never posts to the worker', async () => {
    mockGetActive.mockResolvedValue({
      id: 'k1',
      providerId: 'groq',
      apiKey: 'gsk_user',
      createdAt: '2026-01-01',
    });
    mockExtract.mockResolvedValue([{ label: 'Coffee', amount: 4.5 }]);

    const res = await submitScan({ imageBase64: 'abc', mimeType: 'image/jpeg' }, 'free');

    expect(mockExtract).toHaveBeenCalledWith({
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      categories: undefined,
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.items).toEqual([{ label: 'Coffee', amount: 4.5 }]);
    expect(res.allowance.tier).toBe('free');
    expect(res.allowance.monthLimit).toBe(Number.POSITIVE_INFINITY);
    expect(res.quotaBlocked).toBe(false);
  });
});
