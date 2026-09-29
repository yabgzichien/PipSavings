// src/state/useCloudBackupSync.ts
// Silent, foreground-triggered Google Drive auto-backup (Android and web). Mounted once at the
// App root, same pattern as useReminderSync. Runs only when Drive is connected AND auto-backup
// is on. Never surfaces errors to the user: this runs unattended, so a failure just means the
// next foreground check tries again.
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { buildBackupZip, type BackupSourceData } from '../lib/backupBundle';
import { loadAutoBackupEnabled, runSilentAutoBackupIfDue } from '../lib/cloudBackup/autoBackupPref';
import { isGoogleDrivePlatform } from '../lib/cloudBackup/googleAuth';
import { getLastCloudBackupAt, isCloudBackupConnected, silentBackupIfConnected } from '../lib/cloudBackup/useCloudBackup';
import { useAppData } from './store';

export function useCloudBackupSync(): void {
  const data = useAppData();
  // A ref rather than an effect dependency: `data` is a new object every render, and this
  // background check should only run on mount/foreground, not on every state change.
  const dataRef = useRef<BackupSourceData>(data);
  dataRef.current = data;

  useEffect(() => {
    if (!isGoogleDrivePlatform(Platform.OS)) return;
    let running = false;

    const run = async () => {
      if (running) return;
      running = true;
      try {
        const connected = await isCloudBackupConnected();
        const autoEnabled = await loadAutoBackupEnabled(connected);
        const lastAt = await getLastCloudBackupAt();
        await runSilentAutoBackupIfDue({
          connected,
          autoEnabled,
          lastBackupAt: lastAt,
          buildZip: () => buildBackupZip(dataRef.current),
          upload: silentBackupIfConnected,
        });
      } catch (e) {
        console.warn('[cloudBackup] auto-backup skipped:', e);
      } finally {
        running = false;
      }
    };

    void run();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void run();
    });
    return () => sub.remove();
  }, []);
}
