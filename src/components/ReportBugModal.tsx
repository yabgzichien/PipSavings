import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Translations } from '../i18n/types';
import { reportBug } from '../lib/diagnostics';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, spacing, type, uiFont } from '../theme';
import { Body, Label } from './ui';

export function ReportBugModal({
  visible,
  onClose,
  onSent,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onSent: () => void;
  t: (key: keyof Translations) => string;
}) {
  const accent = useAccent();
  const colors = useThemeColors();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) setMessage('');
  }, [visible]);

  const canSend = message.trim().length > 0;

  const onSubmit = () => {
    if (!canSend) return;
    if (!reportBug(message)) return;
    onSent();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Body weight={700}>{t('reportBug')}</Body>
          <Label color={colors.ink2} style={styles.hint}>
            {t('reportBugHint')}
          </Label>
          <TextInput
            testID="report-bug-input"
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
            placeholder={t('reportBugPlaceholder')}
            placeholderTextColor={colors.ink3}
            style={[
              styles.input,
              { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
            ]}
          />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}>
              <Label color={colors.ink2}>{t('cancel')}</Label>
            </Pressable>
            <Pressable
              testID="report-bug-send"
              accessibilityRole="button"
              disabled={!canSend}
              onPress={onSubmit}
              style={[
                styles.primary,
                { backgroundColor: accent.accent, opacity: canSend ? 1 : 0.5 },
              ]}
            >
              <Text style={[styles.send, { color: accent.accentInk }]}>{t('reportBugSend')}</Text>
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    minHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: uiFont(500),
    fontSize: type.body,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  primary: {
    minHeight: 44,
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  send: { fontFamily: uiFont(700), fontSize: type.label },
});
