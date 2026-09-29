import { GeminiProvider } from '../llm/gemini';
import { GroqProvider } from '../llm/groq';
import { OpenRouterProvider } from '../llm/openrouter';
import { Platform } from 'react-native';
import { APP_LLM_ENV } from './llmEnv';

// Providers are fixed by configuration, not editable in-app. Gemini handles
// primary tasks & document import; Groq and OpenRouter provide fallback tiers.
// Native keys come from .env.local. The web-specific llmEnv module exports no
// credentials so web bundles remain BYOK-only; models stay pinned below.
export const GROQ_DEFAULT_MODEL = GroqProvider.defaultModel;
export const GEMINI_DEFAULT_MODEL = GeminiProvider.defaultModel;
export const OPENROUTER_DEFAULT_MODEL = OpenRouterProvider.defaultModel;

export type ProviderRole = 'general' | 'docs';

export interface LLMSettings {
  groqKey: string;
  groqModel: string;
  geminiKey: string;
  geminiModel: string;
  openrouterKey: string;
  openrouterModel: string;
}

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
}

/** Which provider/key/model a task should use: general → Groq, documents → Gemini. */
export function configFor(s: LLMSettings, role: ProviderRole): ProviderConfig {
  return role === 'docs'
    ? { provider: 'gemini', apiKey: s.geminiKey, model: s.geminiModel }
    : { provider: 'groq', apiKey: s.groqKey, model: s.groqModel };
}

/** The fixed provider settings (keys from env, models pinned). */
export async function loadSettings(): Promise<LLMSettings> {
  const allowAppKeys = Platform.OS !== 'web';
  return {
    groqKey: allowAppKeys ? APP_LLM_ENV.groqKey : '',
    groqModel: APP_LLM_ENV.groqModel || GROQ_DEFAULT_MODEL,
    geminiKey: allowAppKeys ? APP_LLM_ENV.geminiKey : '',
    geminiModel: APP_LLM_ENV.geminiModel || GEMINI_DEFAULT_MODEL,
    openrouterKey: allowAppKeys ? APP_LLM_ENV.openrouterKey : '',
    openrouterModel: APP_LLM_ENV.openrouterModel || OPENROUTER_DEFAULT_MODEL,
  };
}
