import type { AskPipProviderId } from '../lib/askPip/keyStore';
import type { AskPipFrame } from '../lib/askPip/session';
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { OpenRouterProvider } from './openrouter';
import { ASK_PIP_SYSTEM_PROMPT, buildAskPipUserPrompt } from './askPipPrompt';
import type { LLMProvider } from './types';

export async function runAskPipModel(input: {
  providerId: AskPipProviderId;
  apiKey: string;
  utterance: string;
  tripNames: string[];
  personNames: string[];
  categoryLabels: string[];
  current: AskPipFrame | null;
}): Promise<unknown> {
  const providers: Record<AskPipProviderId, LLMProvider> = {
    gemini: GeminiProvider,
    groq: GroqProvider,
    openrouter: OpenRouterProvider,
  };
  const provider = providers[input.providerId];
  return provider.askPip!({
    apiKey: input.apiKey,
    model: provider.defaultModel,
    system: ASK_PIP_SYSTEM_PROMPT,
    user: buildAskPipUserPrompt(input),
  });
}
