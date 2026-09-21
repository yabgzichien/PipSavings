import React from 'react';
import { Platform, Text } from 'react-native';
import { BackupScreen } from '../src/screens/BackupScreen';

const Renderer = require('react-test-renderer');

const mockBackupToDrive = jest.fn(async () => 'ok');
const mockConnect = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    accounts: [],
    categories: [],
    txns: [],
    restoreFromBackup: jest.fn(),
  }),
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({ accent: '#18794e', accentInk: '#126043', accentTint: '#e4f6ec', accentSoft: '#b6e4c8' }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#eef1ee',
    surface: '#ffffff',
    surface2: '#f6f8f6',
    ink: '#16201b',
    ink2: '#5d6b63',
    ink3: '#6a776f',
    line: 'rgba(20,40,30,0.08)',
    line2: 'rgba(20,40,30,0.05)',
    red: '#c0392b',
  }),
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({ isZh: false, language: 'en', t: (key: string) => key }),
}));

jest.mock('../src/db/metaRepo', () => ({
  getMeta: jest.fn(async () => null),
  setMeta: jest.fn(async () => {}),
}));

jest.mock('../src/lib/backupBundle', () => ({
  buildBackupZip: jest.fn(async () => new Uint8Array([1])),
}));

jest.mock('../src/lib/cloudBackup/useCloudBackup', () => ({
  useCloudBackup: () => ({
    isConfigured: true,
    status: 'disconnected',
    accountEmail: null,
    lastBackupAt: null,
    error: null,
    connect: mockConnect,
    disconnect: jest.fn(),
    backupNow: jest.fn(),
    backupToDrive: mockBackupToDrive,
    restoreLatest: jest.fn(),
  }),
}));

function allText(root: any): string {
  return root
    .findAllByType(Text)
    .map((node: any) => node.props.children)
    .flat()
    .filter(Boolean)
    .join(' ');
}

function pressWithText(root: any, label: string) {
  const button = root.findAll(
    (node: any) =>
      typeof node.props?.onPress === 'function' &&
      node.findAll((child: any) => child.props?.children === label).length > 0
  )[0];
  if (!button) throw new Error(`No pressable found for ${label}`);
  return button.props.onPress();
}

describe('BackupScreen Google Drive', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatform;
    mockBackupToDrive.mockClear();
    mockConnect.mockClear();
  });

  it('backs up after picking a Google account, without a separate connect step', async () => {
    Platform.OS = 'android';
    let tree: any;
    await Renderer.act(async () => {
      tree = Renderer.create(<BackupScreen onBack={jest.fn()} />);
      await Promise.resolve();
    });

    expect(allText(tree.root)).toContain('Back up to Google Drive');
    expect(allText(tree.root)).toContain('Restore from Google Drive');
    expect(allText(tree.root)).not.toContain('Connect Google account');

    await Renderer.act(async () => {
      await pressWithText(tree.root, 'Back up to Google Drive');
    });

    expect(mockBackupToDrive).toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
