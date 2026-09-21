// src/llm/fallback.ts
// Primary/secondary/tertiary LLM routing. Gemini is the primary for every task; if a Gemini call fails
// (no key, auth, rate limit, network, or an unreadable reply), the same call is retried on Groq,
// and finally on OpenRouter. This is the single entry point every screen uses, so provider selection +
// fallback live in one place instead of being re-decided per call site.
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { OpenRouterProvider } from './openrouter';
import { LLMError, type LLMProvider } from './types';
import type {
  CategoryGuessInput,
  CoachInput,
  DocExtractInput,
  ExtractInput,
  QuickAddInput,
} from './types';
import { loadSettings, type LLMSettings } from '../settings/settingsStore';
import { defaultAskPipKeyStore, type AskPipProviderId } from '../lib/askPip/keyStore';

/** The methods a screen can request. */
export type Capability =
  | 'extract'
  | 'extractDocument'
  | 'extractHoldings'
  | 'extractBalance'
  | 'extractSnapshot'
  | 'extractReceipt'
  | 'guessCategories'
  | 'quickAdd'
  | 'coach';

interface Leg {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

/** Method inputs, minus the per-provider credentials the wrapper fills in itself. */
type Payload<T> = Omit<T, 'apiKey' | 'model'>;

function splitKeys(rawKey: string): string[] {
  return (rawKey || '')
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export class FallbackProvider {
  private readonly legs: Leg[];

  constructor(settings: LLMSettings) {
    // Order is the fallback order: Gemini first, Groq second, OpenRouter third.
    // Supports comma-separated keys per provider for seamless backup key failover.
    const geminiKeys = splitKeys(settings.geminiKey);
    const groqKeys = splitKeys(settings.groqKey);
    const openrouterKeys = splitKeys(settings.openrouterKey);

    this.legs = [
      ...(geminiKeys.length > 0
        ? geminiKeys.map((k) => ({ provider: GeminiProvider, apiKey: k, model: settings.geminiModel }))
        : [{ provider: GeminiProvider, apiKey: '', model: settings.geminiModel }]),
      ...(groqKeys.length > 0
        ? groqKeys.map((k) => ({ provider: GroqProvider, apiKey: k, model: settings.groqModel }))
        : [{ provider: GroqProvider, apiKey: '', model: settings.groqModel }]),
      ...(openrouterKeys.length > 0
        ? openrouterKeys.map((k) => ({ provider: OpenRouterProvider, apiKey: k, model: settings.openrouterModel }))
        : [{ provider: OpenRouterProvider, apiKey: '', model: settings.openrouterModel }]),
    ];
  }

  /** Legs that have a key AND implement the capability, in fallback order. */
  private legsFor(cap: Capability): Leg[] {
    return this.legs.filter((l) => !!l.apiKey && typeof (l.provider as any)[cap] === 'function');
  }

  /** Whether any provider can serve this capability (drives "feature unavailable" UI). */
  can(cap: Capability): boolean {
    return this.legsFor(cap).length > 0;
  }

  private async run<R>(cap: Capability, payload: object): Promise<R> {
    const legs = this.legsFor(cap);
    if (legs.length === 0) {
      throw new LLMError('no_key', "This feature isn't available right now.");
    }
    let lastError: unknown = new LLMError('unknown', 'No provider attempted.');
    for (const leg of legs) {
      try {
        return await (leg.provider as any)[cap]({ apiKey: leg.apiKey, model: leg.model, ...payload });
      } catch (e) {
        // Any failure from the primary falls through to the secondary. The models differ, so
        // even a bad_response (unreadable reply) is worth retrying on the other provider.
        lastError = e;
      }
    }
    throw lastError;
  }

  extract(input: Payload<ExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extract']>>>>('extract', input);
  }
  extractDocument(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractDocument']>>>>('extractDocument', input);
  }
  extractHoldings(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractHoldings']>>>>('extractHoldings', input);
  }
  extractBalance(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractBalance']>>>>('extractBalance', input);
  }
  extractSnapshot(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractSnapshot']>>>>('extractSnapshot', input);
  }
  extractReceipt(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractReceipt']>>>>('extractReceipt', input);
  }
  guessCategories(input: Payload<CategoryGuessInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['guessCategories']>>>>('guessCategories', input);
  }
  quickAdd(input: Payload<QuickAddInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['quickAdd']>>>>('quickAdd', input);
  }
  coach(input: Payload<CoachInput>) {
    return this.run<string>('coach', input);
  }
}

/** Build the fallback provider from the user's active key when present, else env keys. */
export function llmSettingsForActiveKey(
  active: { providerId: AskPipProviderId; apiKey: string } | null,
  env: LLMSettings,
): LLMSettings {
  if (!active?.apiKey) return env;
  return {
    geminiKey: active.providerId === 'gemini' ? active.apiKey : '',
    geminiModel: env.geminiModel,
    groqKey: active.providerId === 'groq' ? active.apiKey : '',
    groqModel: env.groqModel,
    openrouterKey: active.providerId === 'openrouter' ? active.apiKey : '',
    openrouterModel: env.openrouterModel,
  };
}

export async function getLLM(): Promise<FallbackProvider> {
  const env = await loadSettings();
  const active = await defaultAskPipKeyStore().getActive();
  return new FallbackProvider(llmSettingsForActiveKey(active, env));
}
