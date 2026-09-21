import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AccentSwatchRow } from '../../components/AccentSwatchRow';
import { Icon } from '../../components/Icon';
import { FadeIn } from '../../components/Motion';
import { Pip } from '../../components/Pip';
import { Body, BtnLabel, Card, Label, PrimaryButton, Title } from '../../components/ui';
import { useLanguage } from '../../i18n';
import * as haptics from '../../lib/haptics';
import { inkSwatchCheck, inkSwatchFill } from '../../lib/appearanceStyle';
import { useAccent, useAccentPreset } from '../../state/accent';
import { type ColorSchemeMode, useAppearanceStyle, useColorSchemeMode, useResolvedScheme, useThemeColors } from '../../state/colorScheme';
import { spacing, uiFont } from '../../theme';
import { stagger } from '../../theme/motion';

const THEME_MODE_OPTIONS: { mode: ColorSchemeMode; key: 'themeLight' | 'themeDark' | 'themeSystem' }[] = [
  { mode: 'light', key: 'themeLight' },
  { mode: 'dark', key: 'themeDark' },
  { mode: 'system', key: 'themeSystem' },
];

/** First-run appearance setup. The providers persist changes, so this is the same preference
 * surface as Settings rather than a one-off onboarding-only draft. */
export function AppearanceStep({ onNext }: { onNext: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const scheme = useResolvedScheme();
  const { mode, setMode } = useColorSchemeMode();
  const { style, setStyle } = useAppearanceStyle();
  const { presetId, setPresetId, presets } = useAccentPreset();
  const { t } = useLanguage();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <FadeIn offset={14}>
          <Pip size={86.8} sassy float />
        </FadeIn>
        <FadeIn delay={stagger}>
          <Title style={styles.title}>{t('wizardAppearanceTitle')}</Title>
        </FadeIn>
        <FadeIn delay={stagger * 2}>
          <Body color={colorTheme.ink2} style={styles.subtitle}>{t('wizardAppearanceSubtitle')}</Body>
        </FadeIn>
      </View>

      <FadeIn delay={stagger * 3} style={styles.controls}>
        <Card style={styles.card}>
          <Label style={{ marginBottom: 12 }}>{t('theme')}</Label>
          <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
            {THEME_MODE_OPTIONS.map((option) => {
              const selected = mode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  onPress={() => { haptics.tap(); setMode(option.mode); }}
                  style={[styles.modeButton, selected && { backgroundColor: theme.accentInk }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.modeText, { color: colorTheme.ink2 }, selected && { color: theme.onAccent }]}>
                    {t(option.key)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={styles.card}>
          <Label style={{ marginBottom: 12 }}>{t('accentColor')}</Label>
          <AccentSwatchRow
            presets={presets}
            presetId={presetId}
            onSelect={(id) => {
              haptics.tap();
              setStyle('colour');
              setPresetId(id);
            }}
            onSelectInk={() => {
              haptics.tap();
              setStyle('monochrome');
            }}
            selectedBorderColor={colorTheme.ink}
            ink={{
              selected: style === 'monochrome',
              fill: inkSwatchFill(scheme),
              checkColor: inkSwatchCheck(scheme),
              label: t('accentInk'),
            }}
          />
          {style === 'monochrome' ? (
            <Body color={colorTheme.ink2} style={{ marginTop: 12 }}>
              {t('accentMonoHint', { name: presets.find((p) => p.id === presetId)?.name ?? presets[0].name })}
            </Body>
          ) : null}
        </Card>
      </FadeIn>

      <FadeIn delay={stagger * 4} style={styles.footer}>
        <PrimaryButton onPress={() => { haptics.tap(); onNext(); }}>
          <BtnLabel>{t('wizardAppearanceContinue')}</BtnLabel>
          <Icon name="arrowRight" size={19} color="#fff" />
        </PrimaryButton>
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 140, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  title: { marginTop: spacing.base, textAlign: 'center' },
  subtitle: { marginTop: spacing.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.sm },
  controls: { gap: spacing.sm },
  card: { padding: spacing.base },
  modeToggle: { flexDirection: 'row', borderRadius: 999, padding: 3, borderWidth: 1 },
  modeButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  modeText: { fontFamily: uiFont(700), fontSize: 13 },
  footer: { marginTop: spacing.lg },
});
