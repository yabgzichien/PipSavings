// Turns ML Kit text from a paper receipt into the same receipt object the model used to return.
import { normalizeCurrency } from './currency';
import type { ScannedReceipt } from './parseReceipt';

const CCY = 'RM|MYR|SGD|USD|EUR|GBP|CHF|CNY|JPY|THB|AUD|HKD|S\\$';
const AMOUNT_RE = new RegExp(
  `([+-])?\\s*(${CCY})?\\s*(\\d{1,3}(?:,\\d{3})+|\\d+)[.,](\\d{2})\\s*(${CCY})?`,
  'gi'
);

interface Money {
  value: number;
  currency: string | null;
}

const SKIP_LINE =
  /^(sub\s*total|grand\s*total|total|rounding|round(?:ing)?(?:\s*adj\.?)?|tax|sst|gst|vat|mwst|service(?:\s*charge)?|svc|cash|change|payment|pay(?:ment)?|discount|less|voucher|incl\.?|including|entspricht|tel\.?|fax\.?|e-?mail|mid\b|txn\b|item\s*#|qty\b|quantity|description|amount|rech\.|bar\b|tisch\b|table\b|date\b)/i;

function splitMoney(line: string): { amounts: Money[]; rest: string } {
  const amounts: Money[] = [];
  const rest = line.replace(new RegExp(AMOUNT_RE.source, 'gi'), (_full, _sign, ccyA, whole, frac, ccyB) => {
    const raw = String(ccyB || ccyA || '');
    const value = Number(`${String(whole).replace(/,/g, '')}.${frac}`);
    if (!Number.isFinite(value) || value <= 0) return ' ';
    amounts.push({ value, currency: raw ? normalizeCurrency(raw.replace('S$', 'SGD')) : null });
    return ' ';
  });
  return { amounts, rest: rest.replace(/\s+/g, ' ').replace(/\s*[à@]\s*$/i, '').trim() };
}

function quantityOf(label: string): { quantity: number | null; label: string } {
  const m = label.match(/^(\d+)\s*[x×]\s*/i);
  if (!m) return { quantity: null, label };
  const quantity = Number(m[1]);
  return { quantity: quantity > 0 ? quantity : null, label: label.slice(m[0].length).trim() };
}

function isSkip(label: string): boolean {
  const text = label.trim();
  if (!text) return true;
  if (SKIP_LINE.test(text)) return true;
  if (/^item\s*#/i.test(text)) return true;
  if (/\b(entspricht|in euro|mwst)\b/i.test(text)) return true;
  if (/^(总数|原价|优惠|应收|小计)/.test(text)) return true;
  if (/\b(duitnow|cash|ccash)\b/i.test(text)) return true;
  if (/^\d+\s*points?$/i.test(text)) return true;
  return false;
}

function letterRatio(line: string): number {
  const letters = (line.match(/[A-Za-z\u4e00-\u9fff]/g) ?? []).length;
  return letters / Math.max(line.replace(/\s/g, '').length, 1);
}

function merchantFrom(lines: string[]): string | null {
  const titles: string[] = [];
  for (const line of lines.slice(0, 12)) {
    const { amounts, rest } = splitMoney(line);
    if (amounts.length || !rest || isSkip(rest)) {
      if (titles.length) break;
      continue;
    }
    if (rest.length < 3 || letterRatio(rest) < 0.55) {
      if (titles.length) break;
      continue;
    }
    if (/\d{3,}/.test(rest)) continue;
    if (rest.split(/\s+/).some((word) => word.length === 1)) {
      if (titles.length) break;
      continue;
    }
    titles.push(rest);
    if (titles.length === 2) break;
  }
  if (!titles.length) return null;
  return titles.join(' ').replace(/\s+/g, ' ').trim();
}

/** Pick the transcript whose items add up closest to the printed total. */
export function betterReceiptText(current: string, other: string): string {
  const score = (text: string) => {
    const receipt = parseReceiptOcr(text);
    if (!receipt) return -1;
    const sum = receipt.items.reduce((total, item) => total + item.amount, 0);
    const printed = /(?:^|\n)\s*(?:grand\s*)?total\b|应收/i.test(text);
    const gap = printed ? Math.abs(sum - (receipt.total ?? sum)) : 40;
    return (printed ? 40 : 0) + receipt.items.length * 3 - gap;
  };
  return score(other) > score(current) ? other : current;
}

/** A receipt ML Kit actually read. Null when the text is not a till slip we can finish locally. */
export function parseReceiptOcr(text: string): ScannedReceipt | null {
  const lines = text
    .replace(/\u00a0/g, ' ')
    .replace(/\b(\d{1,3}) +0+[A-Za-z]\b/g, '$1.00')
    .replace(/\b(\d{1,2}) +(\d{2})\b/g, '$1.$2')
    .replace(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/g, ' ')
    .replace(/(\d)\s*[.,]\s+(\d{2})\b/g, '$1.$2')
    .replace(/(\d),(\d{2})\b/g, '$1.$2')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;

  const currencies: string[] = [];
  const items: ScannedReceipt['items'] = [];
  let pending: string | null = null;
  let total: number | null = null;
  let subtotal: number | null = null;
  let tax: number | null = null;
  let discount: ScannedReceipt['discount'] = null;
  let totalCurrency: string | null = null;

  const take = (money: Money) => {
    if (money.currency) currencies.push(money.currency);
    return money.value;
  };

  for (const line of lines) {
    const { amounts, rest } = splitMoney(line);
    const label = rest.trim();
    const last = amounts[amounts.length - 1];

    if (last && /^(grand\s*)?total\b|^应收/i.test(label)) {
      total = take(last);
      totalCurrency = last.currency ?? totalCurrency;
      pending = null;
      continue;
    }
    if (last && /^sub\s*total\b/i.test(label)) {
      subtotal = take(last);
      pending = null;
      continue;
    }
    if (last && /^(tax|sst|gst|vat|mwst|service)\b/i.test(label)) {
      tax = take(last);
      pending = null;
      continue;
    }
    if (last && /^(discount|less|voucher)\b/i.test(label)) {
      discount = { amount: take(last), timing: 'before' };
      pending = null;
      continue;
    }
    const priceOnly = Boolean(last && label && !/[A-Za-z\u4e00-\u9fff]/.test(label) && pending);
    const itemLabel = priceOnly ? '' : label;
    if (last && !itemLabel) {
      const named = pending ? quantityOf(pending) : { quantity: null, label: `Item ${items.length + 1}` };
      if (named.label.length >= 2 && !isSkip(named.label)) {
        items.push({ label: named.label.slice(0, 60), amount: take(last), quantity: named.quantity });
      }
      pending = null;
      continue;
    }

    if (isSkip(itemLabel) && !(last && itemLabel.length > 24)) {
      if (last) amounts.forEach(take);
      continue;
    }

    if (last && total != null && Math.abs(last.value - total) < 0.001 && items.length > 0) {
      pending = null;
      continue;
    }

    if (last && itemLabel && !isSkip(itemLabel)) {
      const named = quantityOf(itemLabel);
      if (named.label.length < 2) continue;
      items.push({ label: named.label.slice(0, 60), amount: take(last), quantity: named.quantity });
      amounts.slice(0, -1).forEach(take);
      pending = null;
      continue;
    }

    if (!last && itemLabel && !isSkip(itemLabel) && letterRatio(itemLabel) >= 0.4 && itemLabel.length >= 2) {
      if (pending && /^(sdn\.?\s*bhd\.?|pte\.?\s*ltd\.?|enterprise|co\.?)$/i.test(label)) pending = `${pending} ${label}`;
      else pending = label;
    }
  }

  const looksLikeShelf = lines.some((line) => /item\s*#/i.test(line));
  const shelved = looksLikeShelf ? shelfItems(lines) : [];
  if (total != null && shelved.length) {
    const shelfSum = shelved.reduce((sum, item) => sum + item.amount, 0);
    const plainSum = items.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(shelfSum - total) < Math.abs(plainSum - total)) {
      items.length = 0;
      items.push(...shelved);
    }
  }

  if (!items.length) return null;
  const sum = Math.round(items.reduce((s, item) => s + item.amount, 0) * 100) / 100;
  if (total == null) total = sum;
  if (total != null && Math.abs(sum - total) > 0.15 && Math.abs(sum - (total + (discount?.amount ?? 0))) > 0.15) {
    return null;
  }
  const currency = normalizeCurrency(totalCurrency ?? mode(currencies) ?? 'MYR');
  return {
    merchant: merchantFrom(lines),
    currency,
    items,
    subtotal,
    serviceCharge: null,
    tax,
    total,
    discount,
  };
}

function repairSlipLine(line: string): string {
  let text = line.replace(/\b(\d{1,3}) +0+[A-Za-z]\b/g, '$1.00').replace(/\b(\d{1,2}) +(\d{2})\b/g, '$1.$2');
  return text.replace(/(?<![.\d])([1-9])(\d{2})(?=\s+[A-Za-z]?\s*$|\s*$)/g, '$1.$2');
}

function productName(line: string): string | null {
  const cleaned = line.replace(/item\s*#?\s*[\d\s.-]+/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || isSkip(cleaned) || /^[\d\s.#-]+$/.test(cleaned) || /[|]/.test(cleaned)) return null;
  const letters = (cleaned.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 4) return null;
  if (letterRatio(cleaned) < 0.45) return null;
  return cleaned.slice(0, 60);
}

function tidyShelfLabel(label: string): string {
  return label.replace(/\d+[.,]\d{2}/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** A supermarket slip prints the price on the barcode line above the product name. */
function shelfItems(lines: string[]): ScannedReceipt['items'] {
  const items: ScannedReceipt['items'] = [];
  let queued: number | null = null;
  let seenCode = false;
  const priceOf = (line: string): number | null => {
    const { amounts } = splitMoney(repairSlipLine(line));
    const last = amounts[amounts.length - 1];
    if (!last || last.value <= 0 || last.value >= 200) return null;
    return last.value;
  };
  const push = (label: string, amount: number) => {
    const name = tidyShelfLabel(label);
    if (name.length < 2) return;
    const prev = items[items.length - 1];
    const prevKey = prev ? prev.label.toLowerCase().replace(/[^a-z]/g, '') : '';
    const key = name.toLowerCase().replace(/[^a-z]/g, '');
    const edits = prevKey && key ? [...key].reduce((n, ch, i) => n + (ch === prevKey[i] ? 0 : 1), 0) : 99;
    if (
      prev &&
      prev.amount === amount &&
      prevKey !== key &&
      Math.abs(prevKey.length - key.length) <= 1 &&
      edits <= 2
    ) {
      if (key.length > prevKey.length) prev.label = name;
      return;
    }
    items.push({ label: name, amount, quantity: null });
  };
  for (const raw of lines) {
    const line = repairSlipLine(raw);
    if (/^(sub\s*total|grand\s*)?total\b/i.test(line)) break;
    if (/i?tem\s*#|^\s*\d{6,}/i.test(line)) {
      seenCode = true;
      const price = priceOf(line);
      if (price != null) queued = price;
      continue;
    }
    if (!seenCode) continue;
    const name = productName(line);
    const price = priceOf(line);
    if (name && price != null && price < 80) {
      push(name, price);
      queued = null;
      continue;
    }
    if (name && queued != null) {
      push(name, queued);
      queued = null;
      continue;
    }
    if (!name && price != null) queued = price;
  }
  return items;
}

function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [value, count] of counts) {
    if (count > n) {
      best = value;
      n = count;
    }
  }
  return best;
}
