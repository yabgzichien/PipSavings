import { sheetOpenFromModalState } from '../src/lib/askPip/sheetOpen';

describe('sheetOpenFromModalState', () => {
  it('is true only while a settle or edit modal value is present', () => {
    expect(sheetOpenFromModalState(null)).toBe(false);
    expect(sheetOpenFromModalState(undefined)).toBe(false);
    expect(sheetOpenFromModalState({ shareId: 's1' })).toBe(true);
    expect(sheetOpenFromModalState(null, { id: 't1' })).toBe(true);
    expect(sheetOpenFromModalState({ shareId: 's1' }, { id: 't1' })).toBe(true);
    expect(sheetOpenFromModalState(null, null)).toBe(false);
  });
});
