// src/llm/extractPrompt.ts
// Prompts for pulling structured transactions out of a document (PDF, image, or
// flattened CSV/XLSX/DOCX text). Shared by document-capable providers.

import type { CategoryOption } from './categoryGuessPrompt';

export const DOC_SYSTEM_PROMPT =
  'You are a precise data extractor for a personal expenses app. You read a ' +
  'bank statement, an exported transaction file, or a screenshot and return ONLY ' +
  'JSON. Never add prose, explanations, or markdown fences.';

export function buildDocUserPrompt(categories?: CategoryOption[]): string {
  if (!categories || categories.length === 0) {
    return DOC_USER_PROMPT;
  }
  const categoryLines = categories.map((c) => `- ${c.id} (${c.kind}): ${c.label}`).join('\n');
  return `Extract every transaction in the attached document.

Categories:
${categoryLines}

Return a JSON object exactly in this shape:
{
  "transactions": [
    {
      "merchant": "string  the payee / description / narration as shown",
      "amount": number  positive value, no currency symbol,
      "currency": "3-letter ISO code read from the symbol or text shown, e.g. \"MYR\", \"CNY\", \"SGD\"  use \"MYR\" if none is shown",
      "direction": "out" for money leaving the account (spending), "in" for money received,
      "date": "YYYY-MM-DD if derivable, otherwise null",
      "category": "the best-fitting category id from the Categories list above, or the label from the source document, otherwise null",
      "method": "optional sub-label, otherwise null"
    }
  ]
}

Rules:
- One object per transaction. Do not merge, split, or invent rows.
- Return every row, including on a long screenshot or statement. Do not stop after the first few.
- amount is always positive; use "direction" for spend vs received.
- For "category": pick the single best-fitting category id from the Categories list above for the merchant / description. If the document carries an explicit category label, prefer that if it matches. Never invent a category id that is not in the provided list. If unsure, use null.
- For tabular data, infer which columns are date, description, amount, and (debit/credit) direction.
- ALSO record interest credited and any bank fees or service charges, even when they
  appear only in an account summary rather than the transaction list. Treat interest
  as income ("in") and fees/charges as expense ("out"). Use the per-account or
  per-pocket amounts; never add a combined "Total" row.
- Skip pure balance rows (opening balance, closing balance), headers, and "Total"/subtotal rows.
- If a summary item such as interest has no explicit date, use the statement's end
  date (the "to" date of the statement period).
- If you cannot read a field, use null (never guess amounts or dates).
- Output JSON only.`;
}

export const DOC_USER_PROMPT = `Extract every transaction in the attached document.

Return a JSON object exactly in this shape:
{
  "transactions": [
    {
      "merchant": "string  the payee / description / narration as shown",
      "amount": number  positive value, no currency symbol,
      "currency": "3-letter ISO code read from the symbol or text shown, e.g. \"MYR\", \"CNY\", \"SGD\"  use \"MYR\" if none is shown",
      "direction": "out" for money leaving the account (spending), "in" for money received,
      "date": "YYYY-MM-DD if derivable, otherwise null",
      "category": "the category/label from the source if the document has one, otherwise null",
      "method": "optional sub-label, otherwise null"
    }
  ]
}

Rules:
- One object per transaction. Do not merge, split, or invent rows.
- Return every row, including on a long screenshot or statement. Do not stop after the first few.
- amount is always positive; use "direction" for spend vs received.
- For tabular data, infer which columns are date, description, amount, and (debit/credit) direction.
- ALSO record interest credited and any bank fees or service charges, even when they
  appear only in an account summary rather than the transaction list. Treat interest
  as income ("in") and fees/charges as expense ("out"). Use the per-account or
  per-pocket amounts; never add a combined "Total" row.
- Skip pure balance rows (opening balance, closing balance), headers, and "Total"/subtotal rows.
- If a summary item such as interest has no explicit date, use the statement's end
  date (the "to" date of the statement period).
- If you cannot read a field, use null (never guess amounts or dates).
- Output JSON only.`;

export const HOLDINGS_SYSTEM_PROMPT =
  'You are a precise data extractor for a personal finance app. You read a ' +
  'screenshot of a crypto wallet or exchange and return ONLY JSON. Never add ' +
  'prose, explanations, or markdown fences.';

export const HOLDINGS_USER_PROMPT = `Extract every cryptocurrency holding shown in this screenshot.

Return a JSON object exactly in this shape:
{
  "holdings": [
    {
      "ticker": "the coin's ticker symbol in uppercase, e.g. BTC, ETH, SOL",
      "quantity": number  the AMOUNT of coins held (not its fiat value)
    }
  ]
}

Rules:
- One object per coin. Use the coin QUANTITY (e.g. 0.0123 for 0.0123 BTC), never the fiat/USD/MYR value.
- ticker is the short symbol only (BTC, ETH, …), uppercase.
- Skip totals, fiat balances, staking labels, and any row without a coin amount.
- If you cannot read a coin's quantity, omit that row. Output JSON only.`;

export const SNAPSHOT_SYSTEM_PROMPT =
  'You read a screenshot of a personal finance app  a bank account, e-wallet, ' +
  'loan/credit statement, or a crypto wallet/exchange  and return ONLY JSON ' +
  'describing what it shows. Never add prose, explanations, or markdown fences.';

export const SNAPSHOT_USER_PROMPT = `Identify what this screenshot shows and return JSON in exactly this shape:
{
  "kind": "balance" | "holdings" | "unknown",
  "provider": "the bank, e-wallet, or platform name shown (e.g. \\"Touch 'n Go eWallet\\", \\"Maybank\\", \\"Binance\\"), read from a logo, header, or app branding  null if you can't tell",
  "accountKind": "asset" | "liability" | null  only for kind \\"balance\\": \\"asset\\" for a deposit/wallet/savings balance, \\"liability\\" for an outstanding loan/credit-card/BNPL amount; null otherwise,
  "amount": number | null  only for kind \\"balance\\": the main balance or outstanding amount, with currency symbols and thousands separators removed (e.g. "RM 1,234.50" -> 1234.50, "¥128.00" -> 128.00),
  "currency": "3-letter ISO code read from the symbol or text shown, e.g. \\"MYR\\", \\"CNY\\", \\"SGD\\"  use \\"MYR\\" if none is shown, only for kind \\"balance\\"",
  "holdings": [{ "ticker": "uppercase coin symbol", "quantity": number }]  only for kind \\"holdings\\"
}

Rules:
- kind "balance" = a bank account, e-wallet, savings/current account, or loan/credit statement showing one main balance amount.
- kind "holdings" = a crypto wallet or exchange showing coin balances.
- kind "unknown" = neither is clearly shown.
- For "balance": use the primary account balance or outstanding loan amount  NOT available credit, rewards points, or interest. Omit holdings (empty array). If you cannot read a clear amount, set amount to null but still report kind "balance" if it's clearly that kind of screenshot.
- For "holdings": use each coin's QUANTITY, never its fiat/USD/MYR value. Omit amount (null). Skip rows without a readable quantity.
- Output JSON only.`;

export const RECEIPT_SYSTEM_PROMPT =
  'You read a photo of a paper restaurant or shop receipt and return ONLY JSON ' +
  'listing what was ordered. Never add prose, explanations, or markdown fences.';

export const RECEIPT_USER_PROMPT = `Read every ordered item on this receipt so the bill can be split between friends.

Return a JSON object exactly in this shape:
{
  "merchant": "the shop or restaurant name printed on the receipt, or null",
  "currency": "3-letter ISO code read from the symbol or text shown, e.g. \"MYR\", \"CNY\", \"SGD\"  use \"MYR\" if none is shown",
  "items": [
    {
      "label": "the item name as printed",
      "amount": number  the LINE TOTAL for that row (quantity already multiplied in),
      "quantity": number or null  how many, if the receipt shows it
    }
  ],
  "subtotal": number or null  the items subtotal BEFORE service charge and tax,
  "serviceCharge": number or null  the service charge amount (often 10%),
  "tax": number or null  the service tax / SST / GST amount (often 6%),
  "total": number or null  the final amount payable,
  "discount": { "amount": number, "timing": "before" | "after" } or null  a voucher or
    discount line, if the receipt printed one
}

Rules:
- One object per ordered line. If a row shows "2 x Teh Ais 3.00 6.00", the amount is the
  LINE TOTAL (6.00) and quantity is 2.
- Do NOT include service charge, tax, subtotal, total, discount, rounding, change, or payment
  lines in "items"  they have their own fields.
- Amounts are plain positive numbers: strip currency symbols and thousands separators
  ("RM 12,340.50" becomes 12340.50).
- For "discount", report the positive amount actually taken off (not negative), and set
  "timing" to "before" if the discount line is printed above the service charge/tax lines
  (it reduced what they were calculated on), or "after" if it is printed below them, near the
  total. If the receipt shows no discount or voucher line, use null.
- If a field is not printed or you cannot read it, use null. Never guess a number.
- Output JSON only.`;

export const BALANCE_SYSTEM_PROMPT =
  'You read a screenshot of a bank account, e-wallet, or loan statement and ' +
  'return ONLY JSON. Never add prose, explanations, or markdown fences.';

export const BALANCE_USER_PROMPT = `Return the main balance or amount shown in this screenshot as JSON:
{ "amount": number, "currency": "3-letter ISO code read from the symbol or text shown, e.g. \\"MYR\\", \\"CNY\\", \\"SGD\\"  use \\"MYR\\" if none is shown" }

Rules:
- Use the primary account balance or the outstanding loan amount  NOT available credit, rewards points, or interest.
- Remove currency symbols and thousands separators (e.g. "RM 1,234.50" → 1234.50).
- If you cannot read a single clear amount, return { "amount": null }.
- Output JSON only.`;
