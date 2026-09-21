// src/components/ScanBalanceButton.tsx
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { submitSnapshotScan } from '../billing/scanProxy';
import { useEntitlement } from '../billing/entitlement';
import { notify } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { colors, uiFont } from '../theme';
import { Icon } from './Icon';

/** Snap or pick a screenshot of a balance; the vision model reads the amount and reports it back. */
export function ScanBalanceButton({ onResult }: { onResult: (amount: number) => void }) {
  const theme = useAccent();
  const { isPro } = useEntitlement();
  const [busy, setBusy] = useState(false);

  const extract = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.uri && !a.base64) { notify('Hmm', "That image couldn't be read."); return; }
    setBusy(true);
    try {
      const snapRes = await submitSnapshotScan({
        uri: a.uri,
        imageBase64: a.base64 || undefined,
        mimeType: a.mimeType ?? 'image/jpeg',
      }, isPro ? 'pro' : 'free');
      if (snapRes.quotaBlocked) {
        notify('Scan limit reached', 'You have reached your free scan limit.');
        return;
      }
      if (!snapRes.ok || !snapRes.snapshot) {
        notify('Hmm', "I couldn't read a clear amount. Try a clearer screenshot or type it in.");
        return;
      }
      if (snapRes.snapshot.kind === 'balance' && snapRes.snapshot.amount != null) {
        onResult(snapRes.snapshot.amount);
      } else {
        notify('Hmm', "I couldn't read a clear amount. Try a clearer screenshot or type it in.");
      }
    } catch (e: any) {
      notify('Scan failed', e?.message || 'Failed to scan balance');
    } finally {
      setBusy(false);
    }
  };

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify('Permission needed', 'Allow photo access to pick a screenshot.'); return; }
    await extract(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }));
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { notify('Permission needed', 'Allow camera access to snap a balance.'); return; }
    await extract(await ImagePicker.launchCameraAsync({ quality: 0.85 }));
  };

  const start = () => {
    if (busy) return;
    // RN-web has no native action-sheet Alert  go straight to the file picker on web.
    if (Platform.OS === 'web') { pickGallery(); return; }
    Alert.alert('Scan balance', 'Read the amount from a screenshot or photo.', [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose from gallery', onPress: pickGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Pressable
      onPress={start}
      disabled={busy}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
        { opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={theme.accent} /> : <Icon name="scan" size={15} color={theme.accent} />}
      <Text style={[styles.text, { color: theme.accent }]}>{busy ? 'Reading…' : 'Scan'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  text: { fontFamily: uiFont(700), fontSize: 13 },
});
