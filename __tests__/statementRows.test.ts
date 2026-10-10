import { collapseFeeTwins, parseStatementRows } from '../src/lib/statementRows';
import { dedupeExtracted } from '../src/lib/longScan';
import type { ExtractedTxn } from '../src/lib/types';

const YEAR = { year: 2026 };

const WISE = `
Transactions
25 September
Q ME BUDGET STORE    3.90 SGD
3.95 SGD
IMAM BANANA LEAF RESTAURANT PTE. LTD.    3.50 SGD
Sent
24 September
ABANG GEMUK (40) PTE. LTD.    6.50 SGD
Sent
SMRT Buses / trains    1.88 SGD
Cafe Carrera Jewel    11.99 SGD
GO GO BEANZ    1.60 SGD
1.62 SGD
Sent
LIAO FAN HAWKER CHAN    6.50 SGD
6.58 SGD
Sent
23 September
Rasapura Masters    11.90 SGD
BreadTalk    6.90 SGD
Fong Yan Yan    27.07 MYR
8.49 SGD
Sent
Fong Yan Yan    12.40 MYR
3.89 SGD
Sent
FOMO PAY PTE. LTD.    2.50 SGD
SMRT Buses / trains    20.03 SGD
`;

const TNG = `
Activity
Transaction
05 Sep 26 - 04 Oct 26
25 Sep, 20:12    -RM15.41
HANDAL INDAH SDN. BHD.
Payment
25 Sep, 18:43
HANDAL INDAH SDN. BHD.
Payment
-RM15.41
23 Sep, 11:40    -RM4.80
HANDAL INDAH SDN. BHD.
Payment
23 Sep, 11:40    -RM3.50
Transfer to KEEVAN KRISHIN
Transfer to Wallet
25 Sep, 19:07    +RM12.00
Receive from ONG JIA YANG
Receive from Wallet
`;

function txn(over: Partial<ExtractedTxn>): ExtractedTxn {
  return {
    merchant: 'Shop',
    amount: 10,
    type: 'expense',
    date: '2026-09-25',
    method: null,
    currency: 'MYR',
    ...over,
  };
}

describe('parseStatementRows', () => {
  it('keeps one Wise row when the fee is printed under the amount', () => {
    const rows = parseStatementRows(WISE, YEAR);
    expect(rows).not.toBeNull();
    const budget = rows!.filter((r) => r.merchant.includes('ME BUDGET'));
    expect(budget).toHaveLength(1);
    expect(budget[0]).toMatchObject({
      amount: 3.95,
      currency: 'SGD',
      date: '2026-09-25',
      type: 'expense',
    });
    expect(rows!.filter((r) => r.merchant.includes('ABANG GEMUK'))).toHaveLength(1);
    expect(rows!.find((r) => r.merchant.includes('IMAM'))).toMatchObject({ amount: 3.5, currency: 'SGD', date: '2026-09-25' });
    expect(rows!.find((r) => r.merchant.includes('GO GO'))).toMatchObject({ amount: 1.62, date: '2026-09-24' });
    expect(rows!.find((r) => r.merchant.includes('LIAO FAN'))).toMatchObject({ amount: 6.58, date: '2026-09-24' });
    expect(rows!.find((r) => r.merchant.includes('Cafe Carrera'))).toMatchObject({ amount: 11.99, date: '2026-09-24' });
    expect(rows!.find((r) => r.merchant === 'Rasapura Masters')).toMatchObject({ amount: 11.9, date: '2026-09-23' });
    const fong = rows!.filter((r) => r.merchant === 'Fong Yan Yan');
    expect(fong.map((r) => r.amount)).toEqual([8.49, 3.89]);
    expect(fong.every((r) => r.currency === 'SGD' && r.date === '2026-09-23')).toBe(true);
    expect(rows).toHaveLength(13);
  });

  it('dates each Handal Indah payment with its own clock time', () => {
    const rows = parseStatementRows(TNG, YEAR);
    expect(rows).not.toBeNull();
    const handal = rows!.filter((r) => r.merchant.includes('HANDAL'));
    expect(handal).toEqual([
      expect.objectContaining({ amount: 15.41, date: '2026-09-25', time: '20:12', currency: 'MYR', method: 'Payment' }),
      expect.objectContaining({ amount: 15.41, date: '2026-09-25', time: '18:43', currency: 'MYR', method: 'Payment' }),
      expect.objectContaining({ amount: 4.8, date: '2026-09-23', time: '11:40', currency: 'MYR' }),
    ]);
    expect(rows!.find((r) => r.merchant.includes('KEEVAN'))).toMatchObject({
      amount: 3.5,
      date: '2026-09-23',
      time: '11:40',
      method: 'Transfer to Wallet',
    });
    expect(rows!.find((r) => r.merchant.includes('ONG JIA YANG'))).toMatchObject({
      amount: 12,
      type: 'income',
      date: '2026-09-25',
      time: '19:07',
    });
  });

  it('reads a Wise screenshot whose fee shares a line with the wrapped name', () => {
    const text = `
25 September
QME BUDGET STORE    3.90 SGD
Sent    3.95 SGD
IMAM BANANA LEAF
3.50 SGD
RESTAURANT PTE. LT D.
Sent
24 September
ABANG GEMUK (40)
6.50 SGD
PTE. LTD.
Sent
SMRT Buses /trains    1.88 SGD
Cafe Carrera Jewel    11.99 SGD
GO GO BEANZ    1.60 SGD
Sent    1.62 SGD
LIAOFAN HAWKER    6.50 SGD
CHAN    6.58 SGD
Sent
23 September
Rasapura Masters    11.90 SGD
BreacTalk    BreadTalk    6.90 SGD
Fong Yan Yan    27.07 MYR
Sent    8.49 SGD
Fong Yan Yan    12.40 MYR
Sent    3.89 SGD
FOMO PAY PTE. LTD.
2.50 SGD
Sent
SMRT Buses/trains    20.03 SGD
`;
    const rows = parseStatementRows(text, YEAR);
    expect(rows).not.toBeNull();
    expect(rows!.map((row) => [row.merchant, row.amount])).toEqual([
      ['QME BUDGET STORE', 3.95],
      ['IMAM BANANA LEAF RESTAURANT PTE. LT D.', 3.5],
      ['ABANG GEMUK (40) PTE. LTD.', 6.5],
      ['SMRT Buses /trains', 1.88],
      ['Cafe Carrera Jewel', 11.99],
      ['GO GO BEANZ', 1.62],
      ['LIAOFAN HAWKER CHAN', 6.58],
      ['Rasapura Masters', 11.9],
      ['BreadTalk', 6.9],
      ['Fong Yan Yan', 8.49],
      ['Fong Yan Yan', 3.89],
      ['FOMO PAY PTE. LTD.', 2.5],
      ['SMRT Buses/trains', 20.03],
    ]);
    const sum = rows!.reduce((total, row) => total + row.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(89.73);
  });

  it('reads the ML Kit band transcript of the Wise screenshot', () => {
    const text = `
6:56@ 回ce    "88%
X    Transactions
Include hidden    Type    Currency    Direc
25 September
个    Q ME BUDGET STORE    3.90 SGD
Sent    3.95 SGD
个
Sent    3.95 SGD
IMAM BANANA LEAF
个    3.50 SGD
RESTAURANT PTE. LTD.
Sent
24 September
ABANG GEMUK (40)
个    6.50 SGD
PTE. LTD.
Sent
SMRT Buses / trains    1.88 SGD
Cafe Carrera Jewel    11.99 SGD
GO GO BEANZ    1.60 SGD
个
Sent    1.62 SGD
个    LIAO FAN HAWKER    6.50 SGD
CHAN    6.58 SGD
Sent
23 September
Rasapura Masters    11.90 SGD
BrestTalk BreadTalk    6.90 SGD
个    Fong Yan Yan    27.07 MYR
Sent    8.49 SGD
个    Fong Yan Yan    12.40 MYR
Sent    3.89 SGD
FOMO PAY PTE. LTD.
个    2.50 SGD
Sent
SMRT Buses / trains    20.03 SGD
`;
    const rows = parseStatementRows(text, YEAR);
    expect(rows).not.toBeNull();
    expect(rows!.map((row) => [row.merchant, row.amount, row.currency])).toEqual([
      ['Q ME BUDGET STORE', 3.95, 'SGD'],
      ['IMAM BANANA LEAF RESTAURANT PTE. LTD.', 3.5, 'SGD'],
      ['ABANG GEMUK (40) PTE. LTD.', 6.5, 'SGD'],
      ['SMRT Buses / trains', 1.88, 'SGD'],
      ['Cafe Carrera Jewel', 11.99, 'SGD'],
      ['GO GO BEANZ', 1.62, 'SGD'],
      ['LIAO FAN HAWKER CHAN', 6.58, 'SGD'],
      ['Rasapura Masters', 11.9, 'SGD'],
      ['BreadTalk', 6.9, 'SGD'],
      ['Fong Yan Yan', 8.49, 'SGD'],
      ['Fong Yan Yan', 3.89, 'SGD'],
      ['FOMO PAY PTE. LTD.', 2.5, 'SGD'],
      ['SMRT Buses / trains', 20.03, 'SGD'],
    ]);
    const sum = rows!.reduce((total, row) => total + row.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(89.73);
  });

  it('puts the decimal back when ML Kit reads 8.49 SGD as 849 SGD', () => {
    const text = `
25 September
个    Q ME BUDGET STORE    3.90 SGD
Sent    3.95 SGD
IMAM BANANA LEAF
个    RESTAURANT PTE. LTD.    3.50 SGD
Sent
24 September
ABANG GEMUK (40)
个    6.50 SGD
PTE. LTD.
Sent
SMRT Buses / trains    1.88 SGD
Cafe Carrera Jewel    11.99 SGD
个    GO GO BEANZ    1.60 SGD
Sent    1.62 SGD
个    LIAO FAN HAWKER    6.50 SGD
CHAN    6.58 SGD
Sent
23 September
Rasapura Masters    11.90 SGD
BreacTalk BreadTalk    6.90 SGD
Fong Yan Yan    27.07 MYR
Sent    849 SGD
个    Fong Yan Yan    12.40 MYR
Sent    3.89 SGD
FOMO PAY PTE. LTD.
个    2.50 SGD
Sent
SMRT Buses / trains    20.03 SGD
`;
    const rows = parseStatementRows(text, YEAR);
    expect(rows).not.toBeNull();
    expect(rows!.find((row) => row.amount === 27.07)).toBeUndefined();
    expect(rows!.filter((row) => row.merchant === 'Fong Yan Yan').map((row) => row.amount)).toEqual([8.49, 3.89]);
    const sum = rows!.reduce((total, row) => total + row.amount, 0);
    expect(rows).toHaveLength(13);
    expect(Math.round(sum * 100) / 100).toBe(89.73);
  });

  it('does not start a new payment when a band repeats the merchant’s last word', () => {
    const text = `
23 September
Rasapura Masters    11.90 SGD
MASTERS
BreadTalk BreadTalk    6.90 SGD
`;
    const rows = parseStatementRows(text, YEAR);
    expect(rows!.map((row) => [row.merchant, row.amount])).toEqual([
      ['Rasapura Masters', 11.9],
      ['BreadTalk', 6.9],
    ]);
  });

  it('does not turn a Touch n Go points line into a second payment', () => {
    const text = `
27 Sep, 17:49
FP-AEON    -RM13.00
DuitNow QR    O points
27 Sep, 17:45
Transfer to FONG YAN YAN    -RM32.40
Transfer to Wallet
`;
    const rows = parseStatementRows(text, YEAR);
    expect(rows!.map((row) => [row.merchant, row.amount])).toEqual([
      ['FP-AEON', 13],
      ['Transfer to FONG YAN YAN', 32.4],
    ]);
  });

  it('leaves an undated transcript for the model', () => {
    const lines = Array.from({ length: 16 }, (_, i) => `Shop ${i} RM ${(i + 1).toFixed(2)}`);
    expect(parseStatementRows(lines.join('\n'), YEAR)).toBeNull();
  });
});

describe('collapseFeeTwins', () => {
  it('drops the second Wise amount when the model emitted it as its own row', () => {
    const rows = collapseFeeTwins([
      txn({ merchant: 'ME BUDGET STORE', amount: 3.9, currency: 'SGD' }),
      txn({ merchant: 'ME BUDGET STORE', amount: 3.95, currency: 'SGD' }),
      txn({ merchant: 'IMAM BANANA LEAF', amount: 3.5, currency: 'SGD' }),
    ]);
    expect(rows.map((r) => [r.merchant, r.amount])).toEqual([
      ['ME BUDGET STORE', 3.95],
      ['IMAM BANANA LEAF', 3.5],
    ]);
  });

  it('keeps two Handal payments that share an amount but not a time', () => {
    const rows = collapseFeeTwins([
      txn({ merchant: 'HANDAL INDAH SDN. BHD.', amount: 15.41, time: '20:12' }),
      txn({ merchant: 'HANDAL INDAH SDN. BHD.', amount: 15.41, time: '18:43' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(dedupeExtracted(rows)).toHaveLength(2);
  });
});
