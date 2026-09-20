import { createAskPipKeyStore, type AskPipKeyIo } from '../src/lib/askPip/keyStore';

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
