// src/lib/cloudBackup/autoBackupPref.ts
// Auto-backup is an explicit opt-in, separate from being signed into Google Drive.
// Unset + already connected grandfathers the previous implicit-on behavior.
import { getMeta, setMeta } from '../../db/metaRepo';

export const AUTO_BACKUP_ENABLED_KEY = 'cloud_backup_auto_enabled';
export const AUTO_BACKUP_STALE_MS = 6 * 60 * 60 * 1000;

export function resolveAutoBackupEnabled(
  stored: string | null,
  connected: boolean,
  opts?: { onboardingComplete?: boolean }
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  if (opts?.onboardingComplete === false) return false;
  return connected;
}

/** Value to persist on first read, or null when the stored choice is already explicit
 *  (or still waiting for an onboarding choice). */
export function nextStoredAutoBackupPref(
  stored: string | null,
  connected: boolean,
  opts?: { onboardingComplete?: boolean }
): 'true' | 'false' | null {
  if (stored === 'true' || stored === 'false') return null;
  if (opts?.onboardingComplete === false) return null;
  return connected ? 'true' : 'false';
}

export function shouldRunSilentAutoBackup(opts: {
  connected: boolean;
  autoEnabled: boolean;
  lastBackupAt: string | null;
  nowMs?: number;
  staleMs?: number;
}): boolean {
  if (!opts.connected || !opts.autoEnabled) return false;
  const now = opts.nowMs ?? Date.now();
  const staleMs = opts.staleMs ?? AUTO_BACKUP_STALE_MS;
  if (!opts.lastBackupAt) return true;
  return now - new Date(opts.lastBackupAt).getTime() > staleMs;
}

export async function persistAutoBackupEnabled(enabled: boolean): Promise<void> {
  await setMeta(AUTO_BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function loadAutoBackupEnabled(connected: boolean): Promise<boolean> {
  const [stored, onboardingFlag] = await Promise.all([
    getMeta(AUTO_BACKUP_ENABLED_KEY),
    getMeta('onboarding_complete'),
  ]);
  const next = nextStoredAutoBackupPref(stored, connected, {
    onboardingComplete: onboardingFlag === 'true',
  });
  if (next !== null) await setMeta(AUTO_BACKUP_ENABLED_KEY, next);
  return resolveAutoBackupEnabled(next ?? stored, connected, {
    onboardingComplete: onboardingFlag === 'true',
  });
}

export async function enableAutoBackup(deps: {
  buildZip: () => Promise<Uint8Array>;
  backupToDrive: (zip: Uint8Array) => Promise<'ok' | 'cancelled'>;
  persist: (enabled: boolean) => Promise<void>;
}): Promise<'ok' | 'cancelled'> {
  const zip = await deps.buildZip();
  const result = await deps.backupToDrive(zip);
  if (result === 'cancelled') return 'cancelled';
  await deps.persist(true);
  return 'ok';
}

export async function runSilentAutoBackupIfDue(deps: {
  connected: boolean;
  autoEnabled: boolean;
  lastBackupAt: string | null;
  buildZip: () => Promise<Uint8Array>;
  upload: (zip: Uint8Array) => Promise<boolean>;
  nowMs?: number;
}): Promise<boolean> {
  if (
    !shouldRunSilentAutoBackup({
      connected: deps.connected,
      autoEnabled: deps.autoEnabled,
      lastBackupAt: deps.lastBackupAt,
      nowMs: deps.nowMs,
    })
  ) {
    return false;
  }
  const zip = await deps.buildZip();
  return deps.upload(zip);
}
