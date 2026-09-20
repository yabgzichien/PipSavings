import type { AskPipProviderId } from './keyStore';
import { GeminiProvider } from '../../llm/gemini';
import { GroqProvider } from '../../llm/groq';
import { OpenRouterProvider } from '../../llm/openrouter';
import type { LLMProvider } from '../../llm/types';

export const ASK_PIP_LLM_PROVIDERS: Record<AskPipProviderId, LLMProvider> = {
  gemini: GeminiProvider,
  groq: GroqProvider,
  openrouter: OpenRouterProvider,
};

export const ASK_PIP_PROVIDER_OPTIONS: { id: AskPipProviderId; label: string }[] = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'groq', label: 'Groq' },
  { id: 'openrouter', label: 'OpenRouter' },
];

export async function testAskPipKey(providerId: AskPipProviderId, apiKey: string): Promise<void> {
  const provider = ASK_PIP_LLM_PROVIDERS[providerId];
  await provider.test({ apiKey, model: provider.defaultModel });
}
