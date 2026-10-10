// Reads an e-wallet or bank transaction list from OCR text.
// One printed row is one payment. A second amount under that row (a fee, or the
// other currency) stays on the same payment. A timestamp belongs to the row it
// is printed on, not the row below it.
import { normalizeCurrency } from './currency';
import type { ExtractedTxn, TxnType } from './types';

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const CCY = 'RM|MYR|SGD|USD|EUR|GBP|CNY|JPY|THB|AUD|HKD|PHP|IDR|INR|KRW|VND|TWD';
const AMOUNT_RE = new RegExp(
  `([+-])?\\s*(${CCY})?\\s*([+-])?\\s*(\\d{1,3}(?:,\\d{3})+|\\d+)\\.(\\d{2})\\s*(${CCY})?`,
  'gi'
);

const METHODS = new Set([
  'payment',
  'sent',
  'received',
  'duitnow',
  'duitnow qr',
  'duitnow received',
  'transfer to wallet',
  'receive from wallet',
  'rfid payment',
  'qr payment',
  'qr pay',
]);

interface Money {
  value: number;
  currency: string;
  incoming: boolean;
}

interface Draft {
  merchant: string;
  amounts: Money[];
  date: string | null;
  time: string | null;
  method: string | null;
  incoming: boolean;
}

export interface StatementParseOptions {
  /** Year to use when a row shows "25 Sep" and no year. Defaults to this year. */
  year?: number;
}

/**
 * Parse a transaction-list transcript. Returns null when the text is not a
 * dated list we can read completely, so the caller can fall back to the model.
 */
export function parseStatementRows(text: string, options: StatementParseOptions = {}): ExtractedTxn[] | null {
  const fallbackYear = options.year ?? new Date().getFullYear();
  let year = fallbackYear;
  const lines = text
    .replace(/\u00a0/g, ' ')
    .replace(/[−–]/g, '-')
    .replace(/S\$/g, 'SGD')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rangeYear = yearFromRange(lines.join('\n'));
  if (rangeYear) year = rangeYear;

  const drafts: Draft[] = [];
  let sectionDate: string | null = null;
  let pendingStamp: { date: string; time: string } | null = null;
  let pendingMerchant: string | null = null;
  let pendingAmounts: Money[] = [];
  let pendingMethod: string | null = null;
  let open: Draft | null = null;
  let seenAmounts = 0;
  let consumedAmounts = 0;

  const flush = (merchant: string, amounts: Money[], method: string | null) => {
    const stamp = pendingStamp;
    const date = stamp?.date ?? sectionDate;
    const incoming = amounts.some((a) => a.incoming) || /^receive from\b/i.test(merchant);
    const draft: Draft = {
      merchant: merchant.replace(/\s+/g, ' ').trim(),
      amounts,
      date,
      time: stamp?.time ?? null,
      method,
      incoming,
    };
    draft.merchant = tidyMerchant(draft.merchant);
    drafts.push(draft);
    open = draft;
    consumedAmounts += amounts.length;
    pendingStamp = null;
    pendingMerchant = null;
    pendingAmounts = [];
    pendingMethod = null;
  };

  for (const original of lines) {
    // ML Kit reads the row's arrow icon as a lone 个. It is not part of the merchant.
    const stripped = original
      .replace(/^(?:个|↑|↓|▲|▼|⬆|⬇)+\s*/u, '')
      .replace(/\s+[+O]?\d*\s*points?$/i, '')
      .trim();
    const rawLine = restoreCompanionDecimal(stripped, open);
    if (!rawLine || isNoise(rawLine)) continue;
    const { amounts, rest } = splitAmounts(rawLine);
    seenAmounts += amounts.length;
    const label = rest.trim();

    if (!label && amounts.length === 0) continue;

    if (label && isRangeLine(label)) {
      const ranged = yearFromRange(label);
      if (ranged) year = ranged;
      continue;
    }

    const stamped = label ? parseTimestamp(label, year) : null;
    if (stamped) {
      open = null;
      pendingMerchant = null;
      pendingStamp = stamped;
      if (amounts.length) pendingAmounts = amounts;
      continue;
    }

    const header = label ? parseDateHeader(label, year) : null;
    if (header && amounts.length === 0) {
      sectionDate = header;
      pendingStamp = null;
      pendingMerchant = null;
      pendingAmounts = [];
      open = null;
      continue;
    }

    if (label && isMethod(label) && amounts.length === 0) {
      if (pendingMerchant || pendingAmounts.length) pendingMethod = label;
      else if (open) open.method = label;
      continue;
    }

    // "PTE. LTD." or "RESTAURANT PTE. LT D." is the rest of the merchant above it.
    // A band overlap repeats the last word of the merchant ("Masters" / "MASTERS") with no amount.
    if (!amounts.length && open && label && lastWord(open.merchant) === label.toLowerCase()) continue;

    if (!amounts.length && label && isNameContinuation(label)) {
      if (open && !pendingMerchant) open.merchant = joinName(open.merchant, label);
      else if (pendingMerchant) pendingMerchant = joinName(pendingMerchant, label);
      else pendingMerchant = label;
      continue;
    }

    // The fee (or the other currency) shares a line with the wrapped last word: "CHAN  6.58 SGD".
    if (
      open &&
      !pendingMerchant &&
      amounts.length === 1 &&
      pairsWith(open, amounts[0]) &&
      continuesOpen(label)
    ) {
      if (label && !isMethod(label)) open.merchant = joinName(open.merchant, label);
      open.amounts.push(amounts[0]);
      consumedAmounts += 1;
      if (label && isMethod(label)) open.method = label;
      continue;
    }

    if (amounts.length && label && !isMethod(label)) {
      const merchant = pendingMerchant ? `${pendingMerchant} ${label}` : label;
      flush(merchant, [...pendingAmounts, ...amounts], pendingMethod);
      continue;
    }

    if (amounts.length && (!label || isMethod(label))) {
      const method = label && isMethod(label) ? label : pendingMethod;
      if (pendingMerchant || pendingAmounts.length || pendingStamp) {
        const merchant = pendingMerchant ?? open?.merchant ?? '';
        if (!merchant) continue;
        flush(merchant, [...pendingAmounts, ...amounts], method);
        continue;
      }
      if (open && !pendingMerchant) {
        open.amounts.push(...amounts);
        consumedAmounts += amounts.length;
        if (method && !open.method) open.method = method;
        continue;
      }
      continue;
    }

    if (label && !isMethod(label)) {
      // The amount was on the timestamp line; this line is that payment's merchant.
      if (pendingAmounts.length > 0) {
        const merchant = pendingMerchant ? `${pendingMerchant} ${label}` : label;
        flush(merchant, pendingAmounts, pendingMethod);
        continue;
      }
      if (pendingMerchant) pendingMerchant = `${pendingMerchant} ${label}`;
      else {
        open = null;
        pendingMerchant = label;
      }
    }
  }

  if (seenAmounts < 2 || consumedAmounts < seenAmounts) return null;
  if (!drafts.some((d) => d.date)) return null;

  const account = accountCurrency(drafts);
  const rows: ExtractedTxn[] = [];
  for (const draft of drafts) {
    if (draft.merchant.length < 2 || draft.amounts.length === 0) return null;
    const chosen = chooseAmount(draft.amounts, account);
    const words = draft.merchant.split(/\s+/).filter(Boolean);
    if (words.length > 10 && chosen.value >= 200) continue;
    draft.merchant = clipBackground(draft.merchant);
    const type: TxnType = draft.incoming ? 'income' : 'expense';
    rows.push({
      merchant: draft.merchant,
      amount: chosen.value,
      type,
      date: draft.date,
      time: draft.time,
      method: draft.method,
      currency: chosen.currency,
    });
  }
  return rows.length >= 2 ? rows : null;
}

/**
 * A second figure printed under the same merchant (Wise shows the fee, or the
 * other currency, on the next line) is not a second payment. Keeps the larger
 * same-currency amount, which is what left the account.
 */
export function collapseFeeTwins(items: ExtractedTxn[]): ExtractedTxn[] {
  const out: ExtractedTxn[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (prev && feeTwin(prev, item)) {
      if (item.amount > prev.amount) out[out.length - 1] = { ...prev, amount: item.amount };
      continue;
    }
    out.push(item);
  }
  return out;
}

function joinName(left: string, right: string): string {
  return `${left} ${right}`.replace(/\s+/g, ' ').trim();
}

function isNameContinuation(label: string): boolean {
  const text = label.trim();
  if (/^(pte\.?\s*ltd\.?|sdn\.?\s*bhd\.?|co\.?,?\s*ltd\.?|berhad|bhd\.?)$/i.test(text)) return true;
  return /^restaurant\b/i.test(text) && text.length < 40;
}

function isWrappedWord(label: string): boolean {
  return /^[A-Z][A-Z0-9.&'/|-]{0,14}$/.test(label.trim());
}

function continuesOpen(label: string): boolean {
  if (!label) return true;
  return isMethod(label) || isNameContinuation(label) || isWrappedWord(label);
}

function pairsWith(open: Draft, money: Money): boolean {
  const same = open.amounts.filter((amount) => amount.currency === money.currency);
  if (!same.length) return false;
  const base = same[same.length - 1].value;
  const hi = Math.max(base, money.value);
  const lo = Math.min(base, money.value);
  const gap = hi - lo;
  return gap >= 0.005 && gap <= 1 && gap / hi <= 0.03;
}

function clipBackground(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length <= 8) return name;
  const tail = name.match(/(?:Receive from|Transfer to)\s+[A-Z][A-Z .'-]{2,}$|(?:[A-Z][A-Z0-9&.'/-]{2,}\s+){0,3}[A-Z][A-Z0-9&.'/-]{2,}\s*$/);
  return tail ? tail[0].trim() : words.slice(-3).join(' ');
}

function lastWord(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

function tidyMerchant(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0].length > 1 && parts[1].length > 1 && nearDuplicate(parts[0], parts[1])) parts.shift();
  const kept: string[] = [];
  for (const part of parts) {
    const prev = kept[kept.length - 1];
    // "BreadTalk BreadTalk" is the same word read twice. "GO GO" is the real name.
    if (prev && prev.length > 4 && prev.toLowerCase() === part.toLowerCase()) continue;
    kept.push(part);
  }
  return kept.join(' ');
}

function nearDuplicate(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (Math.abs(left.length - right.length) > 2) return false;
  const rows = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i++) rows[i][0] = i;
  for (let j = 0; j <= right.length; j++) rows[0][j] = j;
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  const distance = rows[left.length][right.length];
  return distance > 0 && distance <= 2;
}

function feeTwin(a: ExtractedTxn, b: ExtractedTxn): boolean {
  if (a.type !== b.type) return false;
  if (a.currency !== b.currency) return false;
  if (normMerchant(a.merchant) !== normMerchant(b.merchant)) return false;
  if (a.time && b.time && a.time !== b.time) return false;
  if (a.date && b.date && a.date !== b.date) return false;
  const hi = Math.max(a.amount, b.amount);
  const lo = Math.min(a.amount, b.amount);
  const gap = hi - lo;
  if (gap < 0.005 || gap > 1) return false;
  return gap / hi <= 0.03;
}

function normMerchant(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

function accountCurrency(drafts: Draft[]): string {
  const counts = new Map<string, number>();
  for (const draft of drafts) {
    const codes = [...new Set(draft.amounts.map((a) => a.currency))];
    for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best = 'MYR';
  let n = 0;
  for (const [code, count] of counts) {
    if (count > n) {
      best = code;
      n = count;
    }
  }
  return best;
}

function chooseAmount(amounts: Money[], account: string): Money {
  if (amounts.length === 1) return amounts[0];
  const currencies = new Set(amounts.map((a) => a.currency));
  if (currencies.size > 1) {
    const inAccount = amounts.filter((a) => a.currency === account);
    if (inAccount.length) return inAccount[inAccount.length - 1];
  }
  return amounts.reduce((hi, a) => (a.value > hi.value ? a : hi));
}

function splitAmounts(line: string): { amounts: Money[]; rest: string } {
  const amounts: Money[] = [];
  const rest = line.replace(AMOUNT_RE, (full, signA, ccyA, signB, whole, frac, ccyB) => {
    const sign = signA || signB || '';
    const rawCcy = String(ccyB || ccyA || '');
    const currency = normalizeCurrency(rawCcy || undefined);
    const value = Number(`${whole.replace(/,/g, '')}.${frac}`);
    if (!Number.isFinite(value)) return full;
    amounts.push({ value, currency, incoming: sign === '+' });
    return ' ';
  });
  return { amounts, rest: rest.replace(/\s+/g, ' ').trim() };
}

function parseTimestamp(label: string, year: number): { date: string; time: string } | null {
  const m = label.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  const date = toIso(Number(m[1]), m[2], year);
  const time = toClock(Number(m[3]), Number(m[4]), m[5]);
  if (!date || !time) return null;
  return { date, time };
}

function parseDateHeader(label: string, year: number): string | null {
  const iso = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return validIso(date) ? date : null;
  }
  const m = label.match(/^(\d{1,2})\s+([A-Za-z]+)\.?(?:\s+(\d{2,4}))?$/);
  if (!m) return null;
  const y = m[3] ? expandYear(Number(m[3])) : year;
  return toIso(Number(m[1]), m[2], y);
}

function toIso(day: number, monthName: string, year: number): string | null {
  const month = MONTHS[monthName.toLowerCase().replace(/\.$/, '')];
  if (month == null || day < 1 || day > 31) return null;
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const iso = `${year}-${mm}-${dd}`;
  return validIso(iso) ? iso : null;
}

function toClock(hour: number, minute: number, ampm?: string): string | null {
  if (minute > 59 || hour < 0) return null;
  let h = hour;
  if (ampm) {
    const upper = ampm.toUpperCase();
    if (h > 12) return null;
    if (upper === 'PM' && h < 12) h += 12;
    if (upper === 'AM' && h === 12) h = 0;
  }
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function expandYear(year: number): number {
  if (year < 100) return 2000 + year;
  return year;
}

function validIso(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function yearFromRange(text: string): number | null {
  const m = text.match(
    /(\d{1,2})\s+[A-Za-z]+\.?\s+(\d{2,4})\s*[-–—]\s*(\d{1,2})\s+[A-Za-z]+\.?\s+(\d{2,4})/
  );
  if (!m) return null;
  return expandYear(Number(m[2]));
}

function isRangeLine(label: string): boolean {
  return yearFromRange(label) != null && /[-–—]/.test(label);
}

/**
 * ML Kit sometimes drops the decimal in the second currency ("8.49 SGD" becomes "849 SGD").
 * That figure is not an amount until the dot is put back, and only when it then sits in a
 * plausible range next to the other currency on the same payment.
 */
function restoreCompanionDecimal(line: string, open: Draft | null): string {
  if (!open?.amounts.length) return line;
  const flat = line.replace(/\s+/g, ' ').trim();
  const match = flat.match(new RegExp(`^(${[...METHODS].join('|')})\\s+(\\d{3,})\\s+(${CCY})$`, 'i'));
  if (!match) return line;
  const digits = match[2];
  const restored = Number(`${digits.slice(0, -2) || '0'}.${digits.slice(-2)}`);
  const code = normalizeCurrency(match[3]);
  const other = [...open.amounts].reverse().find((amount) => amount.currency !== code);
  if (!other || !Number.isFinite(restored) || restored <= 0) return line;
  const ratio = restored / other.value;
  if (ratio < 0.05 || ratio > 3) return line;
  return `${match[1]} ${restored.toFixed(2)} ${match[3]}`;
}

function isMethod(label: string): boolean {
  return METHODS.has(label.trim().toLowerCase());
}

function isNoise(line: string): boolean {
  if (/^[A-Z]$/.test(line)) return true;
  if (/^\d{1,2}:\d{2}$/.test(line)) return true;
  if (/^(activity|transactions?|messages?(?:\s*\(\d+\))?|include hidden|search|filter)$/i.test(line)) return true;
  if (/^(opening|closing|available)?\s*balance\b/i.test(line)) return true;
  if (/^(subtotal|grand total|total)\b/i.test(line)) return true;
  if (/^[+O]?\d*\s*points?$/i.test(line)) return true;
  return false;
}
