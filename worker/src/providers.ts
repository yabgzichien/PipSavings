// worker/src/providers.ts

export type ScanType = 'transactions' | 'receipt' | 'snapshot';

export interface ProviderCategory {
  id: string;
  label: string;
  kind?: string;
}

export interface ExtractedTxnRow {
  merchant: string;
  amount: number;
  type: 'expense' | 'income';
  date: string | null;
  currency: string;
  method?: string | null;
}

export interface ScannedItem {
  label: string;
  amount: number;
  quantity?: number | null;
}

export interface ScannedReceipt {
  merchant: string | null;
  currency: string;
  total: number | null;
  tax: number | null;
  serviceCharge: number | null;
  subtotal: number | null;
  discount: { amount: number; timing: 'before' | 'after' } | null;
  items: ScannedItem[];
}

export interface ScannedHolding {
  ticker: string;
  quantity: number;
}

export type ScannedSnapshot =
  | {
      kind: 'balance';
      provider: string | null;
      accountKind: 'asset' | 'liability' | null;
      amount: number | null;
      currency: string;
    }
  | { kind: 'holdings'; provider: string | null; holdings: ScannedHolding[] }
  | { kind: 'unknown' };

export interface ScanResultData {
  items?: ExtractedTxnRow[];
  receipt?: ScannedReceipt;
  snapshot?: ScannedSnapshot;
}

export const TRANSACTION_SYSTEM_PROMPT =
  'You extract transactions from bank statements, e-wallets, and receipts into structured JSON. Never add prose or markdown fences.';

export const TRANSACTION_USER_PROMPT = `Extract every transaction row visible in this statement, receipt, or screenshot into a JSON object with an array named "transactions".
Each transaction must have:
- "merchant": clean store or business name (string)
- "amount": total amount paid as a positive number (float)
- "type": "expense" or "income" (usually "expense")
- "date": transaction date in YYYY-MM-DD format, or null if not found
- "currency": 3-letter currency code (e.g. MYR, SGD, USD)
- "method": payment method if visible (e.g. "tng", "grabpay", "visa", "cash"), or null

Return ONLY valid JSON matching: { "transactions": [...] }.`;

export function buildPrompt(_categories?: ProviderCategory[]): string {
  return TRANSACTION_USER_PROMPT;
}

export const RECEIPT_SYSTEM_PROMPT =
  'You read a photo or text of a paper restaurant or shop receipt and return ONLY JSON ' +
  'listing what was ordered. Never add prose, explanations, or markdown fences.';

export const RECEIPT_USER_PROMPT = `Read every ordered item on this receipt so the bill can be split between friends.

Return a JSON object exactly in this shape:
{
  "merchant": "the shop or restaurant name printed on the receipt, or null",
  "currency": "3-letter ISO code read from the symbol or text shown, e.g. \\"MYR\\", \\"CNY\\", \\"SGD\\" - use \\"MYR\\" if none is shown",
  "items": [
    {
      "label": "the item name as printed",
      "amount": number (the LINE TOTAL for that row with quantity already multiplied in),
      "quantity": number or null
    }
  ],
  "subtotal": number or null,
  "serviceCharge": number or null,
  "tax": number or null,
  "total": number or null,
  "discount": { "amount": number, "timing": "before" | "after" } or null
}

Rules:
- One object per ordered line. If a row shows "2 x Teh Ais 3.00 6.00", the amount is 6.00 and quantity is 2.
- Do NOT include service charge, tax, subtotal, total, discount, or payment lines in "items".
- Strip currency symbols and thousands separators.
- Output JSON only.`;

export const SNAPSHOT_SYSTEM_PROMPT =
  'You read a screenshot of a personal finance app - a bank account, e-wallet, ' +
  'loan/credit statement, or a crypto wallet/exchange - and return ONLY JSON ' +
  'describing what it shows. Never add prose, explanations, or markdown fences.';

export const SNAPSHOT_USER_PROMPT = `Identify what this screenshot shows and return JSON in exactly this shape:
{
  "kind": "balance" | "holdings" | "unknown",
  "provider": "the bank, e-wallet, or platform name shown (e.g. \\"Touch 'n Go eWallet\\", \\"Maybank\\", \\"Binance\\"), read from a logo, header, or app branding - null if you can't tell",
  "accountKind": "asset" | "liability" | null,
  "amount": number | null,
  "currency": "3-letter ISO code read from the symbol or text shown, e.g. \\"MYR\\", \\"CNY\\", \\"SGD\\" - use \\"MYR\\" if none is shown",
  "holdings": [{ "ticker": "uppercase coin symbol", "quantity": number }]
}

Rules:
- kind "balance" = a bank account, e-wallet, savings/current account, or loan/credit statement showing one main balance amount.
- kind "holdings" = a crypto wallet or exchange showing coin balances.
- kind "unknown" = neither is clearly shown.
- For "balance": use primary account balance or outstanding loan amount. Omit holdings.
- For "holdings": use each coin's QUANTITY, never fiat value. Omit amount.
- Output JSON only.`;

export function getPromptConfig(scanType: ScanType): {
  systemPrompt?: string;
  userPrompt: string;
} {
  if (scanType === 'receipt') {
    return {
      systemPrompt: RECEIPT_SYSTEM_PROMPT,
      userPrompt: RECEIPT_USER_PROMPT,
    };
  }
  if (scanType === 'snapshot') {
    return {
      systemPrompt: SNAPSHOT_SYSTEM_PROMPT,
      userPrompt: SNAPSHOT_USER_PROMPT,
    };
  }
  return {
    systemPrompt: TRANSACTION_SYSTEM_PROMPT,
    userPrompt: TRANSACTION_USER_PROMPT,
  };
}

export const TRANSACTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transactions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          merchant: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          type: { type: 'STRING', enum: ['expense', 'income'] },
          date: { type: 'STRING', nullable: true },
          currency: { type: 'STRING' },
          method: { type: 'STRING', nullable: true },
        },
        required: ['merchant', 'amount', 'type', 'currency'],
      },
    },
  },
  required: ['transactions'],
};

export const RECEIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    currency: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          quantity: { type: 'NUMBER', nullable: true },
        },
        required: ['label', 'amount'],
      },
    },
    subtotal: { type: 'NUMBER', nullable: true },
    serviceCharge: { type: 'NUMBER', nullable: true },
    tax: { type: 'NUMBER', nullable: true },
    total: { type: 'NUMBER', nullable: true },
    discount: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        amount: { type: 'NUMBER' },
        timing: { type: 'STRING', enum: ['before', 'after'] },
      },
      required: ['amount', 'timing'],
    },
  },
  required: ['currency', 'items'],
};

export const SNAPSHOT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['balance', 'holdings', 'unknown'] },
    provider: { type: 'STRING', nullable: true },
    accountKind: { type: 'STRING', enum: ['asset', 'liability'], nullable: true },
    amount: { type: 'NUMBER', nullable: true },
    currency: { type: 'STRING', nullable: true },
    holdings: {
      type: 'ARRAY',
      nullable: true,
      items: {
        type: 'OBJECT',
        properties: {
          ticker: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
        },
        required: ['ticker', 'quantity'],
      },
    },
  },
  required: ['kind'],
};

export function getResponseSchema(scanType: ScanType): Record<string, unknown> {
  if (scanType === 'receipt') return RECEIPT_SCHEMA;
  if (scanType === 'snapshot') return SNAPSHOT_SCHEMA;
  return TRANSACTIONS_SCHEMA;
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}

function coerceAmount(raw: unknown): number | null {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string') {
    const c = raw.replace(/[^0-9.]/g, '');
    if (!/[0-9]/.test(c)) return null;
    n = Number(c);
  } else {
    return null;
  }
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function parseReceipt(content: string | any): ScannedReceipt {
  let o: any = content;
  if (typeof content === 'string') {
    try {
      o = JSON.parse(stripFences(content).trim());
    } catch {
      o = {};
    }
  }
  if (!o || typeof o !== 'object') {
    return {
      merchant: null,
      currency: 'MYR',
      total: null,
      tax: null,
      serviceCharge: null,
      subtotal: null,
      discount: null,
      items: [],
    };
  }

  const rows = Array.isArray(o.items) ? o.items : [];
  const items: ScannedItem[] = [];
  rows.forEach((row: any, i: number) => {
    if (!row || typeof row !== 'object') return;
    const amount = coerceAmount(row.amount);
    if (amount === null) return;
    const label =
      typeof row.label === 'string' && row.label.trim()
        ? row.label.trim()
        : typeof row.name === 'string' && row.name.trim()
        ? row.name.trim()
        : `Item ${i + 1}`;
    const quantity =
      typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null;
    items.push({ label, amount, quantity });
  });

  return {
    merchant: typeof o.merchant === 'string' && o.merchant.trim() ? o.merchant.trim() : null,
    currency: typeof o.currency === 'string' && o.currency.trim() ? o.currency.trim().toUpperCase() : 'MYR',
    items,
    subtotal: coerceAmount(o.subtotal),
    serviceCharge: coerceAmount(o.serviceCharge),
    tax: coerceAmount(o.tax),
    total: coerceAmount(o.total),
    discount:
      o.discount && typeof o.discount === 'object' && typeof o.discount.amount === 'number'
        ? {
            amount: Math.abs(o.discount.amount),
            timing: o.discount.timing === 'before' ? 'before' : 'after',
          }
        : null,
  };
}

export function parseSnapshot(content: string | any): ScannedSnapshot {
  let o: any = content;
  if (typeof content === 'string') {
    try {
      o = JSON.parse(stripFences(content).trim());
    } catch {
      return { kind: 'unknown' };
    }
  }
  if (!o || typeof o !== 'object') return { kind: 'unknown' };

  if (o.kind === 'balance') {
    return {
      kind: 'balance',
      provider: typeof o.provider === 'string' && o.provider.trim() ? o.provider.trim() : null,
      accountKind: o.accountKind === 'asset' || o.accountKind === 'liability' ? o.accountKind : null,
      amount: coerceAmount(o.amount),
      currency: typeof o.currency === 'string' && o.currency.trim() ? o.currency.trim().toUpperCase() : 'MYR',
    };
  }

  if (o.kind === 'holdings') {
    const list = Array.isArray(o.holdings) ? o.holdings : [];
    const holdings: ScannedHolding[] = [];
    for (const h of list) {
      if (!h || typeof h !== 'object') continue;
      const ticker = typeof h.ticker === 'string' ? h.ticker.trim().toUpperCase() : '';
      const quantity = Number(h.quantity);
      if (ticker && Number.isFinite(quantity) && quantity > 0) {
        holdings.push({ ticker, quantity });
      }
    }
    return {
      kind: 'holdings',
      provider: typeof o.provider === 'string' && o.provider.trim() ? o.provider.trim() : null,
      holdings,
    };
  }

  return { kind: 'unknown' };
}

export function parseScanOutput(scanType: ScanType, content: string | any): ScanResultData {
  if (scanType === 'receipt') {
    return { receipt: parseReceipt(content) };
  }
  if (scanType === 'snapshot') {
    return { snapshot: parseSnapshot(content) };
  }
  let parsed: any;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(stripFences(content).trim());
    } catch {
      parsed = {};
    }
  } else {
    parsed = content;
  }
  return { items: parseTransactionRows(parsed) };
}

export async function callGroqVision(
  apiKey: string,
  base64: string,
  mime: string,
  scanType: ScanType = 'transactions',
  ocrTextOrCategories?: string | ProviderCategory[],
  signal?: AbortSignal
): Promise<ScanResultData> {
  const ocrText = typeof ocrTextOrCategories === 'string' ? ocrTextOrCategories : undefined;
  const { systemPrompt, userPrompt } = getPromptConfig(scanType);
  const effectiveUserPrompt = ocrText
    ? `OCR text transcript from document:\n${ocrText}\n\n${userPrompt}`
    : userPrompt;

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: effectiveUserPrompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${base64}`,
        },
      },
    ],
  });

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages,
      response_format: { type: 'json_object' },
      reasoning_effort: 'none',
      temperature: 0,
      max_tokens: scanType === 'transactions' ? 4096 : 2048,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }

  const json: any = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty provider response');
  return parseScanOutput(scanType, content);
}

export async function callGroqText(
  apiKey: string,
  ocrText: string,
  scanType: ScanType = 'transactions',
  signal?: AbortSignal
): Promise<ScanResultData> {
  const { systemPrompt, userPrompt } = getPromptConfig(scanType);
  const effectiveUserPrompt = `OCR text transcript from document:\n${ocrText}\n\n${userPrompt}`;

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({
    role: 'user',
    content: effectiveUserPrompt,
  });

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages,
      response_format: { type: 'json_object' },
      reasoning_effort: 'none',
      temperature: 0,
      max_tokens: scanType === 'transactions' ? 4096 : 2048,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }

  const json: any = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty provider response');
  return parseScanOutput(scanType, content);
}

export async function callGeminiVision(
  apiKey: string,
  base64: string,
  mime: string,
  scanType: ScanType = 'transactions',
  ocrTextOrCategories?: string | ProviderCategory[],
  signal?: AbortSignal
): Promise<ScanResultData> {
  const ocrText = typeof ocrTextOrCategories === 'string' ? ocrTextOrCategories : undefined;
  const { systemPrompt, userPrompt } = getPromptConfig(scanType);
  const effectiveUserPrompt = ocrText
    ? `OCR text transcript from document:\n${ocrText}\n\n${userPrompt}`
    : userPrompt;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [
      {
        parts: [
          { text: effectiveUserPrompt },
          {
            inline_data: {
              mime_type: mime,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: getResponseSchema(scanType),
      temperature: 0,
      thinkingConfig: { thinkingLevel: 'minimal' },
      maxOutputTokens: scanType === 'transactions' ? 4096 : 2048,
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
    },
  };

  if (systemPrompt) {
    body.system_instruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const json: any = await response.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty provider response');
  return parseScanOutput(scanType, content);
}

export async function callGeminiText(
  apiKey: string,
  ocrText: string,
  scanType: ScanType = 'transactions',
  signal?: AbortSignal
): Promise<ScanResultData> {
  const { systemPrompt, userPrompt } = getPromptConfig(scanType);
  const effectiveUserPrompt = `OCR text transcript from document:\n${ocrText}\n\n${userPrompt}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [
      {
        parts: [{ text: effectiveUserPrompt }],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: getResponseSchema(scanType),
      temperature: 0,
      thinkingConfig: { thinkingLevel: 'minimal' },
      maxOutputTokens: scanType === 'transactions' ? 4096 : 2048,
    },
  };

  if (systemPrompt) {
    body.system_instruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const json: any = await response.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty provider response');
  return parseScanOutput(scanType, content);
}

export async function callOpenRouterVision(
  apiKeysRaw: string,
  base64: string,
  mime: string,
  scanType: ScanType = 'transactions',
  ocrTextOrCategories?: string | ProviderCategory[],
  model: string = 'google/gemini-2.5-flash',
  signal?: AbortSignal
): Promise<ScanResultData> {
  const ocrText = typeof ocrTextOrCategories === 'string' ? ocrTextOrCategories : undefined;
  const { systemPrompt, userPrompt } = getPromptConfig(scanType);
  const effectiveUserPrompt = ocrText
    ? `OCR text transcript from document:\n${ocrText}\n\n${userPrompt}`
    : userPrompt;

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: effectiveUserPrompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${base64}`,
        },
      },
    ],
  });

  const keys = apiKeysRaw.split(',').map((k) => k.trim()).filter(Boolean);
  let lastError: any = null;

  for (const apiKey of keys) {
    try {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://pipfinance.app',
          'X-Title': 'Pip Finance',
        },
        signal,
        body: JSON.stringify({
          model: model || 'google/gemini-2.5-flash',
          max_tokens: scanType === 'transactions' ? 4096 : 2048,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        lastError = new Error(`OpenRouter API error: ${response.status}`);
        continue;
      }

      const json: any = await response.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error('Empty OpenRouter response');
        continue;
      }
      return parseScanOutput(scanType, content);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('All OpenRouter keys failed');
}

export async function callOpenRouterText(
  apiKeysRaw: string,
  ocrText: string,
  scanType: ScanType = 'transactions',
  model: string = 'google/gemini-2.5-flash',
  signal?: AbortSignal
): Promise<ScanResultData> {
  const { systemPrompt, userPrompt } = getPromptConfig(scanType);
  const effectiveUserPrompt = `OCR text transcript from document:\n${ocrText}\n\n${userPrompt}`;

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({
    role: 'user',
    content: effectiveUserPrompt,
  });

  const keys = apiKeysRaw.split(',').map((k) => k.trim()).filter(Boolean);
  let lastError: any = null;

  for (const apiKey of keys) {
    try {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://pipfinance.app',
          'X-Title': 'Pip Finance',
        },
        signal,
        body: JSON.stringify({
          model: model || 'google/gemini-2.5-flash',
          max_tokens: scanType === 'transactions' ? 4096 : 2048,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        lastError = new Error(`OpenRouter API error: ${response.status}`);
        continue;
      }

      const json: any = await response.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error('Empty OpenRouter response');
        continue;
      }
      return parseScanOutput(scanType, content);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('All OpenRouter keys failed');
}

export function parseTransactionRows(data: any): ExtractedTxnRow[] {
  const list = Array.isArray(data) ? data : data?.transactions || data?.items || [];
  if (!Array.isArray(list)) return [];

  return list
    .map((item: any): ExtractedTxnRow | null => {
      const merchant = String(item.merchant || item.name || 'Unknown').trim();
      const amount = Math.abs(Number(item.amount || 0));
      if (!amount || isNaN(amount)) return null;
      const type = item.type === 'income' ? 'income' : 'expense';
      const date = item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null;
      const currency = String(item.currency || 'MYR').toUpperCase();
      const method = item.method ? String(item.method).toLowerCase() : null;

      return {
        merchant,
        amount,
        type,
        date,
        currency,
        method,
      };
    })
    .filter((it): it is ExtractedTxnRow => it !== null);
}
