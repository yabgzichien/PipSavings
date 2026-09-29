import { receiptSubtotal, type ScannedReceipt } from '../parseReceipt';
import { computeSplit } from '../split';
import type { ExtractedTxn, SplitDraft } from '../types';

export type ChatScanPerson = { id: string; name: string };

export function parseChatScanCaption(
  utterance: string,
  people: ChatScanPerson[],
  lookAtFiles = '',
): { remark: string | null; personIds: string[] } {
  let text = utterance.trim();
  if (!text) return { remark: null, personIds: [] };
  if (lookAtFiles && text.toLowerCase() === lookAtFiles.trim().toLowerCase()) {
    return { remark: null, personIds: [] };
  }

  const splitMatch = text.match(/\bsplit(?:\s+(?:it|this|the\s+bill|equally|evenly))?\s+with\s+([^.,;]+)/i)
    ?? text.match(/(?:和|跟)([^，,。；;]+)分账?/);
  const splitClause = splitMatch?.[1] ?? '';
  if (splitMatch && splitMatch.index !== undefined) {
    text = `${text.slice(0, splitMatch.index)} ${text.slice(splitMatch.index + splitMatch[0].length)}`;
  }

  const personIds = matchPeople(splitClause, people);

  if (lookAtFiles) {
    text = text.replace(new RegExp(escapeRegExp(lookAtFiles), 'ig'), ' ');
  }
  text = text
    .replace(/help\s+me\s+record\s+(?:all\s+of\s+)?these(?:\s+transactions)?/ig, ' ')
    .replace(/record\s+(?:all\s+of\s+)?these(?:\s+transactions)?/ig, ' ')
    .replace(/these\s+are\s+\w+\s+receipts/ig, ' ')
    .replace(/帮我记(?:录)?(?:下|一下)?(?:这些)?(?:交易|账单|账)?/g, ' ')
    .replace(/请查看这些附件。?/g, ' ')
    .replace(/[\s.,;:]+/g, ' ')
    .trim();

  return { remark: text || null, personIds };
}

export function txnFromScannedReceipt(receipt: ScannedReceipt, today: string): ExtractedTxn {
  const amount = receipt.total && receipt.total > 0 ? receipt.total : receiptSubtotal(receipt);
  return {
    merchant: (receipt.merchant ?? '').trim() || 'Receipt',
    amount,
    type: 'expense',
    date: today,
    method: null,
    currency: receipt.currency,
  };
}

export function evenSplitDraft(gross: number, personIds: string[]): SplitDraft | null {
  if (personIds.length === 0 || !(gross > 0)) return null;
  const result = computeSplit({
    gross,
    participants: personIds.map((personId) => ({ personId })),
    method: 'equal',
    includeSelf: true,
  });
  return {
    gross,
    ownShare: result.ownShare,
    method: 'equal',
    shares: result.shares.filter((share) => share.owed > 0),
  };
}

export function applyChatScanPrefill(
  rows: ExtractedTxn[],
  utterance: string,
  people: ChatScanPerson[],
  lookAtFiles = '',
): { items: ExtractedTxn[]; splitDrafts: (SplitDraft | null)[] } {
  const { remark, personIds } = parseChatScanCaption(utterance, people, lookAtFiles);
  const items = rows.map((row) => (remark ? { ...row, remark } : row));
  const splitDrafts = items.map((row) => (
    row.type === 'expense' ? evenSplitDraft(row.amount, personIds) : null
  ));
  return { items, splitDrafts };
}

function matchPeople(clause: string, people: ChatScanPerson[]): string[] {
  if (!clause.trim()) return [];
  const haystack = clause.toLowerCase();
  const ranked = [...people].sort((a, b) => b.name.length - a.name.length);
  const hits: { id: string; at: number }[] = [];
  for (const person of ranked) {
    const name = person.name.trim();
    if (!name) continue;
    const at = haystack.indexOf(name.toLowerCase());
    if (at >= 0 && !hits.some((hit) => hit.id === person.id)) hits.push({ id: person.id, at });
  }
  return hits.sort((a, b) => a.at - b.at).map((hit) => hit.id);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
