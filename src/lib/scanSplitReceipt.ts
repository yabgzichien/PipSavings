// src/lib/scanSplitReceipt.ts
// The group split receipt for a bill still on the scan screen, before it is saved: the same
// per-person layout the Saved screen sends, built from the live item assignments. Pure, so the
// one property that matters can be tested: every person's rows add up to what they owe, and the
// people add up to what the bank charged.
import { generateGroupSplitReceipt, type GroupSplitReceipt } from './receiptGenerator';
import { explodeItemized, type ReceiptLine, type Surcharges } from './split';

export interface ScanSplitReceiptInput {
  merchant: string | null;
  currency: string;
  /** Lines with "everyone" already expanded to the real participants. */
  lines: ReceiptLine[];
  surcharges: Surcharges;
  charged: number;
  /** Friends first, the payer last, exactly as `computeItemized` takes them. */
  participants: string[];
  nameOf: (id: string) => string;
  billDate: string;
  isZh: boolean;
}

/** What each person's extras row actually holds on this bill. */
export function extrasLabel(surcharges: Surcharges, isZh: boolean): string {
  const parts: string[] = [];
  if (surcharges.serviceChargePct > 0) parts.push(isZh ? '服务费' : 'Service charge');
  if (surcharges.taxPct > 0) parts.push(isZh ? '税费' : 'Tax');
  if (surcharges.discount && surcharges.discount.value > 0) parts.push(isZh ? '折扣' : 'Discount');
  // Nothing on top of the items, so whatever is left is the gap to what the bank charged.
  if (parts.length === 0) return isZh ? '尾差调整' : 'Rounding adjustment';
  return parts.join(isZh ? '、' : ' & ');
}

export function buildScanSplitReceipt(input: ScanSplitReceiptInput): GroupSplitReceipt {
  const { merchant, currency, lines, surcharges, charged, participants, nameOf, billDate, isZh } = input;
  const people = explodeItemized(lines, surcharges, charged, participants).map((p) => ({ ...p, name: nameOf(p.personId) }));
  return generateGroupSplitReceipt({
    merchant: merchant?.trim() || (isZh ? '分摊账单' : 'Split bill'),
    billTotal: charged,
    currency,
    billDate,
    people,
    seedId: 'scan',
    isZh,
    surchargeLabel: extrasLabel(surcharges, isZh),
  });
}
