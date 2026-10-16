import type { RecapStoryScene } from './recapStory';

export const STORY_LOGICAL_WIDTH = 360;
export const STORY_LOGICAL_HEIGHT = 640;
export const STORY_EXPORT_WIDTH = 1080;
export const STORY_EXPORT_HEIGHT = 1920;

export type StorySceneType = RecapStoryScene['type'];

/**
 * Each monthly theme defines six palettes; scenes share them so consecutive cards alternate
 * light and dark. `ritual` and `light` are light grounds, `bold`, `deep`, `spotlight` and
 * `finale` are dark.
 */
export type StoryPaletteSlot = 'ritual' | 'bold' | 'deep' | 'spotlight' | 'light' | 'finale';

const SCENE_PALETTE_SLOTS: Record<StorySceneType, StoryPaletteSlot> = {
  ritual: 'ritual',
  topSpot: 'bold',
  foodPodium: 'light',
  shoppingRegular: 'deep',
  discoveries: 'ritual',
  rideOrDie: 'bold',
  ghosted: 'light',
  biggestDay: 'deep',
  spotlight: 'spotlight',
  versusLastMonth: 'light',
  finale: 'finale',
};

export function storyPaletteSlot(type: StorySceneType): StoryPaletteSlot {
  return SCENE_PALETTE_SLOTS[type];
}

export interface ScenePalette {
  background: string;
  foreground: string;
  accent: string;
}

export type StoryMotif =
  | 'fireworks'
  | 'lanterns'
  | 'leaves'
  | 'sakura'
  | 'sunburst'
  | 'dragonboat'
  | 'streamers'
  | 'confetti'
  | 'moon'
  | 'halloween'
  | 'maple'
  | 'snowflakes';

export type PipStoryAccessory =
  | 'partyHat'
  | 'cnyScarf'
  | 'leafSprout'
  | 'sakuraFlower'
  | 'sunhat'
  | 'zongziBand'
  | 'sunglasses'
  | 'partyHorn'
  | 'mooncake'
  | 'witchHat'
  | 'warmScarf'
  | 'santaHat';

export interface MonthlyStoryTheme {
  monthNumber: string; // '01'..'12'
  id: string;
  titleEn: string;
  titleZh: string;
  motif: StoryMotif;
  badgeIcon: string;
  palettes: Record<StoryPaletteSlot, ScenePalette>;
  pipAccessory: PipStoryAccessory;
}

export const MONTHLY_THEMES: Record<string, MonthlyStoryTheme> = {
  '01': {
    monthNumber: '01',
    id: 'newyear',
    titleEn: 'New Year Sparks',
    titleZh: '新年新篇章',
    motif: 'fireworks',
    badgeIcon: 'sparkles',
    pipAccessory: 'partyHat',
    palettes: {
      ritual: { background: '#FCE77D', foreground: '#0F172A', accent: '#1D4ED8' },
      bold: { background: '#0F172A', foreground: '#F8FAFC', accent: '#FDE047' },
      deep: { background: '#1E293B', foreground: '#F8FAFC', accent: '#60A5FA' },
      spotlight: { background: '#172554', foreground: '#F8FAFC', accent: '#FDE047' },
      light: { background: '#E2E8F0', foreground: '#0F172A', accent: '#2563EB' },
      finale: { background: '#090D16', foreground: '#FFFFFF', accent: '#FACC15' },
    },
  },
  '02': {
    monthNumber: '02',
    id: 'cny',
    titleEn: 'Chinese New Year',
    titleZh: '新春吉祥',
    motif: 'lanterns',
    badgeIcon: 'sparkles',
    pipAccessory: 'cnyScarf',
    palettes: {
      ritual: { background: '#FEE2E2', foreground: '#7F1D1D', accent: '#B91C1C' },
      bold: { background: '#7F1D1D', foreground: '#FEF2F2', accent: '#FDE047' },
      deep: { background: '#450A0A', foreground: '#FEF2F2', accent: '#FBBF24' },
      spotlight: { background: '#5B1111', foreground: '#FFF1F2', accent: '#FCD34D' },
      light: { background: '#FEF3C7', foreground: '#78350F', accent: '#B45309' },
      finale: { background: '#2B0606', foreground: '#FFFFFF', accent: '#F59E0B' },
    },
  },
  '03': {
    monthNumber: '03',
    id: 'spring',
    titleEn: 'Spring Awakening',
    titleZh: '春意盎然',
    motif: 'leaves',
    badgeIcon: 'sparkles',
    pipAccessory: 'leafSprout',
    palettes: {
      ritual: { background: '#DCFCE7', foreground: '#14532D', accent: '#15803D' },
      bold: { background: '#14532D', foreground: '#F0FDF4', accent: '#86EFAC' },
      deep: { background: '#052E16', foreground: '#F0FDF4', accent: '#4ADE80' },
      spotlight: { background: '#134E4A', foreground: '#F0FDFA', accent: '#5EEAD4' },
      light: { background: '#CCFBF1', foreground: '#134E4A', accent: '#0F766E' },
      finale: { background: '#022C22', foreground: '#FFFFFF', accent: '#34D399' },
    },
  },
  '04': {
    monthNumber: '04',
    id: 'sakura',
    titleEn: 'Pastel Sakura',
    titleZh: '樱花暖春',
    motif: 'sakura',
    badgeIcon: 'sparkles',
    pipAccessory: 'sakuraFlower',
    palettes: {
      ritual: { background: '#FCE7F3', foreground: '#831843', accent: '#DB2777' },
      bold: { background: '#831843', foreground: '#FDF2F8', accent: '#F472B6' },
      deep: { background: '#500724', foreground: '#FDF2F8', accent: '#F9A8D4' },
      spotlight: { background: '#4A044E', foreground: '#FAF5FF', accent: '#E879F9' },
      light: { background: '#F3E8FF', foreground: '#581C87', accent: '#7E22CE' },
      finale: { background: '#2E0226', foreground: '#FFFFFF', accent: '#F472B6' },
    },
  },
  '05': {
    monthNumber: '05',
    id: 'sunburst',
    titleEn: 'Golden Sun & Picnic',
    titleZh: '初夏阳光',
    motif: 'sunburst',
    badgeIcon: 'sparkles',
    pipAccessory: 'sunhat',
    palettes: {
      ritual: { background: '#FEF08A', foreground: '#713F12', accent: '#B45309' },
      bold: { background: '#713F12', foreground: '#FEFCE8', accent: '#FDE047' },
      deep: { background: '#422006', foreground: '#FEFCE8', accent: '#FBBF24' },
      spotlight: { background: '#1E3A5F', foreground: '#F0FDF4', accent: '#FACC15' },
      light: { background: '#E0F2FE', foreground: '#075985', accent: '#0284C7' },
      finale: { background: '#1C1917', foreground: '#FFFFFF', accent: '#FBBF24' },
    },
  },
  '06': {
    monthNumber: '06',
    id: 'dragonboat',
    titleEn: 'Dragon Boat Festival',
    titleZh: '端午竞渡',
    motif: 'dragonboat',
    badgeIcon: 'sparkles',
    pipAccessory: 'zongziBand',
    palettes: {
      ritual: { background: '#CCFBF1', foreground: '#115E59', accent: '#0D9488' },
      bold: { background: '#115E59', foreground: '#F0FDFA', accent: '#5EEAD4' },
      deep: { background: '#042F2E', foreground: '#F0FDFA', accent: '#2DD4BF' },
      spotlight: { background: '#164E63', foreground: '#ECFEFF', accent: '#67E8F9' },
      light: { background: '#E0F2FE', foreground: '#0369A1', accent: '#0284C7' },
      finale: { background: '#082F49', foreground: '#FFFFFF', accent: '#38BDF8' },
    },
  },
  '07': {
    monthNumber: '07',
    id: 'midsummer',
    titleEn: 'Midsummer Festival',
    titleZh: '盛夏庆典',
    motif: 'streamers',
    badgeIcon: 'sparkles',
    pipAccessory: 'sunglasses',
    palettes: {
      ritual: { background: '#FFEDD5', foreground: '#7C2D12', accent: '#EA580C' },
      bold: { background: '#7C2D12', foreground: '#FFF7ED', accent: '#FDBA74' },
      deep: { background: '#431407', foreground: '#FFF7ED', accent: '#FB923C' },
      spotlight: { background: '#3B0764', foreground: '#FAF5FF', accent: '#C084FC' },
      light: { background: '#F3E8FF', foreground: '#581C87', accent: '#9333EA' },
      finale: { background: '#1E1B4B', foreground: '#FFFFFF', accent: '#FB923C' },
    },
  },
  '08': {
    monthNumber: '08',
    id: 'latesummer',
    titleEn: 'Late Summer Bloom',
    titleZh: '盛夏韶华',
    motif: 'confetti',
    badgeIcon: 'sparkles',
    pipAccessory: 'partyHorn',
    palettes: {
      ritual: { background: '#F6D750', foreground: '#17352D', accent: '#C94F39' },
      bold: { background: '#173F35', foreground: '#FAF4E5', accent: '#F6D750' },
      deep: { background: '#EF704B', foreground: '#221F1D', accent: '#F9E07F' },
      spotlight: { background: '#261B3D', foreground: '#FAF4E5', accent: '#F6D750' },
      light: { background: '#D8EADF', foreground: '#17352D', accent: '#1F6F4A' },
      finale: { background: '#27242C', foreground: '#FFFFFF', accent: '#F6D750' },
    },
  },
  '09': {
    monthNumber: '09',
    id: 'midautumn',
    titleEn: 'Mid-Autumn Moon',
    titleZh: '金秋月圆',
    motif: 'moon',
    badgeIcon: 'sparkles',
    pipAccessory: 'mooncake',
    palettes: {
      ritual: { background: '#FEF3C7', foreground: '#78350F', accent: '#B45309' },
      bold: { background: '#78350F', foreground: '#FFFBEB', accent: '#FDE68A' },
      deep: { background: '#3B1F04', foreground: '#FFFBEB', accent: '#FCD34D' },
      spotlight: { background: '#181E34', foreground: '#FFFBEB', accent: '#FDE047' },
      light: { background: '#E2E8F0', foreground: '#1E293B', accent: '#475569' },
      finale: { background: '#0F172A', foreground: '#FFFFFF', accent: '#FBBF24' },
    },
  },
  '10': {
    monthNumber: '10',
    id: 'halloween',
    titleEn: 'Halloween Twilight',
    titleZh: '万圣奇妙夜',
    motif: 'halloween',
    badgeIcon: 'sparkles',
    pipAccessory: 'witchHat',
    palettes: {
      ritual: { background: '#FED7AA', foreground: '#7C2D12', accent: '#C2410C' },
      bold: { background: '#3B0764', foreground: '#FAF5FF', accent: '#FB923C' },
      deep: { background: '#1E1B4B', foreground: '#FAF5FF', accent: '#F97316' },
      spotlight: { background: '#451A03', foreground: '#FFF7ED', accent: '#A855F7' },
      light: { background: '#EDE9FE', foreground: '#4C1D95', accent: '#7C3AED' },
      finale: { background: '#18022E', foreground: '#FFFFFF', accent: '#FB923C' },
    },
  },
  '11': {
    monthNumber: '11',
    id: 'hearth',
    titleEn: 'Warm Hearth & Gratitude',
    titleZh: '感恩暖炉',
    motif: 'maple',
    badgeIcon: 'sparkles',
    pipAccessory: 'warmScarf',
    palettes: {
      ritual: { background: '#FED7AA', foreground: '#7C2D12', accent: '#B45309' },
      bold: { background: '#7C2D12', foreground: '#FFF7ED', accent: '#FDBA74' },
      deep: { background: '#451A03', foreground: '#FFF7ED', accent: '#FB923C' },
      spotlight: { background: '#291811', foreground: '#FFF7ED', accent: '#F59E0B' },
      light: { background: '#FEF3C7', foreground: '#78350F', accent: '#92400E' },
      finale: { background: '#1C0D08', foreground: '#FFFFFF', accent: '#F59E0B' },
    },
  },
  '12': {
    monthNumber: '12',
    id: 'winter',
    titleEn: 'Christmas & Winter Joy',
    titleZh: '圣诞温冬',
    motif: 'snowflakes',
    badgeIcon: 'sparkles',
    pipAccessory: 'santaHat',
    palettes: {
      ritual: { background: '#E0F2FE', foreground: '#0C4A6E', accent: '#DC2626' },
      bold: { background: '#064E3B', foreground: '#ECFDF5', accent: '#F87171' },
      deep: { background: '#7F1D1D', foreground: '#FEF2F2', accent: '#6EE7B7' },
      spotlight: { background: '#0F2B20', foreground: '#F0FDF4', accent: '#EF4444' },
      light: { background: '#E2E8F0', foreground: '#0F172A', accent: '#047857' },
      finale: { background: '#0A1A14', foreground: '#FFFFFF', accent: '#EF4444' },
    },
  },
};

export const STORY_PALETTES: Record<StoryPaletteSlot, ScenePalette> = MONTHLY_THEMES['08'].palettes;

export function resolveStoryMonthKey(month?: string): string {
  if (!month) return '08';
  if (month.length >= 7 && month[4] === '-') {
    const mm = month.slice(5, 7);
    if (MONTHLY_THEMES[mm]) return mm;
  }
  if (MONTHLY_THEMES[month]) return month;
  return '08';
}

export function getStoryThemeForMonth(month?: string): MonthlyStoryTheme {
  const key = resolveStoryMonthKey(month);
  return MONTHLY_THEMES[key] ?? MONTHLY_THEMES['08'];
}

