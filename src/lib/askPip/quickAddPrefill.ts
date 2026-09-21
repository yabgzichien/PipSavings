import { parseQuickText, type QuickDraft } from '../quickParse';
import type { QuickAddCategoryOption } from '../../llm/quickAddPrompt';
import type { LLMProvider } from '../../llm/types';
import { guessCategoryByKeyword } from '../categoryKeywords';
import type { Category } from '../types';

export type AskPipQuickAddProvider = Pick<LLMProvider, 'quickAdd' | 'defaultModel'>;

export interface AskPipQuickAddDraft extends QuickDraft {
  accountId: string | null;
  accountQuery: string | null;
}

type AccountOption = { id: string; name: string; archived: boolean };

function extractAccount(text: string, accounts: AccountOption[]): {
  transactionText: string;
  accountId: string | null;
  accountQuery: string | null;
} {
  const match = text.match(/\s+(?:with|from|via|using)\s+([^,;]+)\s*$/i);
  if (!match) return { transactionText: text, accountId: null, accountQuery: null };
  const query = match[1].trim();
  const lower = query.toLowerCase();
  const active = accounts.filter((account) => !account.archived);
  const exact = active.find((account) => account.name.trim().toLowerCase() === lower);
  const partial = exact
    ? []
    : active.filter((account) => account.name.toLowerCase().includes(lower) || lower.includes(account.name.toLowerCase()));
  return {
    transactionText: text.slice(0, match.index).trim(),
    accountId: exact?.id ?? (partial.length === 1 ? partial[0].id : null),
    accountQuery: exact || partial.length === 1 ? null : query,
  };
}

function withCategory(draft: QuickDraft, categories: QuickAddCategoryOption[]): QuickDraft {
  if (draft.categoryId) return draft;
  const full = categories.map((category) => ({
    ...category,
    icon: 'dots',
    hue: 0,
    isDefault: false,
    isHidden: false,
    templateKey: null,
    labelOverride: null,
    iconOverride: null,
    hueOverride: null,
  })) as Category[];
  const categoryId = guessCategoryByKeyword(draft.label, draft.type, full);
  return categoryId ? { ...draft, categoryId, categorySource: 'guess' } : draft;
}

function enrichDraft(
  draft: QuickDraft,
  categories: QuickAddCategoryOption[],
  account: Pick<AskPipQuickAddDraft, 'accountId' | 'accountQuery'>,
): AskPipQuickAddDraft {
  return { ...withCategory(draft, categories), ...account };
}

export async function resolveAskPipQuickAddPrefill(input: {
  text: string;
  activeCurrencies: string[];
  today: string;
  apiKey: string | null;
  provider: AskPipQuickAddProvider | null;
  categories: QuickAddCategoryOption[];
  accounts?: AccountOption[];
}): Promise<AskPipQuickAddDraft | null> {
  const account = extractAccount(input.text, input.accounts ?? []);
  const local = parseQuickText(account.transactionText, {
    activeCurrencies: input.activeCurrencies,
    today: input.today,
  });
  if (local.confident && local.drafts[0]) {
    return enrichDraft(local.drafts[0], input.categories, account);
  }
  if (input.apiKey && input.provider?.quickAdd) {
    try {
      const drafts = await input.provider.quickAdd({
        apiKey: input.apiKey,
        model: input.provider.defaultModel,
        text: account.transactionText,
        categories: input.categories,
        today: input.today,
        activeCurrencies: input.activeCurrencies,
      });
      if (drafts[0]) return enrichDraft(drafts[0], input.categories, account);
    } catch {
      // Confirm from the local parse rather than blocking the Add button.
    }
  }
  return local.drafts[0] ? enrichDraft(local.drafts[0], input.categories, account) : null;
}
