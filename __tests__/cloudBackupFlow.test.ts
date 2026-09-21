import { backupToDrive, restoreFromDrive } from '../src/lib/cloudBackup/cloudBackupFlow';

const zip = new Uint8Array([1, 2, 3]);

describe('one-tap Google Drive backup', () => {
  it('signs in then uploads without a second backup tap', async () => {
    const interactiveSignIn = jest.fn(async () => ({
      status: 'success' as const,
      accessToken: 'access',
      email: 'yang@example.com',
    }));
    const upload = jest.fn(async () => {});

    await expect(
      backupToDrive(zip, {
        silentAccess: async () => ({ status: 'none' }),
        interactiveSignIn,
        upload,
      })
    ).resolves.toBe('ok');

    expect(interactiveSignIn).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith('access', zip);
  });

  it('skips the account picker when already signed in', async () => {
    const interactiveSignIn = jest.fn();
    const upload = jest.fn(async () => {});

    await expect(
      backupToDrive(zip, {
        silentAccess: async () => ({
          status: 'success',
          accessToken: 'silent',
          email: 'yang@example.com',
        }),
        interactiveSignIn,
        upload,
      })
    ).resolves.toBe('ok');

    expect(interactiveSignIn).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith('silent', zip);
  });

  it('does not upload if the user dismisses the account picker', async () => {
    const upload = jest.fn(async () => {});

    await expect(
      backupToDrive(zip, {
        silentAccess: async () => ({ status: 'none' }),
        interactiveSignIn: async () => ({ status: 'cancelled' }),
        upload,
      })
    ).resolves.toBe('cancelled');

    expect(upload).not.toHaveBeenCalled();
  });
});

describe('one-tap Google Drive restore', () => {
  it('signs in then downloads the latest backup', async () => {
    const bytes = new Uint8Array([9, 8]);
    const download = jest.fn(async () => bytes);

    await expect(
      restoreFromDrive({
        silentAccess: async () => ({ status: 'none' }),
        interactiveSignIn: async () => ({
          status: 'success',
          accessToken: 'access',
          email: 'yang@example.com',
        }),
        download,
      })
    ).resolves.toEqual({ status: 'ok', bytes });

    expect(download).toHaveBeenCalledWith('access');
  });

  it('does not download if the user dismisses the account picker', async () => {
    const download = jest.fn();

    await expect(
      restoreFromDrive({
        silentAccess: async () => ({ status: 'none' }),
        interactiveSignIn: async () => ({ status: 'cancelled' }),
        download,
      })
    ).resolves.toEqual({ status: 'cancelled' });

    expect(download).not.toHaveBeenCalled();
  });
});
