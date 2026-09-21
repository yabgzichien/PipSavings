import type { AskPipProviderId } from './keyStore';
import { GeminiProvider } from '../../llm/gemini';
import { GroqProvider } from '../../llm/groq';
import { OpenRouterProvider } from '../../llm/openrouter';
import { LLMError, type LLMProvider } from '../../llm/types';

export const ASK_PIP_LLM_PROVIDERS: Record<AskPipProviderId, LLMProvider> = {
  gemini: GeminiProvider,
  groq: GroqProvider,
  openrouter: OpenRouterProvider,
};

export const ASK_PIP_PROVIDER_OPTIONS: { id: AskPipProviderId; label: string }[] = [
  { id: 'groq', label: 'Groq' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
];

/** Detect the providers the BYOK sheet accepts. */
export function detectAskPipProvider(raw: string): AskPipProviderId | null {
  const key = raw.trim();
  if (key.startsWith('AIza') && key.length > 8) return 'gemini';
  if (key.startsWith('gsk_') && key.length > 8) return 'groq';
  if (key.startsWith('sk-or-') && key.length > 12) return 'openrouter';
  return null;
}

export const ASK_PIP_KEY_TEST_MS = 12_000;

export async function testAskPipKey(
  providerId: AskPipProviderId,
  apiKey: string,
  timeoutMs = ASK_PIP_KEY_TEST_MS,
): Promise<void> {
  const provider = ASK_PIP_LLM_PROVIDERS[providerId];
  const work = provider.test({ apiKey, model: provider.defaultModel });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new LLMError('network', 'Timed out waiting for the provider.'));
    }, timeoutMs);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
