import React from 'react';
// Same untyped require the other component tests use; the package ships no declarations.
const { act, create } = require('react-test-renderer');

const mockUseAppData = jest.fn();
const mockRunSilent = jest.fn(async () => true);

jest.mock('../src/state/store', () => ({ useAppData: () => mockUseAppData() }));
jest.mock('../src/lib/backupBundle', () => ({ buildBackupZip: jest.fn(async () => new Uint8Array([1])) }));
jest.mock('../src/lib/cloudBackup/googleAuth', () => ({ isGoogleDrivePlatform: () => true }));
jest.mock('../src/lib/cloudBackup/useCloudBackup', () => ({
  isCloudBackupConnected: jest.fn(async () => true),
  getLastCloudBackupAt: jest.fn(async () => null),
  silentBackupIfConnected: jest.fn(async () => true),
}));
jest.mock('../src/lib/cloudBackup/autoBackupPref', () => ({
  loadAutoBackupEnabled: jest.fn(async () => true),
  runSilentAutoBackupIfDue: (...args: unknown[]) => mockRunSilent(...(args as [])),
}));

import { useCloudBackupSync } from '../src/state/useCloudBackupSync';

function Probe() {
  useCloudBackupSync();
  return null;
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useCloudBackupSync', () => {
  beforeEach(() => {
    mockRunSilent.mockClear();
    mockUseAppData.mockReset();
  });

  it('does not back up while the ledger is still loading', async () => {
    mockUseAppData.mockReturnValue({ ready: false, transactions: [] });
    let tree: any;
    await act(async () => {
      tree = create(<Probe />);
    });
    await flush();
    expect(mockRunSilent).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
  });

  it('backs up once the ledger has loaded', async () => {
    mockUseAppData.mockReturnValue({ ready: false, transactions: [] });
    let tree: any;
    await act(async () => {
      tree = create(<Probe />);
    });
    await flush();
    expect(mockRunSilent).not.toHaveBeenCalled();

    mockUseAppData.mockReturnValue({ ready: true, transactions: [{ id: 't1' }] });
    await act(async () => {
      tree!.update(<Probe />);
    });
    await flush();
    expect(mockRunSilent).toHaveBeenCalledTimes(1);
    await act(async () => tree!.unmount());
  });
});
