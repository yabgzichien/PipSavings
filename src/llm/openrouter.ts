// src/llm/openrouter.ts
import { parseExtraction, ExtractionParseError } from '../lib/parseExtraction';
import { parseBalance } from '../lib/parseBalance';
import { parseReceipt, type ScannedReceipt } from '../lib/parseReceipt';
import { parseSnapshot, type ScannedSnapshot } from '../lib/parseSnapshot';
import { parseCryptoHoldings, type ScannedHolding } from '../lib/prices';
import type { ExtractedTxn } from '../lib/types';
import type { QuickDraft } from '../lib/quickParse';
import {
  LLMError,
  type AskPipLlmInput,
  type CategoryGuessInput,
  type CoachInput,
  type DocExtractInput,
  type DocPart,
  type ExtractInput,
  type LLMProvider,
  type QuickAddInput,
  type TestInput,
} from './types';
import {
  BALANCE_SYSTEM_PROMPT,
  BALANCE_USER_PROMPT,
  DOC_SYSTEM_PROMPT,
  DOC_USER_PROMPT,
  buildDocUserPrompt,
  HOLDINGS_SYSTEM_PROMPT,
  HOLDINGS_USER_PROMPT,
  RECEIPT_SYSTEM_PROMPT,
  RECEIPT_USER_PROMPT,
  SNAPSHOT_SYSTEM_PROMPT,
  SNAPSHOT_USER_PROMPT,
} from './extractPrompt';
import {
  buildCategoryGuessPrompt,
  CATEGORY_GUESS_SYSTEM_PROMPT,
  CategoryGuessParseError,
  parseCategoryGuess,
} from './categoryGuessPrompt';
import {
  buildQuickAddPrompt,
  parseQuickAddReply,
  QUICK_ADD_SYSTEM_PROMPT,
  QuickAddParseError,
} from './quickAddPrompt';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openrouter/free';

const SYSTEM_PROMPT =
  'You are a precise data extractor for a personal expenses app. You read a ' +
  'screenshot of a bank or e-wallet transaction history and return ONLY JSON. ' +
  'Never add prose, explanations, or markdown fences.';

const USER_PROMPT = `Extract every transaction row visible in this screenshot.

Return a JSON object exactly in this shape:
{
  "transactions": [
    {
      "merchant": "string — the payee/merchant/title as shown",
      "amount": number — positive value, no currency symbol,
      "direction": "out" for money leaving the account (spending), "in" for money received,
      "date": "YYYY-MM-DD if derivable, otherwise null",
      "method": "optional sub-label like 'DuitNow QR' or 'RFID Payment', otherwise null"
    }
  ]
}

Rules:
- One object per transaction row. Do not merge or invent rows.
- amount is always positive; use "direction" to indicate spend vs received.
- Keep merchant text close to what is shown (you may trim trailing reference codes).
- If you cannot read a field, use null (for date/method) — never guess amounts.
- Output JSON only.`;

async function postChat(body: object, apiKey: string): Promise<Response> {
  if (!apiKey) throw new LLMError('no_key', 'Missing API key.');
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://pipcomp.app',
        'X-Title': 'PipComp',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LLMError('network', 'Network request failed.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new LLMError('auth', 'API key rejected.');
  }
  if (res.status === 429) {
    throw new LLMError('rate_limit', 'Rate limit reached.');
  }
  if (!res.ok) {
    const text = await safeText(res);
    throw new LLMError('unknown', `Request failed (${res.status}). ${text}`.trim());
  }
  return res;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}

/** Pull the assistant text out of a chat completion, or fail with bad_response. */
async function contentOf(res: Response): Promise<string> {
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new LLMError('bad_response', 'Response was not JSON.');
  }
  const content: unknown = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new LLMError('bad_response', 'Empty model response.');
  }
  return content;
}

async function visionJson(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  parts: DocPart[]
): Promise<string> {
  const content: any[] = [{ type: 'text', text: userPrompt }];
  for (const p of parts) {
    if (p.kind === 'text') {
      content.push({ type: 'text', text: p.text });
    } else if (p.mimeType === 'application/pdf') {
      throw new LLMError('bad_response', 'This model cannot read PDF documents.');
    } else {
      content.push({ type: 'image_url', image_url: { url: `data:${p.mimeType};base64,${p.base64}` } });
    }
  }
  const body = {
    model: model || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  };
  return contentOf(await postChat(body, apiKey));
}

export const OpenRouterProvider: LLMProvider = {
  id: 'openrouter',
  label: 'OpenRouter',
  defaultModel: DEFAULT_MODEL,
  // Ingests images and flattened text; PDF binaries fall back to Gemini.
  acceptsDocuments: true,

  async extract({ apiKey, model, imageBase64, mimeType, categories }: ExtractInput): Promise<ExtractedTxn[]> {
    const userPrompt = categories && categories.length > 0 ? buildDocUserPrompt(categories) : USER_PROMPT;
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    const res = await postChat(body, apiKey);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LLMError('bad_response', 'Response was not JSON.');
    }
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMError('bad_response', 'Empty model response.');
    }
    try {
      return parseExtraction(content);
    } catch (e) {
      if (e instanceof ExtractionParseError) {
        throw new LLMError('bad_response', e.message);
      }
      throw e;
    }
  },

  async extractDocument({ apiKey, model, parts }: DocExtractInput): Promise<ExtractedTxn[]> {
    const content = await visionJson(apiKey, model, DOC_SYSTEM_PROMPT, DOC_USER_PROMPT, parts);
    try {
      return parseExtraction(content);
    } catch (e) {
      if (e instanceof ExtractionParseError) throw new LLMError('bad_response', e.message);
      throw e;
    }
  },

  async extractHoldings({ apiKey, model, parts }: DocExtractInput): Promise<ScannedHolding[]> {
    return parseCryptoHoldings(await visionJson(apiKey, model, HOLDINGS_SYSTEM_PROMPT, HOLDINGS_USER_PROMPT, parts));
  },

  async extractBalance({ apiKey, model, parts }: DocExtractInput): Promise<number | null> {
    return parseBalance(await visionJson(apiKey, model, BALANCE_SYSTEM_PROMPT, BALANCE_USER_PROMPT, parts));
  },

  async extractSnapshot({ apiKey, model, parts }: DocExtractInput): Promise<ScannedSnapshot> {
    return parseSnapshot(await visionJson(apiKey, model, SNAPSHOT_SYSTEM_PROMPT, SNAPSHOT_USER_PROMPT, parts));
  },

  async extractReceipt({ apiKey, model, parts }: DocExtractInput): Promise<ScannedReceipt> {
    return parseReceipt(await visionJson(apiKey, model, RECEIPT_SYSTEM_PROMPT, RECEIPT_USER_PROMPT, parts));
  },

  async guessCategories({ apiKey, model, items, categories }: CategoryGuessInput): Promise<Record<number, string | null>> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: CATEGORY_GUESS_SYSTEM_PROMPT },
        { role: 'user', content: buildCategoryGuessPrompt(items, categories) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    const res = await postChat(body, apiKey);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LLMError('bad_response', 'Response was not JSON.');
    }
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMError('bad_response', 'Empty model response.');
    }
    try {
      return parseCategoryGuess(content, items, categories);
    } catch (e) {
      if (e instanceof CategoryGuessParseError) throw new LLMError('bad_response', e.message);
      throw e;
    }
  },

  async quickAdd({ apiKey, model, text, categories, today, activeCurrencies }: QuickAddInput): Promise<QuickDraft[]> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: QUICK_ADD_SYSTEM_PROMPT },
        { role: 'user', content: buildQuickAddPrompt(text, categories, today, activeCurrencies) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    const res = await postChat(body, apiKey);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LLMError('bad_response', 'Response was not JSON.');
    }
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMError('bad_response', 'Empty model response.');
    }
    try {
      return parseQuickAddReply(content, categories, activeCurrencies, today);
    } catch (e) {
      if (e instanceof QuickAddParseError) throw new LLMError('bad_response', e.message);
      throw e;
    }
  },

  async askPip({ apiKey, model, system, user }: AskPipLlmInput): Promise<unknown> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };
    const content = await contentOf(await postChat(body, apiKey));
    try {
      return JSON.parse(content);
    } catch {
      throw new LLMError('bad_response', 'Model response was not JSON.');
    }
  },

  async test({ apiKey, model }: TestInput): Promise<void> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      temperature: 0,
    };
    await postChat(body, apiKey);
  },

  async coach({ apiKey, model, prompt, system }: CoachInput): Promise<string> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.4,
    };
    const res = await postChat(body, apiKey);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LLMError('bad_response', 'Response was not JSON.');
    }
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new LLMError('bad_response', 'Empty coach response.');
    }
    return content.trim();
  },
};
