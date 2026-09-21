import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Card, Eyebrow, TopBar } from '../components/ui';
import { getMeta, setMeta } from '../db/metaRepo';
import { buildBackupZip } from '../lib/backupBundle';
import { InvalidBackupError, formatRelativeBackupTime as formatRelative, peekBackupZip } from '../lib/backupRestore';
import { useCloudBackup } from '../lib/cloudBackup/useCloudBackup';
import { saveOrDownloadExport } from '../lib/financialExport';
import { confirmAction, notify } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { uiFont } from '../theme';

const LOCAL_BACKUP_AT_KEY = 'local_backup_last_at';

export function BackupScreen({ onBack, embedded }: { onBack: () => void; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const appData = useAppData();
  const cloud = useCloudBackup();

  const [localBackupAt, setLocalBackupAt] = useState<string | null>(null);
  const [backingUpLocal, setBackingUpLocal] = useState(false);
  const [restoringFile, setRestoringFile] = useState(false);
  const [backingUpCloud, setBackingUpCloud] = useState(false);
  const [restoringCloud, setRestoringCloud] = useState(false);

  useEffect(() => {
    getMeta(LOCAL_BACKUP_AT_KEY).then(setLocalBackupAt);
  }, []);

  const handleLocalBackup = async () => {
    setBackingUpLocal(true);
    try {
      const zip = await buildBackupZip(appData);
      const fileName = `pip-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      const res = await saveOrDownloadExport(fileName, zip, 'application/zip', { autoShare: true });
      if (res.success) {
        const now = new Date().toISOString();
        await setMeta(LOCAL_BACKUP_AT_KEY, now);
        setLocalBackupAt(now);
      } else {
        notify(isZh ? '备份失败' : 'Backup failed', res.error);
      }
    } catch (e: any) {
      notify(isZh ? '备份失败' : 'Backup failed', e?.message);
    } finally {
      setBackingUpLocal(false);
    }
  };

  const runRestore = async (zipBytes: Uint8Array) => {
    let exportedAt: string | null = null;
    try {
      exportedAt = peekBackupZip(zipBytes).exportedAt;
    } catch (e: any) {
      notify(
        isZh ? '备份文件无效' : 'Invalid backup file',
        e instanceof InvalidBackupError ? e.message : (isZh ? '无法读取该备份文件。' : "Couldn't read that backup file.")
      );
      return;
    }

    const dateLabel = exportedAt ? new Date(exportedAt).toLocaleString() : (isZh ? '未知时间' : 'an unknown time');
    confirmAction(
      isZh ? '恢复备份？' : 'Restore this backup?',
      isZh
        ? `这将用 ${dateLabel} 的备份替换当前所有数据，且无法撤销。`
        : `This replaces all current data with the backup from ${dateLabel}. This can't be undone.`,
      isZh ? '恢复' : 'Restore',
      async () => {
        try {
          await appData.restoreFromBackup(zipBytes);
          notify(isZh ? '恢复完成' : 'Restore complete', isZh ? '您的数据已恢复。' : 'Your data has been restored.');
        } catch (e: any) {
          notify(isZh ? '恢复失败' : 'Restore failed', e?.message);
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
      // On web, expo-file-system's File has no native module to back it (validatePath is
      // native-only), so bytesSync() throws there. expo-document-picker hands back the raw
      // browser File object in `asset.file` on web instead — use that when present.
      const bytes =
        Platform.OS === 'web' && asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : new File(asset.uri).bytesSync();
      await runRestore(bytes);
    } catch (e: any) {
      notify(isZh ? '无法读取文件' : "Couldn't read file", e?.message);
    } finally {
      setRestoringFile(false);
    }
  };

  const handleCloudBackupNow = async () => {
    setBackingUpCloud(true);
    try {
      const zip = await buildBackupZip(appData);
      const result = await cloud.backupToDrive(zip);
      if (result === 'cancelled') return;
    } catch (e: any) {
      notify(isZh ? '云备份失败' : 'Cloud backup failed', e?.message);
    } finally {
      setBackingUpCloud(false);
    }
  };

  const handleCloudRestore = async () => {
    setRestoringCloud(true);
    try {
      const result = await cloud.restoreLatest();
      if (result.status === 'cancelled') return;
      if (result.status === 'empty') {
        notify(isZh ? '未找到备份' : 'No backup found', isZh ? 'Google Drive 中还没有备份。' : "There's no backup in Google Drive yet.");
        return;
      }
      await runRestore(result.bytes);
    } catch (e: any) {
      notify(isZh ? '恢复失败' : 'Restore failed', e?.message);
    } finally {
      setRestoringCloud(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={isZh ? '备份与恢复' : 'Back Up & Restore'} onBack={onBack} />
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}>
        <Eyebrow style={{ marginBottom: 10 }}>{isZh ? '本地备份' : 'Local backup'}</Eyebrow>
        <Card style={{ padding: 16, gap: 12 }}>
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: theme.accentTint }]}>
              <Icon name="folder" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colorTheme.ink }]}>
                {isZh ? '导出完整数据（JSON + 图片）' : 'Export full data (JSON + images)'}
              </Text>
              <Text style={[styles.sub, { color: colorTheme.ink2 }]}>
                {isZh ? `上次备份：${formatRelative(localBackupAt, isZh)}` : `Last backed up: ${formatRelative(localBackupAt, isZh)}`}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={handleLocalBackup}
            disabled={backingUpLocal}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.accentInk, opacity: backingUpLocal ? 0.6 : pressed ? 0.92 : 1 },
            ]}
          >
            {backingUpLocal ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="download" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>{isZh ? '立即备份' : 'Back up now'}</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={handleRestoreFromFile}
            disabled={restoringFile}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2, opacity: restoringFile ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            {restoringFile ? (
              <ActivityIndicator color={theme.accent} size="small" />
            ) : (
              <>
                <Icon name="upload" size={16} color={theme.accent} />
                <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>{isZh ? '从文件恢复' : 'Restore from file'}</Text>
              </>
            )}
          </Pressable>
        </Card>

        {Platform.OS === 'android' && (
          <>
            <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>{isZh ? '云备份' : 'Cloud backup'}</Eyebrow>
            <Card style={{ padding: 16, gap: 12 }}>
              <View style={styles.row}>
                <View style={[styles.badge, { backgroundColor: theme.accentTint }]}>
                  <Icon name="shield" size={16} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colorTheme.ink }]}>Google Drive</Text>
                  <Text style={[styles.sub, { color: colorTheme.ink2 }]}>
                    {!cloud.isConfigured
                      ? (isZh ? '此功能尚未配置。' : 'Not configured yet.')
                      : cloud.status === 'connected' || cloud.status === 'backing-up' || cloud.status === 'restoring'
                        ? (isZh
                            ? `已连接${cloud.accountEmail ? ` (${cloud.accountEmail})` : ''} · 上次备份：${formatRelative(cloud.lastBackupAt, isZh)}`
                            : `Connected${cloud.accountEmail ? ` as ${cloud.accountEmail}` : ''} · Last backed up: ${formatRelative(cloud.lastBackupAt, isZh)}`)
                        : (isZh ? '未连接' : 'Not connected')}
                  </Text>
                </View>
              </View>

              {cloud.error && <Text style={[styles.errorText, { color: '#b3261e' }]}>{cloud.error}</Text>}

              <Pressable
                onPress={handleCloudBackupNow}
                disabled={!cloud.isConfigured || backingUpCloud || cloud.status === 'backing-up' || cloud.status === 'connecting'}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: theme.accentInk,
                    opacity: !cloud.isConfigured
                      ? 0.4
                      : backingUpCloud || cloud.status === 'backing-up' || cloud.status === 'connecting'
                        ? 0.6
                        : pressed
                          ? 0.92
                          : 1,
                  },
                ]}
              >
                {backingUpCloud || cloud.status === 'backing-up' || cloud.status === 'connecting' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Icon name="download" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>{isZh ? '备份到 Google Drive' : 'Back up to Google Drive'}</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={handleCloudRestore}
                disabled={!cloud.isConfigured || restoringCloud || cloud.status === 'restoring'}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  {
                    backgroundColor: colorTheme.surface,
                    borderColor: colorTheme.line2,
                    opacity: !cloud.isConfigured || restoringCloud ? 0.6 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {restoringCloud || cloud.status === 'restoring' ? (
                  <ActivityIndicator color={theme.accent} size="small" />
                ) : (
                  <>
                    <Icon name="upload" size={16} color={theme.accent} />
                    <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>{isZh ? '从 Google Drive 恢复' : 'Restore from Google Drive'}</Text>
                  </>
                )}
              </Pressable>

              {(cloud.status === 'connected' || cloud.status === 'backing-up' || cloud.status === 'restoring') && (
                <Pressable onPress={cloud.disconnect} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, alignSelf: 'center' }]}>
                  <Text style={[styles.disconnectText, { color: colorTheme.ink3 }]}>{isZh ? '断开连接' : 'Disconnect'}</Text>
                </Pressable>
              )}
            </Card>
          </>
        )}

        {Platform.OS === 'ios' && (
          <>
            <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>{isZh ? '云备份' : 'Cloud backup'}</Eyebrow>
            <Card style={{ padding: 16, opacity: 0.5 }}>
              <View style={styles.row}>
                <View style={[styles.badge, { backgroundColor: colorTheme.surface2 }]}>
                  <Icon name="shield" size={16} color={colorTheme.ink3} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colorTheme.ink }]}>iCloud</Text>
                  <Text style={[styles.sub, { color: colorTheme.ink2 }]}>{isZh ? '即将推出' : 'Coming soon'}</Text>
                </View>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: uiFont(700), fontSize: 15 },
  sub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 1 },
  errorText: { fontFamily: uiFont(600), fontSize: 12.5, lineHeight: 17 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 999 },
  primaryBtnText: { fontFamily: uiFont(700), fontSize: 14.5, color: '#fff' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 999, borderWidth: 1 },
  secondaryBtnText: { fontFamily: uiFont(600), fontSize: 13.5 },
  disconnectText: { fontFamily: uiFont(600), fontSize: 12.5, textDecorationLine: 'underline', paddingVertical: 6 },
});
