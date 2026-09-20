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
import { ASK_PIP_PROVIDER_OPTIONS, testAskPipKey } from '../lib/askPip/keyTest';
import {
  defaultAskPipKeyStore,
  type AskPipProviderId,
} from '../lib/askPip/keyStore';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, spacing, type, uiFont } from '../theme';
import { Body, Label } from './ui';

const KEY_PLACEHOLDER = '••••••••';

export function AskPipKeySheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useLanguage();
  const accent = useAccent();
  const colors = useThemeColors();
  const [providerId, setProviderId] = useState<AskPipProviderId>('gemini');
  const [keyText, setKeyText] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setKeyText('');
      setBusy(false);
      setError(null);
      return;
    }
    const store = defaultAskPipKeyStore();
    void Promise.all([store.getProvider(), store.getApiKey()]).then(([savedProvider, savedKey]) => {
      if (savedProvider) setProviderId(savedProvider);
      setHasStoredKey(Boolean(savedKey));
    });
  }, [visible]);

  const onTest = async () => {
    const store = defaultAskPipKeyStore();
    const typed = keyText.trim();
    const apiKey = typed || (await store.getApiKey());
    if (!apiKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      await testAskPipKey(providerId, apiKey);
    } catch {
      setError(t('askPipBadKey'));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    const typed = keyText.trim();
    if (busy || (!typed && !hasStoredKey)) return;
    setBusy(true);
    setError(null);
    const store = defaultAskPipKeyStore();
    await store.setProvider(providerId);
    if (typed) {
      await store.setApiKey(typed);
      setHasStoredKey(true);
      setKeyText('');
    }
    setBusy(false);
    onSaved?.();
  };

  const onClear = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    await defaultAskPipKeyStore().clear();
    setHasStoredKey(false);
    setKeyText('');
    setBusy(false);
    onSaved?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Body weight={700}>{t('askPipNeedKeyTitle')}</Body>
          <Label color={colors.ink2} style={styles.hint}>
            {t('askPipNeedKeyBody')}
          </Label>
          <Label color={colors.ink2}>{t('askPipProvider')}</Label>
          <View style={[styles.modeToggle, { backgroundColor: colors.surface2, borderColor: colors.line2 }]}>
            {ASK_PIP_PROVIDER_OPTIONS.map((opt) => {
              const on = providerId === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setProviderId(opt.id)}
                  style={[styles.modeBtn, on && { backgroundColor: accent.accentInk }]}
                >
                  <Text style={[styles.modeText, { color: colors.ink2 }, on && styles.modeTextOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            testID="ask-pip-key-input"
            value={keyText}
            onChangeText={setKeyText}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder={hasStoredKey ? KEY_PLACEHOLDER : undefined}
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
            onSubmitEditing={() => void onSave()}
          />
          {error ? <Text style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.secondary}>
              <Label color={colors.ink2}>{t('cancel')}</Label>
            </Pressable>
            {hasStoredKey ? (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onClear()} style={styles.secondary}>
                <Label color={colors.red}>{t('clear')}</Label>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void onTest()}
              style={styles.secondary}
            >
              <Label color={colors.ink2}>{t('askPipTestKey')}</Label>
            </Pressable>
            <Pressable
              testID="ask-pip-save-key"
              accessibilityRole="button"
              disabled={busy || (!keyText.trim() && !hasStoredKey)}
              onPress={() => void onSave()}
              style={[
                styles.primary,
                {
                  backgroundColor: accent.accent,
                  opacity: busy || (!keyText.trim() && !hasStoredKey) ? 0.5 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={accent.accentInk} />
              ) : (
                <Label color={accent.accentInk}>{t('askPipSaveKey')}</Label>
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
  modeToggle: { flexDirection: 'row', borderRadius: 999, padding: 3, borderWidth: 1 },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  modeText: { fontFamily: uiFont(700), fontSize: 11, textAlign: 'center' },
  modeTextOn: { color: '#fff' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    fontFamily: uiFont(500),
    fontSize: type.body,
  },
  error: { fontFamily: uiFont(500), fontSize: type.label },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
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
});
