import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n';
import { useThemeColors } from '../state/colorScheme';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';
import { BtnLabel, PrimaryButton } from './ui';

/** Compact prompt for a friend's name: adding someone new, or renaming them from Friends. */
export function AddPersonModal({
  visible,
  onClose,
  onSubmit,
  title,
  initialName = '',
  submitLabel,
  validate,
}: {
  visible: boolean;
  onClose: () => void;
  /** Creates the person and folds them into the bill; the modal closes once this resolves. */
  onSubmit: (name: string) => Promise<void>;
  title?: string;
  initialName?: string;
  submitLabel?: string;
  /** An error message to show instead of submitting, e.g. when the name is already taken. */
  validate?: (name: string) => string | null;
}) {
  const insets = useSafeAreaInsets();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  const problem = name.trim() && validate ? validate(name.trim()) : null;

  if (!visible) return <Modal visible={false} transparent />;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || problem) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={[styles.center, { pointerEvents: 'box-none' }]}
      >
        <View style={[styles.card, { backgroundColor: colorTheme.surface, marginBottom: insets.bottom }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: colorTheme.ink }]}>{title ?? (isZh ? '添加人员' : 'Add a name')}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={isZh ? '人员姓名 / 称呼' : "Friend's name"}
            placeholderTextColor={colorTheme.ink3}
            style={[styles.input, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink }]}
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {problem && <Text style={styles.problem}>{problem}</Text>}

          <View style={{ marginTop: 16 }}>
            <PrimaryButton onPress={submit} disabled={!name.trim() || busy || Boolean(problem)} height={50}>
              {!submitLabel && <Icon name="plus" size={18} color="#fff" stroke={2.2} />}
              <BtnLabel>{submitLabel ?? (isZh ? '添加' : 'Add')}</BtnLabel>
            </PrimaryButton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  center: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  card: { borderRadius: radius.lg, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontFamily: uiFont(700), fontSize: 17 },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontFamily: uiFont(600),
    fontSize: 15,
  },
  problem: { color: '#b3261e', fontFamily: uiFont(600), fontSize: 12.5, marginTop: 8 },
});
