import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catColorsForHue } from '../lib/catColors';
import type { TxnType } from '../lib/types';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';
import { BtnLabel, CatBadge, PrimaryButton } from './ui';
import { EXPENSE_ICONS, INCOME_ICONS, isCustomIcon } from '../lib/categoryIcons';

const HUE_CHOICES = [12, 42, 70, 120, 162, 200, 248, 286, 330];

/** The shared name, icon, colour, and submit controls for a custom category. */
export function CreateCategoryForm({
  kind,
  onCreated,
}: {
  kind: TxnType;
  onCreated: (categoryId: string) => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { addCategory } = useAppData();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('cart');
  const [hue, setHue] = useState(162);
  const [busy, setBusy] = useState(false);

  const iconChoices = kind === 'income' ? INCOME_ICONS : EXPENSE_ICONS;

  const pickCustomIcon = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      const dataUri = a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
      setIcon(dataUri);
    }
  };

  useEffect(() => {
    setName('');
    setIcon(kind === 'income' ? 'wallet' : 'cart');
    setHue(162);
  }, [kind]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id = await addCategory(name.trim(), icon, hue, kind);
      onCreated(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.previewRow}>
        <CatBadge category={{ id: 'new', label: name, icon, hue, kind, isDefault: false, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null }} size={44} />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={isZh ? '分类名称' : 'Category name'}
          placeholderTextColor={colorTheme.ink3}
          style={[styles.input, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink }]}
          maxLength={22}
          autoFocus
        />
      </View>

      <Text style={[styles.pickLabel, { color: colorTheme.ink2 }]}>{isZh ? '图标' : 'Icon'}</Text>
      <View style={styles.choiceWrap}>
        {iconChoices.map((ic) => {
          const on = ic === icon;
          return (
            <Pressable key={ic} onPress={() => setIcon(ic)} style={[styles.iconChoice, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, on && { borderColor: theme.accent, backgroundColor: theme.accentTint }]}>
              <Icon name={ic} size={20} color={on ? theme.accent : colorTheme.ink2} stroke={1.9} />
            </Pressable>
          );
        })}
        <Pressable
          onPress={pickCustomIcon}
          style={[
            styles.iconChoice,
            { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
            isCustomIcon(icon) && { borderColor: theme.accent, backgroundColor: theme.accentTint },
            { minWidth: 68, flexDirection: 'row', gap: 4, paddingHorizontal: 6 }
          ]}
        >
          {isCustomIcon(icon) ? (
            <Image source={{ uri: icon }} style={{ width: 22, height: 22, borderRadius: 4 }} resizeMode="cover" />
          ) : (
            <Icon name="image" size={17} color={theme.accent} stroke={2.0} />
          )}
          <Text style={{ fontSize: 10, fontFamily: uiFont(700), color: theme.accent }}>{isZh ? '相册' : 'Gallery'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.pickLabel, { color: colorTheme.ink2, marginTop: 14 }]}>{isZh ? '颜色' : 'Color'}</Text>
      <View style={styles.choiceWrap}>
        {HUE_CHOICES.map((h) => {
          const on = h === hue;
          return (
            <Pressable key={h} onPress={() => setHue(h)} style={[styles.hueChoice, { backgroundColor: catColorsForHue(h).solid }, on && styles.hueChoiceOn, on && { borderColor: colorTheme.ink }]}>
              {on && <Icon name="check" size={14} color="#fff" stroke={2.6} />}
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 18 }}>
        <PrimaryButton onPress={submit} disabled={!name.trim() || busy} height={50}>
          <Icon name="plus" size={18} color="#fff" stroke={2.2} />
          <BtnLabel>{isZh ? '创建并选择' : 'Create & select'}</BtnLabel>
        </PrimaryButton>
      </View>
    </>
  );
}

/** Compact modal to create a custom category of a given kind, then select it. */
export function AddCategoryModal({
  visible,
  kind,
  onClose,
  onCreated,
}: {
  visible: boolean;
  kind: TxnType;
  onClose: () => void;
  onCreated: (categoryId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();

  if (!visible) return <Modal visible={false} transparent />;

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
            <Text style={[styles.title, { color: colorTheme.ink }]}>
              {isZh ? `新${kind === 'income' ? '收入' : '支出'}分类` : `New ${kind} category`}
            </Text>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={isZh ? '关闭' : 'Close'}>
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>
          <CreateCategoryForm kind={kind} onCreated={onCreated} />
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
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontFamily: uiFont(600),
    fontSize: 15,
  },
  pickLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 9 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  iconChoice: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hueChoice: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  hueChoiceOn: { borderWidth: 2.5 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
});
