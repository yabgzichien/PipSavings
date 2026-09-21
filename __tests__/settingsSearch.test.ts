// __tests__/settingsSearch.test.ts
import { filterSettings, matchesSetting, SETTING_DEFINITIONS, type SettingItemKey } from '../src/lib/settingsSearch';

describe('Settings Search', () => {
  describe('Empty and whitespace queries', () => {
    it('returns all settings when query is empty', () => {
      const result = filterSettings('');
      expect(result.isSearching).toBe(false);
      expect(result.hasMatches).toBe(true);
      expect(result.matchingKeys.size).toBe(SETTING_DEFINITIONS.length);
      expect(result.matchingSections.size).toBeGreaterThan(0);
    });

    it('returns all settings when query is only whitespace', () => {
      const result = filterSettings('   ');
      expect(result.isSearching).toBe(false);
      expect(result.hasMatches).toBe(true);
      expect(result.matchingKeys.size).toBe(SETTING_DEFINITIONS.length);
    });
  });

  describe('English search queries and synonyms', () => {
    it('includes Ask Pip and finds its API key settings', () => {
      expect(SETTING_DEFINITIONS.some((d) => d.key === 'ask_pip')).toBe(true);
      expect(filterSettings('api key').matchingKeys.has('ask_pip')).toBe(true);
      expect(filterSettings('Ask Pip').matchingKeys.has('ask_pip')).toBe(true);
    });

    it('finds theme settings by name and mode keywords', () => {
      expect(filterSettings('theme').matchingKeys.has('theme')).toBe(true);
      expect(filterSettings('dark').matchingKeys.has('theme')).toBe(true);
      expect(filterSettings('light').matchingKeys.has('theme')).toBe(true);
      expect(filterSettings('dark mode').matchingKeys.has('theme')).toBe(true);
      expect(filterSettings('system').matchingKeys.has('theme')).toBe(true);
    });

    it('finds language settings', () => {
      expect(filterSettings('language').matchingKeys.has('language')).toBe(true);
      expect(filterSettings('english').matchingKeys.has('language')).toBe(true);
      expect(filterSettings('chinese').matchingKeys.has('language')).toBe(true);
      expect(filterSettings('i18n').matchingKeys.has('language')).toBe(true);
    });

    it('finds accent color and app icon settings', () => {
      expect(filterSettings('accent').matchingKeys.has('accent')).toBe(true);
      expect(filterSettings('color').matchingKeys.has('accent')).toBe(true);
      expect(filterSettings('app icon').matchingKeys.has('accent')).toBe(true);
      expect(filterSettings('preset').matchingKeys.has('accent')).toBe(true);
    });

    it('finds motion and haptics settings', () => {
      expect(filterSettings('motion').matchingKeys.has('motion')).toBe(true);
      expect(filterSettings('haptics').matchingKeys.has('motion')).toBe(true);
      expect(filterSettings('animation').matchingKeys.has('motion')).toBe(true);
      expect(filterSettings('reduced motion').matchingKeys.has('motion')).toBe(true);
    });

    it('finds sounds settings', () => {
      expect(filterSettings('sound').matchingKeys.has('sounds')).toBe(true);
      expect(filterSettings('audio').matchingKeys.has('sounds')).toBe(true);
      expect(filterSettings('chime').matchingKeys.has('sounds')).toBe(true);
      expect(filterSettings('mute').matchingKeys.has('sounds')).toBe(true);
    });

    it('finds glossary settings under Appearance', () => {
      expect(filterSettings('glossary').matchingKeys.has('glossary')).toBe(true);
      expect(filterSettings('info').matchingKeys.has('glossary')).toBe(true);
      expect(filterSettings('词汇').matchingKeys.has('glossary')).toBe(true);
      expect(filterSettings('glossary').matchingSections.has('appearance')).toBe(true);
    });

    it('does not expose a streak pause setting', () => {
      const streakKey = 'streak' as SettingItemKey;
      expect(SETTING_DEFINITIONS.some((d) => d.key === streakKey)).toBe(false);
      expect(filterSettings('streak').matchingKeys.has(streakKey)).toBe(false);
    });

    it('finds reminder settings', () => {
      const res = filterSettings('reminder');
      expect(res.matchingKeys.has('reminder_spending')).toBe(true);
      expect(res.matchingKeys.has('reminder_owed')).toBe(true);
      expect(res.matchingKeys.has('reminder_commitments')).toBe(true);
      expect(res.matchingSections.has('reminders')).toBe(true);
    });

    it('finds specific reminder by intent', () => {
      expect(filterSettings('spending').matchingKeys.has('reminder_spending')).toBe(true);
      expect(filterSettings('owed').matchingKeys.has('reminder_owed')).toBe(true);
      expect(filterSettings('debt').matchingKeys.has('reminder_owed')).toBe(true);
      expect(filterSettings('bills').matchingKeys.has('reminder_commitments')).toBe(true);
    });

    it('finds tax relief settings', () => {
      const res = filterSettings('tax');
      expect(res.matchingKeys.has('data_tax')).toBe(true);
      expect(res.matchingSections.has('data')).toBe(true);
      expect(filterSettings('relief').matchingKeys.has('data_tax')).toBe(true);
      expect(filterSettings('deduction').matchingKeys.has('data_tax')).toBe(true);
      expect(filterSettings('lhdn').matchingKeys.has('data_tax')).toBe(true);
    });

    it('finds export and report settings', () => {
      expect(filterSettings('export').matchingKeys.has('data_export')).toBe(true);
      expect(filterSettings('csv').matchingKeys.has('data_export')).toBe(true);
      expect(filterSettings('xlsx').matchingKeys.has('data_export')).toBe(true);
      expect(filterSettings('pdf').matchingKeys.has('data_export')).toBe(true);
      expect(filterSettings('backup').matchingKeys.has('data_export')).toBe(true);
    });

    it('finds import settings', () => {
      expect(filterSettings('import').matchingKeys.has('data_import')).toBe(true);
      expect(filterSettings('bank statement').matchingKeys.has('data_import')).toBe(true);
    });

    it('finds category settings', () => {
      expect(filterSettings('categories').matchingKeys.has('data_categories')).toBe(true);
      expect(filterSettings('custom category').matchingKeys.has('data_categories')).toBe(true);
    });

    it('finds currency settings', () => {
      expect(filterSettings('currency').matchingKeys.has('data_currencies')).toBe(true);
      expect(filterSettings('currencies').matchingKeys.has('data_currencies')).toBe(true);
      expect(filterSettings('multi-currency').matchingKeys.has('data_currencies')).toBe(true);
      expect(filterSettings('exchange rate').matchingKeys.has('data_currencies')).toBe(true);
    });

    it('finds tutorial replay settings under About', () => {
      expect(filterSettings('tutorial').matchingKeys.has('about_tutorial')).toBe(true);
      expect(filterSettings('replay').matchingKeys.has('about_tutorial')).toBe(true);
      expect(filterSettings('onboarding').matchingKeys.has('about_tutorial')).toBe(true);
      expect(filterSettings('tutorial').matchingSections.has('about')).toBe(true);
    });

    it('finds About rows by manage, instagram, and bug report', () => {
      expect(filterSettings('manage').matchingKeys.has('about_manage')).toBe(true);
      expect(filterSettings('cancel').matchingKeys.has('about_manage')).toBe(true);
      expect(filterSettings('instagram').matchingKeys.has('about_connect')).toBe(true);
      expect(filterSettings('privacy').matchingKeys.has('about_privacy')).toBe(true);
      expect(filterSettings('terms').matchingKeys.has('about_terms')).toBe(true);
      expect(filterSettings('bug').matchingKeys.has('about_bug')).toBe(true);
      expect(filterSettings('version').matchingKeys.has('about_version')).toBe(true);
      expect(filterSettings('about').matchingSections.has('about')).toBe(true);
    });

    it('finds danger zone reset settings', () => {
      const res = filterSettings('reset');
      expect(res.matchingKeys.has('danger_reset_all')).toBe(true);
      expect(res.matchingKeys.has('danger_reset_setup')).toBe(true);
      expect(filterSettings('wipe').matchingKeys.has('danger_reset_all')).toBe(true);
      expect(filterSettings('danger').matchingSections.has('danger')).toBe(true);
    });

    it('finds learning and budget settings', () => {
      expect(filterSettings('merchant').matchingKeys.has('learning')).toBe(true);
      expect(filterSettings('budget').matchingKeys.has('budget')).toBe(true);
      expect(filterSettings('income').matchingKeys.has('budget')).toBe(true);
    });
  });

  describe('Simplified Chinese search queries', () => {
    it('finds settings with Chinese keywords', () => {
      expect(filterSettings('主题').matchingKeys.has('theme')).toBe(true);
      expect(filterSettings('深色').matchingKeys.has('theme')).toBe(true);
      expect(filterSettings('夜间模式').matchingKeys.has('theme')).toBe(true);
      expect(filterSettings('语言').matchingKeys.has('language')).toBe(true);
      expect(filterSettings('简体中文').matchingKeys.has('language')).toBe(true);
      expect(filterSettings('强调色').matchingKeys.has('accent')).toBe(true);
      expect(filterSettings('图标').matchingKeys.has('accent')).toBe(true);
      expect(filterSettings('动画').matchingKeys.has('motion')).toBe(true);
      expect(filterSettings('触感').matchingKeys.has('motion')).toBe(true);
      expect(filterSettings('音效').matchingKeys.has('sounds')).toBe(true);
      expect(filterSettings('提醒').matchingSections.has('reminders')).toBe(true);
      expect(filterSettings('记账提醒').matchingKeys.has('reminder_spending')).toBe(true);
      expect(filterSettings('催款').matchingKeys.has('reminder_owed')).toBe(true);
      expect(filterSettings('税务').matchingKeys.has('data_tax')).toBe(true);
      expect(filterSettings('退税').matchingKeys.has('data_tax')).toBe(true);
      expect(filterSettings('报税').matchingKeys.has('data_tax')).toBe(true);
      expect(filterSettings('导出').matchingKeys.has('data_export')).toBe(true);
      expect(filterSettings('报表').matchingKeys.has('data_export')).toBe(true);
      expect(filterSettings('导入').matchingKeys.has('data_import')).toBe(true);
      expect(filterSettings('货币').matchingKeys.has('data_currencies')).toBe(true);
      expect(filterSettings('汇率').matchingKeys.has('data_currencies')).toBe(true);
      expect(filterSettings('分类').matchingKeys.has('data_categories')).toBe(true);
      expect(filterSettings('教程').matchingKeys.has('about_tutorial')).toBe(true);
      expect(filterSettings('关于').matchingSections.has('about')).toBe(true);
      expect(filterSettings('隐私政策').matchingKeys.has('about_privacy')).toBe(true);
      expect(filterSettings('使用条款').matchingKeys.has('about_terms')).toBe(true);
      expect(filterSettings('报告问题').matchingKeys.has('about_bug')).toBe(true);
      expect(filterSettings('管理订阅').matchingKeys.has('about_manage')).toBe(true);
      expect(filterSettings('重置').matchingKeys.has('danger_reset_all')).toBe(true);
      expect(filterSettings('清空').matchingKeys.has('danger_reset_all')).toBe(true);
      expect(filterSettings('预算').matchingKeys.has('budget')).toBe(true);
      expect(filterSettings('智能记忆').matchingKeys.has('learning')).toBe(true);
    });
  });

  describe('Section name matching', () => {
    it('matches all settings in a section when searching the section title', () => {
      const appResult = filterSettings('Appearance');
      expect(appResult.matchingSections.has('appearance')).toBe(true);
      expect(appResult.matchingKeys.has('theme')).toBe(true);
      expect(appResult.matchingKeys.has('language')).toBe(true);
      expect(appResult.matchingKeys.has('accent')).toBe(true);

      const remResult = filterSettings('Reminders');
      expect(remResult.matchingSections.has('reminders')).toBe(true);
      expect(remResult.matchingKeys.has('reminder_spending')).toBe(true);
      expect(remResult.matchingKeys.has('reminder_owed')).toBe(true);
      expect(remResult.matchingKeys.has('reminder_commitments')).toBe(true);
    });
  });

  describe('Non-matching queries', () => {
    it('returns empty matches when query does not match any setting', () => {
      const result = filterSettings('xyz_nonexistent_query_12345');
      expect(result.isSearching).toBe(true);
      expect(result.hasMatches).toBe(false);
      expect(result.matchingKeys.size).toBe(0);
      expect(result.matchingSections.size).toBe(0);
    });
  });

  describe('Dynamic context keywords', () => {
    it('matches dynamically active currencies passed in context', () => {
      const withoutCtx = filterSettings('SGD');
      expect(withoutCtx.matchingKeys.has('data_currencies')).toBe(true); // SGD is in static keywords

      const customCode = filterSettings('BRL', { data_currencies: ['BRL', 'MYR'] });
      expect(customCode.matchingKeys.has('data_currencies')).toBe(true);
    });
  });
});
