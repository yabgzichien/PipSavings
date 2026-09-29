// src/screens/onboarding/BackupStep.tsx
// Skippable Google Drive auto-backup ask. Same shape as NotificationsStep: Enable signs in,
// turns auto-backup on, and takes a first copy; Skip writes the flag off so a Drive restore
// during import cannot grandfather auto-backup on. Shown on Android and web (iOS skips the
// step entirely — iCloud is still coming soon).
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { FadeIn } from '../../components/Motion';
import { Pip } from '../../components/Pip';
import { Body, BtnLabel, Card, PrimaryButton, Title } from '../../components/ui';
import { useLanguage } from '../../i18n';
import { buildBackupZip } from '../../lib/backupBundle';
import { enableAutoBackup, persistAutoBackupEnabled } from '../../lib/cloudBackup/autoBackupPref';
import { useCloudBackup } from '../../lib/cloudBackup/useCloudBackup';
import * as haptics from '../../lib/haptics';
import { useThemeColors } from '../../state/colorScheme';
import { useAppData } from '../../state/store';
import { spacing, uiFont } from '../../theme';
import { stagger } from '../../theme/motion';

const PIP_SIZE = 104;
const PIP_BOX = PIP_SIZE * 1.42;

export function BackupStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const colorTheme = useThemeColors();
  const appData = useAppData();
  const cloud = useCloudBackup();
  const { t } = useLanguage();
  const [status, setStatus] = useState<'idle' | 'granted' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const granted = status === 'granted';

  const enable = async () => {
    if (busy) return;
    haptics.tap();
    setBusy(true);
    try {
      const result = await enableAutoBackup({
        buildZip: () => buildBackupZip(appData),
        backupToDrive: cloud.backupToDrive,
        persist: cloud.setAutoEnabled,
      });
      if (result === 'cancelled') return;
      haptics.payoff();
      setStatus('granted');
    } catch {
      haptics.warn();
      await persistAutoBackupEnabled(false);
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    haptics.tap();
    void persistAutoBackupEnabled(false);
    onSkip();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, flexGrow: 1, justifyContent: 'center' }}>
      <View style={styles.hero}>
        <View style={styles.pipBox}>
          <Pip
            size={PIP_SIZE}
            expr={granted ? 'proud' : 'think'}
            idea={!granted}
            float
            celebrate={granted}
          />
        </View>
        <FadeIn key={`title-${status}`} delay={stagger}>
          <Title style={{ textAlign: 'center' }}>
            {granted ? t('wizardBackupGrantedTitle') : t('wizardBackupIdleTitle')}
          </Title>
        </FadeIn>
        <FadeIn key={`body-${status}`} delay={stagger * 2}>
          <Body color={colorTheme.ink2} style={styles.subtitle}>
            {granted ? t('wizardBackupGrantedBody') : t('wizardBackupIdleBody')}
          </Body>
        </FadeIn>
      </View>

      {status === 'failed' && (
        <FadeIn>
          <Card style={[styles.notice, { backgroundColor: colorTheme.surface2 }]}>
            <Body color={colorTheme.ink2} style={{ lineHeight: 19 }}>
              {t('wizardBackupFailedNotice')}
            </Body>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={stagger * 3} style={styles.footer}>
        {status === 'idle' ? (
          <>
            <PrimaryButton onPress={() => void enable()} disabled={busy || !cloud.isConfigured}>
              <BtnLabel>{busy ? t('wizardBackupBusyBtn') : t('wizardBackupEnableBtn')}</BtnLabel>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
            </PrimaryButton>
            <Pressable
              onPress={skip}
              style={({ pressed }) => [styles.skipBtn, pressed && styles.skipPressed]}
            >
              <Text style={[styles.skipText, { color: colorTheme.ink2 }]}>{t('wizardSkipForNow')}</Text>
            </Pressable>
          </>
        ) : (
          <PrimaryButton onPress={() => { haptics.tap(); onNext(); }}>
            <BtnLabel>{t('wizardContinue')}</BtnLabel>
            <Icon name="arrowRight" size={19} color="#fff" />
          </PrimaryButton>
        )}
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  pipBox: { height: PIP_BOX, justifyContent: 'flex-end', marginBottom: spacing.sm },
  subtitle: { marginTop: spacing.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.sm },
  notice: { padding: spacing.base, marginBottom: spacing.base },
  footer: { gap: spacing.sm },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipPressed: { opacity: 0.55 },
  skipText: { fontFamily: uiFont(600), fontSize: 13.5 },
});
