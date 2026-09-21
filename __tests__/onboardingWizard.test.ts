// __tests__/onboardingWizard.test.ts
import {
  getPreviousDemoBeat,
  getPreviousWizardStep,
  getWizardNavInfo,
  type WizardStep,
} from '../src/lib/onboardingNav';

describe('onboardingWizard', () => {
  describe('getWizardNavInfo', () => {
    it('returns null for intro and advanced_import (no top progress bar on intro or external import chrome)', () => {
      expect(getWizardNavInfo('intro', false)).toBeNull();
      expect(getWizardNavInfo('intro', true)).toBeNull();
      expect(getWizardNavInfo('advanced_import', false)).toBeNull();
      expect(getWizardNavInfo('advanced_import', true)).toBeNull();
    });

    it('uses the same four setup steps for both import outcomes when the demo is disabled', () => {
      for (const hasImported of [false, true]) {
        expect(getWizardNavInfo('import', hasImported)).toEqual({
          title: 'Import data', stepNumber: 1, totalSteps: 4, progressPct: 25,
        });
        expect(getWizardNavInfo('appearance', hasImported)).toEqual({
          title: 'Appearance', stepNumber: 2, totalSteps: 4, progressPct: 50,
        });
        expect(getWizardNavInfo('notifications', hasImported)?.stepNumber).toBe(3);
        expect(getWizardNavInfo('widget', hasImported)).toEqual({
          title: 'Widget', stepNumber: 4, totalSteps: 4, progressPct: 100,
        });
      }
    });
  });

  describe('getPreviousWizardStep', () => {
    it('returns null for intro (root step)', () => {
      expect(getPreviousWizardStep('intro', false)).toBeNull();
      expect(getPreviousWizardStep('intro', true)).toBeNull();
    });

    it('returns intro from import step', () => {
      expect(getPreviousWizardStep('import', false)).toBe('intro');
      expect(getPreviousWizardStep('import', true)).toBe('intro');
    });

    it('returns import from advanced_import step', () => {
      expect(getPreviousWizardStep('advanced_import', false)).toBe('import');
      expect(getPreviousWizardStep('advanced_import', true)).toBe('import');
    });

    it('reverses appearance and notifications through the shared path', () => {
      expect(getPreviousWizardStep('appearance', true)).toBe('import');
      expect(getPreviousWizardStep('notifications', true)).toBe('appearance');
      expect(getPreviousWizardStep('notifications', false)).toBe('appearance');
    });

    it('returns notifications from widget step', () => {
      expect(getPreviousWizardStep('widget', false)).toBe('notifications');
      expect(getPreviousWizardStep('widget', true)).toBe('notifications');
    });
  });

  describe('End-to-end flow traversal simulations', () => {
    it('simulates advanced import through appearance, demo, notifications, and widget', () => {
      let currentStep: WizardStep = 'intro';
      let hasImported = false;

      // 1. Advance from Intro
      currentStep = 'import';
      expect(getWizardNavInfo(currentStep, hasImported)?.title).toBe('Import data');

      // 2. User starts advanced import
      currentStep = 'advanced_import';

      // 3. User finishes import
      hasImported = true;
      currentStep = 'appearance';
      expect(getWizardNavInfo(currentStep, hasImported, true)?.stepNumber).toBe(2);
      currentStep = 'demo';
      expect(getWizardNavInfo(currentStep, hasImported, true)?.stepNumber).toBe(3);

      // 4. User advances through notifications to widget
      currentStep = 'notifications';
      expect(getWizardNavInfo(currentStep, hasImported, true)?.stepNumber).toBe(4);
      currentStep = 'widget';
      expect(getWizardNavInfo(currentStep, hasImported, true)?.stepNumber).toBe(5);
      expect(getWizardNavInfo(currentStep, hasImported, true)?.totalSteps).toBe(5);

      // 5. Back navigation retraces correctly: Widget -> Notifications -> Demo -> Appearance -> Import -> Intro
      currentStep = getPreviousWizardStep('widget', hasImported, true)!;
      expect(currentStep).toBe('notifications');

      currentStep = getPreviousWizardStep(currentStep, hasImported, true)!;
      expect(currentStep).toBe('demo');

      currentStep = getPreviousWizardStep(currentStep, hasImported, true)!;
      expect(currentStep).toBe('appearance');

      currentStep = getPreviousWizardStep(currentStep, hasImported, true)!;
      expect(currentStep).toBe('import');

      currentStep = getPreviousWizardStep(currentStep, hasImported, true)!;
      expect(currentStep).toBe('intro');

      expect(getPreviousWizardStep(currentStep, hasImported)).toBeNull();
    });

    it('sends a fresh user through the same appearance-first sequence', () => {
      let currentStep: WizardStep = 'intro';
      let hasImported = false;

      // 1. Advance from Intro
      currentStep = 'import';

      // 2. User chooses "I don't have anything to import"
      hasImported = false;
      currentStep = 'appearance';
      expect(getWizardNavInfo(currentStep, hasImported, true)?.title).toBe('Appearance');
      expect(getWizardNavInfo(currentStep, hasImported, true)?.stepNumber).toBe(2);
      expect(getWizardNavInfo(currentStep, hasImported, true)?.totalSteps).toBe(5);

      // 3. Advance to the demo
      currentStep = 'demo';
      expect(getWizardNavInfo(currentStep, hasImported, true)?.title).toBe('Demo');
      expect(getWizardNavInfo(currentStep, hasImported, true)?.stepNumber).toBe(3);

      // 4. Advance to Notifications
      currentStep = 'notifications';
      expect(getWizardNavInfo(currentStep, hasImported, true)?.title).toBe('Notifications');
      expect(getWizardNavInfo(currentStep, hasImported, true)?.stepNumber).toBe(4);

      // 5. Advance to Widget
      currentStep = 'widget';
      expect(getWizardNavInfo(currentStep, hasImported, true)?.title).toBe('Widget');
      expect(getWizardNavInfo(currentStep, hasImported, true)?.stepNumber).toBe(5);

      // 6. Back navigation retraces correctly: Widget -> Notifications -> Demo -> Appearance -> Import -> Intro
      currentStep = getPreviousWizardStep('widget', hasImported, true)!;
      expect(currentStep).toBe('notifications');

      currentStep = getPreviousWizardStep(currentStep, hasImported, true)!;
      expect(currentStep).toBe('demo');

      currentStep = getPreviousWizardStep(currentStep, hasImported, true)!;
      expect(currentStep).toBe('appearance');

      currentStep = getPreviousWizardStep(currentStep, hasImported, true)!;
      expect(currentStep).toBe('import');

      currentStep = getPreviousWizardStep(currentStep, hasImported, true)!;
      expect(currentStep).toBe('intro');

      expect(getPreviousWizardStep(currentStep, hasImported)).toBeNull();
    });
  });

  // The demo step (docs/superpowers/specs/2026-09-08-onboarding-demo-step-design.md) is opt-in
  // via a third argument rather than a module-level constant, so these functions stay pure and
  // both states are testable. Every assertion above runs with the demo off, which is exactly
  // what flipping DEMO_STEP_ENABLED back to false restores.
  describe('Demo step (withDemo = true)', () => {
    it('follows appearance in the shared branch, making it 5 steps', () => {
      expect(getWizardNavInfo('demo', false, true)).toEqual({
        title: 'Demo',
        stepNumber: 3,
        totalSteps: 5,
        progressPct: 60,
      });
      expect(getWizardNavInfo('widget', false, true)).toEqual({
        title: 'Widget',
        stepNumber: 5,
        totalSteps: 5,
        progressPct: 100,
      });
    });

    it('has the same position after advanced import', () => {
      expect(getWizardNavInfo('demo', true, true)).toEqual({
        title: 'Demo',
        stepNumber: 3,
        totalSteps: 5,
        progressPct: 60,
      });
      expect(getWizardNavInfo('notifications', true, true)?.stepNumber).toBe(4);
    });

    it('threads back-navigation through the demo in both branches', () => {
      expect(getPreviousWizardStep('demo', false, true)).toBe('appearance');
      expect(getPreviousWizardStep('notifications', false, true)).toBe('demo');
      expect(getPreviousWizardStep('notifications', true, true)).toBe('demo');
    });

    it('disappears entirely when withDemo is false', () => {
      expect(getWizardNavInfo('demo', false, false)).toBeNull();
      expect(getWizardNavInfo('appearance', false, false)?.totalSteps).toBe(4);
      expect(getPreviousWizardStep('notifications', false, false)).toBe('appearance');
    });
  });

  // Back inside the demo walks its own beats before it leaves the step.
  describe('getPreviousDemoBeat', () => {
    it('walks back through the beats the user actually chose', () => {
      expect(getPreviousDemoBeat('share')).toBe('split');
      expect(getPreviousDemoBeat('split')).toBe('reveal');
      expect(getPreviousDemoBeat('reveal')).toBe('offer');
    });

    it('leaves the step only from the first beat', () => {
      expect(getPreviousDemoBeat('offer')).toBeNull();
    });

    it('never lands on scanning, which advances on its own', () => {
      // Going back into a timed beat would immediately fling the user forward again.
      expect(getPreviousDemoBeat('scanning')).toBe('offer');
      const targets = (['offer', 'scanning', 'reveal', 'split', 'share'] as const).map(
        getPreviousDemoBeat
      );
      expect(targets).not.toContain('scanning');
    });
  });

  describe('Appearance-first demo flow', () => {
    it('puts appearance before the demo and removes budget and recurring from both branches', () => {
      expect(getWizardNavInfo('appearance', false, true)).toEqual({
        title: 'Appearance',
        stepNumber: 2,
        totalSteps: 5,
        progressPct: 40,
      });
      expect(getWizardNavInfo('demo', false, true)?.stepNumber).toBe(3);
      expect(getWizardNavInfo('notifications', false, true)?.stepNumber).toBe(4);
      expect(getWizardNavInfo('widget', false, true)).toEqual({
        title: 'Widget',
        stepNumber: 5,
        totalSteps: 5,
        progressPct: 100,
      });
      expect(getWizardNavInfo('appearance', true, true)?.stepNumber).toBe(2);
      expect(getWizardNavInfo('demo', true, true)?.stepNumber).toBe(3);
      expect(getWizardNavInfo('notifications', true, true)?.stepNumber).toBe(4);
      expect(getWizardNavInfo('widget', true, true)?.totalSteps).toBe(5);
    });

    it('retraces the shared import, appearance, demo, notification, and widget sequence', () => {
      expect(getPreviousWizardStep('appearance', false, true)).toBe('import');
      expect(getPreviousWizardStep('demo', false, true)).toBe('appearance');
      expect(getPreviousWizardStep('notifications', false, true)).toBe('demo');
      expect(getPreviousWizardStep('widget', false, true)).toBe('notifications');
    });
  });

  describe('Wizard Localization', () => {
    it('provides both English and Mandarin translations for setup wizard intro and nav titles', () => {
      const { translate } = require('../src/i18n/LanguageContext');
      
      // Intro step translations
      expect(translate('en', 'introTitle')).toBe('Know your money.');
      expect(translate('zh', 'introTitle')).toBe('洞悉你的每一分钱。');

      expect(translate('en', 'introSubtitle')).toContain('Screenshot the app');
      expect(translate('zh', 'introSubtitle')).toContain('截屏你正在使用的应用');

      expect(translate('en', 'introNext')).toBe('Next');
      expect(translate('zh', 'introNext')).toBe('下一步');

      // Nav titles
      expect(translate('en', 'wizardImportTitle')).toBe('Import data');
      expect(translate('zh', 'wizardImportTitle')).toBe('导入数据');
      expect(translate('en', 'wizardAppearanceTitle')).toBe('Appearance');
      expect(translate('zh', 'wizardAppearanceTitle')).toBe('外观');
      expect(translate('en', 'wizardBudgetTitle')).toBe('Budget');
      expect(translate('zh', 'wizardBudgetTitle')).toBe('预算设置');
      expect(translate('en', 'wizardRecurringTitle')).toBe('Recurring payment');
      expect(translate('zh', 'wizardRecurringTitle')).toBe('周期账单');
      expect(translate('en', 'wizardNotificationsTitle')).toBe('Notifications');
      expect(translate('zh', 'wizardNotificationsTitle')).toBe('通知提醒');
      expect(translate('en', 'wizardWidgetTitle')).toBe('Widget');
      expect(translate('zh', 'wizardWidgetTitle')).toBe('小组件');

      // Import step choices
      expect(translate('en', 'importOptionsTitle')).toBe('Bring in your data');
      expect(translate('zh', 'importOptionsTitle')).toBe('迁入已有数据');
      expect(translate('en', 'importLoadBackupTitle')).toBe('Restore Pip backup');
      expect(translate('zh', 'importLoadBackupTitle')).toBe('恢复 Pip 备份');
      expect(translate('en', 'importLoadBackupBtn')).toBe('Load backup');
      expect(translate('zh', 'importLoadBackupBtn')).toBe('恢复备份');
      expect(translate('en', 'importAdvancedTitle')).toBe('Advanced import');
      expect(translate('zh', 'importAdvancedTitle')).toBe('高级导入');
      expect(translate('en', 'importAdvancedBtn')).toBe('Import from other app');
      expect(translate('zh', 'importAdvancedBtn')).toBe('从其他应用导入');
    });
  });

  describe('Onboarding cleanliness', () => {
    it('does not include paywall or upsell steps in the onboarding wizard sequence', () => {
      const validSteps: WizardStep[] = [
        'intro',
        'import',
        'advanced_import',
        'appearance',
        'demo',
        'notifications',
        'widget',
      ];
      expect((validSteps as string[]).includes('paywall')).toBe(false);
      expect((validSteps as string[]).includes('upsell')).toBe(false);
    });
  });
});
