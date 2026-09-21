// src/components/RestoreBackupModal.tsx
// Bottom sheet modal to restore app data from a local backup archive (.zip)
// or Google Drive cloud backup during onboarding or recovery.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Pip } from './Pip';
import { Caption, Card, Eyebrow, Title } from './ui';
import { InvalidBackupError, formatRelativeBackupTime, peekBackupZip } from '../lib/backupRestore';
import { useCloudBackup } from '../lib/cloudBackup/useCloudBackup';
import * as haptics from '../lib/haptics';
import { restore } from '../billing/purchases';
import { useEntitlement } from '../billing/entitlement';
import { offerRestorePurchases } from '../lib/offerRestorePurchases';
import { confirmAction, notify } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { radius, spacing, uiFont } from '../theme';

export interface RestoreBackupModalProps {
  visible: boolean;
  onClose: () => void;
  onRestoreSuccess?: () => void;
}

export function RestoreBackupModal({
  visible,
  onClose,
  onRestoreSuccess,
}: RestoreBackupModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const appData = useAppData();
  const { refresh } = useEntitlement();
  const cloud = useCloudBackup();

  const [restoringFile, setRestoringFile] = useState(false);
  const [restoringCloud, setRestoringCloud] = useState(false);

  if (!visible) return null;

  const runRestore = async (zipBytes: Uint8Array) => {
    let exportedAt: string | null = null;
    try {
      exportedAt = peekBackupZip(zipBytes).exportedAt;
    } catch (e: any) {
      notify(
        t('restoreFailedTitle'),
        e instanceof InvalidBackupError ? t('restoreInvalidFile') : t('restoreCantReadFile')
      );
      return;
    }

    const dateLabel = exportedAt
      ? new Date(exportedAt).toLocaleString()
      : (isZh ? '未知时间' : 'an unknown time');

    confirmAction(
      t('restoreConfirmTitle'),
      t('restoreConfirmBody', { date: dateLabel }),
      t('restoreConfirmBtn'),
      async () => {
        try {
          await appData.restoreFromBackup(zipBytes);
          await appData.completeOnboarding();
          onClose();
          onRestoreSuccess?.();
          haptics.payoff();
          // Data restore succeeds first; purchases aren't in the backup, so ask once.
          // Cancel ("Not now") is safe because onboarding is already complete.
          offerRestorePurchases({
            confirmAction,
            restore,
            refresh,
            notify,
            title: t('restorePurchasesAskTitle'),
            body: t('restorePurchasesAskBody'),
            confirmLabel: t('proRestore'),
            skipLabel: t('restorePurchasesAskSkip'),
            nothingToRestore: t('proRestoreNothing'),
            storeUnreachable: t('proStoreUnreachable'),
          });
        } catch (e: any) {
          notify(t('restoreFailedTitle'), e?.message);
        }
      }
    );
  };

  const handleRestoreFromFile = async () => {
    setRestoringFile(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const bytes =
        Platform.OS === 'web' && asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : new File(asset.uri).bytesSync();
      await runRestore(bytes);
    } catch (e: any) {
      notify(t('restoreFailedTitle'), e?.message || t('restoreCantReadFile'));
    } finally {
      setRestoringFile(false);
    }
  };

  const handleCloudRestore = async () => {
    setRestoringCloud(true);
    try {
      const result = await cloud.restoreLatest();
      if (result.status === 'cancelled') return;
      if (result.status === 'empty') {
        notify(t('restoreFailedTitle'), t('restoreNoBackupFound'));
        return;
      }
      await runRestore(result.bytes);
    } catch (e: any) {
      notify(t('restoreFailedTitle'), e?.message);
    } finally {
      setRestoringCloud(false);
    }
  };

  const isRestoring = restoringFile || restoringCloud || cloud.status === 'connecting' || cloud.status === 'restoring';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colorTheme.bg,
            paddingBottom: Math.max(insets.bottom, 16) + spacing.base,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />

        <View style={styles.sheetHead}>
          <Pip size={42} expr="curious" />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Title>{t('restoreModalTitle')}</Title>
            <Caption color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>
              {t('restoreModalSubtitle')}
            </Caption>
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('close')}>
            <Icon name="x" size={20} color={colorTheme.ink2} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Card 1: Local Backup (.zip) */}
          <Eyebrow style={{ marginBottom: 8, marginTop: 4 }}>
            {isZh ? '本地文件备份' : 'Local backup file'}
          </Eyebrow>
          <Card style={[styles.card, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
            <View style={styles.row}>
              <View style={[styles.badge, { backgroundColor: theme.accentTint }]}>
                <Icon name="folder" size={18} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colorTheme.ink }]}>
                  {t('restoreFromFileTitle')}
                </Text>
                <Text style={[styles.cardSub, { color: colorTheme.ink2 }]}>
                  {t('restoreFromFileDesc')}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleRestoreFromFile}
              disabled={isRestoring}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: theme.accentInk,
                  opacity: restoringFile ? 0.6 : pressed ? 0.92 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              {restoringFile ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Icon name="upload" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>{t('restoreFromFileBtn')}</Text>
                </>
              )}
            </Pressable>
          </Card>

          {/* Card 2: Cloud Backup */}
          {Platform.OS === 'android' && (
            <>
              <Eyebrow style={{ marginBottom: 8, marginTop: 18 }}>
                {isZh ? '云端备份' : 'Cloud backup'}
              </Eyebrow>
              <Card style={[styles.card, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
                <View style={styles.row}>
                  <View style={[styles.badge, { backgroundColor: theme.accentTint }]}>
                    <Icon name="shield" size={18} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colorTheme.ink }]}>
                      {t('restoreFromCloudTitle')}
                    </Text>
                    <Text style={[styles.cardSub, { color: colorTheme.ink2 }]}>
                      {!cloud.isConfigured
                        ? t('restoreFromCloudNotConfigured')
                        : cloud.status === 'connected' || cloud.status === 'backing-up' || cloud.status === 'restoring'
                          ? `${t('restoreConnectedAs', { email: cloud.accountEmail ?? '' })}${cloud.lastBackupAt ? ` · ${formatRelativeBackupTime(cloud.lastBackupAt, isZh)}` : ''}`
                          : t('restoreNotConnected')}
                    </Text>
                  </View>
                </View>

                {cloud.error && (
                  <Text style={[styles.errorText, { color: '#b3261e' }]}>{cloud.error}</Text>
                )}

                <Pressable
                  onPress={handleCloudRestore}
                  disabled={!cloud.isConfigured || isRestoring}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: theme.accentInk,
                      opacity: !cloud.isConfigured ? 0.4 : isRestoring ? 0.6 : pressed ? 0.92 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  {restoringCloud || cloud.status === 'connecting' || cloud.status === 'restoring' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Icon name="download" size={16} color="#fff" />
                      <Text style={styles.primaryBtnText}>{t('restoreConnectGoogleBtn')}</Text>
                    </>
                  )}
                </Pressable>
              </Card>
            </>
          )}

          {Platform.OS === 'ios' && (
            <>
              <Eyebrow style={{ marginBottom: 8, marginTop: 18 }}>
                {isZh ? '云端备份' : 'Cloud backup'}
              </Eyebrow>
              <Card style={[styles.card, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2, opacity: 0.6 }]}>
                <View style={styles.row}>
                  <View style={[styles.badge, { backgroundColor: colorTheme.surface2 }]}>
                    <Icon name="shield" size={18} color={colorTheme.ink3} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colorTheme.ink }]}>iCloud</Text>
                    <Text style={[styles.cardSub, { color: colorTheme.ink2 }]}>
                      {t('restoreICloudComingSoon')}
                    </Text>
                  </View>
                </View>
              </Card>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  card: {
    padding: spacing.base,
    gap: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: uiFont(700),
    fontSize: 14.5,
  },
  cardSub: {
    fontFamily: uiFont(500),
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  errorText: {
    fontFamily: uiFont(600),
    fontSize: 12,
    lineHeight: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 999,
  },
  primaryBtnText: {
    fontFamily: uiFont(700),
    fontSize: 14,
    color: '#fff',
  },
});
