import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { DestinationIcon } from './DestinationIcon';
import { TripBadge } from './TripBadge';
import { DESTINATIONS } from '../lib/destinations';
import { matchDestination } from '../lib/destinations';
import { isCustomImageUri, type Trip } from '../lib/trips';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { uiFont } from '../theme';

/**
 * Choose a trip's icon: a landmark, a picture from the gallery, or back to automatic.
 *
 * "Automatic" is a real, selectable option rather than an implicit default, because it is the
 * only way back once a choice has been made — without it, a mis-tap would permanently pin the
 * wrong landmark to a trip. It shows the icon the name currently resolves to, so choosing it is
 * not a leap of faith.
 */
export function TripIconPickerSheet({
  visible,
  trip,
  onClose,
  onPick,
  onCover,
}: {
  visible: boolean;
  trip: Trip;
  onClose: () => void;
  /** A destination key, an image URI, or null for automatic. */
  onPick: (icon: string | null) => void;
  /** Present only once a trip exists to store a cover. A URI sets it; null removes it. */
  onCover?: (cover: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const [busy, setBusy] = useState(false);

  const autoMatch = matchDestination(trip.name);

  const pickFromGallery = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        // Square, and small: this is stored inline in the row and travels inside the backup
        // JSON, so a full-resolution photo would bloat every backup the user ever takes.
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      if (!res.canceled && res.assets?.length) {
        const a = res.assets[0];
        onPick(a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
      }
    } finally {
      setBusy(false);
    }
  };

  const pickCover = async () => {
    if (busy || !onCover) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        // Wide, and compressed: the cover is stored inline and travels in the backup, same as
        // a gallery icon. A full-resolution photo would bloat every backup.
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.45,
      });
      if (!res.canceled && res.assets?.length) {
        const a = res.assets[0];
        onCover(a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
      }
    } finally {
      setBusy(false);
    }
  };

  const hasCover = isCustomImageUri(trip.cover);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colorTheme.surface, paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <Text style={[styles.title, { color: colorTheme.ink }]}>{t('tripIconTitle')}</Text>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {/* Automatic + gallery, the two options that are not a landmark. */}
            <View style={styles.topRow}>
              <Pressable
                onPress={() => onPick(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: trip.icon === null }}
                style={[
                  styles.wideOption,
                  { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
                  trip.icon === null && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                ]}
              >
                <View style={[styles.autoBadge, { backgroundColor: theme.accentTint }]}>
                  <DestinationIcon destination={autoMatch} size={22} color={theme.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.optionLabel, { color: colorTheme.ink }]}>{t('tripIconAuto')}</Text>
                  <Text style={[styles.optionSub, { color: colorTheme.ink2 }]} numberOfLines={1}>
                    {t('tripIconAutoHint')}
                  </Text>
                </View>
                {trip.icon === null && <Icon name="check" size={18} color={theme.accent} stroke={2.5} />}
              </Pressable>

              <Pressable
                onPress={pickFromGallery}
                accessibilityRole="button"
                style={[styles.wideOption, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
              >
                <View style={[styles.autoBadge, { backgroundColor: colorTheme.surface }]}>
                  {isCustomImageUri(trip.icon) ? (
                    <TripBadge trip={trip} size={34} rad={10} />
                  ) : (
                    <Icon name="image" size={20} color={colorTheme.ink2} />
                  )}
                </View>
                <Text style={[styles.optionLabel, { color: colorTheme.ink, flex: 1 }]}>{t('tripIconGallery')}</Text>
                <Icon name="chevronRight" size={15} color={colorTheme.ink3} />
              </Pressable>
            </View>

            {onCover && (
              <View style={styles.topRow}>
                <Pressable
                  onPress={pickCover}
                  accessibilityRole="button"
                  accessibilityLabel={hasCover ? t('tripCoverChange') : t('tripCoverSet')}
                  style={[styles.wideOption, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                >
                  <View style={[styles.autoBadge, { backgroundColor: colorTheme.surface }]}>
                    <Icon name="image" size={20} color={colorTheme.ink2} />
                  </View>
                  <Text style={[styles.optionLabel, { color: colorTheme.ink, flex: 1 }]}>
                    {hasCover ? t('tripCoverChange') : t('tripCoverSet')}
                  </Text>
                  <Icon name="chevronRight" size={15} color={colorTheme.ink3} />
                </Pressable>
                {hasCover && (
                  <Pressable
                    onPress={() => onCover(null)}
                    accessibilityRole="button"
                    accessibilityLabel={t('tripCoverRemove')}
                    style={[styles.wideOption, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  >
                    <View style={[styles.autoBadge, { backgroundColor: colorTheme.surface }]}>
                      <Icon name="trash" size={18} color={colorTheme.ink2} />
                    </View>
                    <Text style={[styles.optionLabel, { color: colorTheme.ink, flex: 1 }]}>{t('tripCoverRemove')}</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Text style={[styles.groupLabel, { color: colorTheme.ink2 }]}>
              {isZh ? '地标' : 'Landmarks'}
            </Text>
            <View style={styles.grid}>
              {DESTINATIONS.map((d) => {
                const on = trip.icon === d.key;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => onPick(d.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={isZh ? d.labelZh : d.label}
                    style={[
                      styles.cell,
                      { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
                      on && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                    ]}
                  >
                    <DestinationIcon destination={d.key} size={26} color={on ? theme.accent : colorTheme.ink2} />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16,32,24,0.35)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 999, marginBottom: 12 },
  title: { fontFamily: uiFont(700), fontSize: 16, marginBottom: 12, paddingHorizontal: 4 },
  topRow: { gap: 8, marginBottom: 16 },
  wideOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5, padding: 10,
  },
  autoBadge: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  optionLabel: { fontFamily: uiFont(700), fontSize: 14 },
  optionSub: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 1 },
  groupLabel: { fontFamily: uiFont(700), fontSize: 12, letterSpacing: 0.3, marginBottom: 8, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  cell: {
    width: '31.5%', borderRadius: 14, borderWidth: 1.5,
    minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: 11,
  },
});
