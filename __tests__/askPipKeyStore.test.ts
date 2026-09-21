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
    expect(memory.get('ask_pip_keys_v2')).toContain('web_key');
  });
});

describe('multi-key BYOK store', () => {
  it('stores several keys and lets the user pick the active one', async () => {
    const store = createAskPipKeyStore(memoryIo());
    const groq = await store.add('groq', 'gsk_one_aaaaaaaa');
    const gemini = await store.add('gemini', 'AIzaSyTwo_bbbbbbbb');
    expect(await store.list()).toHaveLength(2);
    expect((await store.getActive())?.id).toBe(gemini.id);
    await store.setActive(groq.id);
    expect(await store.getApiKey()).toBe('gsk_one_aaaaaaaa');
    expect(await store.getProvider()).toBe('groq');
  });

  it('migrates the old single-key slots into the list', async () => {
    const io = memoryIo();
    await io.set('ask_pip_api_key', 'gsk_legacy');
    await io.set('ask_pip_provider', 'groq');
    const store = createAskPipKeyStore(io);
    const active = await store.getActive();
    expect(active?.apiKey).toBe('gsk_legacy');
    expect(active?.providerId).toBe('groq');
    expect(await io.get('ask_pip_api_key')).toBeNull();
  });

  it('selects another key when the active one is removed', async () => {
    const store = createAskPipKeyStore(memoryIo());
    const first = await store.add('groq', 'gsk_aaaaaaa1');
    const second = await store.add('gemini', 'AIzaaaaaaaa2');
    await store.setActive(second.id);
    await store.remove(second.id);
    expect((await store.getActive())?.id).toBe(first.id);
  });

  it('activates an existing row instead of duplicating the same secret', async () => {
    const store = createAskPipKeyStore(memoryIo());
    const first = await store.add('groq', 'gsk_same_key_xx');
    await store.add('gemini', 'AIza_other_yy');
    const again = await store.add('groq', 'gsk_same_key_xx');
    expect(again.id).toBe(first.id);
    expect(await store.list()).toHaveLength(2);
    expect((await store.getActive())?.id).toBe(first.id);
  });
});
