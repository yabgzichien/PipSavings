import { en } from '../src/i18n/translations/en';
import { zh } from '../src/i18n/translations/zh';
import { RECAP_STORY_COPY_KEYS, RECAP_STORY_LINE_VARIANTS, recapStoryLineKey } from '../src/lib/recapStoryCopy';

const VIEWER_COPY_KEYS = [
  'recapStoryOpen',
  'recapStoryInviteTitle',
  'recapStoryInviteBody',
  'recapStoryDismiss',
  'recapStoryOf',
  'recapStoryPrevious',
  'recapStoryNext',
  'recapStoryPause',
  'recapStoryPlay',
  'recapStoryMute',
  'recapStoryUnmute',
  'recapStoryReplay',
  'recapStoryShareCard',
  'recapStoryChooseCards',
  'recapStorySaveSelected',
  'recapStoryDownload',
  'recapStoryRetry',
  'recapStorySavedCount',
  'recapStoryPermissionDenied',
  'recapStoryCaptureFailed',
  'recapStoryShareUnavailable',
  'recapStoryOpenInstagram',
  'recapStorySavedToPhotos',
  'recapStoryCloseCaptureTitle',
  'recapStoryCloseCaptureBody',
] as const;

/** Faces only: object emoji such as the crown and lock are part of the story's voice. */
const FACE_EMOJI = /[\u{1F600}-\u{1F64F}\u{1F910}-\u{1F92F}\u{1F970}-\u{1F97F}\u{1F9D0}\u{2639}\u{263A}]/u;
/** The story reacts to facts; it never tells anyone how to spend. */
const MORALIZING = /\bshould\b|cut back|overspen|too much|wasteful|应该|省着|浪费|乱花/i;

function tokens(value: string): string[] {
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

describe('monthly recap story copy', () => {
  const enCopy = en as unknown as Record<string, string>;
  const zhCopy = zh as unknown as Record<string, string>;

  test('keeps the monthly ritual sentence exact in English', () => {
    expect(en.recapStoryRitualTitle).toBe('Wake up—it’s the first of the month');
  });

  test.each([...VIEWER_COPY_KEYS, ...RECAP_STORY_COPY_KEYS])('%s is present in both locales', (key) => {
    expect(enCopy[key]?.trim()).toBeTruthy();
    expect(zhCopy[key]?.trim()).toBeTruthy();
  });

  test.each(RECAP_STORY_COPY_KEYS)('%s uses the same placeholders in both locales', (key) => {
    expect(tokens(zhCopy[key])).toEqual(tokens(enCopy[key]));
  });

  test('every scene line variant exists', () => {
    for (const [sceneId, count] of Object.entries(RECAP_STORY_LINE_VARIANTS)) {
      for (let variant = 0; variant < count; variant += 1) {
        expect(RECAP_STORY_COPY_KEYS).toContain(`recapStory_${sceneId}_line${variant}`);
      }
    }
  });

  test('picks a line key that exists for every month', () => {
    for (const month of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
      for (const sceneId of Object.keys(RECAP_STORY_LINE_VARIANTS) as (keyof typeof RECAP_STORY_LINE_VARIANTS)[]) {
        expect(RECAP_STORY_COPY_KEYS).toContain(recapStoryLineKey(month, sceneId));
      }
    }
  });

  test('has no face emoji and no spending advice in either locale', () => {
    for (const key of RECAP_STORY_COPY_KEYS) {
      for (const copy of [enCopy, zhCopy]) {
        expect(copy[key]).not.toMatch(FACE_EMOJI);
        expect(copy[key]).not.toMatch(MORALIZING);
      }
    }
  });

  test('retires the persona, badge, merchant-cameo and share-of-spending copy', () => {
    const retired = Object.keys(enCopy).filter((key) =>
      /^recapStory(Persona_|Badge_|Merchant|RecordedShare|Comparison|Days$|Weeks$|Spotlight_cafe|Spotlight_outlier)/.test(key));
    expect(retired).toEqual([]);
    expect(Object.keys(zhCopy).filter((key) => /^recapStory(Persona_|Badge_)/.test(key))).toEqual([]);
  });
});
