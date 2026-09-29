import {
  AUTO_BACKUP_ENABLED_KEY,
  enableAutoBackup,
  loadAutoBackupEnabled,
  nextStoredAutoBackupPref,
  persistAutoBackupEnabled,
  resolveAutoBackupEnabled,
  runSilentAutoBackupIfDue,
  shouldRunSilentAutoBackup,
} from '../src/lib/cloudBackup/autoBackupPref';

jest.mock('../src/db/metaRepo', () => ({
  getMeta: jest.fn(),
  setMeta: jest.fn(),
}));

import { getMeta, setMeta } from '../src/db/metaRepo';

const mockGetMeta = getMeta as jest.MockedFunction<typeof getMeta>;
const mockSetMeta = setMeta as jest.MockedFunction<typeof setMeta>;

describe('resolveAutoBackupEnabled', () => {
  it('defaults off when the flag is unset and Google Drive is not connected', () => {
    expect(resolveAutoBackupEnabled(null, false)).toBe(false);
  });

  it('defaults off during onboarding even if Google Drive is already connected', () => {
    expect(resolveAutoBackupEnabled(null, true, { onboardingComplete: false })).toBe(false);
  });

  it('grandfathers on when the flag is unset and Google Drive is already connected', () => {
    expect(resolveAutoBackupEnabled(null, true)).toBe(true);
  });

  it('honors an explicit off even if Google Drive is connected', () => {
    expect(resolveAutoBackupEnabled('false', true)).toBe(false);
  });

  it('honors an explicit on even if Google Drive is disconnected', () => {
    expect(resolveAutoBackupEnabled('true', false)).toBe(true);
  });
});

describe('nextStoredAutoBackupPref', () => {
  it('writes false for a first-run user who is not connected', () => {
    expect(nextStoredAutoBackupPref(null, false)).toBe('false');
  });

  it('writes true to grandfather an already-connected account', () => {
    expect(nextStoredAutoBackupPref(null, true)).toBe('true');
  });

  it('does not persist during onboarding, even if Drive is already connected', () => {
    expect(nextStoredAutoBackupPref(null, true, { onboardingComplete: false })).toBeNull();
    expect(nextStoredAutoBackupPref(null, false, { onboardingComplete: false })).toBeNull();
  });

  it('does not rewrite an explicit choice', () => {
    expect(nextStoredAutoBackupPref('false', true)).toBeNull();
    expect(nextStoredAutoBackupPref('true', false)).toBeNull();
  });
});

describe('shouldRunSilentAutoBackup', () => {
  const hour = 60 * 60 * 1000;
  const now = Date.parse('2026-09-22T00:00:00.000Z');

  it('does not run when auto-backup is off', () => {
    expect(
      shouldRunSilentAutoBackup({
        connected: true,
        autoEnabled: false,
        lastBackupAt: null,
        nowMs: now,
      })
    ).toBe(false);
  });

  it('does not run when Drive is disconnected', () => {
    expect(
      shouldRunSilentAutoBackup({
        connected: false,
        autoEnabled: true,
        lastBackupAt: null,
        nowMs: now,
      })
    ).toBe(false);
  });

  it('runs when connected, auto is on, and there is no previous backup', () => {
    expect(
      shouldRunSilentAutoBackup({
        connected: true,
        autoEnabled: true,
        lastBackupAt: null,
        nowMs: now,
      })
    ).toBe(true);
  });

  it('skips when the last backup is still fresh', () => {
    expect(
      shouldRunSilentAutoBackup({
        connected: true,
        autoEnabled: true,
        lastBackupAt: new Date(now - hour).toISOString(),
        nowMs: now,
      })
    ).toBe(false);
  });

  it('runs when the last backup is older than six hours', () => {
    expect(
      shouldRunSilentAutoBackup({
        connected: true,
        autoEnabled: true,
        lastBackupAt: new Date(now - 7 * hour).toISOString(),
        nowMs: now,
      })
    ).toBe(true);
  });
});

describe('loadAutoBackupEnabled', () => {
  beforeEach(() => {
    mockGetMeta.mockReset();
    mockSetMeta.mockReset();
    mockSetMeta.mockResolvedValue(undefined);
  });

  function mockMeta(values: Record<string, string | null>) {
    mockGetMeta.mockImplementation(async (key: string) => values[key] ?? null);
  }

  it('persists false on first launch when Drive is not connected', async () => {
    mockMeta({ [AUTO_BACKUP_ENABLED_KEY]: null, onboarding_complete: 'true' });
    await expect(loadAutoBackupEnabled(false)).resolves.toBe(false);
    expect(mockSetMeta).toHaveBeenCalledWith(AUTO_BACKUP_ENABLED_KEY, 'false');
  });

  it('persists true on first launch when Drive is already connected and onboarding is done', async () => {
    mockMeta({ [AUTO_BACKUP_ENABLED_KEY]: null, onboarding_complete: 'true' });
    await expect(loadAutoBackupEnabled(true)).resolves.toBe(true);
    expect(mockSetMeta).toHaveBeenCalledWith(AUTO_BACKUP_ENABLED_KEY, 'true');
  });

  it('does not persist during onboarding even if Drive is already connected', async () => {
    mockMeta({ [AUTO_BACKUP_ENABLED_KEY]: null, onboarding_complete: null });
    await expect(loadAutoBackupEnabled(true)).resolves.toBe(false);
    expect(mockSetMeta).not.toHaveBeenCalled();
  });

  it('does not rewrite an explicit off', async () => {
    mockMeta({ [AUTO_BACKUP_ENABLED_KEY]: 'false', onboarding_complete: 'true' });
    await expect(loadAutoBackupEnabled(true)).resolves.toBe(false);
    expect(mockSetMeta).not.toHaveBeenCalled();
  });
});

describe('persistAutoBackupEnabled', () => {
  beforeEach(() => {
    mockSetMeta.mockReset();
    mockSetMeta.mockResolvedValue(undefined);
  });

  it('stores an explicit true or false', async () => {
    await persistAutoBackupEnabled(true);
    expect(mockSetMeta).toHaveBeenCalledWith(AUTO_BACKUP_ENABLED_KEY, 'true');
    await persistAutoBackupEnabled(false);
    expect(mockSetMeta).toHaveBeenCalledWith(AUTO_BACKUP_ENABLED_KEY, 'false');
  });
});

describe('runSilentAutoBackupIfDue', () => {
  it('does not build or upload when auto-backup should not run', async () => {
    const buildZip = jest.fn();
    const upload = jest.fn();
    await expect(
      runSilentAutoBackupIfDue({
        connected: true,
        autoEnabled: false,
        lastBackupAt: null,
        buildZip,
        upload,
      })
    ).resolves.toBe(false);
    expect(buildZip).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('builds a zip and uploads when auto-backup is due', async () => {
    const zip = new Uint8Array([1, 2]);
    const buildZip = jest.fn(async () => zip);
    const upload = jest.fn(async () => true);
    await expect(
      runSilentAutoBackupIfDue({
        connected: true,
        autoEnabled: true,
        lastBackupAt: null,
        buildZip,
        upload,
      })
    ).resolves.toBe(true);
    expect(buildZip).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(zip);
  });
});

describe('enableAutoBackup', () => {
  it('uploads then persists on after a successful Drive backup', async () => {
    const zip = new Uint8Array([3]);
    const backupToDrive = jest.fn(async () => 'ok' as const);
    const persist = jest.fn(async () => {});
    await expect(
      enableAutoBackup({
        buildZip: async () => zip,
        backupToDrive,
        persist,
      })
    ).resolves.toBe('ok');
    expect(backupToDrive).toHaveBeenCalledWith(zip);
    expect(persist).toHaveBeenCalledWith(true);
  });

  it('does not persist on when the user cancels Google sign-in', async () => {
    const persist = jest.fn(async () => {});
    await expect(
      enableAutoBackup({
        buildZip: async () => new Uint8Array([3]),
        backupToDrive: async () => 'cancelled',
        persist,
      })
    ).resolves.toBe('cancelled');
    expect(persist).not.toHaveBeenCalled();
  });
});
