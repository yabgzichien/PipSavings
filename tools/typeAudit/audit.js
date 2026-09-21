// @ts-check
/**
 * tools/typeAudit/audit.js
 * Mechanical guard for the type and spacing scale (docs/ui-design-plan.md §4), same shape as
 * tools/contrastAudit/audit.js. The finding that motivated this: 30 distinct fontSize values
 * across 507 declarations and 29 spacing values with a 61% off-4pt-grid rate, because nothing
 * stopped either number from drifting. A scale that isn't mechanically enforced doesn't stay
 * fixed — this is the enforcement.
 *
 * Two checks, per file:
 *   1. No raw `fontSize:` outside src/components/ui.tsx (where the five primitives live).
 *      Screens/components consume type via <Display>/<Title>/<Body>/<Label>/<Caption>.
 *   2. Every padding/margin/gap literal is one of ALLOWED_SPACING (kept in sync with
 *      `spacing` in src/theme.ts by hand — this is plain Node, no TS transpile, so it can't
 *      import that module directly, the same constraint contrastAudit works around).
 *
 * Files not yet migrated to the new scale are listed in ALLOWLIST below and skipped
 * entirely — both checks — rather than silently passing. Migrating a screen means deleting
 * its line from this list, not adding exceptions around it. When ALLOWLIST is empty, this
 * audit covers every screen and component in the app.
 *
 * Run:  node tools/typeAudit/audit.js
 * Exits non-zero (and prints every violation) if any migrated file fails either check.
 */

'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');

// ── Policy constants — keep in sync with src/theme.ts `spacing` and `type` ─────────────────
const ALLOWED_SPACING = [0, 4, 8, 12, 16, 24, 32];

// ── Files not yet migrated to the primitives + spacing scale. Delete a line here as part of
// the commit that migrates that file, not before. ─────────────────────────────────────────
const ALLOWLIST = new Set([
  // The primitives file. Its raw fontSize is exempt by design (see EXEMPT_BY_DESIGN below) —
  // but its OWN internal component spacing (Card, chip, TopBar, buttons) is still the old ad
  // hoc values, used by all ~50 other files here. Migrating it ripples visually into every
  // screen at once, including the ~40 not yet migrated to the new scale, so it's its own
  // follow-up pass rather than bundled into this one. Listed here, not fixed quietly.
  'src/components/ui.tsx',
  'src/components/AccountLinkField.tsx',
  'src/components/AddAccountModal.tsx',
  'src/components/AddCategoryModal.tsx',
  'src/components/AddPersonModal.tsx',
  'src/components/AppAlertModal.tsx',
  'src/components/BottomNav.tsx',
  'src/components/BrandBadge.tsx',
  'src/components/BudgetProgressList.tsx',
  'src/components/CalcBadge.tsx',
  'src/components/CashflowStructure.tsx',
  'src/components/CoinMascot.tsx',
  'src/components/CurrencyChip.tsx',
  'src/components/EditTransactionModal.tsx',
  'src/components/ErrorBoundary.tsx',
  'src/components/ExportSuccessModal.tsx',
  'src/components/GlossaryVisualGuide.tsx',
  'src/components/Icon.tsx',
  'src/components/InfoButton.tsx',
  'src/components/InstitutionBadge.tsx',
  'src/components/InstitutionField.tsx',
  'src/components/MapCommitmentSheet.tsx',
  'src/components/Motion.tsx',
  'src/components/OnboardingTutorialCard.tsx',
  'src/components/PieChart.tsx',
  'src/components/Pip.tsx',
  'src/components/QuickAddField.tsx',
  'src/components/ReceiptItemModal.tsx',
  'src/components/ReliefTagEditSheet.tsx',
  'src/components/ReviewCheckInToast.tsx',
  'src/components/SavingsHabitCard.tsx',
  'src/components/ScanBalanceButton.tsx',
  'src/components/ScanProgressBar.tsx',
  'src/components/ScanQuotaBadge.tsx',
  'src/components/SettleSheet.tsx',
  'src/components/SplitSheet.tsx',
  'src/components/TickerSearchModal.tsx',
  'src/components/TourAnchor.tsx',
  'src/components/TourSpotlight.tsx',
  'src/components/TransactionFilterModal.tsx',
  'src/screens/AddFlow.tsx',
  'src/screens/AdvancedImportScreen.tsx',
  'src/screens/AllTransactionsScreen.tsx',
  'src/screens/BalanceScanScreen.tsx',
  'src/screens/BreakdownScreen.tsx',
  'src/screens/BudgetWizard.tsx',
  'src/screens/CalendarScreen.tsx',
  'src/screens/CategoriesScreen.tsx',
  'src/screens/CategorizeScreen.tsx',
  'src/screens/CommitmentsScreen.tsx',
  'src/screens/CurrencySettingsScreen.tsx',
  'src/screens/DashboardScreen.tsx',
  'src/screens/ExportScreen.tsx',
  'src/screens/ExtractScreen.tsx',
  'src/screens/ImportReviewScreen.tsx',
  'src/screens/ImportScreen.tsx',
  'src/screens/ManualEntryScreen.tsx',
  'src/screens/NetWorthScreen.tsx',
  'src/screens/OnboardingScreen.tsx',
  'src/screens/OwedScreen.tsx',
  'src/screens/ReceiptScanScreen.tsx',
  'src/screens/SavedScreen.tsx',
  'src/screens/SettingsScreen.tsx',
  'src/screens/TaxScreen.tsx',
  'src/screens/onboarding/BudgetStep.tsx',
  'src/screens/onboarding/ImportStep.tsx',
  'src/screens/onboarding/NotificationsStep.tsx',
  'src/screens/onboarding/PipIntroStep.tsx',
  'src/screens/onboarding/RecurringPaymentStep.tsx',
  'src/screens/onboarding/WidgetStep.tsx',
  'src/widget/QuickRecordWidget.tsx',
  'src/widget/StreakWidget.tsx',
  'src/widget/syncQuickRecordWidget.tsx',
  'src/widget/syncStreakWidget.tsx',
  'src/widget/widgetTask.tsx',
  'App.tsx',
]);

// The primitives' own definition file: raw fontSize here is the point, not a violation.
const EXEMPT_BY_DESIGN = new Set(['src/components/ui.tsx']);

const SPACING_PROPS = [
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingHorizontal', 'paddingVertical',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical',
  'gap', 'rowGap', 'columnGap',
];
const SPACING_RE = new RegExp(`\\b(${SPACING_PROPS.join('|')}):\\s*(-?[0-9]+(?:\\.[0-9]+)?)`, 'g');
const FONT_SIZE_RE = /\bfontSize:\s*([0-9]+(?:\.[0-9]+)?)/g;
const IGNORE_MARKER = 'spacing-audit-ignore';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) out.push(full);
  }
  return out;
}

function checkFile(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join('/');
  if (ALLOWLIST.has(rel)) return [];

  const exempt = EXEMPT_BY_DESIGN.has(rel);
  const src = fs.readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  const violations = [];

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (line.includes(IGNORE_MARKER)) return;

    if (!exempt) {
      FONT_SIZE_RE.lastIndex = 0;
      let m;
      while ((m = FONT_SIZE_RE.exec(line))) {
        violations.push(`${rel}:${lineNo}  raw fontSize: ${m[1]}  — use <Display>/<Title>/<Body>/<Label>/<Caption>`);
      }
    }

    SPACING_RE.lastIndex = 0;
    let sm;
    while ((sm = SPACING_RE.exec(line))) {
      const [, prop, valueStr] = sm;
      const value = parseFloat(valueStr);
      if (value < 0) continue; // negative offsets are positioning, not spacing-scale rhythm
      if (!ALLOWED_SPACING.includes(value)) {
        violations.push(`${rel}:${lineNo}  ${prop}: ${valueStr}  — not on the spacing scale (${ALLOWED_SPACING.join('/')})`);
      }
    }
  });

  return violations;
}

// ── Run ──────────────────────────────────────────────────────────────────────────────────
const targets = [
  ...walk(path.join(ROOT, 'src', 'components')),
  ...walk(path.join(ROOT, 'src', 'screens')),
  ...walk(path.join(ROOT, 'src', 'widget')),
  path.join(ROOT, 'App.tsx'),
].filter((f) => fs.existsSync(f));

let allViolations = [];
let checked = 0;
let skipped = 0;
for (const file of targets) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (ALLOWLIST.has(rel)) {
    skipped++;
    continue;
  }
  checked++;
  allViolations = allViolations.concat(checkFile(file));
}

for (const v of allViolations) console.error(`FAIL  ${v}`);

console.log(`\n${checked} file(s) checked, ${skipped} allowlisted (not yet migrated), ${allViolations.length} violation(s).`);
if (allViolations.length > 0) {
  console.error(`${allViolations.length} violation(s) FAILED. Use the type/spacing scale, don't add a one-off number.`);
  process.exit(1);
}

// ── Honest scope note ───────────────────────────────────────────────────────────────────
// This checks two axes only: fontSize literals and padding/margin/gap literals. It does not
// check fontFamily/weight (still funneled through uiFont()/numFont(), which only expose the
// weights those helpers map to — see theme.ts) or borderRadius (already tokenised via
// `radius`, three values, low drift risk). A negative spacing value is assumed to be a
// positioning offset (centering, overlap) rather than a rhythm value and is not checked; add
// `// spacing-audit-ignore` on a line to exempt a genuine one-off (a scroll-content bottom
// padding clearing the tab bar, say) — use it rarely enough that grep for it stays a review
// signal, not a second allowlist.
