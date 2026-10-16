import type {
  RecapStoryCaptureAdapter,
  RecapStorySceneId,
  RenderAndCaptureStory,
  SaveSelectedStoriesResult,
} from './recapStoryCapture.types';
import { RECAP_STORY_SCENE_ORDER } from './recapStory';

export const RECAP_STORY_DOWNLOAD_FILENAME = 'pip-monthly-story.png';

function inNarrativeOrder(sceneIds: readonly RecapStorySceneId[]): RecapStorySceneId[] {
  const selected = new Set(sceneIds);
  return RECAP_STORY_SCENE_ORDER.filter((sceneId) => selected.has(sceneId));
}

async function cleanupAll<Ref>(
  adapter: RecapStoryCaptureAdapter<Ref>,
  uris: readonly string[],
): Promise<void> {
  for (const uri of uris) {
    try {
      await adapter.cleanup(uri);
    } catch {
      // Cleanup is best-effort, but one failure must never strand the remaining files.
    }
  }
}

export async function shareOneStory<Ref>(
  adapter: RecapStoryCaptureAdapter<Ref>,
  sceneId: RecapStorySceneId,
  renderAndCapture: RenderAndCaptureStory,
): Promise<boolean> {
  if (!(await adapter.canShare())) return false;

  const createdUris: string[] = [];
  try {
    const uri = await renderAndCapture(sceneId);
    createdUris.push(uri);
    await adapter.share(uri);
    return true;
  } finally {
    await cleanupAll(adapter, createdUris);
  }
}

export async function downloadOneStory<Ref>(
  adapter: RecapStoryCaptureAdapter<Ref>,
  sceneId: RecapStorySceneId,
  renderAndCapture: RenderAndCaptureStory,
  filename = RECAP_STORY_DOWNLOAD_FILENAME,
): Promise<void> {
  const createdUris: string[] = [];
  try {
    const uri = await renderAndCapture(sceneId);
    createdUris.push(uri);
    await adapter.download(uri, filename);
  } finally {
    await cleanupAll(adapter, createdUris);
  }
}

export async function saveSelectedStories<Ref>(
  adapter: RecapStoryCaptureAdapter<Ref>,
  selectedSceneIds: readonly RecapStorySceneId[],
  renderAndCapture: RenderAndCaptureStory,
): Promise<SaveSelectedStoriesResult> {
  if ((await adapter.requestSavePermission()) === 'denied') {
    return { status: 'permission-denied' };
  }

  const createdUris: string[] = [];
  const savedIds: RecapStorySceneId[] = [];
  const failedIds: RecapStorySceneId[] = [];

  try {
    for (const sceneId of inNarrativeOrder(selectedSceneIds)) {
      try {
        const uri = await renderAndCapture(sceneId);
        createdUris.push(uri);
        await adapter.save(uri);
        savedIds.push(sceneId);
      } catch {
        failedIds.push(sceneId);
      }
    }
    return { savedIds, failedIds };
  } finally {
    await cleanupAll(adapter, createdUris);
  }
}
