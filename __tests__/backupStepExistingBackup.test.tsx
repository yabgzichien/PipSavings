import React from 'react';
const { act, create } = require('react-test-renderer');

const mockBackupToDrive = jest.fn<Promise<'ok' | 'cancelled'>, unknown[]>();
const mockPersist = jest.fn<Promise<void>, unknown[]>(async () => {});
const mockEnable = jest.fn<Promise<'ok' | 'cancelled'>, unknown[]>();

jest.mock('../src/lib/cloudBackup/useCloudBackup', () => ({
  useCloudBackup: () => ({
    isConfigured: true,
    backupToDrive: (...a: unknown[]) => mockBackupToDrive(...a),
    setAutoEnabled: jest.fn(),
  }),
}));
jest.mock('../src/lib/cloudBackup/autoBackupPref', () => ({
  enableAutoBackup: (...a: unknown[]) => mockEnable(...a),
  persistAutoBackupEnabled: (...a: unknown[]) => mockPersist(...a),
}));
jest.mock('../src/lib/backupBundle', () => ({ buildBackupZip: jest.fn(async () => new Uint8Array([1])) }));
jest.mock('../src/state/store', () => ({ useAppData: () => ({}) }));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({ ink2: '#555', surface2: '#eee', ink: '#000', surface: '#fff', line2: '#ccc' }),
}));
jest.mock('../src/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k, isZh: false }) }));
jest.mock('../src/lib/haptics', () => ({ tap: jest.fn(), payoff: jest.fn(), warn: jest.fn() }));
jest.mock('../src/components/Pip', () => ({ Pip: () => null }));
jest.mock('../src/components/Icon', () => ({ Icon: () => null }));
jest.mock('../src/components/Motion', () => ({
  FadeIn: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/components/RestoreBackupModal', () => ({
  RestoreBackupModal: ({ visible }: { visible: boolean }) => {
    const { Text } = require('react-native');
    return visible ? <Text>restore-modal-open</Text> : null;
  },
}));

import { EmptyBackupRefusedError } from '../src/lib/cloudBackup/emptyLedgerGuard';
import { BackupStep } from '../src/screens/onboarding/BackupStep';

const textOf = (node: any): string => JSON.stringify(node.toJSON());

// Plain text under a test-renderer instance, for finding the button that says a given thing.
const contentOf = (inst: any): string =>
  (inst.children ?? [])
    .map((c: any) => (typeof c === 'string' ? c : contentOf(c)))
    .join('');

describe('BackupStep when Drive already has a backup', () => {
  beforeEach(() => {
    mockPersist.mockClear();
    mockEnable.mockReset();
  });

  it('offers to restore instead of reporting a failure, and leaves auto-backup alone', async () => {
    mockEnable.mockRejectedValue(new EmptyBackupRefusedError());
    let tree: any;
    await act(async () => {
      tree = create(<BackupStep onNext={jest.fn()} onSkip={jest.fn()} />);
    });

    const enableBtn = tree.root.findAll((n: any) => typeof n.props.onPress === 'function' && n.props.disabled === false)[0];
    await act(async () => {
      await enableBtn.props.onPress();
    });

    const out = textOf(tree);
    expect(out).toContain('wizardBackupExistingNotice');
    expect(out).toContain('wizardBackupRestoreExistingBtn');
    expect(out).not.toContain('wizardBackupFailedNotice');
    // The old behaviour switched auto-backup off here, which left a restored user unprotected.
    expect(mockPersist).not.toHaveBeenCalled();

    const restoreBtn = tree.root
      .findAll((n: any) => typeof n.props.onPress === 'function')
      .find((n: any) => contentOf(n).includes('wizardBackupRestoreExistingBtn'));
    expect(restoreBtn).toBeDefined();
    await act(async () => {
      restoreBtn.props.onPress();
    });
    expect(textOf(tree)).toContain('restore-modal-open');
  });

  it('still treats an ordinary failure as a failure and turns auto-backup off', async () => {
    mockEnable.mockRejectedValue(new Error('network'));
    let tree: any;
    await act(async () => {
      tree = create(<BackupStep onNext={jest.fn()} onSkip={jest.fn()} />);
    });
    const enableBtn = tree.root.findAll((n: any) => typeof n.props.onPress === 'function' && n.props.disabled === false)[0];
    await act(async () => {
      await enableBtn.props.onPress();
    });
    expect(textOf(tree)).toContain('wizardBackupFailedNotice');
    expect(mockPersist).toHaveBeenCalledWith(false);
  });
});
