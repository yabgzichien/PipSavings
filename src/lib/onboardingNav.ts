// src/lib/onboardingNav.ts
// Pure helper functions for setup wizard navigation, progress, and dynamic branching.
//
// The flow is expressed as an ordered list per branch rather than a switch per step, so step
// numbers, totals and back-navigation all derive from one place. Adding or removing a step is
// an edit to a single array — which is what makes the demo step (see
// docs/superpowers/specs/2026-09-08-onboarding-demo-step-design.md) switchable without
// four hand-maintained variants of the same arithmetic.
//
// `withDemo` is a parameter rather than a module-level constant read here: these functions stay
// pure and both states stay testable. The app supplies it from `src/config/onboardingFlags.ts`.

export type WizardStep =
  | 'intro'
  | 'import'
  | 'advanced_import'
  | 'appearance'
  | 'demo'
  | 'notifications'
  | 'backup'
  | 'widget';

/** The beats inside the demo step. Lives here rather than in the component because the wizard's
 *  back button needs to know about them: back should walk the demo before leaving it. */
export type DemoBeat = 'offer' | 'scanning' | 'reveal' | 'split' | 'share';

/**
 * Where back goes from inside the demo, or null when the demo has nothing left to go back to
 * and the wizard should leave the step entirely.
 *
 * `scanning` is never a destination: it advances on a timer, so landing there would fling the
 * user straight forward again. Going back from it returns to the offer.
 */
export function getPreviousDemoBeat(beat: DemoBeat): DemoBeat | null {
  switch (beat) {
    case 'offer':
      return null;
    case 'scanning':
    case 'reveal':
      return 'offer';
    case 'split':
      return 'reveal';
    case 'share':
      return 'split';
  }
}

export interface WizardNavInfo {
  title: string;
  stepNumber: number;
  totalSteps: number;
  progressPct: number;
}

/** English titles. `OnboardingScreen` maps these onto translation keys for display. */
const STEP_TITLES: Partial<Record<WizardStep, string>> = {
  import: 'Import data',
  appearance: 'Appearance',
  demo: 'Demo',
  notifications: 'Notifications',
  backup: 'Backup',
  widget: 'Widget',
};

/**
 * The steps that carry a progress bar, in order.
 *
 * `intro` and `advanced_import` are deliberately absent: the intro is the front door and
 * advanced import is external chrome, and neither shows wizard progress.
 *
 * Both import outcomes feed the same setup sequence: make the app feel like the user's app,
 * see the demo, then opt into notifications, Google Drive auto-backup (Android/web), and widgets.
 * Budgeting and recurring bills remain available in the product, but do not interrupt the
 * first-run path. Google Drive auto-backup is an extra Android/web step.
 */
export function getWizardSteps(
  _hasImported: boolean,
  withDemo: boolean,
  withCloudBackup = false
): WizardStep[] {
  const demo: WizardStep[] = withDemo ? ['demo'] : [];
  const backup: WizardStep[] = withCloudBackup ? ['backup'] : [];
  return ['import', 'appearance', ...demo, 'notifications', ...backup, 'widget'];
}

export function getWizardNavInfo(
  step: WizardStep,
  hasImported: boolean,
  withDemo = false,
  withCloudBackup = false
): WizardNavInfo | null {
  const steps = getWizardSteps(hasImported, withDemo, withCloudBackup);
  const idx = steps.indexOf(step);
  if (idx < 0) return null;

  const title = STEP_TITLES[step];
  if (!title) return null;

  const stepNumber = idx + 1;
  const totalSteps = steps.length;
  return { title, stepNumber, totalSteps, progressPct: (stepNumber / totalSteps) * 100 };
}

export function getPreviousWizardStep(
  step: WizardStep,
  hasImported: boolean,
  withDemo = false,
  withCloudBackup = false
): WizardStep | null {
  if (step === 'intro') return null;
  if (step === 'advanced_import') return 'import';

  const steps = getWizardSteps(hasImported, withDemo, withCloudBackup);
  const idx = steps.indexOf(step);
  // A step outside the active wizard shape has no back destination.
  if (idx < 0) return null;
  // The first progress step falls back to the intro, the wizard's true root.
  return idx === 0 ? 'intro' : steps[idx - 1];
}
