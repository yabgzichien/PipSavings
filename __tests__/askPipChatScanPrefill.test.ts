import {
  applyChatScanPrefill,
  evenSplitDraft,
  parseChatScanCaption,
  txnFromScannedReceipt,
} from '../src/lib/askPip/chatScanPrefill';
import type { ScannedReceipt } from '../src/lib/parseReceipt';
import type { ExtractedTxn } from '../src/lib/types';

const people = [
  { id: 'p-fyy', name: 'fyy' },
  { id: 'p-alex', name: 'Alex' },
];

const lookAtFiles = 'Look at the attached files.';

function receipt(over: Partial<ScannedReceipt> = {}): ScannedReceipt {
  return {
    merchant: 'Nando\'s',
    currency: 'MYR',
    items: [{ label: 'chicken', amount: 32, quantity: 1 }],
    subtotal: 32,
    serviceCharge: null,
    tax: 2,
    total: 34,
    discount: null,
    ...over,
  };
}

function item(over: Partial<ExtractedTxn> = {}): ExtractedTxn {
  return {
    merchant: 'Nando\'s',
    amount: 34,
    type: 'expense',
    date: '2026-09-21',
    method: null,
    currency: 'MYR',
    ...over,
  };
}

describe('parseChatScanCaption', () => {
  it('drops record-these boilerplate and leaves no remark', () => {
    expect(parseChatScanCaption('Help me record all of these transactions', people, lookAtFiles)).toEqual({
      remark: null,
      personIds: [],
    });
    expect(parseChatScanCaption(lookAtFiles, people, lookAtFiles)).toEqual({
      remark: null,
      personIds: [],
    });
  });

  it('picks known people from a split-with clause and leftover words as remark', () => {
    expect(
      parseChatScanCaption(
        'Help me record all of these transactions. Split with fyy. Client lunch',
        people,
        lookAtFiles,
      ),
    ).toEqual({
      remark: 'Client lunch',
      personIds: ['p-fyy'],
    });
    expect(parseChatScanCaption('client lunch, split with fyy and Alex', people, lookAtFiles)).toEqual({
      remark: 'client lunch',
      personIds: ['p-fyy', 'p-alex'],
    });
  });

  it('ignores names Pip does not know', () => {
    expect(parseChatScanCaption('split with nobodyihave', people, lookAtFiles)).toEqual({
      remark: null,
      personIds: [],
    });
  });
});

describe('txnFromScannedReceipt', () => {
  it('uses the charged total and today, not line-item labels as a remark', () => {
    expect(txnFromScannedReceipt(receipt(), '2026-09-21')).toEqual({
      merchant: 'Nando\'s',
      amount: 34,
      type: 'expense',
      date: '2026-09-21',
      method: null,
      currency: 'MYR',
    });
  });

  it('falls back to the items subtotal when the receipt printed no total', () => {
    expect(txnFromScannedReceipt(receipt({ total: null, merchant: null }), '2026-09-21').amount).toBe(32);
    expect(txnFromScannedReceipt(receipt({ total: null, merchant: null }), '2026-09-21').merchant).toBe('Receipt');
  });
});

describe('evenSplitDraft', () => {
  it('splits equally with the payer in the bill', () => {
    const draft = evenSplitDraft(100, ['p-fyy']);
    expect(draft).toEqual({
      gross: 100,
      ownShare: 50,
      method: 'equal',
      shares: [{ personId: 'p-fyy', owed: 50 }],
    });
  });
});

describe('applyChatScanPrefill', () => {
  it('copies remark and even split onto every expense row', () => {
    const rows = [item(), item({ merchant: 'Starbucks', amount: 18 })];
    const next = applyChatScanPrefill(
      rows,
      'record these, split with fyy, birthday dinner',
      people,
      lookAtFiles,
    );
    expect(next.items.map((row) => row.remark)).toEqual(['birthday dinner', 'birthday dinner']);
    expect(next.splitDrafts[0]).toMatchObject({ gross: 34, method: 'equal', shares: [{ personId: 'p-fyy', owed: 17 }] });
    expect(next.splitDrafts[1]).toMatchObject({ gross: 18, method: 'equal' });
  });

  it('does not split income and leaves rows alone when the caption is empty', () => {
    const income = item({ type: 'income', merchant: 'Refund' });
    const next = applyChatScanPrefill([income], '', people, lookAtFiles);
    expect(next.items[0].remark).toBeUndefined();
    expect(next.splitDrafts).toEqual([null]);
  });
});
