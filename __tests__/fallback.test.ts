import { FallbackProvider, llmSettingsForActiveKey } from '../src/llm/fallback';
import type { LLMSettings } from '../src/settings/settingsStore';

// Route a mocked fetch to the right provider by URL, so we can drive Groq, Gemini, and OpenRouter
// independently. Each side returns a Response-like object shaped like the one the real
// providers read (status/ok/json/text).
function routeFetch(handlers: {
  groq?: () => { status?: number; ok?: boolean; json: unknown };
  gemini?: () => { status?: number; ok?: boolean; json: unknown };
  openrouter?: () => { status?: number; ok?: boolean; json: unknown };
}) {
  (global as any).fetch = jest.fn((url: string) => {
    let h: { status?: number; ok?: boolean; json: unknown } = { status: 200, ok: true, json: {} };
    if (String(url).includes('openrouter.ai')) {
      h = handlers.openrouter ? handlers.openrouter() : h;
    } else if (String(url).includes('api.groq.com')) {
      h = handlers.groq ? handlers.groq() : h;
    } else {
      h = handlers.gemini ? handlers.gemini() : h;
    }
    const status = h.status ?? 200;
    return Promise.resolve({
      status,
      ok: h.ok ?? (status >= 200 && status < 300),
      json: async () => h.json,
      text: async () => JSON.stringify(h.json ?? ''),
    });
  });
}

const groqReply = (text: string) => ({ choices: [{ message: { content: text } }] });
const geminiReply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const openrouterReply = (text: string) => ({ choices: [{ message: { content: text } }] });

const allKeys: LLMSettings = {
  geminiKey: 'AIza_test',
  geminiModel: 'gemini-3.1-flash-lite',
  groqKey: 'gsk_test',
  groqModel: 'qwen/qwen3.6-27b',
  openrouterKey: 'sk-or-test',
  openrouterModel: 'openrouter/free',
};

describe('FallbackProvider — 3-tier hierarchy (Gemini -> Groq -> OpenRouter)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses Gemini (Rank 1 primary) when it succeeds, and never calls Groq or OpenRouter', async () => {
    routeFetch({
      gemini: () => ({ json: geminiReply('from gemini') }),
      groq: () => ({ json: groqReply('from groq') }),
      openrouter: () => ({ json: openrouterReply('from openrouter') }),
    });
    const llm = new FallbackProvider(allKeys);
    const text = await llm.coach({ system: 's', prompt: 'p' });
    expect(text).toBe('from gemini');
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(true);
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(false);
    expect(calls.some((u: string) => u.includes('openrouter.ai'))).toBe(false);
  });

  it('falls back to Groq (Rank 2) when Gemini fails', async () => {
    routeFetch({
      gemini: () => ({ status: 500, json: { error: 'boom' } }),
      groq: () => ({ json: groqReply('from groq') }),
      openrouter: () => ({ json: openrouterReply('from openrouter') }),
    });
    const llm = new FallbackProvider(allKeys);
    const text = await llm.coach({ system: 's', prompt: 'p' });
    expect(text).toBe('from groq');
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(true);
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(true);
    expect(calls.some((u: string) => u.includes('openrouter.ai'))).toBe(false);
  });

  it('falls back to OpenRouter (Rank 3) when both Gemini and Groq fail', async () => {
    routeFetch({
      gemini: () => ({ status: 500, json: { error: 'gemini down' } }),
      groq: () => ({ status: 500, json: { error: 'groq down' } }),
      openrouter: () => ({ json: openrouterReply('from openrouter') }),
    });
    const llm = new FallbackProvider(allKeys);
    const text = await llm.coach({ system: 's', prompt: 'p' });
    expect(text).toBe('from openrouter');
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(true);
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(true);
    expect(calls.some((u: string) => u.includes('openrouter.ai'))).toBe(true);
  });

  it('routes a PDF straight to Gemini without a Groq/OpenRouter HTTP call', async () => {
    routeFetch({
      gemini: () => ({ json: geminiReply('{"transactions":[{"merchant":"X","amount":5,"direction":"out"}]}') }),
      groq: () => ({ json: groqReply('{"transactions":[]}') }),
      openrouter: () => ({ json: openrouterReply('{"transactions":[]}') }),
    });
    const llm = new FallbackProvider(allKeys);
    const rows = await llm.extractDocument({ parts: [{ kind: 'binary', base64: 'AAAA', mimeType: 'application/pdf' }] });
    expect(rows).toHaveLength(1);
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(true);
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(false);
    expect(calls.some((u: string) => u.includes('openrouter.ai'))).toBe(false);
  });

  it('skips keyless providers and serves from the first available provider with a key', async () => {
    routeFetch({
      openrouter: () => ({ json: openrouterReply('from openrouter') }),
    });
    const openrouterOnly: LLMSettings = {
      ...allKeys,
      geminiKey: '',
      groqKey: '',
    };
    const llm = new FallbackProvider(openrouterOnly);
    const text = await llm.coach({ system: 's', prompt: 'p' });
    expect(text).toBe('from openrouter');
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(false);
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(false);
    expect(calls.some((u: string) => u.includes('openrouter.ai'))).toBe(true);
  });

  it('can() reflects whether any provider has a key + implements the capability', () => {
    expect(new FallbackProvider(allKeys).can('extractSnapshot')).toBe(true);
    const noKeys: LLMSettings = { ...allKeys, geminiKey: '', groqKey: '', openrouterKey: '' };
    expect(new FallbackProvider(noKeys).can('coach')).toBe(false);
  });

  it('falls back across comma-separated keys for the same provider', async () => {
    let openrouterAttempts = 0;
    (global as any).fetch = jest.fn((_url: string, init?: RequestInit) => {
      const authHeader = (init?.headers as any)?.Authorization || '';
      if (authHeader.includes('sk-or-key1')) {
        openrouterAttempts++;
        return Promise.resolve({
          status: 429,
          ok: false,
          json: async () => ({ error: 'rate limit' }),
          text: async () => 'rate limit',
        });
      }
      if (authHeader.includes('sk-or-key2')) {
        openrouterAttempts++;
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => openrouterReply('from openrouter backup key'),
          text: async () => JSON.stringify(openrouterReply('from openrouter backup key')),
        });
      }
      return Promise.resolve({
        status: 500,
        ok: false,
        json: async () => ({ error: 'primary down' }),
        text: async () => 'down',
      });
    });

    const multiKeySettings: LLMSettings = {
      geminiKey: '',
      geminiModel: 'gemini-3.1-flash-lite',
      groqKey: '',
      groqModel: 'qwen/qwen3.6-27b',
      openrouterKey: 'sk-or-key1, sk-or-key2',
      openrouterModel: 'openrouter/free',
    };
    const llm = new FallbackProvider(multiKeySettings);
    const text = await llm.coach({ system: 's', prompt: 'p' });
    expect(text).toBe('from openrouter backup key');
    expect(openrouterAttempts).toBe(2);
  });

  it('rejects with the last error when every provider fails', async () => {
    routeFetch({
      gemini: () => ({ status: 500, json: {} }),
      groq: () => ({ status: 500, json: {} }),
      openrouter: () => ({ status: 500, json: {} }),
    });
    const llm = new FallbackProvider(allKeys);
    await expect(llm.coach({ system: 's', prompt: 'p' })).rejects.toBeTruthy();
  });
});

describe('FallbackProvider.quickAdd', () => {
  afterEach(() => jest.restoreAllMocks());

  const cats = [{ id: 'food', label: 'Food', kind: 'expense' as const }];
  const payload = { text: 'lunch 9.2', categories: cats, today: '2026-08-28', activeCurrencies: ['MYR'] };
  const items = JSON.stringify({ items: [{ label: 'lunch', amount: 9.2, type: 'expense', categoryId: 'food' }] });

  it('reports the capability as unavailable with no keys', () => {
    const llm = new FallbackProvider({ ...allKeys, geminiKey: '', groqKey: '', openrouterKey: '' });
    expect(llm.can('quickAdd')).toBe(false);
  });

  it('skips Gemini, which does not implement quickAdd, and uses Groq', async () => {
    routeFetch({ groq: () => ({ json: groqReply(items) }) });
    const out = await new FallbackProvider(allKeys).quickAdd(payload);
    expect(out[0].label).toBe('lunch');
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(false);
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(true);
  });

  it('falls back to OpenRouter when Groq fails', async () => {
    routeFetch({
      groq: () => ({ status: 500, json: { error: 'boom' } }),
      openrouter: () => ({ json: openrouterReply(items) }),
    });
    const out = await new FallbackProvider(allKeys).quickAdd(payload);
    expect(out[0].amount).toBe(9.2);
  });
});

describe('llmSettingsForActiveKey', () => {
  it('keeps env keys when the user has not saved one', () => {
    expect(llmSettingsForActiveKey(null, allKeys)).toEqual(allKeys);
  });

  it('uses only the active Groq key and blanks the founder keys', () => {
    const next = llmSettingsForActiveKey({ providerId: 'groq', apiKey: 'gsk_user' }, allKeys);
    expect(next.groqKey).toBe('gsk_user');
    expect(next.geminiKey).toBe('');
    expect(next.openrouterKey).toBe('');
    expect(next.groqModel).toBe(allKeys.groqModel);
  });
});


