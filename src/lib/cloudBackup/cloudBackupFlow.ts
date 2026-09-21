// src/lib/cloudBackup/cloudBackupFlow.ts
// One-tap Drive backup/restore: reuse a silent Google session when one exists, otherwise
// show the native account picker, then upload/download immediately. Callers inject auth
// and Drive IO so this stays unit-testable without the native module.

export type DriveSession = {
  status: 'success';
  accessToken: string;
  email: string | null;
};

export type DriveAuth = {
  silentAccess: () => Promise<DriveSession | { status: 'none' }>;
  interactiveSignIn: () => Promise<DriveSession | { status: 'cancelled' }>;
};

export async function ensureDriveSession(auth: DriveAuth): Promise<DriveSession | { status: 'cancelled' }> {
  const silent = await auth.silentAccess();
  if (silent.status === 'success') return silent;
  return auth.interactiveSignIn();
}

export async function backupToDrive(
  zipBytes: Uint8Array,
  deps: DriveAuth & { upload: (accessToken: string, zipBytes: Uint8Array) => Promise<void> }
): Promise<'ok' | 'cancelled'> {
  const session = await ensureDriveSession(deps);
  if (session.status === 'cancelled') return 'cancelled';
  await deps.upload(session.accessToken, zipBytes);
  return 'ok';
}

export async function restoreFromDrive(
  deps: DriveAuth & { download: (accessToken: string) => Promise<Uint8Array | null> }
): Promise<{ status: 'ok'; bytes: Uint8Array } | { status: 'empty' } | { status: 'cancelled' }> {
  const session = await ensureDriveSession(deps);
  if (session.status === 'cancelled') return { status: 'cancelled' };
  const bytes = await deps.download(session.accessToken);
  if (!bytes) return { status: 'empty' };
  return { status: 'ok', bytes };
}
