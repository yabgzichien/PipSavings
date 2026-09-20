import { parseQuickText, type QuickDraft } from '../quickParse';
import type { QuickAddCategoryOption } from '../../llm/quickAddPrompt';
import type { LLMProvider } from '../../llm/types';

export type AskPipQuickAddProvider = Pick<LLMProvider, 'quickAdd' | 'defaultModel'>;

export async function resolveAskPipQuickAddPrefill(input: {
  text: string;
  activeCurrencies: string[];
  today: string;
  apiKey: string | null;
  provider: AskPipQuickAddProvider | null;
  categories: QuickAddCategoryOption[];
}): Promise<QuickDraft | null> {
  const local = parseQuickText(input.text, {
    activeCurrencies: input.activeCurrencies,
    today: input.today,
  });
  if (local.confident && local.drafts[0]) {
    return local.drafts[0];
  }
  if (input.apiKey && input.provider?.quickAdd) {
    try {
      const drafts = await input.provider.quickAdd({
        apiKey: input.apiKey,
        model: input.provider.defaultModel,
        text: input.text,
        categories: input.categories,
        today: input.today,
        activeCurrencies: input.activeCurrencies,
      });
      if (drafts[0]) return drafts[0];
    } catch {
      // Confirm from the local parse rather than blocking the Add button.
    }
  }
  return local.drafts[0] ?? null;
}
