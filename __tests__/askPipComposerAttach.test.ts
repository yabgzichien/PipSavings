import * as XLSX from 'xlsx-js-style';
import {
  COMPOSER_PICKER_TYPES,
  attachmentsFromPickerAssets,
  composerAttachKind,
  composerSendUtterance,
  formatAskPipAttachmentBlock,
  isComposerBinaryKind,
  planComposerSend,
  spreadsheetBytesToText,
  SPREADSHEET_MAX_BYTES,
  SPREADSHEET_MAX_SHEETS,
  SPREADSHEET_TOO_LARGE_NOTE,
  SPREADSHEET_UNREADABLE_NOTE,
  takeNextScanImage,
} from '../src/lib/askPip/composerAttach';

describe('composerAttachKind', () => {
  it('classifies pdf, images, csv, and excel; rejects unknown types', () => {
    expect(composerAttachKind('application/pdf', 'statement.pdf')).toBe('pdf');
    expect(composerAttachKind('image/jpeg', 'shot.jpg')).toBe('image');
    expect(composerAttachKind('', 'photo.heic')).toBe('image');
    expect(composerAttachKind('text/csv', 'export.csv')).toBe('csv');
    expect(composerAttachKind('', 'old.xls')).toBe('xlsx');
    expect(composerAttachKind(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'book.xlsx',
    )).toBe('xlsx');
    expect(composerAttachKind('application/zip', 'notes.zip')).toBe('unsupported');
  });
});

describe('attachmentsFromPickerAssets', () => {
  it('keeps accepted files, drops unsupported, and assigns ids', () => {
    let n = 0;
    const files = attachmentsFromPickerAssets(
      [
        { uri: 'file://a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' },
        { uri: 'file://b.pdf', name: 'b.pdf', mimeType: 'application/pdf' },
        { uri: 'file://c.csv', name: 'c.csv', mimeType: 'text/csv' },
        { uri: 'file://d.zip', name: 'd.zip', mimeType: 'application/zip' },
      ],
      () => `att-${++n}`,
    );
    expect(files.map((file) => file.kind)).toEqual(['image', 'pdf', 'csv']);
    expect(files.map((file) => file.id)).toEqual(['att-1', 'att-2', 'att-3']);
    expect(COMPOSER_PICKER_TYPES).toEqual(expect.arrayContaining([
      'image/*',
      'application/pdf',
      'text/csv',
    ]));
  });
});

describe('composerSendUtterance', () => {
  it('uses typed text, or a look-at-files fallback when only files are attached', () => {
    expect(composerSendUtterance('  what is this  ', 2, 'Look at the attached files.')).toBe('what is this');
    expect(composerSendUtterance('   ', 2, 'Look at the attached files.')).toBe('Look at the attached files.');
    expect(composerSendUtterance('', 0, 'Look at the attached files.')).toBe('');
  });
});

describe('planComposerSend', () => {
  it('sends named scan jobs with images or pdfs through vision', () => {
    expect(planComposerSend('these are grab receipts', [{ kind: 'image' }], 'Look at the attached files.')).toEqual({
      type: 'vision',
      kind: 'scan_receipt',
      utterance: 'these are grab receipts',
    });
    expect(planComposerSend('bank statement', [{ kind: 'pdf' }], 'Look at the attached files.')).toEqual({
      type: 'vision',
      kind: 'scan_statement',
      utterance: 'bank statement',
    });
  });

  it('asks the user to pick a scan kind when they send photos or pdfs with no caption', () => {
    expect(planComposerSend('', [{ kind: 'image' }, { kind: 'image' }], 'Look at the attached files.')).toEqual({
      type: 'pick_kind',
    });
    expect(planComposerSend('   ', [{ kind: 'pdf' }], 'Look at the attached files.')).toEqual({
      type: 'pick_kind',
    });
  });

  it('sends captions, spreadsheets, and empty composers as an Ask Pip turn', () => {
    expect(planComposerSend('', [{ kind: 'csv' }], 'Look at the attached files.')).toEqual({
      type: 'turn',
      utterance: 'Look at the attached files.',
    });
    expect(planComposerSend('who owes me', [{ kind: 'image' }], 'Look at the attached files.')).toEqual({
      type: 'turn',
      utterance: 'who owes me',
    });
    expect(planComposerSend('', [], 'Look at the attached files.')).toEqual({ type: 'none' });
  });
});

describe('formatAskPipAttachmentBlock', () => {
  it('lists every file and inlines csv or excel text', () => {
    expect(formatAskPipAttachmentBlock([
      { name: 'shot.jpg', kind: 'image' },
      { name: 'export.csv', kind: 'csv', text: 'date,amount\n2026-01-01,12' },
    ])).toBe([
      'Attached files:',
      '- shot.jpg (image)',
      '- export.csv (csv)',
      '--- export.csv ---',
      'date,amount\n2026-01-01,12',
    ].join('\n'));
  });

  it('returns null when nothing is attached', () => {
    expect(formatAskPipAttachmentBlock([])).toBeNull();
  });
});

describe('spreadsheetBytesToText', () => {
  it('flattens an xlsx workbook to csv text', () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['date', 'amount'], ['2026-01-01', 12]]);
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    const text = spreadsheetBytesToText(bytes);
    expect(text).toContain('date,amount');
    expect(text).toContain('2026-01-01');
  });

  it('refuses an oversized file without handing it to the parser', () => {
    const big = new Uint8Array(SPREADSHEET_MAX_BYTES + 1);
    expect(spreadsheetBytesToText(big)).toBe(SPREADSHEET_TOO_LARGE_NOTE);
  });

  it('turns a corrupt file into a note instead of throwing', () => {
    const garbage = new Uint8Array(2048).map((_, i) => (i * 31) % 251);
    expect(() => spreadsheetBytesToText(garbage)).not.toThrow();
    const out = spreadsheetBytesToText(garbage);
    expect(typeof out).toBe('string');
    expect(out.length).toBeLessThan(50_000);
  });

  it('reads at most the first handful of sheets', () => {
    const wb = XLSX.utils.book_new();
    for (let i = 0; i < SPREADSHEET_MAX_SHEETS + 5; i++) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['n'], [i]]), `S${i}`);
    }
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    const text = spreadsheetBytesToText(bytes);
    expect(text).toContain(`# S${SPREADSHEET_MAX_SHEETS - 1}`);
    expect(text).not.toContain(`# S${SPREADSHEET_MAX_SHEETS}\n`);
    expect(SPREADSHEET_UNREADABLE_NOTE).not.toBe(text);
  });
});

describe('isComposerBinaryKind', () => {
  it('treats images and pdfs as binary vision parts', () => {
    expect(isComposerBinaryKind('image')).toBe(true);
    expect(isComposerBinaryKind('pdf')).toBe(true);
    expect(isComposerBinaryKind('csv')).toBe(false);
    expect(isComposerBinaryKind('xlsx')).toBe(false);
  });
});

describe('takeNextScanImage', () => {
  it('reads one attached photo at a time and keeps the rest for later', () => {
    expect(takeNextScanImage(['a.jpg', 'b.jpg', 'c.jpg'])).toEqual({
      image: 'a.jpg',
      remaining: ['b.jpg', 'c.jpg'],
    });
    expect(takeNextScanImage(['only.png'])).toEqual({ image: 'only.png', remaining: [] });
    expect(takeNextScanImage([])).toBeNull();
  });
});
