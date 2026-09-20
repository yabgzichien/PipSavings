import * as SecureStore from 'expo-secure-store';

export type AskPipProviderId = 'gemini' | 'groq' | 'openrouter';

const PROVIDER_KEY = 'ask_pip_provider';
const API_KEY_KEY = 'ask_pip_api_key';

export interface AskPipKeyIo {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
  del(k: string): Promise<void>;
}

function parseProvider(raw: string | null): AskPipProviderId | null {
  if (raw === 'gemini' || raw === 'groq' || raw === 'openrouter') return raw;
  return null;
}

export function createAskPipKeyStore(io: AskPipKeyIo) {
  return {
    async getProvider(): Promise<AskPipProviderId | null> {
      return parseProvider(await io.get(PROVIDER_KEY));
    },
    async setProvider(id: AskPipProviderId): Promise<void> {
      await io.set(PROVIDER_KEY, id);
    },
    async getApiKey(): Promise<string | null> {
      return io.get(API_KEY_KEY);
    },
    async setApiKey(key: string): Promise<void> {
      await io.set(API_KEY_KEY, key);
    },
    async clear(): Promise<void> {
      await io.del(PROVIDER_KEY);
      await io.del(API_KEY_KEY);
    },
  };
}

function webStorageIo(): AskPipKeyIo {
  return {
    async get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    async set(k, v) {
      localStorage.setItem(k, v);
    },
    async del(k) {
      localStorage.removeItem(k);
    },
  };
}

function secureStoreIo(): AskPipKeyIo {
  return {
    get: (k) => SecureStore.getItemAsync(k),
    set: (k, v) => SecureStore.setItemAsync(k, v),
    del: (k) => SecureStore.deleteItemAsync(k),
  };
}

export function defaultAskPipKeyStore() {
  // expo-secure-store has no web implementation; awaiting it from the browser
  // never settles, which is why Save looked frozen on web.
  const io: AskPipKeyIo =
    typeof localStorage !== 'undefined' ? webStorageIo() : secureStoreIo();
  return createAskPipKeyStore(io);
}
