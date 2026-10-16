import {
  downloadOneStory,
  saveSelectedStories,
  shareOneStory,
} from '../src/lib/recapStoryExport';
import { Linking } from 'react-native';
import { recapStoryCaptureAdapter } from '../src/lib/recapStoryCapture';
import type {
  RecapStoryCaptureAdapter,
  RecapStorySceneId,
} from '../src/lib/recapStoryCapture.types';

class FakeCaptureAdapter implements RecapStoryCaptureAdapter<never> {
  readonly events: string[] = [];
  shareAvailable = true;
  permission: 'granted' | 'denied' = 'granted';
  failSaveUris = new Set<string>();
  failCleanupUris = new Set<string>();

  async capture(_ref: never): Promise<string> {
    throw new Error('The coordinator receives an injected renderAndCapture callback');
  }

  async canShare(): Promise<boolean> {
    this.events.push('canShare');
    return this.shareAvailable;
  }

  async share(uri: string): Promise<void> {
    this.events.push(`share:${uri}`);
  }

  async download(uri: string, filename: string): Promise<void> {
    this.events.push(`download:${uri}:${filename}`);
  }

  async requestSavePermission(): Promise<'granted' | 'denied'> {
    this.events.push('permission');
    return this.permission;
  }

  async save(uri: string): Promise<void> {
    this.events.push(`save:${uri}`);
    if (this.failSaveUris.has(uri)) throw new Error('save failed');
  }

  async cleanup(uri: string): Promise<void> {
    this.events.push(`cleanup:${uri}`);
    if (this.failCleanupUris.has(uri)) throw new Error('cleanup failed');
  }

  async openInstagram(): Promise<boolean> {
    this.events.push('instagram');
    return false;
  }
}

function renderer(adapter: FakeCaptureAdapter, failures: RecapStorySceneId[] = []) {
  return async (sceneId: RecapStorySceneId): Promise<string> => {
    adapter.events.push(`capture:${sceneId}`);
    if (failures.includes(sceneId)) throw new Error('capture failed');
    return `tmp://${sceneId}`;
  };
}

describe('monthly story export coordinator', () => {
  test('one-card share checks native availability before capturing', async () => {
    const adapter = new FakeCaptureAdapter();
    adapter.shareAvailable = false;

    await expect(shareOneStory(adapter, 'topSpot', renderer(adapter))).resolves.toBe(false);
    expect(adapter.events).toEqual(['canShare']);
  });

  test('one-card share captures, shares, and cleans its temporary file', async () => {
    const adapter = new FakeCaptureAdapter();

    await expect(shareOneStory(adapter, 'topSpot', renderer(adapter))).resolves.toBe(true);
    expect(adapter.events).toEqual([
      'canShare',
      'capture:topSpot',
      'share:tmp://topSpot',
      'cleanup:tmp://topSpot',
    ]);
  });

  test('one-card share cleans a captured file when the share sheet fails', async () => {
    const adapter = new FakeCaptureAdapter();
    adapter.share = async (uri) => {
      adapter.events.push(`share:${uri}`);
      throw new Error('share failed');
    };

    await expect(shareOneStory(adapter, 'topSpot', renderer(adapter))).rejects.toThrow('share failed');
    expect(adapter.events).toEqual([
      'canShare',
      'capture:topSpot',
      'share:tmp://topSpot',
      'cleanup:tmp://topSpot',
    ]);
  });

  test('web download bypasses native share availability and cleans the capture', async () => {
    const adapter = new FakeCaptureAdapter();
    adapter.shareAvailable = false;

    await downloadOneStory(adapter, 'finale', renderer(adapter));

    expect(adapter.events).toEqual([
      'capture:finale',
      'download:tmp://finale:pip-monthly-story.png',
      'cleanup:tmp://finale',
    ]);
  });

  test('permission denial is typed and prevents every batch capture', async () => {
    const adapter = new FakeCaptureAdapter();
    adapter.permission = 'denied';

    await expect(
      saveSelectedStories(adapter, ['topSpot', 'finale'], renderer(adapter)),
    ).resolves.toEqual({ status: 'permission-denied' });
    expect(adapter.events).toEqual(['permission']);
  });

  test('batch save captures and saves sequentially in narrative order after one permission request', async () => {
    const adapter = new FakeCaptureAdapter();

    await expect(
      saveSelectedStories(adapter, ['finale', 'topSpot', 'biggestDay'], renderer(adapter)),
    ).resolves.toEqual({ savedIds: ['topSpot', 'biggestDay', 'finale'], failedIds: [] });
    expect(adapter.events).toEqual([
      'permission',
      'capture:topSpot',
      'save:tmp://topSpot',
      'capture:biggestDay',
      'save:tmp://biggestDay',
      'capture:finale',
      'save:tmp://finale',
      'cleanup:tmp://topSpot',
      'cleanup:tmp://biggestDay',
      'cleanup:tmp://finale',
    ]);
  });

  test('batch save captures spotlight scene in correct narrative order between the ghosted place and the finale', async () => {
    const adapter = new FakeCaptureAdapter();

    await expect(
      saveSelectedStories(adapter, ['finale', 'spotlight', 'topSpot', 'ghosted'], renderer(adapter)),
    ).resolves.toEqual({ savedIds: ['topSpot', 'ghosted', 'spotlight', 'finale'], failedIds: [] });
    expect(adapter.events).toEqual([
      'permission',
      'capture:topSpot',
      'save:tmp://topSpot',
      'capture:ghosted',
      'save:tmp://ghosted',
      'capture:spotlight',
      'save:tmp://spotlight',
      'capture:finale',
      'save:tmp://finale',
      'cleanup:tmp://topSpot',
      'cleanup:tmp://ghosted',
      'cleanup:tmp://spotlight',
      'cleanup:tmp://finale',
    ]);
  });

  test('a partial save returns exact IDs and continues with later cards', async () => {
    const adapter = new FakeCaptureAdapter();
    adapter.failSaveUris.add('tmp://ghosted');

    await expect(
      saveSelectedStories(adapter, ['topSpot', 'ghosted', 'finale'], renderer(adapter)),
    ).resolves.toEqual({ savedIds: ['topSpot', 'finale'], failedIds: ['ghosted'] });
    expect(adapter.events).toContain('save:tmp://finale');
  });

  test('a capture failure is recorded while later selected cards still save', async () => {
    const adapter = new FakeCaptureAdapter();

    await expect(
      saveSelectedStories(
        adapter,
        ['topSpot', 'ghosted', 'biggestDay'],
        renderer(adapter, ['ghosted']),
      ),
    ).resolves.toEqual({ savedIds: ['topSpot', 'biggestDay'], failedIds: ['ghosted'] });
    expect(adapter.events).toEqual([
      'permission',
      'capture:topSpot',
      'save:tmp://topSpot',
      'capture:ghosted',
      'capture:biggestDay',
      'save:tmp://biggestDay',
      'cleanup:tmp://topSpot',
      'cleanup:tmp://biggestDay',
    ]);
  });

  test('retrying the returned failures captures only failed cards', async () => {
    const adapter = new FakeCaptureAdapter();
    adapter.failSaveUris.add('tmp://ghosted');
    const first = await saveSelectedStories(
      adapter,
      ['topSpot', 'ghosted', 'finale'],
      renderer(adapter),
    );
    if ('status' in first) throw new Error('permission unexpectedly denied');

    adapter.events.length = 0;
    adapter.failSaveUris.clear();
    await expect(
      saveSelectedStories(adapter, first.failedIds, renderer(adapter)),
    ).resolves.toEqual({ savedIds: ['ghosted'], failedIds: [] });
    expect(adapter.events).toEqual([
      'permission',
      'capture:ghosted',
      'save:tmp://ghosted',
      'cleanup:tmp://ghosted',
    ]);
  });

  test('cleanup attempts every created URI even when one cleanup fails', async () => {
    const adapter = new FakeCaptureAdapter();
    adapter.failSaveUris.add('tmp://biggestDay');
    adapter.failCleanupUris.add('tmp://topSpot');

    await expect(
      saveSelectedStories(adapter, ['topSpot', 'biggestDay', 'finale'], renderer(adapter)),
    ).resolves.toEqual({ savedIds: ['topSpot', 'finale'], failedIds: ['biggestDay'] });
    expect(adapter.events.slice(-3)).toEqual([
      'cleanup:tmp://topSpot',
      'cleanup:tmp://biggestDay',
      'cleanup:tmp://finale',
    ]);
  });
});

describe('native monthly story capture adapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Instagram absence returns false without trying to open it', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    await expect(recapStoryCaptureAdapter.openInstagram()).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  test('Instagram availability lookup failure returns false', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockRejectedValue(new Error('lookup failed'));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    await expect(recapStoryCaptureAdapter.openInstagram()).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  test('Instagram launch failure returns false', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('launch failed'));

    await expect(recapStoryCaptureAdapter.openInstagram()).resolves.toBe(false);
  });

  test('successful Instagram launch returns true', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    await expect(recapStoryCaptureAdapter.openInstagram()).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('instagram://app');
  });
});
