import { parseReceiptOcr } from '../src/lib/receiptFromOcr';

describe('parseReceiptOcr', () => {
  it('reads a restaurant slip with a line total after the unit price', () => {
    const text = `
Berghotel
Grosse Scheidegg
2xLatte Macchiato à 4.50 CHF 9.00
1xGloki à 5.00 CHF 5.00
1xSchweinschnitzel à 22.00 CHF 22.00
1xChässpätzli à 18.50 CHF 18.50
Total : CHF 54.50
Incl. 7.6% MwSt 54.50 CHF: 3.85
Entspricht in Euro 36.33 EUR
`;
    const receipt = parseReceiptOcr(text);
    expect(receipt).not.toBeNull();
    expect(receipt!.merchant).toBe('Berghotel Grosse Scheidegg');
    expect(receipt!.currency).toBe('CHF');
    expect(receipt!.total).toBe(54.5);
    expect(receipt!.items.map((item) => [item.label, item.amount, item.quantity])).toEqual([
      ['Latte Macchiato', 9, 2],
      ['Gloki', 5, 1],
      ['Schweinschnitzel', 22, 1],
      ['Chässpätzli', 18.5, 1],
    ]);
  });

  it('reads a two-line shop receipt and its total', () => {
    const text = `
NS PLT
A15    12.00
A18    14.00
TOTAL    26.00
`;
    const receipt = parseReceiptOcr(text);
    expect(receipt!.merchant).toBe('NS PLT');
    expect(receipt!.currency).toBe('MYR');
    expect(receipt!.total).toBe(26);
    expect(receipt!.items.map((item) => [item.label, item.amount])).toEqual([
      ['A15', 12],
      ['A18', 14],
    ]);
  });

  it('attaches a price printed on the following line', () => {
    const text = `
THE ML KITCHEN (SEPANG) SDN. BHD.
麻辣烫 Mala Soup
32.45
白饭 Rice
2.00
白饭 Rice
2.00
TOTAL 36.45
`;
    const receipt = parseReceiptOcr(text);
    expect(receipt!.total).toBe(36.45);
    expect(receipt!.items.map((item) => item.amount)).toEqual([32.45, 2, 2]);
  });

  it('repairs prices ML Kit printed as 12 0C and 14 00', () => {
    const text = `
NS PLT
S ANC SELANOR
TABLE    13
AMOUNT
1317 00
12 0C
14 00
TOTAL    26.00
CCASH    26.00
`;
    const receipt = parseReceiptOcr(text);
    expect(receipt!.merchant).toBe('NS PLT');
    expect(receipt!.total).toBe(26);
    expect(receipt!.items.map((item) => item.amount)).toEqual([12, 14]);
  });

  it('pairs a supermarket price printed above the product name', () => {
    const text = `
ECONSAVE
ITEM # 9415007016908    1    9.90
SHRIMP PASTE
ITEM # 9556046700127    1    9.45
ANCHOR CHEDDAR CHE
ITEM # 9555995800209    1    5.80
KNIFE CLAS LIGHT S
GARDENIA ORI    2.85
TOTAL    27.99
`;
    const receipt = parseReceiptOcr(text);
    expect(receipt!.total).toBe(27.99);
    expect(receipt!.items.map((item) => [item.label, item.amount])).toEqual([
      ['SHRIMP PASTE', 9.9],
      ['ANCHOR CHEDDAR CHE', 9.45],
      ['KNIFE CLAS LIGHT S', 5.8],
      ['GARDENIA ORI', 2.85],
    ]);
  });

  it('returns null when no prices were read', () => {
    expect(parseReceiptOcr('Thank you\nPlease come again')).toBeNull();
  });
});
