import { createAskPipKeyStore, defaultAskPipKeyStore, type AskPipKeyIo } from '../src/lib/askPip/keyStore';

function memoryIo(): AskPipKeyIo {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => {
      map.set(k, v);
    },
    del: async (k) => {
      map.delete(k);
    },
  };
}

describe('createAskPipKeyStore', () => {
  it('persists and clears api key and provider', async () => {
    const store = createAskPipKeyStore(memoryIo());

    await store.setApiKey('gsk_secret');
    expect(await store.getApiKey()).toBe('gsk_secret');

    await store.setProvider('groq');
    expect(await store.getProvider()).toBe('groq');

    await store.clear();
    expect(await store.getApiKey()).toBeNull();
    expect(await store.getProvider()).toBeNull();
  });
});

describe('defaultAskPipKeyStore', () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => {
          memory.set(k, v);
        },
        removeItem: (k: string) => {
          memory.delete(k);
        },
      },
    });
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('uses localStorage when it is available', async () => {
    const store = defaultAskPipKeyStore();
    await store.setApiKey('web_key');
    await store.setProvider('groq');
    expect(await store.getApiKey()).toBe('web_key');
    expect(await store.getProvider()).toBe('groq');
    expect(memory.get('ask_pip_api_key')).toBe('web_key');
  });
});
