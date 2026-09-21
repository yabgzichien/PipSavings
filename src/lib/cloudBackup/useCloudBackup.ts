// src/lib/cloudBackup/useCloudBackup.ts
// React hook wrapping native Google Sign-In + Drive REST calls into the state a Settings
// screen (or the silent auto-backup trigger) needs. Android only — see googleAuth.ts.
import { useCallback, useEffect, useState } from 'react';
import { getMeta, setMeta } from '../../db/metaRepo';
import { isGoogleDriveConfigured, refreshAccessToken } from './googleAuth';
import { backupToDrive as runBackupToDrive, restoreFromDrive as runRestoreFromDrive } from './cloudBackupFlow';
import { downloadBackup, fetchAccountEmail, uploadBackup } from './googleDriveApi';
import {
  googleSignInUserMessage,
  hasNativeGoogleSession,
  interactiveGoogleSignIn,
  signOutGoogle,
  silentGoogleAccess,
} from './nativeGoogleAuth';
import {
  clearStoredCredential,
  getStoredAccountEmail,
  getStoredRefreshToken,
  setStoredAccountEmail,
} from './tokenStore';

const LAST_BACKUP_AT_KEY = 'cloud_backup_google_last_at';

async function silentAccessWithLegacyFallback() {
  const native = await silentGoogleAccess();
  if (native.status === 'success') return native;
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return { status: 'none' as const };
  const { accessToken } = await refreshAccessToken(refreshToken);
  return {
    status: 'success' as const,
    accessToken,
    email: await getStoredAccountEmail(),
  };
}

const nativeDriveAuth = {
  silentAccess: silentAccessWithLegacyFallback,
  interactiveSignIn: interactiveGoogleSignIn,
};

export type CloudBackupStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'backing-up'
  | 'restoring'
  | 'error';

export type CloudRestoreResult =
  | { status: 'ok'; bytes: Uint8Array }
  | { status: 'empty' }
  | { status: 'cancelled' };

export interface CloudBackupState {
  isConfigured: boolean;
  status: CloudBackupStatus;
  accountEmail: string | null;
  lastBackupAt: string | null;
  error: string | null;
  connect: () => Promise<'connected' | 'cancelled'>;
  disconnect: () => Promise<void>;
  backupNow: (zipBytes: Uint8Array) => Promise<void>;
  backupToDrive: (zipBytes: Uint8Array) => Promise<'ok' | 'cancelled'>;
  restoreLatest: () => Promise<CloudRestoreResult>;
}

export function useCloudBackup(): CloudBackupState {
  const [status, setStatus] = useState<CloudBackupStatus>('disconnected');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [refreshToken, email, lastAt] = await Promise.all([
        getStoredRefreshToken(),
        getStoredAccountEmail(),
        getMeta(LAST_BACKUP_AT_KEY),
      ]);
      setAccountEmail(email);
      setLastBackupAt(lastAt);
      if (hasNativeGoogleSession() || refreshToken) setStatus('connected');
    })();
  }, []);

  const rememberEmail = useCallback(async (email: string | null) => {
    if (!email) return;
    await setStoredAccountEmail(email);
    setAccountEmail(email);
  }, []);

  const connect = useCallback(async (): Promise<'connected' | 'cancelled'> => {
    if (!isGoogleDriveConfigured) {
      setError('Google Drive backup is not configured yet.');
      return 'cancelled';
    }
    setError(null);
    setStatus('connecting');
    try {
      const result = await interactiveGoogleSignIn();
      if (result.status === 'cancelled') {
        setStatus('disconnected');
        return 'cancelled';
      }
      await rememberEmail(result.email);
      if (!result.email) {
        const email = await fetchAccountEmail(result.accessToken);
        await rememberEmail(email);
      }
      setStatus('connected');
      return 'connected';
    } catch (e: any) {
      const message = googleSignInUserMessage(e);
      setError(message);
      setStatus('error');
      throw new Error(message);
    }
  }, [rememberEmail]);

  const disconnect = useCallback(async () => {
    await signOutGoogle();
    await clearStoredCredential();
    setAccountEmail(null);
    setStatus('disconnected');
  }, []);

  const backupToDrive = useCallback(async (zipBytes: Uint8Array): Promise<'ok' | 'cancelled'> => {
    if (!isGoogleDriveConfigured) {
      setError('Google Drive backup is not configured yet.');
      throw new Error('Google Drive backup is not configured yet.');
    }
    setStatus('backing-up');
    setError(null);
    try {
      const result = await runBackupToDrive(zipBytes, {
        ...nativeDriveAuth,
        upload: uploadBackup,
      });
      if (result === 'cancelled') {
        const stillConnected = hasNativeGoogleSession() || Boolean(await getStoredRefreshToken());
        setStatus(stillConnected ? 'connected' : 'disconnected');
        return 'cancelled';
      }
      await rememberEmail(await getStoredAccountEmail());
      const at = new Date().toISOString();
      await setMeta(LAST_BACKUP_AT_KEY, at);
      setLastBackupAt(at);
      setStatus('connected');
      return 'ok';
    } catch (e: any) {
      const message = googleSignInUserMessage(e);
      setError(message);
      setStatus('error');
      throw new Error(message);
    }
  }, [rememberEmail]);

  const backupNow = useCallback(async (zipBytes: Uint8Array) => {
    const result = await backupToDrive(zipBytes);
    if (result === 'cancelled') return;
  }, [backupToDrive]);

  const restoreLatest = useCallback(async (): Promise<CloudRestoreResult> => {
    setStatus('restoring');
    setError(null);
    try {
      const result = await runRestoreFromDrive({
        ...nativeDriveAuth,
        download: downloadBackup,
      });
      const stillConnected = hasNativeGoogleSession() || Boolean(await getStoredRefreshToken());
      setStatus(stillConnected ? 'connected' : 'disconnected');
      if (result.status === 'ok') {
        const email = await getStoredAccountEmail();
        await rememberEmail(email);
      }
      return result;
    } catch (e: any) {
      const message = googleSignInUserMessage(e);
      setError(message);
      setStatus('error');
      throw new Error(message);
    }
  }, [rememberEmail]);

  return {
    isConfigured: isGoogleDriveConfigured,
    status,
    accountEmail,
    lastBackupAt,
    error,
    connect,
    disconnect,
    backupNow,
    backupToDrive,
    restoreLatest,
  };
}

/** Silent, non-interactive counterpart to backupToDrive for the foreground auto-backup
 *  trigger (useCloudBackupSync.ts). Throws are caught by the caller and logged. */
export async function silentBackupIfConnected(zipBytes: Uint8Array): Promise<boolean> {
  const silent = await silentAccessWithLegacyFallback();
  if (silent.status !== 'success') return false;
  await uploadBackup(silent.accessToken, zipBytes);
  await setMeta(LAST_BACKUP_AT_KEY, new Date().toISOString());
  return true;
}

export async function getLastCloudBackupAt(): Promise<string | null> {
  return getMeta(LAST_BACKUP_AT_KEY);
}

export async function isCloudBackupConnected(): Promise<boolean> {
  if (hasNativeGoogleSession()) return true;
  return (await getStoredRefreshToken()) !== null;
}
