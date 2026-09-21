import * as SecureStore from 'expo-secure-store';

export type AskPipProviderId = 'gemini' | 'groq' | 'openrouter';

const PROVIDER_KEY = 'ask_pip_provider';
const API_KEY_KEY = 'ask_pip_api_key';
const BUNDLE_KEY = 'ask_pip_keys_v2';

export interface AskPipKeyIo {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
  del(k: string): Promise<void>;
}

export interface AskPipSavedKey {
  id: string;
  providerId: AskPipProviderId;
  apiKey: string;
  createdAt: string;
}

export interface AskPipKeyState {
  keys: AskPipSavedKey[];
  activeId: string | null;
}

function parseProvider(raw: string | null): AskPipProviderId | null {
  if (raw === 'gemini' || raw === 'groq' || raw === 'openrouter') return raw;
  return null;
}

function emptyState(): AskPipKeyState {
  return { keys: [], activeId: null };
}

function newId(): string {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseState(raw: string | null): AskPipKeyState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AskPipKeyState>;
    if (!parsed || !Array.isArray(parsed.keys)) return null;
    const keys = parsed.keys.filter(
      (row): row is AskPipSavedKey =>
        !!row &&
        typeof row.id === 'string' &&
        typeof row.apiKey === 'string' &&
        parseProvider(row.providerId) !== null,
    );
    const activeId =
      typeof parsed.activeId === 'string' && keys.some((row) => row.id === parsed.activeId)
        ? parsed.activeId
        : keys[0]?.id ?? null;
    return { keys, activeId };
  } catch {
    return null;
  }
}

function activeOf(state: AskPipKeyState): AskPipSavedKey | null {
  return state.keys.find((row) => row.id === state.activeId) ?? state.keys[0] ?? null;
}

export function maskAskPipKey(apiKey: string): string {
  const tail = apiKey.slice(-4);
  return `••••${tail}`;
}

export function createAskPipKeyStore(io: AskPipKeyIo) {
  async function persist(state: AskPipKeyState): Promise<void> {
    await io.set(BUNDLE_KEY, JSON.stringify(state));
  }

  async function load(): Promise<AskPipKeyState> {
    const existing = parseState(await io.get(BUNDLE_KEY));
    if (existing) return existing;
    const oldKey = await io.get(API_KEY_KEY);
    const oldProvider = parseProvider(await io.get(PROVIDER_KEY));
    if (!oldKey) return emptyState();
    const row: AskPipSavedKey = {
      id: newId(),
      providerId: oldProvider ?? 'groq',
      apiKey: oldKey,
      createdAt: new Date().toISOString(),
    };
    const state = { keys: [row], activeId: row.id };
    await persist(state);
    await io.del(API_KEY_KEY);
    await io.del(PROVIDER_KEY);
    return state;
  }

  return {
    async list(): Promise<AskPipSavedKey[]> {
      return (await load()).keys;
    },
    async getActive(): Promise<AskPipSavedKey | null> {
      return activeOf(await load());
    },
    async add(providerId: AskPipProviderId, apiKey: string): Promise<AskPipSavedKey> {
      const state = await load();
      const existing = state.keys.find((row) => row.apiKey === apiKey);
      if (existing) {
        await persist({
          keys: state.keys.map((row) =>
            row.id === existing.id ? { ...row, providerId } : row,
          ),
          activeId: existing.id,
        });
        return { ...existing, providerId };
      }
      const row: AskPipSavedKey = {
        id: newId(),
        providerId,
        apiKey,
        createdAt: new Date().toISOString(),
      };
      await persist({ keys: [...state.keys, row], activeId: row.id });
      return row;
    },
    async setActive(id: string): Promise<void> {
      const state = await load();
      if (!state.keys.some((row) => row.id === id)) return;
      await persist({ ...state, activeId: id });
    },
    async remove(id: string): Promise<void> {
      const state = await load();
      const keys = state.keys.filter((row) => row.id !== id);
      const activeId = state.activeId === id ? keys[0]?.id ?? null : state.activeId;
      await persist({ keys, activeId });
    },
    async getProvider(): Promise<AskPipProviderId | null> {
      return activeOf(await load())?.providerId ?? null;
    },
    async setProvider(id: AskPipProviderId): Promise<void> {
      const state = await load();
      const active = activeOf(state);
      if (active) {
        await persist({
          ...state,
          keys: state.keys.map((row) => (row.id === active.id ? { ...row, providerId: id } : row)),
        });
        return;
      }
      const row: AskPipSavedKey = {
        id: newId(),
        providerId: id,
        apiKey: '',
        createdAt: new Date().toISOString(),
      };
      await persist({ keys: [row], activeId: row.id });
    },
    async getApiKey(): Promise<string | null> {
      return activeOf(await load())?.apiKey ?? null;
    },
    async setApiKey(key: string): Promise<void> {
      const state = await load();
      const active = activeOf(state);
      if (active) {
        await persist({
          ...state,
          keys: state.keys.map((row) => (row.id === active.id ? { ...row, apiKey: key } : row)),
        });
        return;
      }
      const row: AskPipSavedKey = {
        id: newId(),
        providerId: 'groq',
        apiKey: key,
        createdAt: new Date().toISOString(),
      };
      await persist({ keys: [row], activeId: row.id });
    },
    async clear(): Promise<void> {
      await persist(emptyState());
      await io.del(API_KEY_KEY);
      await io.del(PROVIDER_KEY);
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
