import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, spacing } from '../theme';
import { Body, Label } from './ui';

export type AskPipDiscloseKind = 'send' | 'photo';

export function AskPipDiscloseSheet({
  visible,
  kind,
  onContinue,
  onCancel,
}: {
  visible: boolean;
  kind: AskPipDiscloseKind;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const accent = useAccent();
  const colors = useThemeColors();
  const title = kind === 'photo' ? t('askPipDisclosePhotoTitle') : t('askPipDiscloseSendTitle');
  const body = kind === 'photo' ? t('askPipDisclosePhotoBody') : t('askPipDiscloseSendBody');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Body weight={700}>{title}</Body>
          <Label color={colors.ink2} style={styles.hint}>
            {body}
          </Label>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.secondary}>
              <Label color={colors.ink2}>{t('cancel')}</Label>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onContinue}
              style={[styles.primary, { backgroundColor: accent.accent }]}
            >
              <Label color={accent.accentInk}>{t('askPipDiscloseContinue')}</Label>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.base,
    gap: spacing.sm,
  },
  hint: { marginBottom: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  primary: {
    minHeight: 44,
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
});
