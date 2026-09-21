import { GLOSSARY, type GlossaryEntry } from '../src/lib/glossary';

describe('GLOSSARY', () => {
  it('contains valid entries with non-empty term, short, and body', () => {
    const keys = Object.keys(GLOSSARY);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      const entry: GlossaryEntry = GLOSSARY[key];
      expect(entry).toBeDefined();
      expect(typeof entry.term).toBe('string');
      expect(entry.term.trim().length).toBeGreaterThan(0);
      expect(typeof entry.short).toBe('string');
      expect(entry.short.trim().length).toBeGreaterThan(0);
      expect(typeof entry.body).toBe('string');
      expect(entry.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('contains split_bill with a concise tutorial on how to use split bill', () => {
    const splitBill = GLOSSARY['split_bill'];
    expect(splitBill).toBeDefined();
    expect(splitBill.term).toBe('Split bill');
    expect(splitBill.short).toContain('Divide a shared bill');
    expect(splitBill.body).toContain('Equal, Shares, or Exact');
    expect(splitBill.body).toContain('Owed to you');
    expect(splitBill.steps).toBeDefined();
    expect(splitBill.steps?.length).toBe(4);
    expect(splitBill.steps?.[0].visualKey).toBe('split_receipt_step');
    expect(splitBill.steps?.[1].visualKey).toBe('split_step_1');
    expect(splitBill.steps?.[2].visualKey).toBe('split_step_2');
    expect(splitBill.steps?.[3].visualKey).toBe('split_step_3');
  });

  it('contains owed_to_you explaining receivables, settling, and write-offs', () => {
    const owed = GLOSSARY['owed_to_you'];
    expect(owed).toBeDefined();
    expect(owed.term).toBe('Owed to you');
    expect(owed.short).toContain('Money friends owe you');
    expect(owed.body).toContain('Net Worth');
    expect(owed.body).toContain('settling');
    expect(owed.body).toContain('writing it off');
    expect(owed.steps).toBeDefined();
    expect(owed.steps?.length).toBe(2);
  });

  it('contains quick_add explaining natural text input with examples', () => {
    const quickAdd = GLOSSARY['quick_add'];
    expect(quickAdd).toBeDefined();
    expect(quickAdd.term).toBe('Just type it');
    expect(quickAdd.short).toContain('plain text');
    expect(quickAdd.body).toContain('Examples:');
    expect(quickAdd.body).toContain('lunch 9.2');
    expect(quickAdd.steps).toBeDefined();
    expect(quickAdd.steps?.length).toBe(2);
  });

  it('contains reduce_liability explaining instalments for car and real estate loans', () => {
    const entry = GLOSSARY['reduce_liability'];
    expect(entry).toBeDefined();
    expect(entry.term).toBe('Reduce liability');
    expect(entry.short).toContain('instalment');
    expect(entry.body).toContain('car instalment');
    expect(entry.body).toContain('real estate');
    expect(entry.steps).toBeDefined();
    expect(entry.steps?.length).toBeGreaterThanOrEqual(1);
  });

  it('contains tax_relief as a Malaysia-only tracker that does not file or advise', () => {
    const entry = GLOSSARY['tax_relief'];
    expect(entry).toBeDefined();
    expect(entry.term).toBe('Tax relief');
    expect(entry.short).toMatch(/Malaysian/i);
    expect(entry.short).toMatch(/not tax advice/i);
    expect(entry.short).toMatch(/never files/i);
    expect(entry.body).toContain('LHDN');
    expect(entry.body).toContain('MyTax');
    expect(entry.body).toContain('hasil.gov.my');
    expect(entry.body).toMatch(/on this device/i);
    expect(entry.steps).toBeDefined();
    expect(entry.steps?.length).toBe(5);
    expect(entry.steps?.[0].title).toMatch(/logging/i);
    expect(entry.steps?.[4].desc).toMatch(/does not submit/i);
    const blob = [entry.term, entry.short, entry.body, ...(entry.steps ?? []).flatMap((s) => [s.title, s.desc, s.badge ?? ''])].join('\n');
    expect(blob).not.toMatch(/[—–]/);
  });

  it('validates all steps when defined have non-empty titles and descriptions', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      if (entry.steps) {
        expect(entry.steps.length).toBeGreaterThan(0);
        for (const step of entry.steps) {
          expect(step.title.trim().length).toBeGreaterThan(0);
          expect(step.desc.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
