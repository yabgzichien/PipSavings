import { MONTHLY_THEMES, STORY_PALETTES, getStoryThemeForMonth, storyPaletteSlot } from '../src/lib/recapStoryTheme';
import type { RecapStoryScene } from '../src/lib/recapStory';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string): number {
  const brightest = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darkest = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (brightest + 0.05) / (darkest + 0.05);
}

describe('monthly recap story palettes', () => {
  test.each(Object.entries(STORY_PALETTES))('%s foreground supports meaningful small text', (_name, palette) => {
    expect(contrastRatio(palette.foreground, palette.background)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(['ritual', 'bold', 'spotlight', 'light', 'finale'] as const)(
    '%s accent supports its intentionally large meaningful label',
    (name) => {
      const palette = STORY_PALETTES[name];
      expect(contrastRatio(palette.accent, palette.background)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('all 12 monthly themes contrast compliance', () => {
  const themes = Object.values(MONTHLY_THEMES);

  test.each(themes)('theme $monthNumber ($titleEn) has readable foregrounds (>= 4.5:1) in all scenes', (theme) => {
    for (const [sceneType, palette] of Object.entries(theme.palettes)) {
      const ratio = contrastRatio(palette.foreground, palette.background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  const SCENES_WITH_ACCENT_LABELS = ['ritual', 'bold', 'spotlight', 'light', 'finale'] as const;

  test.each(themes)('theme $monthNumber ($titleEn) has accessible accents (>= 3.0:1) in labeled scenes', (theme) => {
    for (const sceneType of SCENES_WITH_ACCENT_LABELS) {
      const palette = theme.palettes[sceneType];
      const ratio = contrastRatio(palette.accent, palette.background);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    }
  });

  it('resolves December theme for 2026-12 and returns snowflakes motif', () => {
    const theme = getStoryThemeForMonth('2026-12');
    expect(theme.monthNumber).toBe('12');
    expect(theme.motif).toBe('snowflakes');
    expect(theme.pipAccessory).toBe('santaHat');
  });

  it('resolves February theme for 2026-02 and returns lanterns motif', () => {
    const theme = getStoryThemeForMonth('2026-02');
    expect(theme.monthNumber).toBe('02');
    expect(theme.motif).toBe('lanterns');
    expect(theme.pipAccessory).toBe('cnyScarf');
  });

  it('falls back safely to August theme when month is unspecified', () => {
    const theme = getStoryThemeForMonth();
    expect(theme.monthNumber).toBe('08');
    expect(theme.motif).toBe('confetti');
  });
});

describe('story scene palettes', () => {
  const sceneTypes: RecapStoryScene['type'][] = [
    'ritual', 'topSpot', 'foodPodium', 'shoppingRegular', 'discoveries', 'rideOrDie', 'ghosted', 'biggestDay',
    'spotlight', 'versusLastMonth', 'finale',
  ];

  it('gives every scene a palette slot every monthly theme defines', () => {
    for (const theme of Object.values(MONTHLY_THEMES)) {
      for (const type of sceneTypes) expect(theme.palettes[storyPaletteSlot(type)]).toBeDefined();
    }
  });

  it('alternates light and dark through the main run of scenes', () => {
    const order = sceneTypes.filter((type) => type !== 'spotlight');
    for (let index = 1; index < order.length; index += 1) {
      expect(storyPaletteSlot(order[index])).not.toBe(storyPaletteSlot(order[index - 1]));
    }
  });
});
