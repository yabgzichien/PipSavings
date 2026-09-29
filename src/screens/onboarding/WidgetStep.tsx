// src/screens/onboarding/WidgetStep.tsx
// Step 5 of the setup wizard. Rendered on every platform so the step is always reviewable,
// but only Android can actually pin anything: this app ships an Android widget target and
// no iOS one. On the platforms that can't pin, the step says so and offers only Finish,
// rather than a button that would look live and do nothing (react-native-android-widget
// swaps in a no-op module off Android, so `requestPinWidget` there just resolves false).
//
// On Android, `requestPinWidget` only confirms the launcher accepted the request, not that
// the user finished placing the widget, so Finish is reachable either way.
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';
import { Icon } from '../../components/Icon';
import { FadeIn } from '../../components/Motion';
import { Pip } from '../../components/Pip';
import { Body, BtnLabel, PrimaryButton, Title } from '../../components/ui';
import { useLanguage } from '../../i18n';
import * as haptics from '../../lib/haptics';
import { useThemeColors } from '../../state/colorScheme';
import { spacing, uiFont } from '../../theme';
import { stagger } from '../../theme/motion';

/** Only Android ships a widget target in this app, so only Android can offer to pin one. */
const CAN_PIN = Platform.OS === 'android';
const PIP_SIZE = 88;

export function WidgetStep({ onFinish }: { onFinish: () => void }) {
  const colorTheme = useThemeColors();
  const { t } = useLanguage();
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);

  const addWidget = async () => {
    if (busy) return;
    haptics.tap();
    setBusy(true);
    try {
      await requestPinWidget({ widgetName: 'QuickRecordWidget' });
    } catch {
      try {
        await requestPinWidget({ widgetName: 'StreakWidget' });
      } catch {
        // Unsupported launcher/OS version — Finish still works below.
      }
    } finally {
      setBusy(false);
      setAsked(true);
    }
  };

  const finish = () => {
    haptics.commit();
    onFinish();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, flexGrow: 1, justifyContent: 'center' }}>
      <View style={styles.hero}>
        <FadeIn offset={14}>
          <Pip size={PIP_SIZE} glasses float />
        </FadeIn>
        <FadeIn delay={stagger}>
          <Title style={{ marginTop: spacing.base, textAlign: 'center' }}>
            {CAN_PIN ? t('wizardWidgetCanPinTitle') : t('wizardWidgetNoPinTitle')}
          </Title>
        </FadeIn>
        {CAN_PIN ? (
          <FadeIn delay={stagger * 2}>
            <Body color={colorTheme.ink2} style={styles.subtitle}>
              {t('wizardWidgetCanPinBody')}
            </Body>
          </FadeIn>
        ) : null}
      </View>

      <FadeIn delay={stagger * 3} style={styles.footer}>
        {CAN_PIN ? (
          <>
            <PrimaryButton onPress={() => void addWidget()} disabled={busy}>
              <BtnLabel>
                {asked ? t('wizardAddWidgetAgain') : busy ? t('wizardAddWidgetOpening') : t('wizardAddWidget')}
              </BtnLabel>
              <Icon name="pin" size={17} color="#fff" />
            </PrimaryButton>
            <Pressable
              onPress={finish}
              style={({ pressed }) => [styles.finishBtn, pressed && styles.finishPressed]}
            >
              <Text style={[styles.finishText, { color: colorTheme.ink2 }]}>
                {asked ? t('wizardFinish') : t('wizardFinishWithoutAdding')}
              </Text>
            </Pressable>
          </>
        ) : (
          <PrimaryButton onPress={finish}>
            <BtnLabel>{t('wizardFinish')}</BtnLabel>
            <Icon name="check" size={18} color="#fff" stroke={2.4} />
          </PrimaryButton>
        )}
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  subtitle: { marginTop: spacing.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.sm },
  footer: { gap: spacing.sm, marginTop: spacing.lg },
  finishBtn: { alignItems: 'center', paddingVertical: 10 },
  finishPressed: { opacity: 0.55 },
  finishText: { fontFamily: uiFont(600), fontSize: 13.5 },
});
