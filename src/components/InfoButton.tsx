import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getGlossaryEntry } from '../i18n';
import { useLanguage } from '../i18n';
import { useGlossary } from '../state/glossary';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { colors, radius, uiFont } from '../theme';
import { Pip } from './Pip';
import { GlossaryVisualGuide } from './GlossaryVisualGuide';

/** Small circular "i" badge that opens the glossary modal for `entry`. Place inline next to a
 *  label/eyebrow (row + gap), same role as LenderConsole's InfoButton (app/shared.tsx). */
export function InfoButton({ entry, color }: { entry: string; color?: string }) {
  const { open } = useGlossary();
  const { glossaryEnabled } = useAppData();
  const colorTheme = useThemeColors();
  const { language } = useLanguage();
  if (!glossaryEnabled) return null;
  const term = getGlossaryEntry(entry, language)?.term ?? 'this';
  return (
    <Pressable
      onPress={() => open(entry)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`What is ${term}?`}
      style={({ pressed }) => [styles.badge, pressed && styles.pressed]}
    >
      <Text style={[styles.badgeText, { color: colorTheme.ink3 }, color ? { color } : null]}>i</Text>
    </Pressable>
  );
}

/** Centered glossary modal, driven by useGlossary(). Renders nothing when no entry is open.
 *  Mount once near the app root (see App.tsx) so any InfoButton can open it. */
export function GlossaryModal() {
  const { openEntry, close } = useGlossary();
  const { language, isZh } = useLanguage();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    setActiveStep(0);
  }, [openEntry]);

  if (!openEntry) return <Modal visible={false} transparent />;
  const entry = getGlossaryEntry(openEntry, language);
  if (!entry) return <Modal visible={false} transparent />;

  const steps = entry.steps ?? [];
  const hasSteps = steps.length > 0;
  const currentStep = hasSteps ? steps[Math.min(activeStep, steps.length - 1)] : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.center, { pointerEvents: 'box-none' }]}>
        <View style={[styles.card, { backgroundColor: colorTheme.surface }]}>
          <View style={styles.head}>
            <Pip size={40} expr="curious" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: colorTheme.ink3 }]}>
                {isZh ? (hasSteps ? '使用指南 & 词汇' : '词汇解释') : (hasSteps ? 'Visual Guide & Glossary' : 'Glossary')}
              </Text>
              <Text style={[styles.title, { color: colorTheme.ink }]}>{entry.term}</Text>
            </View>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={[styles.closeBtn, { backgroundColor: colorTheme.surface2 }]}>
              <Text style={[styles.closeText, { color: colorTheme.ink2 }]}>✕</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <Text style={[styles.short, { color: theme.accentInk }]}>{entry.short}</Text>

            {hasSteps && currentStep && (
              <View style={[styles.stepContainer, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                <View style={styles.stepHeaderRow}>
                  {currentStep.badge ? (
                    <View style={[styles.stepBadge, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
                      <Text style={[styles.stepBadgeText, { color: theme.accentInk }]}>{currentStep.badge}</Text>
                    </View>
                  ) : null}
                  {steps.length > 1 && (
                    <View style={styles.stepDots}>
                      {steps.map((_, i) => (
                        <Pressable
                          key={i}
                          onPress={() => setActiveStep(i)}
                          hitSlop={6}
                          style={[
                            styles.stepDot,
                            { backgroundColor: i === activeStep ? theme.accent : colorTheme.line },
                            i === activeStep && styles.stepDotActive,
                          ]}
                          accessibilityLabel={`Step ${i + 1}`}
                        />
                      ))}
                    </View>
                  )}
                </View>

                <Text style={[styles.stepTitle, { color: colorTheme.ink }]}>{currentStep.title}</Text>
                <Text style={[styles.stepDesc, { color: colorTheme.ink2 }]}>{currentStep.desc}</Text>

                <GlossaryVisualGuide visualKey={currentStep.visualKey ?? entry.visualKey} />

                {steps.length > 1 && (
                  <View style={styles.stepNavRow}>
                    <Pressable
                      onPress={() => setActiveStep((prev) => Math.max(0, prev - 1))}
                      disabled={activeStep === 0}
                      style={[
                        styles.navBtn,
                        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
                        activeStep === 0 && { opacity: 0.4 },
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.navBtnText, { color: colorTheme.ink2 }]}>{isZh ? '← 上一步' : '← Previous'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setActiveStep((prev) => Math.min(steps.length - 1, prev + 1))}
                      disabled={activeStep === steps.length - 1}
                      style={[
                        styles.navBtn,
                        { backgroundColor: activeStep === steps.length - 1 ? colorTheme.surface : theme.accent, borderColor: colorTheme.line },
                        activeStep === steps.length - 1 && { opacity: 0.4 },
                      ]}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.navBtnText,
                          { color: activeStep === steps.length - 1 ? colorTheme.ink2 : '#ffffff', fontWeight: '700' },
                        ]}
                      >
                        {isZh ? '下一步 →' : 'Next Step →'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {!hasSteps && entry.visualKey && (
              <GlossaryVisualGuide visualKey={entry.visualKey} />
            )}

            <Text style={[styles.body, { color: colorTheme.ink2 }]}>{entry.body}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(20,40,30,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  badgeText: {
    fontFamily: Platform.select({ ios: 'Georgia-Italic', android: 'serif', default: 'Georgia' }),
    fontStyle: 'italic',
    fontWeight: '700',
    fontSize: 11,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,24,18,0.46)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    borderRadius: radius.md,
    padding: 20,
  },
  scroll: {
    maxHeight: 480,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  eyebrow: {
    fontFamily: uiFont(700),
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: { fontFamily: uiFont(800), fontSize: 18 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 13 },
  short: { fontFamily: uiFont(600), fontSize: 13.5, lineHeight: 19, marginBottom: 10 },
  body: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 19, marginTop: 10 },
  stepContainer: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  stepBadgeText: {
    fontFamily: uiFont(700),
    fontSize: 10.5,
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stepDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  stepDotActive: {
    width: 16,
    borderRadius: 4,
  },
  stepTitle: {
    fontFamily: uiFont(700),
    fontSize: 13.5,
    marginBottom: 3,
  },
  stepDesc: {
    fontFamily: uiFont(500),
    fontSize: 12,
    lineHeight: 17,
  },
  stepNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  navBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontFamily: uiFont(600),
    fontSize: 11.5,
  },
});

