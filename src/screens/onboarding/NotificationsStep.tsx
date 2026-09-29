// src/screens/onboarding/NotificationsStep.tsx
// Step 4 of the setup wizard: one permission ask. Granting sets a daily reminder cadence
// (today's silent default is 'off'). A denial never blocks Continue.
//
// Pip carries this step instead of an alert glyph: the ask is "let me nudge you", which is a
// thing a character does, not a warning. He arrives thinking, with the idea bulb lit above his
// head, and flips to `proud` + a sparkle burst the moment permission lands.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { FadeIn } from '../../components/Motion';
import { Pip } from '../../components/Pip';
import { Body, BtnLabel, Card, PrimaryButton, Title } from '../../components/ui';
import { useLanguage } from '../../i18n';
import * as haptics from '../../lib/haptics';
import { ensurePermission } from '../../notifications';
import { useThemeColors } from '../../state/colorScheme';
import { useAppData } from '../../state/store';
import { spacing, uiFont } from '../../theme';
import { stagger } from '../../theme/motion';

const PIP_SIZE = 104;
/** Reserves the taller boxed height Pip occupies *with* the bulb, so losing the bulb on the
 *  granted state doesn't drop the whole hero by ~40px mid-animation. */
const PIP_BOX = PIP_SIZE * 1.42;

export function NotificationsStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const colorTheme = useThemeColors();
  const { setReminderCadence } = useAppData();
  const { t } = useLanguage();
  const [status, setStatus] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [busy, setBusy] = useState(false);
  const granted = status === 'granted';

  const enable = async () => {
    if (busy) return;
    haptics.tap();
    setBusy(true);
    try {
      const granted = await ensurePermission();
      if (granted) {
        await setReminderCadence('daily');
        haptics.payoff();
        setStatus('granted');
      } else {
        haptics.warn();
        setStatus('denied');
      }
    } finally {
      setBusy(false);
    }
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
        {/* Keyed on the outcome so the copy swap replays the entrance instead of cutting. */}
        <FadeIn key={`title-${status}`} delay={stagger}>
          <Title style={{ textAlign: 'center' }}>{granted ? t('wizardNotifGrantedTitle') : t('wizardNotifIdleTitle')}</Title>
        </FadeIn>
        <FadeIn key={`body-${status}`} delay={stagger * 2}>
          <Body color={colorTheme.ink2} style={styles.subtitle}>
            {granted
              ? t('wizardNotifGrantedBody')
              : t('wizardNotifIdleBody')}
          </Body>
        </FadeIn>
      </View>

      {status === 'denied' && (
        <FadeIn>
          <Card style={[styles.notice, { backgroundColor: colorTheme.surface2 }]}>
            <Body color={colorTheme.ink2} style={{ lineHeight: 19 }}>
              {t('wizardNotifDeniedNotice')}
            </Body>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={stagger * 3} style={styles.footer}>
        {status === 'idle' ? (
          <>
            <PrimaryButton onPress={() => void enable()} disabled={busy}>
              <BtnLabel>{busy ? t('wizardAskingNotifBtn') : t('wizardEnableNotifBtn')}</BtnLabel>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
            </PrimaryButton>
            <Pressable
              onPress={() => {
                haptics.tap();
                onSkip();
              }}
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
