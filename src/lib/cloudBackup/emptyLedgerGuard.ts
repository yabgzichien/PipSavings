// src/lib/cloudBackup/emptyLedgerGuard.ts
// The cloud backup is a single rolling file, so uploading replaces whatever was there. A phone
// that has just been reinstalled (or whose database failed to open) holds an empty ledger, and
// "back up" would then silently replace the user's only copy with nothing. Restore is exactly
// what that user needs next, and it would find an empty file. This refuses that one case.
import { strFromU8, unzipSync } from 'fflate';

export class EmptyBackupRefusedError extends Error {
  /** Stable marker so UI can show a translated message instead of this English text. */
  readonly code = 'empty_backup_refused';

  constructor() {
    super(
      "Pip didn't back up: this phone has no transactions or accounts yet, and your Google Drive " +
        'already holds a backup. Restore that backup first, or add some data, so it is not replaced with an empty one.'
    );
    this.name = 'EmptyBackupRefusedError';
  }
}

const COLLECTIONS = ['transactions', 'accounts', 'commitments', 'people', 'splits', 'trips'] as const;

/**
 * Whether a backup zip carries any of the user's records. Anything unexpected (not a zip, no
 * backup.json, odd shape) answers true: this guard must never be the reason a backup stops
 * working, only the reason an obviously empty one does not overwrite a real one.
 */
export function zipHasLedgerData(zipBytes: Uint8Array): boolean {
  try {
    // Read only backup.json; the receipts folder can be large and is irrelevant here.
    const entries = unzipSync(zipBytes, { filter: (file) => file.name === 'backup.json' });
    const json = entries['backup.json'];
    if (!json) return true;
    const payload = JSON.parse(strFromU8(json)) as Record<string, unknown> | null;
    if (!payload || typeof payload !== 'object') return true;
    for (const key of COLLECTIONS) {
      const value = payload[key];
      if (Array.isArray(value) && value.length > 0) return true;
    }
    const budget = payload.budget as { expectedIncome?: unknown } | undefined;
    if (budget && typeof budget.expectedIncome === 'number' && budget.expectedIncome > 0) return true;
    // Every collection was present-and-empty (or absent): a genuinely empty ledger.
    return !COLLECTIONS.some((key) => Array.isArray(payload[key]));
  } catch {
    return true;
  }
}
