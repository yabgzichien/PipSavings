// src/lib/receiptGenerator.ts
// Deterministic receipt generator for Pip Finance.
// If specific line items are not present, it only uses the bill's category (or merchant/remark),
// with 100% deterministic local math and NO made-up items or LLM routing.
// Pure, deterministic, and unit-tested: no platform or database dependencies.

import { fmtMoney } from './format';
import { shortDate } from './dates';
import type { SplitWorkings } from './splitMessage';
import {
  SPACE_MONO_GOOGLE_FONTS_LINK,
  SPACE_MONO_FONT_FACE_CSS,
  RECEIPT_FONT_FAMILY,
} from './receiptFont';

export interface GeneratedReceiptItem {
  name: string;
  qty: number;
  amount: number;
  note?: string;
  workings?: string;
  surchargeTag?: string;
}

export interface GeneratedReceipt {
  receiptNo: string;
  merchant: string;
  date: string | null;
  personName: string;
  currency: string;
  items: GeneratedReceiptItem[];
  subtotal: number;
  serviceChargePct: number;
  serviceCharge: number;
  taxPct: number;
  tax: number;
  discount: number | null;
  total: number;
  isZh: boolean;
}

export interface ReceiptGenInput {
  merchant: string;
  total: number;
  currency?: string;
  personName?: string;
  billDate?: string | null;
  seedId?: string;
  remark?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  items?: { name: string; qty?: number; amount: number; note?: string; workings?: string; surchargeTag?: string }[];
  workings?: Partial<SplitWorkings> | null;
  serviceChargePct?: number | null;
  taxPct?: number | null;
  discount?: number | null;
  gross?: number | null;
  owed?: number | null;
  paid?: number | null;
  splitMethod?: string | null;
  participantCount?: number | null;
  workingsCalculation?: string | null;
  isZh?: boolean;
}

/**
 * Formats surcharge, tax, and discount tag.
 * Only shown when tax, service charge, or discount is present.
 * If only one is applicable, it only mentions that one (e.g. if only tax is applicable,
 * it does not mention service charge or discount).
 */
export function formatSurchargeTag(opts: {
  serviceChargePct?: number | null;
  taxPct?: number | null;
  discount?: number | null;
  isZh?: boolean;
}): string | undefined {
  const { serviceChargePct, taxPct, discount, isZh = false } = opts;
  const parts: string[] = [];

  if (serviceChargePct && serviceChargePct > 0) {
    parts.push(isZh ? `${serviceChargePct}% 服务费` : `${serviceChargePct}% svc`);
  }
  if (taxPct && taxPct > 0) {
    parts.push(isZh ? `${taxPct}% SST` : `${taxPct}% SST`);
  }
  if (discount && discount > 0) {
    parts.push(isZh ? '折扣' : 'discount');
  }

  if (parts.length === 0) return undefined;
  return isZh ? `(含 ${parts.join(' + ')})` : `(incl. ${parts.join(' + ')})`;
}

export interface SplitWorkingsParams {
  gross: number;
  owed: number;
  outstanding: number;
  paid?: number;
  currency: string;
  splitMethod?: string | null;
  participantCount?: number | null;
  isZh?: boolean;
}

/**
 * Formats deterministic workings calculation for a split bill item.
 * e.g. "Bill RM 30.00 ÷ 2 = RM 15.00"
 */
export function formatWorkingsCalculation(opts: SplitWorkingsParams): string {
  const { gross, owed, outstanding, paid = 0, currency, participantCount, isZh } = opts;
  const money = (n: number) => `${currency} ${n.toFixed(2)}`;

  let base = '';
  const count = participantCount && participantCount >= 2
    ? participantCount
    : Math.round(gross / (owed || outstanding || 1));

  if (count >= 2 && Math.abs(gross / count - owed) <= 0.05) {
    base = isZh
      ? `账单 ${money(gross)} ÷ ${count} 人 = ${money(owed)}`
      : `Bill ${money(gross)} ÷ ${count} = ${money(owed)}`;
  } else {
    const pct = Math.round((owed / gross) * 100);
    base = isZh
      ? `账单 ${money(gross)} · 应付 ${money(owed)} (${pct}%)`
      : `Bill ${money(gross)} · Share: ${money(owed)} (${pct}%)`;
  }

  if (paid > 0 && outstanding < owed) {
    const payStr = isZh
      ? `（已付 ${money(paid)}，待还 ${money(outstanding)}）`
      : ` (Paid: ${money(paid)}, Balance: ${money(outstanding)})`;
    return base + payStr;
  }

  return base;
}

/** Stable integer hash from a string seed. */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Generates a deterministic receipt.
 * If line items are not specified, it only mentions the category (e.g. "Food"),
 * without inventing any fake menu items.
 */
export function generateDeterministicReceipt(input: ReceiptGenInput): GeneratedReceipt {
  const {
    merchant,
    total,
    currency = 'MYR',
    personName = 'Friend',
    billDate = null,
    seedId = 'seed',
    remark = null,
    categoryId = null,
    categoryName = null,
    items: explicitItems,
    workings,
    gross,
    owed,
    paid,
    splitMethod,
    participantCount,
    workingsCalculation,
    isZh = false,
  } = input;

  const totalCents = toCents(total);
  const seed = hashString(`${seedId}:${merchant}:${totalCents}`);

  // Surcharges from workings or direct props if provided
  let svcPct = input.serviceChargePct ?? workings?.serviceChargePct ?? 0;
  let taxPct = input.taxPct ?? workings?.taxPct ?? 0;
  const discountAmount = input.discount ?? workings?.discount ?? null;

  // Workings calculation (formatted in grey text on canvas)
  let workingsText: string | undefined = undefined;
  if (workingsCalculation && workingsCalculation.trim().length > 0) {
    workingsText = workingsCalculation.trim();
  } else if (gross && gross > total) {
    const calc = formatWorkingsCalculation({
      gross,
      owed: owed ?? total,
      outstanding: total,
      paid: paid ?? 0,
      currency,
      splitMethod,
      participantCount,
      isZh,
    });
    if (calc) workingsText = calc;
  }

  // Surcharge & discount tag: ONLY show if tax, service charge, or discount is applicable.
  // If only one is applicable, only mention that one (e.g. if only tax, do not mention svc or discount).
  const surchargeTag = formatSurchargeTag({
    serviceChargePct: svcPct,
    taxPct: taxPct,
    discount: discountAmount,
    isZh,
  });

  // Plain-text note fallback combining workings and tag if both exist
  const noteParts = [workingsText, surchargeTag].filter(Boolean);
  const noteText = noteParts.length > 0 ? noteParts.join('  ') : undefined;

  let items: GeneratedReceiptItem[] = [];

  if (explicitItems && explicitItems.length > 0) {
    // Use real items when provided
    items = explicitItems.map((it) => {
      const itWorkings = (it as any).workings ?? workingsText;
      const itTag = (it as any).surchargeTag ?? surchargeTag;
      const itNote = it.note ?? [itWorkings, itTag].filter(Boolean).join('  ') ?? undefined;
      return {
        name: it.name,
        qty: it.qty ?? 1,
        amount: it.amount,
        workings: itWorkings,
        surchargeTag: itTag,
        note: itNote,
      };
    });
  } else {
    // If no items specified, only mention the category (or merchant/remark)
    // Never make up fake food/dishes!
    const itemName =
      categoryName?.trim() ||
      (categoryId && categoryId.trim()) ||
      (merchant && merchant !== 'A shared bill' ? merchant.trim() : null) ||
      (remark && remark.trim()) ||
      (isZh ? '消费支出' : 'Expense');

    items = [
      {
        name: itemName,
        qty: 1,
        amount: total,
        workings: workingsText,
        surchargeTag,
        note: noteText,
      },
    ];
  }

  // Pre-tax base, service charge, and SST
  let baseCents = totalCents;
  let serviceCents = 0;
  let taxCents = 0;

  if (svcPct > 0 || taxPct > 0) {
    const compoundMultiplier = (1 + svcPct / 100) * (1 + taxPct / 100);
    baseCents = Math.round(totalCents / compoundMultiplier);
    serviceCents = Math.round((baseCents * svcPct) / 100);
    taxCents = Math.max(0, totalCents - baseCents - serviceCents);
  }

  const receiptNum = `PIP-${(seed % 90000) + 10000}`;

  return {
    receiptNo: receiptNum,
    merchant,
    date: billDate,
    personName,
    currency,
    items,
    subtotal: fromCents(baseCents),
    serviceChargePct: svcPct,
    serviceCharge: fromCents(serviceCents),
    taxPct,
    tax: fromCents(taxCents),
    discount: discountAmount,
    total,
    isZh,
  };
}

/* --- Group split receipt -------------------------------------------------
 *
 * One receipt for the whole table, for posting once to a group chat instead of sending each
 * friend their own. Sits alongside the per-person receipts above rather than replacing them:
 * chasing one friend privately and showing the whole table how a bill divided are different
 * jobs.
 */

/** One person's portion, as `explodeItemized` produces it plus a display name. */
export interface GroupSplitPersonInput {
  personId: string;
  name: string;
  items: { label: string; amount: number; sharedBy: number }[];
  itemsSubtotal: number;
  surcharge: number;
  total: number;
}

export interface GroupSplitReceiptInput {
  merchant: string;
  billTotal: number;
  people: GroupSplitPersonInput[];
  currency?: string;
  billDate?: string | null;
  categoryName?: string | null;
  seedId?: string;
  isZh?: boolean;
  /** Names each person's extras row; defaults to service charge & SST. */
  surchargeLabel?: string;
}

export interface GroupSplitReceiptPerson {
  personId: string;
  name: string;
  items: GeneratedReceiptItem[];
  total: number;
}

export interface GroupSplitReceipt {
  receiptNo: string;
  merchant: string;
  date: string | null;
  currency: string;
  categoryName: string | null;
  people: GroupSplitReceiptPerson[];
  billTotal: number;
  isZh: boolean;
}

/**
 * Builds the group receipt. Every person's surcharge share becomes its own printed row, so
 * each section's rows add up to that person's total and the sections add up to the bill — the
 * arithmetic is checkable by anyone at the table, which is the point of showing it to all of
 * them at once.
 */
export function generateGroupSplitReceipt(input: GroupSplitReceiptInput): GroupSplitReceipt {
  const {
    merchant,
    billTotal,
    people,
    currency = 'MYR',
    billDate = null,
    categoryName = null,
    seedId = 'group',
    isZh = false,
    surchargeLabel,
  } = input;

  const seed = hashString(`${seedId}:${merchant}:${toCents(billTotal)}:${people.length}`);

  return {
    receiptNo: `PIP-${(seed % 90000) + 10000}`,
    merchant,
    date: billDate,
    currency,
    categoryName,
    billTotal,
    isZh,
    people: people.map((person) => {
      const items: GeneratedReceiptItem[] = person.items.map((it) => ({
        name: it.label,
        qty: 1,
        amount: it.amount,
        // Only shared lines need explaining; a dish someone ate alone speaks for itself.
        workings:
          it.sharedBy > 1
            ? isZh
              ? `${it.sharedBy} 人均摊`
              : `shared ÷ ${it.sharedBy}`
            : undefined,
      }));

      // The surcharge rides on what each person ordered, so it is shown as their own row
      // rather than a single table-wide line nobody can attribute.
      if (toCents(person.surcharge) !== 0) {
        items.push({
          name: surchargeLabel ?? (isZh ? '服务费与销售税' : 'Service charge & SST'),
          qty: 1,
          amount: person.surcharge,
        });
      }

      return { personId: person.personId, name: person.name, items, total: person.total };
    }),
  };
}

/** The plain-text version, for pasting into the chat beside the image. */
export function formatGroupSplitReceiptMessage(receipt: GroupSplitReceipt): string {
  const { billTotal, currency, date, isZh, merchant, people, receiptNo } = receipt;
  const lines: string[] = [];

  lines.push(isZh ? '🧾 分摊小票' : '🧾 SPLIT RECEIPT');
  lines.push(merchant);
  const when = shortDate(date);
  if (when) lines.push(when);
  lines.push(isZh ? `账单编号：#${receiptNo}` : `RECEIPT NO: #${receiptNo}`);
  lines.push('');

  for (const person of people) {
    lines.push(`${person.name}: ${fmtMoney(person.total, currency)}`);
    for (const item of person.items) {
      const suffix = item.workings ? `  (${item.workings})` : '';
      lines.push(`  • ${item.name} ${fmtMoney(item.amount, currency)}${suffix}`);
    }
    lines.push('');
  }

  lines.push(`${isZh ? '账单合计：' : 'BILL TOTAL: '}${fmtMoney(billTotal, currency)}`);
  return lines.join('\n');
}

/**
 * Adapts a group receipt onto the canvas renderer's multi-section layout: one section per
 * person instead of one per bill. The three optional label fields on `ReceiptCanvasInput` are
 * what make the sections read as people; everything else is the existing renderer untouched.
 */
export function groupReceiptCanvasInput(
  receipt: GroupSplitReceipt,
  key = 'group-split'
): ReceiptCanvasInput {
  return {
    key,
    currency: receipt.currency,
    // The whole table is the audience, so there is no single person it is billed to.
    personName: receipt.isZh ? '全体' : 'The table',
    total: receipt.billTotal,
    isZh: receipt.isZh,
    merchantLabel: receipt.merchant,
    totalLabel: receipt.isZh ? '账单合计' : 'BILL TOTAL',
    breakdownLabel: receipt.isZh ? '谁点了什么' : 'WHO ORDERED WHAT',
    // Name only: the canvas prints each section's own "Bill Share" line, so repeating the
    // amount in the heading showed every total twice.
    sectionLabels: receipt.people.map((p) => p.name),
    receipts: receipt.people.map((p) => ({
      receiptNo: receipt.receiptNo,
      merchant: receipt.merchant,
      date: receipt.date,
      personName: p.name,
      currency: receipt.currency,
      items: p.items,
      // The surcharge is already a printed row inside `items`, so a second set of surcharge
      // lines per section would double-count it on the page.
      subtotal: p.total,
      serviceChargePct: 0,
      serviceCharge: 0,
      taxPct: 0,
      tax: 0,
      discount: null,
      total: p.total,
      isZh: receipt.isZh,
    })),
  };
}

/**
 * Formats a single bill's GeneratedReceipt into an authentic text receipt.
 */
export function formatReceiptMessage(receipt: GeneratedReceipt): string {
  const { currency, date, isZh, items, merchant, personName, receiptNo, serviceCharge, serviceChargePct, subtotal, tax, taxPct, total } =
    receipt;
  const when = shortDate(date);

  const lines: string[] = [];

  // Receipt Header
  lines.push(isZh ? '🧾 分摊小票' : '🧾 SPLIT RECEIPT');
  lines.push('──────────────────────────────');
  lines.push(isZh ? `账单编号：  #${receiptNo}` : `RECEIPT NO: #${receiptNo}`);
  if (when) {
    lines.push(isZh ? `消费日期：  ${when}` : `DATE:       ${when}`);
  }
  lines.push(isZh ? `消费商家：  ${merchant}` : `MERCHANT:   ${merchant}`);
  lines.push(isZh ? `付款人：    ${personName}` : `BILLED TO:  ${personName}`);
  lines.push('──────────────────────────────');

  // Items List
  lines.push(isZh ? '消费明细：' : 'ITEMS:');
  for (const item of items) {
    lines.push(`• ${item.name}: ${fmtMoney(item.amount, currency)}`);
    if (item.workings && item.surchargeTag) {
      lines.push(`  ${item.workings}  ${item.surchargeTag}`);
    } else if (item.workings) {
      lines.push(`  ${item.workings}`);
    } else if (item.surchargeTag) {
      lines.push(`  ${item.surchargeTag}`);
    } else if (item.note) {
      lines.push(`  ${item.note}`);
    }
  }

  // Surcharges & Breakdown
  if (serviceChargePct > 0 || taxPct > 0 || (receipt.discount != null && receipt.discount > 0)) {
    lines.push('──────────────────────────────');
    const colon = isZh ? '：' : ': ';
    lines.push(
      `${isZh ? '税前小计' : 'Subtotal'}${colon}${fmtMoney(subtotal, currency)}`
    );
    if (serviceChargePct > 0) {
      lines.push(
        `${isZh ? `服务费 (${serviceChargePct}%)` : `Service Charge (${serviceChargePct}%)`}${colon}${fmtMoney(serviceCharge, currency)}`
      );
    }
    if (taxPct > 0) {
      lines.push(
        `${isZh ? `销售税 SST (${taxPct}%)` : `SST (${taxPct}%)`}${colon}${fmtMoney(tax, currency)}`
      );
    }
    if (receipt.discount != null && receipt.discount > 0) {
      lines.push(
        `${isZh ? '折扣' : 'Discount'}${colon}-${fmtMoney(receipt.discount, currency)}`
      );
    }
  }

  // Total Due
  lines.push('──────────────────────────────');
  lines.push(`${isZh ? '应付合计：' : 'TOTAL OWED: '}${fmtMoney(total, currency)}`);

  return lines.join('\n');
}

/**
 * Formats multiple bills into a consolidated Statement Receipt.
 */
export function formatMultiBillStatement(
  receipts: GeneratedReceipt[],
  opts: {
    total: number;
    currency: string;
    personName: string;
    isZh: boolean;
  }
): string {
  const { currency, isZh, personName, total } = opts;
  const lines: string[] = [];

  const n = receipts.length;
  lines.push(isZh ? '🧾 账单对账明细' : '🧾 SPLIT STATEMENT');
  lines.push('──────────────────────────────');
  lines.push(isZh ? `对账对象：  ${personName}` : `BILLED TO:  ${personName}`);
  lines.push(
    isZh
      ? `待结账单：  共 ${n} 笔`
      : `OPEN BILLS: ${n} ${n === 1 ? 'bill' : 'bills'}`
  );
  lines.push('──────────────────────────────');
  lines.push(isZh ? '账单与消费明细：' : 'BILLS & ITEMIZED BREAKDOWN:');
  lines.push('');

  receipts.forEach((r, idx) => {
    const when = shortDate(r.date);
    const head = when ? `${r.merchant} (${when})` : r.merchant;
    lines.push(`${idx + 1}. ${head}`);
    for (const item of r.items) {
      lines.push(`   • ${item.name}: ${fmtMoney(item.amount, currency)}`);
      if (item.workings && item.surchargeTag) {
        lines.push(`     ${item.workings}  ${item.surchargeTag}`);
      } else if (item.workings) {
        lines.push(`     ${item.workings}`);
      } else if (item.surchargeTag) {
        lines.push(`     ${item.surchargeTag}`);
      } else if (item.note) {
        lines.push(`     ${item.note}`);
      }
    }
    lines.push(`   ${isZh ? '该单应付' : 'Bill share'}: ${fmtMoney(r.total, currency)}`);
    if (idx < receipts.length - 1) {
      lines.push('');
    }
  });

  lines.push('──────────────────────────────');
  lines.push(
    `${isZh ? '待结总额合计' : 'TOTAL OUTSTANDING'}: ${fmtMoney(total, currency)}`
  );

  return lines.join('\n');
}

export interface ReceiptCanvasInput {
  key: string;
  receipts: GeneratedReceipt[];
  currency: string;
  personName: string;
  total: number;
  isZh: boolean;
  /* The three fields below exist for the group split receipt, where the multi-section layout
   * means "one person each" rather than "one bill each". All optional: absent, the canvas
   * renders exactly as it always has. */
  /** Section headings, parallel to `receipts`. Replaces the "1. Merchant (date)" heading. */
  sectionLabels?: string[];
  /** Replaces "TOTAL OWED" on the final line. */
  totalLabel?: string;
  /** Replaces the "N Bills" merchant field when several sections share one merchant. */
  merchantLabel?: string;
  /** Replaces the "BILLS & CATEGORY BREAKDOWN" heading above the sections. */
  breakdownLabel?: string;
}

/**
 * Generates an HTML5 Canvas rendering script that paints a high-resolution,
 * publication-grade Pip receipt PNG image with Pip mascot, ticket notches,
 * itemized breakdown, and totals.
 * Omit QR codes, made-up items, viral sign-offs, and barcodes.
 */
export function generateReceiptCanvasHtml(
  input: ReceiptCanvasInput | ReceiptCanvasInput[]
): string {
  // This JSON is spliced into a <script> block, and merchant or friend names are user- and
  // OCR-supplied. `</script>` inside a string would close the block and run whatever follows,
  // so make `<` (and the two JS line separators JSON leaves raw) unreachable.
  const serialized = JSON.stringify(input)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  ${SPACE_MONO_GOOGLE_FONTS_LINK}
  <style>
    ${SPACE_MONO_FONT_FACE_CSS}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: transparent; margin: 0; padding: 0; overflow: hidden; font-family: ${RECEIPT_FONT_FAMILY}; }
    .preload-font {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    }
  </style>
</head>
<body>
  <span class="preload-font" style="font-family: 'Space Mono'; font-weight: 400;">0123456789RM</span>
  <span class="preload-font" style="font-family: 'Space Mono'; font-weight: 700;">0123456789RM</span>
  <canvas id="rc"></canvas>
  <script>
  (async function() {
    if (document.fonts) {
      try {
        await Promise.race([
          Promise.all([
            document.fonts.load('400 16px "Space Mono"'),
            document.fonts.load('700 16px "Space Mono"'),
            document.fonts.ready
          ]),
          new Promise(function(r) { setTimeout(r, 600); })
        ]);
      } catch (e) {}
    }

    const raw = ${serialized};
    const list = Array.isArray(raw) ? raw : [raw];
    const canvas = document.getElementById('rc');
    const ctx = canvas.getContext('2d');

    const W = 800;
    const padX = 50;
    const contentW = W - padX * 2;

    function monoFont(weight, size) {
      return weight + ' ' + size + 'px "Space Mono", "SF Mono", Monaco, "Courier New", Courier, monospace, -apple-system, sans-serif';
    }

    function roundRect(x, y, w, h, r) {
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        return;
      }
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function drawNerdMascot(mcx, mcy, scale) {
      ctx.save();
      ctx.translate(mcx, mcy);
      ctx.scale(scale, scale);
      ctx.translate(-50, -50);

      // 1. Shadow
      ctx.beginPath();
      ctx.ellipse(50, 92, 22, 4.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,40,28,0.12)';
      ctx.fill();

      // 2. Sprout (stem + 2 leaves)
      ctx.beginPath();
      ctx.moveTo(50, 26);
      ctx.bezierCurveTo(50, 18, 50, 14, 50, 12);
      ctx.strokeStyle = '#185e3e';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.save();
      ctx.translate(42, 15);
      ctx.rotate(-32 * Math.PI / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, 7.5, 4.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1c7a4e';
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(58, 13);
      ctx.rotate(28 * Math.PI / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8.5, 4.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#2aab68';
      ctx.fill();
      ctx.restore();

      // 3. Body (coin rim, bevel, face)
      ctx.beginPath();
      ctx.arc(50, 56, 33, 0, Math.PI * 2);
      ctx.fillStyle = '#F5B42A';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(50, 56, 26.6, 0, Math.PI * 2);
      ctx.fillStyle = '#FAC438';
      ctx.fill();
      ctx.strokeStyle = '#D99E18';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // Top highlight
      ctx.save();
      ctx.translate(35, 42);
      ctx.rotate(-26 * Math.PI / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8.5, 4.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.23)';
      ctx.fill();
      ctx.restore();

      // Blush cheeks
      ctx.beginPath();
      ctx.ellipse(32, 60.3, 5.3, 3.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(240, 120, 40, 0.35)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(68, 60.3, 5.3, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 4. Propeller Cap
      // Yellow crown (left-center)
      ctx.beginPath();
      ctx.moveTo(25, 38);
      ctx.lineTo(29, 27);
      ctx.bezierCurveTo(29.5, 21, 37, 17.5, 50, 17.5);
      ctx.lineTo(50, 38);
      ctx.closePath();
      ctx.fillStyle = '#F5C542';
      ctx.fill();

      // Red crown (right-center)
      ctx.beginPath();
      ctx.moveTo(75, 38);
      ctx.lineTo(71, 27);
      ctx.bezierCurveTo(70.5, 21, 63, 17.5, 50, 17.5);
      ctx.lineTo(50, 38);
      ctx.closePath();
      ctx.fillStyle = '#E8453C';
      ctx.fill();

      // Blue side trims
      ctx.beginPath();
      ctx.moveTo(25, 38);
      ctx.lineTo(29, 27);
      ctx.bezierCurveTo(29.5, 21, 33, 18.5, 36, 18.3);
      ctx.lineTo(32, 38);
      ctx.closePath();
      ctx.fillStyle = '#3F6FD1';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(75, 38);
      ctx.lineTo(71, 27);
      ctx.bezierCurveTo(70.5, 21, 67, 18.5, 64, 18.3);
      ctx.lineTo(68, 38);
      ctx.closePath();
      ctx.fillStyle = '#3F6FD1';
      ctx.fill();

      // Center seam line
      ctx.beginPath();
      ctx.moveTo(50, 17.5);
      ctx.lineTo(50, 38);
      ctx.strokeStyle = '#3F6FD1';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Brim shadow
      ctx.beginPath();
      ctx.ellipse(50, 40.5, 34, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,50,30,0.18)';
      ctx.fill();

      // Green brim
      ctx.beginPath();
      ctx.ellipse(50, 38, 36, 6.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#2E9E5B';
      ctx.fill();
      ctx.strokeStyle = '#1F7A44';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(50, 38, 29, 4.8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(31,122,68,0.45)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // 5. Nerd Face (eyes, smile, freckles)
      // Big nerd eyes
      ctx.fillStyle = '#7A4800';
      ctx.beginPath();
      ctx.arc(39, 55, 6.2, 0, Math.PI * 2);
      ctx.arc(61, 55, 6.2, 0, Math.PI * 2);
      ctx.fill();

      // White eye catchlights
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(41.3, 52.6, 1.8, 0, Math.PI * 2);
      ctx.arc(63.3, 52.6, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Smile mouth
      ctx.beginPath();
      ctx.moveTo(41, 65);
      ctx.quadraticCurveTo(50, 73, 59, 65);
      ctx.strokeStyle = '#7A4800';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Cheek freckles
      ctx.fillStyle = '#E8703A';
      ctx.beginPath();
      ctx.arc(30.5, 68, 1.3, 0, Math.PI * 2);
      ctx.arc(69.5, 68, 1.3, 0, Math.PI * 2);
      ctx.fill();

      // 6. Rainbow Lollipop
      // Stick
      ctx.beginPath();
      ctx.moveTo(83, 72);
      ctx.lineTo(75, 37);
      ctx.strokeStyle = '#FFF6E4';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(83, 72);
      ctx.lineTo(75, 37);
      ctx.strokeStyle = '#8A5A16';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Candy head (concentric rings)
      const lcx = 75;
      const lcy = 27;

      ctx.beginPath();
      ctx.arc(lcx, lcy, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#E8453C';
      ctx.fill();
      ctx.strokeStyle = '#4A3220';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(lcx, lcy, 10.4, 0, Math.PI * 2);
      ctx.fillStyle = '#F2954A';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(lcx, lcy, 7.8, 0, Math.PI * 2);
      ctx.fillStyle = '#F5D93A';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(lcx, lcy, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = '#4FAF6D';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(lcx, lcy, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#4A90D9';
      ctx.fill();

      // Gloss reflection on candy
      ctx.save();
      ctx.translate(69.5, 21);
      ctx.rotate(-25 * Math.PI / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 2.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      ctx.restore();

      // Glove / Hand fist holding the lollipop
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(77, 67.5, 12, 11, 5.2);
      } else {
        roundRect(77, 67.5, 12, 11, 5.2);
      }
      ctx.fillStyle = '#FFF6E4';
      ctx.fill();
      ctx.strokeStyle = '#8A5A16';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    for (let idx = 0; idx < list.length; idx++) {
      const data = list[idx];
      await new Promise(function(resolve) {
        const isSingle = data.receipts.length === 1;
        const single = isSingle ? data.receipts[0] : null;

        // Calculate required canvas height dynamically
        let H = 225; // header + metadata + ticket notches

        if (isSingle && single) {
          H += 38; // items header
          for (const it of single.items) {
            H += 32;
            if (it.note || it.workings || it.surchargeTag) H += 24;
          }
          if (single.serviceChargePct > 0 || single.taxPct > 0 || (single.discount != null && single.discount > 0)) {
            H += 50;
            if (single.serviceChargePct > 0) H += 24;
            if (single.taxPct > 0) H += 24;
            if (single.discount != null && single.discount > 0) H += 24;
          }
        } else {
          H += 38; // breakdown header
          for (const r of data.receipts) {
            H += 28; // bill title
            for (const it of r.items) {
              H += 26;
              if (it.note || it.workings || it.surchargeTag) H += 18;
            }
            H += 30; // bill share
          }
        }

        H += 85; // total owed (minimalist rules without box)
        H += 45; // bottom margin inside ticket
        H = Math.max(450, H);

        canvas.width = W;
        canvas.height = H;
        ctx.clearRect(0, 0, W, H);

        // Card background
        const cardX = 24;
        const cardY = 24;
        const cardW = W - 48;
        const cardH = H - 48;
        const cardR = 26;

        roundRect(cardX, cardY, cardW, cardH, cardR);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#D9E6DF';
        ctx.stroke();

        // Draw Nerd Mascot in top-right corner (compact scale)
        drawNerdMascot(708, 68, 0.58);

        // Minimalist Header: "SPLIT RECEIPT" / "SPLIT STATEMENT"
        let curY = 68;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#142B20';
        ctx.font = monoFont('bold', 22);
        const titleText = isSingle
          ? (data.isZh ? '分摊小票' : 'SPLIT RECEIPT')
          : (data.isZh ? '对账明细' : 'SPLIT STATEMENT');
        ctx.fillText(titleText, padX, curY);

        curY += 34;

        // Metadata Section (NO ENCLOSING BORDER / BOX)
        const colLeft = padX + 8;
        const colRight = W / 2 + 16;

        const recNo = isSingle && single ? '#' + single.receiptNo : '#' + (data.receipts[0]?.receiptNo ?? 'PIP');
        const recDate = isSingle && single ? (single.date ? single.date.slice(0, 10) : 'Today') : 'Today';
        const recMerch = data.merchantLabel || (isSingle && single ? single.merchant : (data.isZh ? '多笔账单' : data.receipts.length + ' Bills'));

        ctx.textAlign = 'left';
        ctx.font = monoFont('400', 11.5);
        ctx.fillStyle = '#788E83';
        ctx.fillText(data.isZh ? '账单编号' : 'RECEIPT NO.', colLeft, curY);
        ctx.fillText(data.isZh ? '日期' : 'DATE', colRight, curY);

        curY += 20;
        ctx.font = monoFont('bold', 14);
        ctx.fillStyle = '#142B20';
        ctx.fillText(recNo, colLeft, curY);
        ctx.fillText(recDate, colRight, curY);

        curY += 22;
        ctx.font = monoFont('400', 11.5);
        ctx.fillStyle = '#788E83';
        ctx.fillText(data.isZh ? '消费类别/商家' : 'CATEGORY / MERCHANT', colLeft, curY);
        ctx.fillText(data.isZh ? '付款人' : 'BILLED TO', colRight, curY);

        curY += 20;
        ctx.font = monoFont('bold', 14);
        ctx.fillStyle = '#142B20';
        ctx.fillText(recMerch.slice(0, 18), colLeft, curY);
        ctx.fillText(data.personName.slice(0, 16), colRight, curY);

        curY += 26;

        // Ticket notch cutouts & dashed tear-off line
        ctx.save();
        ctx.beginPath();
        ctx.arc(cardX, curY, 14, -Math.PI / 2, Math.PI / 2, false);
        ctx.fillStyle = '#F0F5F2';
        ctx.fill();
        ctx.strokeStyle = '#D9E6DF';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cardX + cardW, curY, 14, Math.PI / 2, -Math.PI / 2, false);
        ctx.fillStyle = '#F0F5F2';
        ctx.fill();
        ctx.strokeStyle = '#D9E6DF';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = '#CBDCD3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cardX + 22, curY);
        ctx.lineTo(cardX + cardW - 22, curY);
        ctx.stroke();
        ctx.restore();

        curY += 28;

        // Items Section
        if (isSingle && single) {
          ctx.textAlign = 'left';
          ctx.font = monoFont('bold', 12);
          ctx.fillStyle = '#788E83';
          ctx.fillText(data.isZh ? '消费类别/项目' : 'CATEGORY / ITEM', padX, curY);

          ctx.textAlign = 'right';
          ctx.fillText(data.isZh ? '金额 (' + data.currency + ')' : 'AMOUNT (' + data.currency + ')', W - padX, curY);

          curY += 14;
          ctx.strokeStyle = '#EAF0ED';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(padX, curY);
          ctx.lineTo(W - padX, curY);
          ctx.stroke();

          curY += 24;

          for (const item of single.items) {
            ctx.textAlign = 'left';
            ctx.font = monoFont('bold', 16);
            ctx.fillStyle = '#142B20';
            ctx.fillText(item.name, padX, curY);

            ctx.textAlign = 'right';
            ctx.fillText(data.currency + ' ' + item.amount.toFixed(2), W - padX, curY);

            const hasWorkings = !!item.workings;
            const hasTag = !!item.surchargeTag;

            if (hasWorkings || hasTag || item.note) {
              curY += 18;
              ctx.textAlign = 'left';
              ctx.font = monoFont('400', 12.5);

              if (hasWorkings && hasTag) {
                // Workings in GREY text
                ctx.fillStyle = '#788E83';
                ctx.fillText(item.workings, padX, curY);
                const wWidth = ctx.measureText(item.workings + '  ').width;
                const tagWidth = ctx.measureText(item.surchargeTag).width;

                if (padX + wWidth + tagWidth <= W - padX) {
                  // Surcharge/tax/discount tag in GREEN text
                  ctx.fillStyle = '#1C7A4E';
                  ctx.fillText(item.surchargeTag, padX + wWidth, curY);
                } else {
                  curY += 16;
                  ctx.fillStyle = '#1C7A4E';
                  ctx.fillText(item.surchargeTag, padX, curY);
                }
              } else if (hasWorkings) {
                // Only workings in GREY text
                ctx.fillStyle = '#788E83';
                ctx.fillText(item.workings, padX, curY);
              } else if (hasTag) {
                // Only surcharge tag in GREEN text
                ctx.fillStyle = '#1C7A4E';
                ctx.fillText(item.surchargeTag, padX, curY);
              } else if (item.note) {
                // Fallback note in GREY text
                ctx.fillStyle = '#788E83';
                ctx.fillText(item.note, padX, curY);
              }
            }

            curY += 30;
          }

          const hasSurcharges = single.serviceChargePct > 0 || single.taxPct > 0 || (single.discount != null && single.discount > 0);
          if (hasSurcharges) {
            curY += 4;
            ctx.strokeStyle = '#EAF0ED';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padX, curY);
            ctx.lineTo(W - padX, curY);
            ctx.stroke();
            curY += 22;

            ctx.font = monoFont('400', 13.5);
            ctx.fillStyle = '#596B61';

            ctx.textAlign = 'left';
            ctx.fillText(data.isZh ? '税前小计' : 'Subtotal', padX, curY);
            ctx.textAlign = 'right';
            ctx.fillText(data.currency + ' ' + single.subtotal.toFixed(2), W - padX, curY);
            curY += 24;

            if (single.serviceChargePct > 0) {
              ctx.textAlign = 'left';
              ctx.fillText((data.isZh ? '服务费 (' : 'Service Charge (') + single.serviceChargePct + '%)', padX, curY);
              ctx.textAlign = 'right';
              ctx.fillText(data.currency + ' ' + single.serviceCharge.toFixed(2), W - padX, curY);
              curY += 24;
            }

            if (single.taxPct > 0) {
              ctx.textAlign = 'left';
              ctx.fillText((data.isZh ? '销售税 SST (' : 'SST (') + single.taxPct + '%)', padX, curY);
              ctx.textAlign = 'right';
              ctx.fillText(data.currency + ' ' + single.tax.toFixed(2), W - padX, curY);
              curY += 24;
            }

            if (single.discount != null && single.discount > 0) {
              ctx.textAlign = 'left';
              ctx.fillText(data.isZh ? '折扣' : 'Discount', padX, curY);
              ctx.textAlign = 'right';
              ctx.fillText('-' + data.currency + ' ' + single.discount.toFixed(2), W - padX, curY);
              curY += 24;
            }
          }
        } else {
          ctx.textAlign = 'left';
          ctx.font = monoFont('bold', 12);
          ctx.fillStyle = '#788E83';
          ctx.fillText(data.breakdownLabel || (data.isZh ? '待结账单明细' : 'BILLS & CATEGORY BREAKDOWN'), padX, curY);
          curY += 14;
          ctx.strokeStyle = '#EAF0ED';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(padX, curY);
          ctx.lineTo(W - padX, curY);
          ctx.stroke();
          curY += 22;

          data.receipts.forEach((r, idx2) => {
            ctx.textAlign = 'left';
            ctx.font = monoFont('bold', 15);
            ctx.fillStyle = '#142B20';
            const dateStr = r.date ? ' (' + r.date.slice(0, 10) + ')' : '';
            ctx.fillText((data.sectionLabels && data.sectionLabels[idx2]) || ((idx2 + 1) + '. ' + r.merchant + dateStr), padX, curY);
            curY += 22;

            for (const it of r.items) {
              ctx.font = monoFont('400', 13.5);
              ctx.fillStyle = '#142B20';
              ctx.fillText('  • ' + it.name, padX, curY);
              ctx.textAlign = 'right';
              ctx.fillText(data.currency + ' ' + it.amount.toFixed(2), W - padX, curY);
              ctx.textAlign = 'left';

              const hasWorkings = !!it.workings;
              const hasTag = !!it.surchargeTag;

              if (hasWorkings || hasTag || it.note) {
                curY += 16;
                ctx.font = monoFont('400', 12);

                if (hasWorkings && hasTag) {
                  ctx.fillStyle = '#788E83';
                  ctx.fillText('    ' + it.workings, padX, curY);
                  const wWidth = ctx.measureText('    ' + it.workings + '  ').width;
                  const tagWidth = ctx.measureText(it.surchargeTag).width;

                  if (padX + wWidth + tagWidth <= W - padX) {
                    ctx.fillStyle = '#1C7A4E';
                    ctx.fillText(it.surchargeTag, padX + wWidth, curY);
                  } else {
                    curY += 15;
                    ctx.fillStyle = '#1C7A4E';
                    ctx.fillText('    ' + it.surchargeTag, padX, curY);
                  }
                } else if (hasWorkings) {
                  ctx.fillStyle = '#788E83';
                  ctx.fillText('    ' + it.workings, padX, curY);
                } else if (hasTag) {
                  ctx.fillStyle = '#1C7A4E';
                  ctx.fillText('    ' + it.surchargeTag, padX, curY);
                } else if (it.note) {
                  ctx.fillStyle = '#788E83';
                  ctx.fillText('    ' + it.note, padX, curY);
                }
              }
              curY += 24;
            }

            ctx.font = monoFont('bold', 13.5);
            ctx.fillStyle = '#185E3E';
            ctx.fillText('  ' + (data.isZh ? '该单应付' : 'Bill Share') + ':', padX, curY);
            ctx.textAlign = 'right';
            ctx.fillText(data.currency + ' ' + r.total.toFixed(2), W - padX, curY);
            ctx.textAlign = 'left';

            curY += 26;
          });
        }

        // Total Owed Section (NO BORDER BOX, CLEAN MINIMALIST TOTAL)
        curY += 8;
        ctx.strokeStyle = '#CBDCD3';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padX, curY);
        ctx.lineTo(W - padX, curY);
        ctx.stroke();

        curY += 34;
        ctx.textAlign = 'left';
        ctx.font = monoFont('bold', 18);
        ctx.fillStyle = '#142B20';
        ctx.fillText(data.totalLabel || (data.isZh ? '应付合计' : 'TOTAL OWED'), padX, curY);

        ctx.textAlign = 'right';
        ctx.font = monoFont('bold', 28);
        ctx.fillText(data.currency + ' ' + data.total.toFixed(2), W - padX, curY);

        curY += 18;
        ctx.beginPath();
        ctx.moveTo(padX, curY);
        ctx.lineTo(W - padX, curY);
        ctx.stroke();

        // Export PNG and message React Native
        const dataUrl = canvas.toDataURL('image/png');
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ key: data.key, dataUrl: dataUrl }));
        }
        resolve();
      });
    }
  })();
  </script>
</body>
</html>`;
}
