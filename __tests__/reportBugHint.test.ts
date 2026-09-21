import { en } from '../src/i18n/translations/en';
import { zh } from '../src/i18n/translations/zh';

describe('bug report hint', () => {
  it('does not claim we cannot write back', () => {
    expect(en.reportBugHint).not.toMatch(/cannot write back/i);
    expect(en.reportBugHint).not.toMatch(/not a conversation/i);
    expect(zh.reportBugHint).not.toContain('没法回复');
    expect(zh.reportBugHint).not.toContain('不是对话');
  });
});
