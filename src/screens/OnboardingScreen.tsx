// src/screens/OnboardingScreen.tsx
// The app's front door setup wizard:
// 1. Pip intro: "Know your money."
// 2. Old money manager import ask.
// 3. Appearance -> Demo -> Notifications -> Backup (Android/web) -> Widget.
// Users can return to any earlier setup step with the wizard back control.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn } from '../components/Motion';
import { ProgressTrack, TopBar } from '../components/ui';
import * as haptics from '../lib/haptics';
import {
  getPreviousDemoBeat,
  getPreviousWizardStep,
  getWizardNavInfo,
  type DemoBeat,
  type WizardStep,
} from '../lib/onboardingNav';
import { DEMO_RECEIPT_LINES } from '../data/demoReceipt';
import type { ReceiptLine } from '../lib/split';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useBackHandler, useExitConfirm } from '../state/useBackHandler';
import { useLanguage } from '../i18n';
import { spacing } from '../theme';
import { DEMO_STEP_ENABLED } from '../config/onboardingFlags';
import { isGoogleDrivePlatform } from '../lib/cloudBackup/googleAuth';
import { AdvancedImportScreen } from './AdvancedImportScreen';
import { AppearanceStep } from './onboarding/AppearanceStep';
import { BackupStep } from './onboarding/BackupStep';
import { DemoStep } from './onboarding/DemoStep';
import { ImportStep } from './onboarding/ImportStep';
import { NotificationsStep } from './onboarding/NotificationsStep';
import { PipIntroStep } from './onboarding/PipIntroStep';
import { WidgetStep } from './onboarding/WidgetStep';

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const colorTheme = useThemeColors();
  const { completeOnboarding } = useAppData();
  const { t } = useLanguage();

  const [step, setStep] = useState<WizardStep>('intro');
  const [hasImported, setHasImported] = useState(false);
  // Which way the wizard last moved. Forward, the incoming step rises into place; back, it
  // settles down from above, so the direction of travel is legible without a slide transition.
  const [back, setBack] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // The demo's own state lives here, not inside the step. The wizard's back button walks the
  // demo's beats before leaving it, and returning from Notifications preserves the split.
  const [demoBeat, setDemoBeat] = useState<DemoBeat>('offer');
  const [demoLines, setDemoLines] = useState<ReceiptLine[]>(DEMO_RECEIPT_LINES);

  const finish = () => {
    if (finishing) return;
    setFinishing(true);
    haptics.payoff();
    void completeOnboarding();
  };

  const advance = (nextStep: WizardStep) => {
    setBack(false);
    setStep(nextStep);
  };

  /** Both import outcomes flow through appearance before the optional demo. */
  const afterImport = (): WizardStep => 'appearance';

  const afterAppearance = (): WizardStep => (DEMO_STEP_ENABLED ? 'demo' : 'notifications');
  const withCloudBackup = isGoogleDrivePlatform(Platform.OS);
  const afterNotifications = (): WizardStep => (withCloudBackup ? 'backup' : 'widget');

  const goBack = () => {
    // Inside the demo, back rewinds a beat at a time and only leaves the step once there is
    // nothing left to rewind.
    if (step === 'demo') {
      const prevBeat = getPreviousDemoBeat(demoBeat);
      if (prevBeat) {
        haptics.tap();
        setBack(true);
        setDemoBeat(prevBeat);
        return;
      }
    }

    const prev = getPreviousWizardStep(step, hasImported, DEMO_STEP_ENABLED, withCloudBackup);
    if (!prev) return;
    haptics.tap();
    setBack(true);
    setStep(prev);
  };

  // The wizard's intro step is the app's true front door — there's no screen further back to
  // fall through to, so hardware/gesture back gets the same "press again to exit" gate Home
  // uses once onboarding is done.
  const confirmExit = useExitConfirm();
  useBackHandler(() => {
    if (step !== 'intro') {
      goBack();
      return true;
    }
    return confirmExit();
  });

  const navInfo = getWizardNavInfo(step, hasImported, DEMO_STEP_ENABLED, withCloudBackup);

  const getLocalizedWizardTitle = (title: string) => {
    switch (title) {
      case 'Import data':
        return t('wizardImportTitle');
      case 'Appearance':
        return t('wizardAppearanceTitle');
      case 'Notifications':
        return t('wizardNotificationsTitle');
      case 'Backup':
        return t('wizardBackupTitle');
      case 'Widget':
        return t('wizardWidgetTitle');
      case 'Demo':
        return t('wizardDemoTitle');
      default:
        return title;
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {navInfo && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={getLocalizedWizardTitle(navInfo.title)} onBack={goBack} />
          <View style={{ paddingHorizontal: 18, paddingTop: 2 }}>
            <ProgressTrack pct={navInfo.progressPct} height={5} />
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Keyed on `step` so each step remounts and replays its entrance; the steps hold no
            state worth preserving across a move, and the back button re-enters an earlier one
            fresh rather than showing a half-filled form the user already skipped past. */}
        <FadeIn key={step} style={styles.fill} offset={back ? -14 : 16}>
          {step === 'intro' && <PipIntroStep onNext={() => advance('import')} />}
          {step === 'import' && (
            <ImportStep
              hasImported={hasImported}
              onStartImport={() => advance('advanced_import')}
              onSkip={() => {
                setHasImported(false);
                advance(afterImport());
              }}
              onContinue={() => advance(afterImport())}
            />
          )}
          {step === 'advanced_import' && (
            <AdvancedImportScreen
              onClose={goBack}
              onSuccess={() => {
                setHasImported(true);
                advance(afterImport());
              }}
              isWizard
            />
          )}
          {step === 'appearance' && <AppearanceStep onNext={() => advance(afterAppearance())} />}
          {step === 'demo' && (
            <DemoStep
              beat={demoBeat}
              onBeat={setDemoBeat}
              lines={demoLines}
              onLines={setDemoLines}
              onNext={() => advance('notifications')}
              onSkip={() => advance('notifications')}
            />
          )}
          {step === 'notifications' && (
            <NotificationsStep
              onNext={() => advance(afterNotifications())}
              onSkip={() => advance(afterNotifications())}
            />
          )}
          {step === 'backup' && (
            <BackupStep
              onNext={() => advance('widget')}
              onSkip={() => advance('widget')}
            />
          )}
          {step === 'widget' && <WidgetStep onFinish={finish} />}
        </FadeIn>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1, paddingTop: spacing.sm },
});
