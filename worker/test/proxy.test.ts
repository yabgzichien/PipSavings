// worker/test/proxy.test.ts
import worker, { isUsableResult } from '../src/index';
import { createMockD1 } from './mockD1';

describe('Worker proxy endpoint', () => {
  let db: ReturnType<typeof createMockD1>;

  beforeEach(() => {
    db = createMockD1();
  });

  it('allows scan preprocess header on CORS preflight', async () => {
    const req = new Request('https://proxy.pip.local/scan', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Headers': 'content-type,x-installation-id,x-client-preprocess',
      },
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(204);
    const allowed = res.headers.get('Access-Control-Allow-Headers') || '';
    expect(allowed).toContain('x-client-preprocess');
    expect(allowed).toContain('x-installation-id');
    expect(allowed).toContain('x-rc-app-user-id');
  });

  it('rejects requests without x-installation-id header', async () => {
    const req = new Request('https://proxy.pip.local/allowance', {
      method: 'GET',
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('x-installation-id');
  });

  it('returns initial allowance for new installation on GET /allowance', async () => {
    const req = new Request('https://proxy.pip.local/allowance', {
      method: 'GET',
      headers: {
        'x-installation-id': 'device-001',
      },
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      tier: 'free',
      monthUsed: 0,
      monthLimit: 20,
      dayUsed: 0,
      dayLimit: 3,
      canScan: true,
      blockedBy: null,
    });
  });

  it('does not treat a client x-entitlement header as Pro', async () => {
    const req = new Request('https://proxy.pip.local/allowance', {
      method: 'GET',
      headers: {
        'x-installation-id': 'device-002',
        'x-entitlement': 'pro',
      },
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe('free');
    expect(json.monthLimit).toBe(20);
  });

  it('treats a RevenueCat-verified pip_pro customer as Pro', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('/projects/proj_test/customers/user-1/active_entitlements');
      return {
        ok: true,
        json: async () => ({ items: [{ entitlement_id: 'pip_pro' }] }),
      } as Response;
    }) as typeof fetch;
    try {
      const req = new Request('https://proxy.pip.local/allowance', {
        method: 'GET',
        headers: {
          'x-installation-id': 'device-rc-1',
          'x-rc-app-user-id': 'user-1',
        },
      });
      const res = await worker.fetch(req, {
        DB: db,
        REVENUECAT_SECRET_KEY: 'sk_test',
        REVENUECAT_PROJECT_ID: 'proj_test',
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tier).toBe('pro');
      expect(json.monthLimit).toBe('Infinity');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles scan request, commits quota on success, and increments usage', async () => {
    const req = new Request('https://proxy.pip.local/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'device-003',
        'x-idempotency-key': 'idemp-1',
      },
      body: JSON.stringify({
        imageBase64: 'mockBase64',
        mimeType: 'image/png',
        categories: [{ id: 'food', label: 'Food' }],
      }),
    });

    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.allowance.dayUsed).toBe(1);
    expect(json.allowance.monthUsed).toBe(1);
  });

  it('blocks scan request with 429 when daily quota is exhausted', async () => {
    // Perform 3 successful scans
    for (let i = 1; i <= 3; i++) {
      const r = new Request('https://proxy.pip.local/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-installation-id': 'device-004',
          'x-idempotency-key': `req-${i}`,
        },
        body: JSON.stringify({
          imageBase64: `img-${i}`,
          mimeType: 'image/jpeg',
        }),
      });
      const resp = await worker.fetch(r, { DB: db });
      expect(resp.status).toBe(200);
    }

    // 4th scan must return 429
    const fourthReq = new Request('https://proxy.pip.local/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'device-004',
        'x-idempotency-key': 'req-4',
      },
        body: JSON.stringify({
          imageBase64: 'img-4',
          mimeType: 'image/jpeg',
        }),
    });
    const fourthRes = await worker.fetch(fourthReq, { DB: db });
    expect(fourthRes.status).toBe(429);
    const fourthJson = await fourthRes.json();
    expect(fourthJson.ok).toBe(false);
    expect(fourthJson.error).toBe('daily_limit');
    expect(fourthJson.allowance.blockedBy).toBe('daily');
  });

  it('ignores a stolen client idempotency key when the payload changes', async () => {
    const first = await worker.fetch(
      new Request('https://proxy.pip.local/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-installation-id': 'device-idemp',
          'x-idempotency-key': 'stolen-key',
        },
        body: JSON.stringify({ imageBase64: 'photo-one', mimeType: 'image/jpeg' }),
      }),
      { DB: db }
    );
    expect(first.status).toBe(200);
    expect((await first.json()).allowance.dayUsed).toBe(1);

    const second = await worker.fetch(
      new Request('https://proxy.pip.local/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-installation-id': 'device-idemp',
          'x-idempotency-key': 'stolen-key',
        },
        body: JSON.stringify({ imageBase64: 'photo-two', mimeType: 'image/jpeg' }),
      }),
      { DB: db }
    );
    expect(second.status).toBe(200);
    expect((await second.json()).allowance.dayUsed).toBe(2);
  });

  it('replays the stored result for the same payload without burning another scan', async () => {
    const body = JSON.stringify({ imageBase64: 'same-photo', mimeType: 'image/jpeg' });
    const headers = {
      'Content-Type': 'application/json',
      'x-installation-id': 'device-replay',
    };
    const first = await worker.fetch(
      new Request('https://proxy.pip.local/scan', { method: 'POST', headers, body }),
      { DB: db }
    );
    const firstJson = await first.json();
    expect(firstJson.allowance.dayUsed).toBe(1);

    const second = await worker.fetch(
      new Request('https://proxy.pip.local/scan', { method: 'POST', headers, body }),
      { DB: db }
    );
    const secondJson = await second.json();
    expect(second.status).toBe(200);
    expect(secondJson.ok).toBe(true);
    expect(secondJson.allowance.dayUsed).toBe(1);
  });

  it('rejects oversized imageBase64 with HTTP 413', async () => {
    const hugeImage = 'A'.repeat(401 * 1024);
    const req = new Request('https://proxy.pip.local/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'device-005',
      },
      body: JSON.stringify({
        imageBase64: hugeImage,
        mimeType: 'image/jpeg',
      }),
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toContain('400KB');
  });

  it('rejects oversized ocrText with HTTP 413', async () => {
    const hugeText = 'A'.repeat(9 * 1024);
    const req = new Request('https://proxy.pip.local/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'device-006',
      },
      body: JSON.stringify({
        ocrText: hugeText,
      }),
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toContain('8KB');
  });

  it('rejects request missing both ocrText and imageBase64/mimeType with HTTP 400', async () => {
    const req = new Request('https://proxy.pip.local/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'device-007',
      },
      body: JSON.stringify({
        scanType: 'transactions',
      }),
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Missing ocrText or imageBase64/mimeType');
  });

  it('accepts text-only scan without image', async () => {
    const req = new Request('https://proxy.pip.local/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'device-008',
      },
      body: JSON.stringify({
        ocrText: 'FamilyMart RM 15.50 2026-09-15',
        scanType: 'transactions',
      }),
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.allowance.dayUsed).toBe(1);
  });

  it('accepts hybrid scan with both image and ocrText', async () => {
    const req = new Request('https://proxy.pip.local/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'device-009',
      },
      body: JSON.stringify({
        imageBase64: 'imgBase64',
        mimeType: 'image/jpeg',
        ocrText: 'FamilyMart RM 15.50',
        scanType: 'receipt',
      }),
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.scanType).toBe('receipt');
  });

  it('computes fallback idempotency key if header is omitted', async () => {
    const req = new Request('https://proxy.pip.local/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': 'device-010',
      },
      body: JSON.stringify({
        ocrText: 'Grab MYR 22.00',
        scanType: 'transactions',
      }),
    });
    const res = await worker.fetch(req, { DB: db });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('falls through to Groq when Gemini returns empty unusable result', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        // Gemini returns empty transactions
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ transactions: [] }) }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('api.groq.com')) {
        // Groq rescues with valid items
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    transactions: [{ merchant: 'Groq Rescued', amount: 33.5, type: 'expense' }],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    globalThis.fetch = fetchMock as any;
    try {
      const req = new Request('https://proxy.pip.local/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-installation-id': 'device-011',
          'x-idempotency-key': 'rescue-key-1',
        },
        body: JSON.stringify({
          ocrText: 'Grab MYR 33.50',
          scanType: 'transactions',
        }),
      });

      const res = await worker.fetch(req, {
        DB: db,
        GEMINI_API_KEY: 'mock-gemini',
        GROQ_API_KEY: 'mock-groq',
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.items).toHaveLength(1);
      expect(json.items[0].merchant).toBe('Groq Rescued');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('isUsableResult', () => {
  it('validates transaction results correctly', () => {
    expect(isUsableResult('transactions', {})).toBe(false);
    expect(isUsableResult('transactions', { items: [] })).toBe(false);
    expect(
      isUsableResult('transactions', {
        items: [{ merchant: 'Shop', amount: 0, type: 'expense', date: null, currency: 'MYR', method: null }],
      })
    ).toBe(true);
    expect(
      isUsableResult('transactions', {
        items: [{ merchant: 'Shop', amount: 15.5, type: 'expense', date: null, currency: 'MYR', method: null }],
      })
    ).toBe(true);
  });

  it('validates receipt results correctly', () => {
    expect(isUsableResult('receipt', {})).toBe(false);
    expect(
      isUsableResult('receipt', {
        receipt: {
          merchant: 'Store',
          currency: 'MYR',
          items: [],
          total: null,
          subtotal: null,
          tax: null,
          serviceCharge: null,
          discount: null,
        },
      })
    ).toBe(false);
    expect(
      isUsableResult('receipt', {
        receipt: {
          merchant: 'Store',
          currency: 'MYR',
          items: [{ label: 'Item 1', amount: 10, quantity: 1 }],
          total: null,
          subtotal: null,
          tax: null,
          serviceCharge: null,
          discount: null,
        },
      })
    ).toBe(true);
    expect(
      isUsableResult('receipt', {
        receipt: {
          merchant: 'Store',
          currency: 'MYR',
          items: [],
          total: 55.2,
          subtotal: null,
          tax: null,
          serviceCharge: null,
          discount: null,
        },
      })
    ).toBe(true);
  });

  it('validates snapshot results correctly', () => {
    expect(isUsableResult('snapshot', {})).toBe(false);
    expect(isUsableResult('snapshot', { snapshot: { kind: 'unknown' } })).toBe(false);
    expect(
      isUsableResult('snapshot', {
        snapshot: { kind: 'balance', provider: 'Maybank', accountKind: 'asset', amount: null, currency: 'MYR' },
      })
    ).toBe(false);
    expect(
      isUsableResult('snapshot', {
        snapshot: { kind: 'balance', provider: 'Maybank', accountKind: 'asset', amount: 0, currency: 'MYR' },
      })
    ).toBe(true);
    expect(
      isUsableResult('snapshot', {
        snapshot: { kind: 'balance', provider: 'Maybank', accountKind: 'asset', amount: 1500, currency: 'MYR' },
      })
    ).toBe(true);
    expect(
      isUsableResult('snapshot', {
        snapshot: { kind: 'holdings', provider: 'Binance', holdings: [] },
      })
    ).toBe(false);
    expect(
      isUsableResult('snapshot', {
        snapshot: { kind: 'holdings', provider: 'Binance', holdings: [{ ticker: 'BTC', quantity: 0.5 }] },
      })
    ).toBe(true);
  });
});
