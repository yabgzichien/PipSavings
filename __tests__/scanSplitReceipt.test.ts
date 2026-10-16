import { buildScanSplitReceipt, extrasLabel } from '../src/lib/scanSplitReceipt';
import { SELF, toCents, type ReceiptLine, type Surcharges } from '../src/lib/split';

const names: Record<string, string> = { fyy: 'fyy', kee: 'keevan', [SELF]: 'You' };
const NONE: Surcharges = { serviceChargePct: 0, taxPct: 0, discount: null };

function build(lines: ReceiptLine[], surcharges: Surcharges, charged: number, participants = ['fyy', 'kee', SELF]) {
  return buildScanSplitReceipt({
    merchant: 'Mala Hotpot',
    currency: 'MYR',
    lines,
    surcharges,
    charged,
    participants,
    nameOf: (id) => names[id],
    billDate: '2026-10-14',
    isZh: false,
  });
}

const cents = (n: number) => toCents(n);

function expectTiesOut(receipt: ReturnType<typeof build>, charged: number) {
  for (const p of receipt.people) {
    expect(p.items.reduce((s, it) => s + cents(it.amount), 0)).toBe(cents(p.total));
  }
  expect(receipt.people.reduce((s, p) => s + cents(p.total), 0)).toBe(cents(charged));
  expect(receipt.billTotal).toBe(charged);
}

// The bill from the screenshot: a discount, plus a few sen the bank charged less.
const MALA: ReceiptLine[] = [
  { id: 'a', label: 'Mala Soup', amount: 32.45, assignedTo: ['fyy'] },
  { id: 'b', label: 'Rice', amount: 2, assignedTo: ['kee'] },
  { id: 'c', label: 'Rice', amount: 2, assignedTo: [] },
];
const DISCOUNTED: Surcharges = { serviceChargePct: 0, taxPct: 0, discount: { value: 1.82, unit: 'amount', timing: 'after' } };

it('every person adds up, and the people add up to what was charged', () => {
  const receipt = build(MALA, DISCOUNTED, 34.58);
  expectTiesOut(receipt, 34.58);
  expect(receipt.people.map((p) => p.name)).toEqual(['fyy', 'keevan', 'You']);
});

it('shows unclaimed items as shared across the whole bill', () => {
  const receipt = build(MALA, DISCOUNTED, 34.58);
  for (const p of receipt.people) {
    const rice = p.items.filter((it) => it.name === 'Rice' && it.workings === 'shared ÷ 3');
    expect(rice).toHaveLength(1);
  }
});

it('prints an extras row named after what the bill actually has', () => {
  const receipt = build(MALA, DISCOUNTED, 34.58);
  const fyy = receipt.people[0];
  expect(fyy.items.some((it) => it.name === 'Discount')).toBe(true);
  expect(fyy.items.some((it) => it.name === 'Service charge & SST')).toBe(false);
});

it('ties out with service charge and tax too', () => {
  const lines: ReceiptLine[] = [
    { id: 'a', label: 'Nasi Lemak', amount: 12.9, assignedTo: [SELF, 'fyy'] },
    { id: 'b', label: 'Teh Tarik', amount: 3.3, assignedTo: ['kee'] },
    { id: 'c', label: 'Roti', amount: 7.1, assignedTo: ['fyy', 'kee', SELF] },
  ];
  const s: Surcharges = { serviceChargePct: 10, taxPct: 6, discount: null };
  const receipt = build(lines, s, 27.17);
  expectTiesOut(receipt, 27.17);
  expect(receipt.people[0].items.find((it) => it.name === 'Nasi Lemak')?.workings).toBe('shared ÷ 2');
});

it('falls back to a merchant name when the scan found none', () => {
  const receipt = buildScanSplitReceipt({
    merchant: '  ',
    currency: 'MYR',
    lines: MALA,
    surcharges: NONE,
    charged: 36.45,
    participants: ['fyy', SELF],
    nameOf: (id) => names[id],
    billDate: '2026-10-14',
    isZh: false,
  });
  expect(receipt.merchant).toBe('Split bill');
  expectTiesOut(receipt, 36.45);
});

describe('extrasLabel', () => {
  it('names each kind of extra on the bill', () => {
    expect(extrasLabel({ serviceChargePct: 10, taxPct: 6, discount: null }, false)).toBe('Service charge & Tax');
    expect(extrasLabel(DISCOUNTED, false)).toBe('Discount');
    expect(extrasLabel(NONE, false)).toBe('Rounding adjustment');
    expect(extrasLabel({ serviceChargePct: 10, taxPct: 0, discount: null }, true)).toBe('服务费');
  });
});
