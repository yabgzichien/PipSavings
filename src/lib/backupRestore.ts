// src/lib/backupRestore.ts
// Orchestrates "Restore from backup" for Settings > Back Up & Restore: unzips a backup archive
// (built by `generateFullBackupZip`), writes its receipt images back to local storage, and
// hands the parsed JSON to restoreRepo for the actual destructive DB load. See
// docs/superpowers/specs/2026-09-02-backup-restore-design.md.
import { strFromU8, unzipSync } from 'fflate';
import { saveReceiptImageBytes } from './receiptStorage';
import { restoreFromBackupPayload, validateBackupPayload, type BackupPayload } from '../db/restoreRepo';

export class InvalidBackupError extends Error {}

export function formatRelativeBackupTime(iso: string | null, isZh: boolean): string {
  if (!iso) return isZh ? '从未备份' : 'Never';
  const then = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return isZh ? '刚刚' : 'Just now';
  if (diffMin < 60) return isZh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return isZh ? `${diffHr} 小时前` : `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return isZh ? `${diffDay} 天前` : `${diffDay}d ago`;
}

function mimeForFileName(name: string): string {
  return name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/** Parses `backup.json` out of the zip without touching the database — used to show the
 *  backup's date/summary in a confirm dialog before the user commits to the destructive part. */
export function peekBackupZip(zipBytes: Uint8Array): { payload: BackupPayload; exportedAt: string | null } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new InvalidBackupError('That file is not a valid backup archive.');
  }
  const jsonBytes = entries['backup.json'];
  if (!jsonBytes) throw new InvalidBackupError('That archive has no backup.json inside it.');

  let payload: unknown;
  try {
    payload = JSON.parse(strFromU8(jsonBytes));
  } catch {
    throw new InvalidBackupError("backup.json in that archive isn't valid JSON.");
  }
  if (!validateBackupPayload(payload)) {
    throw new InvalidBackupError("That backup's data doesn't look like a Pip backup.");
  }
  return { payload, exportedAt: payload.statement?.exportedAt ?? null };
}

/**
 * Destructively replaces all app data with the contents of a backup zip: writes every
 * `receipts/*` entry back to local storage, then wipes and reloads the database from
 * `backup.json`. Callers are responsible for confirming with the user first — this has no
 * confirmation step of its own.
 */
export async function restoreFromBackupZip(
  zipBytes: Uint8Array,
  isPro: boolean = false
): Promise<void> {
  const entries = unzipSync(zipBytes);
  const jsonBytes = entries['backup.json'];
  if (!jsonBytes) throw new InvalidBackupError('That archive has no backup.json inside it.');

  const payload = JSON.parse(strFromU8(jsonBytes));
  if (!validateBackupPayload(payload)) {
    throw new InvalidBackupError("That backup's data doesn't look like a Pip backup.");
  }

  const receiptUriByFileName = new Map<string, string>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.startsWith('receipts/') || bytes.length === 0) continue;
    const fileName = path.slice('receipts/'.length);
    const uri = saveReceiptImageBytes(bytes, mimeForFileName(fileName));
    receiptUriByFileName.set(fileName, uri);
  }

  await restoreFromBackupPayload(payload, receiptUriByFileName, isPro);
}
