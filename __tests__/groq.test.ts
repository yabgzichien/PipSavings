import { GroqProvider } from '../src/llm/groq';
import { LLMError } from '../src/llm/types';

function mockFetchOnce(opts: {
  status?: number;
  ok?: boolean;
  json?: unknown;
  reject?: boolean;
}) {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const impl = opts.reject
    ? () => Promise.reject(new Error('offline'))
    : () =>
        Promise.resolve({
          status,
          ok,
          json: async () => opts.json,
          text: async () => JSON.stringify(opts.json ?? ''),
        });
  (global as any).fetch = jest.fn(impl);
}

const input = {
  apiKey: 'gsk_test',
  model: 'qwen/qwen3.6-27b',
  imageBase64: 'AAAA',
  mimeType: 'image/png',
};

describe('GroqProvider.extract', () => {
  it('parses a well-formed chat completion', async () => {
    mockFetchOnce({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                transactions: [{ merchant: 'Tealive', amount: 9.5, direction: 'out' }],
              }),
            },
          },
        ],
      },
    });
    const rows = await GroqProvider.extract(input);
    const body = JSON.parse(((global as any).fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.max_completion_tokens).toBe(2048);
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe('Tealive');
    expect(rows[0].type).toBe('expense');
  });

  it('maps HTTP 401 to an auth error', async () => {
    mockFetchOnce({ status: 401, json: {} });
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'auth' });
  });

  it('maps HTTP 429 to a rate_limit error', async () => {
    mockFetchOnce({ status: 429, json: {} });
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'rate_limit' });
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a smaller reply when the first request is larger than an unused minute', async () => {
    let calls = 0;
    (global as any).fetch = jest.fn(async (_url: string, init: { body: string }) => {
      calls += 1;
      const body = JSON.parse(init.body);
      if (calls === 1) {
        expect(body.max_completion_tokens).toBe(2048);
        return {
          status: 429,
          ok: false,
          json: async () => ({}),
          text: async () => 'Limit 8000, Used 0, Requested 16000',
        };
      }
      expect(body.max_completion_tokens).toBe(1024);
      return {
        status: 200,
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ transactions: [{ merchant: 'Tealive', amount: 9.5, direction: 'out' }] }) } }],
        }),
        text: async () => '',
      };
    });
    const rows = await GroqProvider.extract(input);
    expect(rows[0].merchant).toBe('Tealive');
    expect(calls).toBe(2);
  });

  it('does not retry when the key has actually used its allowance', async () => {
    (global as any).fetch = jest.fn(async () => ({
      status: 429,
      ok: false,
      json: async () => ({}),
      text: async () => 'Limit 8000, Used 8000, Requested 500',
    }));
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'rate_limit' });
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('throws no_key when the key is empty', async () => {
    mockFetchOnce({ json: {} });
    await expect(GroqProvider.extract({ ...input, apiKey: '' })).rejects.toBeInstanceOf(LLMError);
    await expect(GroqProvider.extract({ ...input, apiKey: '' })).rejects.toMatchObject({
      code: 'no_key',
    });
  });

  it('maps a thrown fetch to a network error', async () => {
    mockFetchOnce({ reject: true });
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'network' });
  });

  it('maps an unreadable model reply to bad_response', async () => {
    mockFetchOnce({
      json: { choices: [{ message: { content: 'the model is down' } }] },
    });
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'bad_response' });
  });
});

describe('GroqProvider.quickAdd', () => {
  const cats = [{ id: 'food', label: 'Food', kind: 'expense' as const }];
  const args = { apiKey: 'gsk_test', model: 'qwen/qwen3.6-27b', text: 'lunch 9.2', categories: cats, today: '2026-08-28', activeCurrencies: ['MYR'] };

  it('parses a well-formed reply into drafts', async () => {
    mockFetchOnce({
      json: {
        choices: [{ message: { content: JSON.stringify({ items: [{ label: 'lunch', amount: 9.2, type: 'expense', categoryId: 'food' }] }) } }],
      },
    });
    const out = await GroqProvider.quickAdd!(args);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: 'lunch', amount: 9.2, categoryId: 'food' });
  });

  it('raises bad_response when the reply is not JSON', async () => {
    mockFetchOnce({ json: { choices: [{ message: { content: 'sorry, what?' } }] } });
    await expect(GroqProvider.quickAdd!(args)).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('raises bad_response when the message content is missing', async () => {
    mockFetchOnce({ json: { choices: [{}] } });
    await expect(GroqProvider.quickAdd!(args)).rejects.toBeInstanceOf(LLMError);
  });
});

