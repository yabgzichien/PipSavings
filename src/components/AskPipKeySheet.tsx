import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ASK_PIP_PROVIDER_OPTIONS, detectAskPipProvider, testAskPipKey } from '../lib/askPip/keyTest';
import {
  defaultAskPipKeyStore,
  maskAskPipKey,
  type AskPipProviderId,
  type AskPipSavedKey,
} from '../lib/askPip/keyStore';
import { LLMError } from '../llm/types';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, spacing, type, uiFont } from '../theme';
import { Body, Caption, Label } from './ui';
import { Icon } from './Icon';

const GUIDES: Record<AskPipProviderId, { title: string; titleZh: string; url: string; action: string; actionZh: string; steps: string[]; stepsZh: string[] }> = {
  groq: {
    title: 'Groq',
    titleZh: 'Groq',
    url: 'https://console.groq.com/keys',
    action: 'Open Groq Console',
    actionZh: '打开 Groq Console',
    steps: [
      'Open the Groq Console and sign in.',
      'Open API Keys, then create a key.',
      'Copy the key beginning with gsk_ and paste it above.',
    ],
    stepsZh: ['打开 Groq Console 并登录。', '进入 API Keys，然后创建密钥。', '复制以 gsk_ 开头的密钥并粘贴到上方。'],
  },
  gemini: {
    title: 'Google Gemini',
    titleZh: 'Google Gemini',
    url: 'https://aistudio.google.com/app/apikey',
    action: 'Open Google AI Studio',
    actionZh: '打开 Google AI Studio',
    steps: [
      'Open Google AI Studio and sign in.',
      'Open API Keys, then create a key.',
      'Copy the key beginning with AIza and paste it above.',
    ],
    stepsZh: ['打开 Google AI Studio 并登录。', '进入 API Keys，然后创建密钥。', '复制以 AIza 开头的密钥并粘贴到上方。'],
  },
  openrouter: {
    title: 'OpenRouter',
    titleZh: 'OpenRouter',
    url: 'https://openrouter.ai/settings/keys',
    action: 'Open OpenRouter Keys',
    actionZh: '打开 OpenRouter 密钥页',
    steps: [
      'Open OpenRouter and sign in.',
      'Open API Keys, then create a key.',
      'Copy the key beginning with sk-or- and paste it above.',
    ],
    stepsZh: ['打开 OpenRouter 并登录。', '进入 API Keys，然后创建密钥。', '复制以 sk-or- 开头的密钥并粘贴到上方。'],
  },
};

function providerLabel(id: AskPipProviderId, isZh: boolean): string {
  if (id === 'gemini') return 'Google Gemini';
  if (id === 'groq') return 'Groq';
  return isZh ? 'OpenRouter' : 'OpenRouter';
}

export function AskPipKeySheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t, isZh } = useLanguage();
  const accent = useAccent();
  const colors = useThemeColors();
  const [guideId, setGuideId] = useState<AskPipProviderId>('groq');
  const [keyText, setKeyText] = useState('');
  const [keys, setKeys] = useState<AskPipSavedKey[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'paste' | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const reload = async () => {
    const store = defaultAskPipKeyStore();
    const listed = await store.list();
    const active = await store.getActive();
    setKeys(listed);
    setActiveId(active?.id ?? null);
    if (active) setGuideId(active.providerId);
  };

  useEffect(() => {
    if (!visible) {
      setKeyText('');
      setBusy(null);
      setStatus(null);
      return;
    }
    void reload();
  }, [visible]);

  const detectedProvider = detectAskPipProvider(keyText);

  const onPaste = async () => {
    if (busy) return;
    setBusy('paste');
    setStatus(null);
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text) {
        setStatus({ kind: 'err', text: isZh ? '剪贴板是空的。' : 'Clipboard is empty.' });
        return;
      }
      setKeyText(text);
      const detected = detectAskPipProvider(text);
      if (detected) setGuideId(detected);
    } catch {
      setStatus({ kind: 'err', text: isZh ? '无法读取剪贴板。' : 'Could not read the clipboard.' });
    } finally {
      setBusy(null);
    }
  };

  const onSave = async () => {
    const typed = keyText.trim();
    if (busy || !typed) return;
    const nextProvider = detectedProvider;
    if (!nextProvider) {
      setStatus({
        kind: 'err',
        text: isZh
          ? '无法识别此密钥。Pip 支持 Gemini（AIza…）、Groq（gsk_…）和 OpenRouter（sk-or-…）。'
          : 'Key not recognised. Pip supports Gemini (AIza…), Groq (gsk_…), and OpenRouter (sk-or-…).',
      });
      return;
    }
    setBusy('save');
    setStatus(null);
    try {
      await testAskPipKey(nextProvider, typed);
      const saved = await defaultAskPipKeyStore().add(nextProvider, typed);
      setKeyText('');
      setGuideId(nextProvider);
      await reload();
      setActiveId(saved.id);
      setStatus({ kind: 'ok', text: t('askPipKeyOk') });
      onSaved?.();
    } catch (err) {
      const network = err instanceof LLMError && err.code === 'network';
      setStatus({ kind: 'err', text: network ? t('askPipOffline') : t('askPipBadKey') });
    } finally {
      setBusy(null);
    }
  };

  const onActivate = async (id: string) => {
    if (busy) return;
    await defaultAskPipKeyStore().setActive(id);
    setActiveId(id);
    const row = keys.find((k) => k.id === id);
    if (row) setGuideId(row.providerId);
    onSaved?.();
  };

  const onRemove = async (id: string) => {
    if (busy) return;
    await defaultAskPipKeyStore().remove(id);
    await reload();
    onSaved?.();
  };

  const guide = GUIDES[guideId];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Body weight={700}>{t('askPipNeedKeyTitle')}</Body>
            <Label color={colors.ink2} style={styles.hint}>
              {isZh
                ? '粘贴一个密钥即可。Pip 会自动识别并验证提供商。选择下方标签查看对应教程。'
                : 'Paste a key. Pip detects and verifies the provider. Tap a provider below for its setup guide.'}
            </Label>

            <View style={[styles.modeToggle, { backgroundColor: colors.surface2, borderColor: colors.line2 }]}>
              {ASK_PIP_PROVIDER_OPTIONS.map((opt) => {
                const on = guideId === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setGuideId(opt.id)}
                    style={[styles.modeBtn, on && { backgroundColor: accent.accentInk }]}
                  >
                    <Text style={[styles.modeText, { color: colors.ink2 }, on && styles.modeTextOn]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.inputRow}>
              <TextInput
                testID="ask-pip-key-input"
                value={keyText}
                onChangeText={(value) => {
                  setKeyText(value);
                  setStatus(null);
                  const detected = detectAskPipProvider(value);
                  if (detected) setGuideId(detected);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                placeholder={isZh ? '粘贴 API 密钥' : 'Paste an API key'}
                placeholderTextColor={colors.ink3}
                style={[
                  styles.input,
                  {
                    color: colors.ink,
                    borderColor: status?.kind === 'err' ? colors.red : colors.line,
                    backgroundColor: colors.bg,
                  },
                ]}
                returnKeyType="done"
                onSubmitEditing={() => void onSave()}
              />
              <Pressable
                testID="ask-pip-paste-key"
                accessibilityRole="button"
                accessibilityLabel={t('paste')}
                disabled={!!busy}
                onPress={() => void onPaste()}
                style={[styles.pasteBtn, { borderColor: colors.line, backgroundColor: colors.surface2 }]}
              >
                {busy === 'paste' ? (
                  <ActivityIndicator color={colors.ink2} />
                ) : (
                  <Label color={accent.accent}>{t('paste')}</Label>
                )}
              </Pressable>
            </View>

            {keyText.trim() ? (
              <Caption color={detectedProvider ? accent.accent : colors.ink2}>
                {detectedProvider
                  ? (isZh ? `已识别：${providerLabel(detectedProvider, isZh)}` : `Detected: ${providerLabel(detectedProvider, isZh)}`)
                  : (isZh ? '等待 Gemini、Groq 或 OpenRouter 密钥' : 'Waiting for a Gemini, Groq, or OpenRouter key')}
              </Caption>
            ) : null}
            {status ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.status, { color: status.kind === 'err' ? colors.red : accent.accent }]}
              >
                {status.text}
              </Text>
            ) : null}

            {keys.length > 0 ? (
              <View style={styles.savedBlock}>
                <Label weight={700}>{t('askPipSavedKeys')}</Label>
                {keys.map((row) => {
                  const on = row.id === activeId;
                  return (
                    <View key={row.id} style={[styles.savedRow, { borderColor: colors.line2 }]}>
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => void onActivate(row.id)}
                        style={styles.savedMain}
                      >
                        <View style={[styles.radio, { borderColor: on ? accent.accent : colors.line }, on && { backgroundColor: accent.accent }]} />
                        <View style={{ flex: 1 }}>
                          <Label>{providerLabel(row.providerId, isZh)}</Label>
                          <Caption color={on ? accent.accent : colors.ink2}>
                            {on ? (isZh ? `使用中 · ${maskAskPipKey(row.apiKey)}` : `In use · ${maskAskPipKey(row.apiKey)}`) : maskAskPipKey(row.apiKey)}
                          </Caption>
                        </View>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('delete')}
                        onPress={() => void onRemove(row.id)}
                        style={styles.savedDelete}
                      >
                        <Icon name="trash" size={16} color={colors.red} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={[styles.guide, { borderTopColor: colors.line2 }]}>
              <Body weight={700}>{isZh ? '如何获取免费密钥' : 'Get a free API key'}</Body>
              <Guide
                title={isZh ? guide.titleZh : guide.title}
                steps={isZh ? guide.stepsZh : guide.steps}
                action={isZh ? guide.actionZh : guide.action}
                onPress={() => void Linking.openURL(guide.url)}
                colors={colors}
                accent={accent.accent}
              />
              <Caption color={colors.ink2}>
                {isZh ? '免费额度和限制由提供商决定，可能会改变。请勿分享您的密钥。' : 'Free-tier availability and limits are set by each provider and may change. Never share your key.'}
              </Caption>
            </View>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={!!busy} onPress={onClose} style={styles.secondary}>
              <Label color={colors.ink2}>{t('close')}</Label>
            </Pressable>
            <Pressable
              testID="ask-pip-save-key"
              accessibilityRole="button"
              disabled={!!busy || !keyText.trim() || !detectedProvider}
              onPress={() => void onSave()}
              style={[
                styles.primary,
                {
                  backgroundColor: accent.accent,
                  opacity: !!busy || !keyText.trim() || !detectedProvider ? 0.5 : 1,
                },
              ]}
            >
              {busy === 'save' ? (
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

function Guide({
  title,
  steps,
  action,
  onPress,
  colors,
  accent,
}: {
  title: string;
  steps: string[];
  action: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
  accent: string;
}) {
  return (
    <View style={styles.guideSection}>
      <Label weight={700}>{title}</Label>
      {steps.map((step, index) => (
        <View key={step} style={styles.stepRow}>
          <View style={[styles.stepNumber, { backgroundColor: colors.surface2 }]}>
            <Caption color={colors.ink2}>{index + 1}</Caption>
          </View>
          <Label color={colors.ink2} style={styles.stepText}>{step}</Label>
        </View>
      ))}
      <Pressable accessibilityRole="link" onPress={onPress} style={styles.guideLink}>
        <Label weight={700} color={accent}>{action}</Label>
      </Pressable>
    </View>
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
    maxHeight: '88%',
  },
  content: { gap: spacing.sm },
  hint: { marginBottom: spacing.xs },
  modeToggle: { flexDirection: 'row', borderRadius: 999, padding: 3, borderWidth: 1 },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  modeText: { fontFamily: uiFont(700), fontSize: 11, textAlign: 'center' },
  modeTextOn: { color: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    fontFamily: uiFont(500),
    fontSize: type.body,
  },
  pasteBtn: {
    minHeight: 48,
    minWidth: 72,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { fontFamily: uiFont(500), fontSize: type.label },
  savedBlock: { gap: spacing.xs, marginTop: spacing.xs },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  savedMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  savedDelete: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  guide: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, marginTop: spacing.xs, gap: spacing.md },
  guideSection: { gap: spacing.xs },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNumber: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, lineHeight: 20 },
  guideLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
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
