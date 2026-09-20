import type { AskPipEntryKind } from './catalog';
import type { AskPipProviderId } from './keyStore';
import { GeminiProvider } from '../../llm/gemini';
import { GroqProvider } from '../../llm/groq';
import { OpenRouterProvider } from '../../llm/openrouter';
import type { DocPart, LLMProvider } from '../../llm/types';

const PROVIDERS: Record<AskPipProviderId, LLMProvider> = {
  gemini: GeminiProvider,
  groq: GroqProvider,
  openrouter: OpenRouterProvider,
};

export type ChatVisionProvider = Pick<
  LLMProvider,
  'extract' | 'extractReceipt' | 'extractBalance' | 'extractHoldings' | 'defaultModel'
>;

export type RunChatVisionInput = {
  kind: AskPipEntryKind;
  apiKey: string;
  parts: DocPart[];
  providerId?: AskPipProviderId;
  provider?: ChatVisionProvider;
};

export function kindFromUtterance(utterance: string): AskPipEntryKind | null {
  const s = utterance.toLowerCase();
  if (s.includes('receipt') || utterance.includes('小票')) return 'scan_receipt';
  if (s.includes('statement') || utterance.includes('明细')) return 'scan_statement';
  if (s.includes('balance') || utterance.includes('余额')) return 'scan_balance';
  if (s.includes('holdings') || utterance.includes('持仓')) return 'scan_holdings';
  return null;
}

function resolveProvider(input: RunChatVisionInput): ChatVisionProvider {
  if (input.provider) return input.provider;
  if (input.providerId) return PROVIDERS[input.providerId];
  throw new Error('runChatVision requires provider or providerId');
}

function statementExtractInput(apiKey: string, model: string, parts: DocPart[]) {
  const binary = parts.find((part): part is Extract<DocPart, { kind: 'binary' }> => part.kind === 'binary');
  return {
    apiKey,
    model,
    imageBase64: binary?.base64 ?? '',
    mimeType: binary?.mimeType ?? 'image/jpeg',
  };
}

export async function runChatVision(input: RunChatVisionInput) {
  const provider = resolveProvider(input);
  const model = provider.defaultModel ?? '';
  const { apiKey, parts, kind } = input;
  switch (kind) {
    case 'scan_receipt':
      return provider.extractReceipt?.({ apiKey, model, parts });
    case 'scan_statement':
      return provider.extract?.(statementExtractInput(apiKey, model, parts));
    case 'scan_balance':
      return provider.extractBalance?.({ apiKey, model, parts });
    case 'scan_holdings':
      return provider.extractHoldings?.({ apiKey, model, parts });
    default:
      return undefined;
  }
}
