// src/lib/cloudBackup/googleDriveApi.ts
// Plain REST calls against the Drive API v3, scoped to the hidden `appDataFolder` (invisible in
// the user's normal Drive UI; only this app's OAuth client can read/write it). No native SDK —
// just fetch, so this needs no config-plugin/prebuild changes. Every function takes an already-
// valid access token; token refresh lives in googleAuth.ts.
import { EmptyBackupRefusedError, zipHasLedgerData } from './emptyLedgerGuard';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/** Single rolling backup file — see spec decision "single rolling backup" (not dated versions). */
export const BACKUP_FILE_NAME = 'pip-backup.zip';

export class DriveApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new DriveApiError(`Drive API error ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  return res;
}

/** Finds the single backup file's id in appDataFolder, if it exists yet. */
export async function findBackupFileId(accessToken: string): Promise<string | null> {
  const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${encodeURIComponent(
    `name = '${BACKUP_FILE_NAME}'`
  )}&fields=files(id,modifiedTime)`;
  const res = await driveFetch(url, accessToken);
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

/** Modified time of the current backup file, or null if none exists yet. */
export async function getBackupModifiedTime(accessToken: string): Promise<string | null> {
  const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${encodeURIComponent(
    `name = '${BACKUP_FILE_NAME}'`
  )}&fields=files(id,modifiedTime)`;
  const res = await driveFetch(url, accessToken);
  const json = (await res.json()) as { files?: { id: string; modifiedTime: string }[] };
  return json.files?.[0]?.modifiedTime ?? null;
}

/** Creates or overwrites the single rolling backup file in appDataFolder. */
export async function uploadBackup(accessToken: string, zipBytes: Uint8Array): Promise<void> {
  const existingId = await findBackupFileId(accessToken);

  if (existingId) {
    // Every upload path (silent auto-backup, Back up now, the onboarding opt-in) ends here, so
    // this is the one place that can stop an empty fresh install replacing a real backup.
    if (!zipHasLedgerData(zipBytes)) throw new EmptyBackupRefusedError();
    await driveFetch(`${DRIVE_UPLOAD_URL}/${existingId}?uploadType=media`, accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/zip' },
      body: zipBytes as any,
    });
    return;
  }

  // Multipart create: metadata (name + parents=[appDataFolder]) plus the file body in one request.
  const boundary = `pipbackup-${Date.now()}`;
  const metadata = JSON.stringify({ name: BACKUP_FILE_NAME, parents: ['appDataFolder'] });
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + zipBytes.length + tail.length);
  body.set(head, 0);
  body.set(zipBytes, head.length);
  body.set(tail, head.length + zipBytes.length);

  await driveFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: body as any,
  });
}

/** Downloads the single rolling backup file's raw bytes, or null if none exists yet. */
export async function downloadBackup(accessToken: string): Promise<Uint8Array | null> {
  const fileId = await findBackupFileId(accessToken);
  if (!fileId) return null;
  const res = await driveFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, accessToken);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** The signed-in account's email, for display in Settings ("Connected as ..."). */
export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  const res = await driveFetch('https://www.googleapis.com/oauth2/v3/userinfo', accessToken);
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}
