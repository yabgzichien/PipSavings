jest.mock('../src/db/metaRepo', () => ({
  getMeta: jest.fn(),
  setMeta: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/widget/syncWidgets', () => ({
  syncAllWidgets: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/sound', () => ({ setSoundEnabled: jest.fn() }));
jest.mock('../src/lib/backupRestore', () => ({ restoreFromBackupZip: jest.fn() }));

import { setMeta } from '../src/db/metaRepo';
import { syncAllWidgets } from '../src/widget/syncWidgets';
import { restoreFromBackupZip } from '../src/lib/backupRestore';
import { persistWidgetMascotConfig, restoreBackupAndRefresh } from '../src/state/store';
import {
  DEFAULT_WIDGET_MASCOT_CONFIG,
  WIDGET_MASCOT_CONFIG_KEY,
} from '../src/widget/mascot/config';

describe('persistWidgetMascotConfig', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the serialized config under the right key', async () => {
    const c = { ...DEFAULT_WIDGET_MASCOT_CONFIG, head: 'goggles' as const };
    await persistWidgetMascotConfig(c);
    expect(setMeta).toHaveBeenCalledWith(WIDGET_MASCOT_CONFIG_KEY, JSON.stringify(c));
  });

  it('pushes the change to placed widgets after persisting', async () => {
    await persistWidgetMascotConfig(DEFAULT_WIDGET_MASCOT_CONFIG);
    expect(syncAllWidgets).toHaveBeenCalled();
  });

  it('still resolves when the widget sync fails', async () => {
    (syncAllWidgets as jest.Mock).mockRejectedValueOnce(new Error('no widget placed'));
    await expect(
      persistWidgetMascotConfig(DEFAULT_WIDGET_MASCOT_CONFIG)
    ).resolves.toBeUndefined();
  });
});

describe('restoreBackupAndRefresh', () => {
  it('refreshes app state and then resyncs placed widgets after restore', async () => {
    jest.clearAllMocks();
    const refresh = jest.fn().mockResolvedValue(undefined);
    await restoreBackupAndRefresh(new Uint8Array([1]), refresh);

    expect(restoreFromBackupZip).toHaveBeenCalledWith(new Uint8Array([1]), false);
    expect(refresh).toHaveBeenCalled();
    expect(syncAllWidgets).toHaveBeenCalled();
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      (syncAllWidgets as jest.Mock).mock.invocationCallOrder[0]
    );
  });
});
