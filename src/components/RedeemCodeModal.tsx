import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { redeemPromoCode } from '../billing/scanProxy';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, spacing, type, uiFont } from '../theme';
import { Body, Label } from './ui';

function errorMessage(error: string, t: (key: keyof Translations) => string): string {
  switch (error) {
    case 'already_used':
      return t('promoCodeAlreadyUsed');
    case 'already_granted':
      return t('promoCodeAlreadyGranted');
    case 'disabled':
      return t('promoCodeDisabled');
    case 'network':
    case 'invalid_json':
      return t('promoCodeNetwork');
    case 'rate_limited':
      return t('promoCodeRateLimited');
    default:
      return t('promoCodeInvalid');
  }
}

export function RedeemCodeModal({
  visible,
  onClose,
  onRedeemed,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onRedeemed: () => Promise<void> | void;
  t: (key: keyof Translations) => string;
}) {
  const accent = useAccent();
  const colors = useThemeColors();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setCode('');
      setBusy(false);
      setError(null);
    }
  }, [visible]);

  const onSubmit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await redeemPromoCode(code);
    if (!result.ok) {
      setError(errorMessage(result.error, t));
      setBusy(false);
      return;
    }
    await onRedeemed();
    setBusy(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Body weight={700}>{t('promoCodeTitle')}</Body>
          <Label color={colors.ink2} style={styles.hint}>
            {t('promoCodeHint')}
          </Label>
          <TextInput
            testID="promo-code-input"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            placeholder={t('promoCodePlaceholder')}
            placeholderTextColor={colors.ink3}
            style={[
              styles.input,
              {
                color: colors.ink,
                borderColor: error ? colors.red : colors.line,
                backgroundColor: colors.bg,
              },
            ]}
            returnKeyType="done"
            onSubmitEditing={() => void onSubmit()}
          />
          {error ? (
            <Text style={[styles.error, { color: colors.red }]}>{error}</Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onClose}
              style={styles.secondary}
            >
              <Label color={colors.ink2}>{t('cancel')}</Label>
            </Pressable>
            <Pressable
              testID="promo-code-redeem"
              accessibilityRole="button"
              disabled={busy || !code.trim()}
              onPress={() => void onSubmit()}
              style={[
                styles.primary,
                { backgroundColor: accent.accent, opacity: busy || !code.trim() ? 0.5 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={accent.accentInk} />
              ) : (
                <Label color={accent.accentInk}>{t('promoCodeRedeem')}</Label>
              )}
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
    minHeight: 48,
    paddingHorizontal: spacing.md,
    fontFamily: uiFont(500),
    fontSize: type.body,
    letterSpacing: 1,
  },
  error: { fontFamily: uiFont(500), fontSize: type.label },
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
