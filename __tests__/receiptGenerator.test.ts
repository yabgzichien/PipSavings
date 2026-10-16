// __tests__/receiptGenerator.test.ts
import {
  generateDeterministicReceipt,
  formatReceiptMessage,
  formatMultiBillStatement,
  generateReceiptCanvasHtml,
  formatWorkingsCalculation,
  formatSurchargeTag,
  type ReceiptGenInput,
} from '../src/lib/receiptGenerator';

describe('receiptGenerator', () => {
  const baseInput = (overrides?: Partial<ReceiptGenInput>): ReceiptGenInput => ({
    merchant: "Carl's Jr",
    total: 42.5,
    currency: 'MYR',
    personName: 'Ali',
    billDate: '2026-09-03',
    seedId: 'share-123',
    categoryName: 'Food',
    isZh: false,
    ...overrides,
  });

  describe('determinism and math', () => {
    it('generates the exact same receipt across multiple runs', () => {
      const receipt1 = generateDeterministicReceipt(baseInput());
      const receipt2 = generateDeterministicReceipt(baseInput());
      expect(receipt1).toEqual(receipt2);
    });

    it('uses the category as the single item with exact total when items are not specified', () => {
      const receipt = generateDeterministicReceipt(
        baseInput({ total: 25.0, categoryName: 'Food' })
      );
      expect(receipt.items).toHaveLength(1);
      expect(receipt.items[0].name).toBe('Food');
      expect(receipt.items[0].amount).toBe(25.0);
      expect(receipt.total).toBe(25.0);
    });

    it('falls back to categoryId, merchant, or remark when categoryName is missing', () => {
      const r1 = generateDeterministicReceipt(
        baseInput({ categoryName: undefined, categoryId: 'entertainment' })
      );
      expect(r1.items[0].name).toBe('entertainment');

      const r2 = generateDeterministicReceipt(
        baseInput({ categoryName: undefined, categoryId: undefined, merchant: 'GSC Cinema' })
      );
      expect(r2.items[0].name).toBe('GSC Cinema');

      const r3 = generateDeterministicReceipt(
        baseInput({
          categoryName: undefined,
          categoryId: undefined,
          merchant: 'A shared bill',
          remark: 'Grab ride',
        })
      );
      expect(r3.items[0].name).toBe('Grab ride');

      const r4 = generateDeterministicReceipt(
        baseInput({
          categoryName: undefined,
          categoryId: undefined,
          merchant: 'A shared bill',
          remark: undefined,
          isZh: false,
        })
      );
      expect(r4.items[0].name).toBe('Expense');
    });

    it('uses explicit items when provided', () => {
      const receipt = generateDeterministicReceipt(
        baseInput({
          items: [
            { name: 'Cheeseburger', qty: 1, amount: 25.0 },
            { name: 'Curly Fries', qty: 1, amount: 17.5 },
          ],
        })
      );
      expect(receipt.items).toHaveLength(2);
      expect(receipt.items[0].name).toBe('Cheeseburger');
      expect(receipt.items[1].name).toBe('Curly Fries');
      const itemSum = receipt.items.reduce((s, it) => s + it.amount, 0);
      expect(itemSum).toBe(42.5);
    });

    it('reconciles subtotal + service charge + tax to exactly match total when surcharges exist', () => {
      const amounts = [15.0, 42.5, 78.9, 114.25, 250.0];
      for (const amount of amounts) {
        const receipt = generateDeterministicReceipt(
          baseInput({
            total: amount,
            workings: {
              serviceChargePct: 10,
              taxPct: 6,
              discount: null,
            },
          })
        );
        const baseCents = Math.round(receipt.subtotal * 100);
        const svcCents = Math.round(receipt.serviceCharge * 100);
        const taxCents = Math.round(receipt.tax * 100);
        expect(baseCents + svcCents + taxCents).toBe(Math.round(amount * 100));
      }
    });

    it('mentions service charge and SST in item note when surcharges exist', () => {
      const receipt = generateDeterministicReceipt(
        baseInput({
          workings: {
            serviceChargePct: 10,
            taxPct: 6,
            discount: null,
          },
        })
      );
      expect(receipt.items[0].note).toContain('10% svc');
      expect(receipt.items[0].note).toContain('6% SST');
    });
  });

  describe('no made-up items (100% deterministic, no LLM)', () => {
    it('never creates fictional menu items like burgers, fries, or sushi when only category is known', () => {
      const categories = ['Food', 'Groceries', 'Transport', 'Entertainment', 'Shopping'];
      for (const cat of categories) {
        const receipt = generateDeterministicReceipt(
          baseInput({ categoryName: cat, merchant: 'Random Shop' })
        );
        expect(receipt.items).toHaveLength(1);
        expect(receipt.items[0].name).toBe(cat);
        expect(receipt.items[0].name).not.toMatch(
          /Savory Combo Dish|Crispy Snack Basket|Double Cheeseburger|Salmon|Mee Goreng/
        );
      }
    });
  });

  describe('receipt formatting', () => {
    it('formats a single bill into a clean Pip receipt with header, items, and total', () => {
      const receipt = generateDeterministicReceipt(
        baseInput({
          workings: { serviceChargePct: 10, taxPct: 6, discount: null },
        })
      );
      const msg = formatReceiptMessage(receipt);
      expect(msg).toContain('🧾 SPLIT RECEIPT');
      expect(msg).not.toContain('PIP FINANCE');
      expect(msg).toContain('RECEIPT NO: #PIP-');
      expect(msg).toContain("MERCHANT:   Carl's Jr");
      expect(msg).toContain('BILLED TO:  Ali');
      expect(msg).toContain('ITEMS:');
      expect(msg).toContain('• Food: RM 42.50');
      expect(msg).toContain('Subtotal:');
      expect(msg).toContain('Service Charge (10%):');
      expect(msg).toContain('SST (6%):');
      expect(msg).toContain('TOTAL OWED: RM 42.50');

      // Must NOT contain viral sign-off or website links
      expect(msg).not.toContain('Split with Pip');
      expect(msg).not.toContain('Zero ads');
      expect(msg).not.toContain('https://pipfinance.app');
      expect(msg).not.toContain('Pay me via DuitNow');
    });

    it('formats a consolidated statement receipt for multiple bills without promo link', () => {
      const r1 = generateDeterministicReceipt(
        baseInput({ merchant: "Carl's Jr", categoryName: 'Food', total: 40.0, seedId: 's1' })
      );
      const r2 = generateDeterministicReceipt(
        baseInput({ merchant: 'Starbucks', categoryName: 'Coffee', total: 25.0, seedId: 's2' })
      );

      const statement = formatMultiBillStatement([r1, r2], {
        total: 65.0,
        currency: 'MYR',
        personName: 'Ali',
        isZh: false,
      });

      expect(statement).toContain('🧾 SPLIT STATEMENT');
      expect(statement).not.toContain('PIP FINANCE');
      expect(statement).toContain('BILLED TO:  Ali');
      expect(statement).toContain('OPEN BILLS: 2 bills');
      expect(statement).toContain("1. Carl's Jr");
      expect(statement).toContain('• Food: RM 40.00');
      expect(statement).toContain('2. Starbucks');
      expect(statement).toContain('• Coffee: RM 25.00');
      expect(statement).toContain('TOTAL OUTSTANDING: RM 65.00');
      expect(statement).not.toContain('Pay me via DuitNow');
      expect(statement).not.toContain('https://pipfinance.app');
      expect(statement).not.toContain('Split with Pip');
    });

    it('localizes receipt into Chinese when isZh is true without promo sign-off', () => {
      const receipt = generateDeterministicReceipt(
        baseInput({
          categoryName: '餐饮美食',
          isZh: true,
          workings: { serviceChargePct: 10, taxPct: 6, discount: null },
        })
      );
      const msg = formatReceiptMessage(receipt);
      expect(msg).toContain('🧾 分摊小票');
      expect(msg).not.toContain('PIP 记账');
      expect(msg).toContain('账单编号：  #PIP-');
      expect(msg).toContain("消费商家：  Carl's Jr");
      expect(msg).toContain('付款人：    Ali');
      expect(msg).toContain('消费明细：');
      expect(msg).toContain('• 餐饮美食: RM 42.50');
      expect(msg).toContain('税前小计：');
      expect(msg).toContain('服务费 (10%)：');
      expect(msg).toContain('销售税 SST (6%)：');
      expect(msg).toContain('应付合计：RM 42.50');
      expect(msg).not.toContain('使用 DuitNow 付款');
      expect(msg).not.toContain('由 Pip 分摊');
      expect(msg).not.toContain('https://pipfinance.app');
    });
  });

  describe('generateReceiptCanvasHtml', () => {
    it('cannot be broken out of its <script> block by a hostile merchant or friend name', () => {
      const evil = '</script><img src=x onerror="window.ReactNativeWebView.postMessage(1)">\u2028';
      const receipt = generateDeterministicReceipt(baseInput({ merchant: evil, personName: evil }));
      const html = generateReceiptCanvasHtml({
        key: 'share-evil',
        receipts: [receipt],
        currency: 'MYR',
        personName: evil,
        total: 42.5,
        isZh: false,
      });

      // Exactly one closing tag, and it is the template's own at the very end of the script.
      const scriptCloses = html.match(/<\/script>/gi) ?? [];
      expect(scriptCloses).toHaveLength(1);
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('\u2028');

      // The data still round-trips: the escape is invisible to the script that reads it.
      const m = html.match(/const raw = (.*);\n/);
      expect(m).not.toBeNull();
      const parsed = JSON.parse(m![1]);
      expect(parsed.personName).toBe(evil);
    });

    it('generates HTML with canvas script, mascot, items, and total (no QR, no barcode, no promo link)', () => {
      const receipt = generateDeterministicReceipt(baseInput());
      const html = generateReceiptCanvasHtml({
        key: 'share-123',
        receipts: [receipt],
        currency: 'MYR',
        personName: 'Ali',
        total: 42.5,
        isZh: false,
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<canvas id="rc"></canvas>');
      expect(html).toContain('SPLIT RECEIPT');
      expect(html).not.toContain('PIP FINANCE');
      expect(html).toContain('drawNerdMascot');
      expect(html).toContain('TOTAL OWED');
      expect(html).toContain('canvas.toDataURL(\x27image/png\x27)');
      expect(html).toContain('window.ReactNativeWebView.postMessage');

      // Verify removal of QR, Barcode, and Website link
      expect(html).not.toContain('DuitNow QR');
      expect(html).not.toContain('duitNowQrBase64');
      expect(html).not.toContain('pipfinance.app');
      expect(html).not.toContain('BARCODE');
      expect(html).not.toContain('Zero ads');

      // Verify Space Mono font integration
      expect(html).toContain('Space+Mono');
      expect(html).toContain("'Space Mono'");
      expect(html).toContain('monoFont');
    });

    it('supports batch-rendering multiple receipts', () => {
      const r1 = generateDeterministicReceipt(baseInput({ seedId: 'b1' }));
      const r2 = generateDeterministicReceipt(baseInput({ seedId: 'b2' }));
      const html = generateReceiptCanvasHtml([
        {
          key: 'b1',
          receipts: [r1],
          currency: 'MYR',
          personName: 'Ali',
          total: 42.5,
          isZh: false,
        },
        {
          key: 'b2',
          receipts: [r2],
          currency: 'MYR',
          personName: 'Ali',
          total: 42.5,
          isZh: false,
        },
      ]);

      expect(html).toContain('"key":"b1"');
      expect(html).toContain('"key":"b2"');
    });
  });

  describe('formatWorkingsCalculation', () => {
    it('formats equal division when participantCount is present or cleanly divides', () => {
      const calc1 = formatWorkingsCalculation({
        gross: 30,
        owed: 15,
        outstanding: 15,
        currency: 'MYR',
        splitMethod: 'equal',
        participantCount: 2,
        isZh: false,
      });
      expect(calc1).toBe('Bill MYR 30.00 ÷ 2 = MYR 15.00');

      const calcZh = formatWorkingsCalculation({
        gross: 30,
        owed: 15,
        outstanding: 15,
        currency: 'MYR',
        splitMethod: 'equal',
        participantCount: 2,
        isZh: true,
      });
      expect(calcZh).toBe('账单 MYR 30.00 ÷ 2 人 = MYR 15.00');
    });

    it('formats custom percentage share when amounts do not cleanly divide', () => {
      const calc = formatWorkingsCalculation({
        gross: 50,
        owed: 20,
        outstanding: 20,
        currency: 'MYR',
        splitMethod: 'exact',
        isZh: false,
      });
      expect(calc).toBe('Bill MYR 50.00 · Share: MYR 20.00 (40%)');
    });

    it('appends partial payments when paid > 0 and balance remains', () => {
      const calc = formatWorkingsCalculation({
        gross: 30,
        owed: 15,
        outstanding: 10,
        paid: 5,
        currency: 'MYR',
        splitMethod: 'equal',
        participantCount: 2,
        isZh: false,
      });
      expect(calc).toBe('Bill MYR 30.00 ÷ 2 = MYR 15.00 (Paid: MYR 5.00, Balance: MYR 10.00)');
    });

    it('embeds workings calculation into deterministic receipt item note', () => {
      const receipt = generateDeterministicReceipt(
        baseInput({
          gross: 30,
          total: 15,
          workingsCalculation: 'Bill MYR 30.00 ÷ 2 = MYR 15.00',
        })
      );
      expect(receipt.items[0].note).toBe('Bill MYR 30.00 ÷ 2 = MYR 15.00');
      expect(receipt.items[0].workings).toBe('Bill MYR 30.00 ÷ 2 = MYR 15.00');
      expect(receipt.items[0].surchargeTag).toBeUndefined();
    });
  });

  describe('formatSurchargeTag', () => {
    it('shows only tax when only tax is applicable', () => {
      const tag = formatSurchargeTag({ taxPct: 6 });
      expect(tag).toBe('(incl. 6% SST)');
      expect(tag).not.toContain('svc');
      expect(tag).not.toContain('discount');
    });

    it('shows only service charge when only service is applicable', () => {
      const tag = formatSurchargeTag({ serviceChargePct: 10 });
      expect(tag).toBe('(incl. 10% svc)');
      expect(tag).not.toContain('SST');
      expect(tag).not.toContain('discount');
    });

    it('shows only discount when only discount is applicable', () => {
      const tag = formatSurchargeTag({ discount: 5 });
      expect(tag).toBe('(incl. discount)');
      expect(tag).not.toContain('svc');
      expect(tag).not.toContain('SST');
    });

    it('shows service charge and SST without mentioning discount when only those two are applicable', () => {
      const tag = formatSurchargeTag({ serviceChargePct: 10, taxPct: 6 });
      expect(tag).toBe('(incl. 10% svc + 6% SST)');
      expect(tag).not.toContain('discount');
    });

    it('shows all three when service, tax, and discount are all applicable', () => {
      const tag = formatSurchargeTag({ serviceChargePct: 10, taxPct: 6, discount: 5 });
      expect(tag).toBe('(incl. 10% svc + 6% SST + discount)');
    });

    it('returns undefined when no tax, service, or discount is applicable', () => {
      const tag = formatSurchargeTag({ serviceChargePct: 0, taxPct: 0, discount: null });
      expect(tag).toBeUndefined();
    });

    it('localizes correctly into Chinese', () => {
      expect(formatSurchargeTag({ taxPct: 6, isZh: true })).toBe('(含 6% SST)');
      expect(formatSurchargeTag({ serviceChargePct: 10, isZh: true })).toBe('(含 10% 服务费)');
      expect(formatSurchargeTag({ discount: 5, isZh: true })).toBe('(含 折扣)');
      expect(formatSurchargeTag({ serviceChargePct: 10, taxPct: 6, isZh: true })).toBe('(含 10% 服务费 + 6% SST)');
    });
  });

  describe('canvas workings in grey and tags in green', () => {
    it('generates canvas with grey workings (#788E83) and green surchargeTag (#1C7A4E)', () => {
      const receipt = generateDeterministicReceipt(
        baseInput({
          gross: 30,
          total: 15,
          workingsCalculation: 'Bill MYR 30.00 ÷ 2 = MYR 15.00',
          workings: { serviceChargePct: 10, taxPct: 6, discount: null },
        })
      );
      expect(receipt.items[0].workings).toBe('Bill MYR 30.00 ÷ 2 = MYR 15.00');
      expect(receipt.items[0].surchargeTag).toBe('(incl. 10% svc + 6% SST)');

      const html = generateReceiptCanvasHtml({
        key: 'test',
        receipts: [receipt],
        currency: 'MYR',
        personName: 'Ali',
        total: 15,
        isZh: false,
      });

      // Monospace grey for workings
      expect(html).toContain("ctx.fillStyle = '#788E83'");
      // Monospace green for surcharge tag
      expect(html).toContain("ctx.fillStyle = '#1C7A4E'");
    });
  });
});
