import React, { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, SvgXml } from 'react-native-svg';
import { useLanguage } from '../../i18n';
import { currencyPrefix, fmtMoney } from '../../lib/format';
import { prevMonthKey } from '../../lib/recap';
import type { RecapStoryContentSceneId, RecapStoryScene } from '../../lib/recapStory';
import { recapStoryLineKey } from '../../lib/recapStoryCopy';
import {
  STORY_LOGICAL_HEIGHT,
  STORY_LOGICAL_WIDTH,
  getStoryThemeForMonth,
  storyPaletteSlot,
  type PipStoryAccessory,
  type StoryMotif,
} from '../../lib/recapStoryTheme';
import { composeMascot } from '../../widget/mascot/compose';
import type { WidgetMascotConfig } from '../../widget/mascot/config';
import { Icon, type IconName } from '../Icon';
import { Body, Display, Label, Title } from '../ui';
import { DancingCow } from './DancingCow';

export interface RecapStoryFrameProps {
  scene: RecapStoryScene;
  mode: 'animated' | 'export';
  motion: 'full' | 'reduced' | 'off';
  progress?: Animated.Value;
  mascotConfig: WidgetMascotConfig;
  monthLabel: string;
  categoryLabel: (categoryId: string) => string;
  accessibilityPositionLabel?: string;
  month?: string;
  /** Display currency the scene's amounts are already converted to. */
  currency?: string;
  /** Share-time privacy: every amount renders as "RM ••••", in pixels and in the label. */
  hideAmounts?: boolean;
}

const CATEGORY_ICONS: Record<string, IconName> = {
  food: 'utensils', shopping: 'bag', entertainment: 'sparkles', travelling: 'pin',
  learning: 'book', family: 'gift', medical: 'heart', utilities: 'home',
  subscriptions: 'play', rental: 'home', phoneBill: 'phone', insurance: 'shield',
};

function StoryMotifSvg({ motif, stroke, fill }: { motif: StoryMotif; stroke: string; fill: string }) {
  switch (motif) {
    case 'snowflakes':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Path d="M 290 50 L 290 130 M 250 90 L 330 90 M 262 62 L 318 118 M 262 118 L 318 62" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
          <Circle cx={290} cy={90} r={4} fill={fill} />
          <Path d="M 60 480 L 60 540 M 30 510 L 90 510 M 39 489 L 81 531 M 39 531 L 81 489" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={60} cy={510} r={3} fill={fill} />
          <Circle cx={320} cy={220} r={5} fill={fill} />
          <Circle cx={40} cy={320} r={4} fill={fill} />
          <Circle cx={300} cy={440} r={6} fill={fill} />
        </Svg>
      );
    case 'lanterns':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Path d="M 290 0 L 290 40" stroke={stroke} strokeWidth={2} />
          <Rect x={268} y={40} width={44} height={52} rx={14} stroke={stroke} strokeWidth={2.5} fill="none" />
          <Path d="M 276 40 L 276 92 M 304 40 L 304 92" stroke={stroke} strokeWidth={1.5} />
          <Path d="M 290 92 L 290 120" stroke={stroke} strokeWidth={2} />
          <Path d="M 332 0 L 332 64" stroke={stroke} strokeWidth={2} />
          <Rect x={316} y={64} width={32} height={38} rx={10} stroke={stroke} strokeWidth={2} fill="none" />
          <Path d="M 332 102 L 332 122" stroke={stroke} strokeWidth={1.5} />
          <Circle cx={60} cy={520} r={18} stroke={stroke} strokeWidth={2} fill="none" />
          <Rect x={54} y={514} width={12} height={12} stroke={stroke} strokeWidth={1.5} fill="none" />
        </Svg>
      );
    case 'leaves':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.2}>
          <Path d="M 280 40 C 320 60 330 110 300 140 C 270 170 230 150 240 100 C 250 50 280 40 280 40 Z" stroke={stroke} strokeWidth={2} fill="none" />
          <Path d="M 280 40 Q 275 100 270 140" stroke={stroke} strokeWidth={1.5} fill="none" />
          <Path d="M 40 480 C 80 460 110 490 100 530 C 90 570 40 570 30 530 C 20 490 40 480 40 480 Z" stroke={stroke} strokeWidth={2} fill="none" />
        </Svg>
      );
    case 'sakura':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Circle cx={290} cy={80} r={10} fill={fill} />
          <Circle cx={306} cy={92} r={10} fill={fill} />
          <Circle cx={299} cy={110} r={10} fill={fill} />
          <Circle cx={281} cy={110} r={10} fill={fill} />
          <Circle cx={274} cy={92} r={10} fill={fill} />
          <Circle cx={290} cy={97} r={4} fill={stroke} />
          <Path d="M 60 480 C 70 470 85 475 80 490 C 75 505 60 500 60 480 Z" fill={fill} />
          <Path d="M 320 320 C 330 310 345 315 340 330 C 335 345 320 340 320 320 Z" fill={fill} />
        </Svg>
      );
    case 'sunburst':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Circle cx={310} cy={60} r={28} stroke={stroke} strokeWidth={3} fill="none" />
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i * Math.PI) / 4;
            const x1 = 310 + 36 * Math.cos(angle);
            const y1 = 60 + 36 * Math.sin(angle);
            const x2 = 310 + 48 * Math.cos(angle);
            const y2 = 60 + 48 * Math.sin(angle);
            return <Path key={i} d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />;
          })}
        </Svg>
      );
    case 'dragonboat':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Path d="M 0 540 Q 90 510 180 540 T 360 540" stroke={stroke} strokeWidth={3} fill="none" />
          <Path d="M 0 564 Q 90 534 180 564 T 360 564" stroke={stroke} strokeWidth={2} fill="none" />
          <Path d="M 260 80 Q 300 60 330 100" stroke={stroke} strokeWidth={3} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case 'streamers':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Path d="M 240 20 Q 300 60 270 120 T 320 180" stroke={stroke} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Circle cx={60} cy={500} r={8} fill={fill} />
          <Circle cx={310} cy={300} r={12} fill={fill} />
          <Circle cx={40} cy={220} r={6} fill={stroke} />
        </Svg>
      );
    case 'confetti':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Rect x={280} y={60} width={14} height={14} transform="rotate(25 287 67)" fill={fill} />
          <Rect x={320} y={110} width={12} height={12} transform="rotate(45 326 116)" fill={stroke} />
          <Circle cx={260} cy={130} r={6} fill={fill} />
          <Rect x={40} y={490} width={16} height={16} transform="rotate(15 48 498)" fill={fill} />
          <Circle cx={80} cy={530} r={7} fill={stroke} />
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.24}>
          <Circle cx={300} cy={80} r={34} fill={fill} />
          <Path d="M 250 95 Q 290 85 330 100 Q 350 105 360 100" stroke={stroke} strokeWidth={2} fill="none" opacity={0.6} />
        </Svg>
      );
    case 'halloween':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Path d="M 280 80 Q 295 65 310 80 Q 320 60 330 75 Q 315 95 280 80 Z" fill={fill} />
          <Path d="M 50 490 Q 65 475 80 490 Q 90 470 100 485 Q 85 505 50 490 Z" fill={fill} />
          <Circle cx={320} cy={140} r={4} fill={stroke} />
          <Circle cx={40} cy={300} r={5} fill={stroke} />
        </Svg>
      );
    case 'maple':
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Path d="M 300 60 L 306 75 L 324 75 L 310 85 L 316 102 L 300 92 L 284 102 L 290 85 L 276 75 L 294 75 Z" fill={fill} />
          <Path d="M 60 500 L 65 512 L 78 512 L 67 520 L 71 532 L 60 524 L 49 532 L 53 520 L 42 512 L 55 512 Z" fill={fill} />
        </Svg>
      );
    case 'fireworks':
    default:
      return (
        <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false} opacity={0.22}>
          <Path d="M 300 50 L 300 110 M 270 80 L 330 80 M 278 58 L 322 102 M 278 102 L 322 58" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={300} cy={80} r={3} fill={fill} />
          <Circle cx={50} cy={500} r={4} fill={fill} />
          <Circle cx={70} cy={480} r={3} fill={stroke} />
        </Svg>
      );
  }
}

function PipFestiveAccessory({ accessory, ink, accent }: { accessory: PipStoryAccessory; ink: string; accent: string }) {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Svg width={248} height={208} viewBox="0 0 248 208" accessible={false}>
        {accessory === 'santaHat' && (
          <G transform="translate(112, 10) rotate(12)">
            <Path d="M 0 32 Q 10 8 32 0 Q 38 18 28 32 Z" fill="#DC2626" stroke="#991B1B" strokeWidth={1.5} />
            <Rect x={-4} y={30} width={36} height={10} rx={5} fill="#FFFFFF" stroke="#E2E8F0" strokeWidth={1} />
            <Circle cx={34} cy={0} r={6} fill="#FFFFFF" stroke="#E2E8F0" strokeWidth={1} />
          </G>
        )}
        {accessory === 'partyHat' && (
          <G transform="translate(118, 14) rotate(-8)">
            <Path d="M 12 0 L 26 36 L -2 36 Z" fill={accent} stroke={ink} strokeWidth={1.5} />
            <Circle cx={12} cy={0} r={4} fill={ink} />
            <Circle cx={8} cy={24} r={2} fill={ink} />
            <Circle cx={16} cy={16} r={2} fill={ink} />
          </G>
        )}
        {accessory === 'cnyScarf' && (
          <G transform="translate(92, 92)">
            <Path d="M 4 8 Q 32 20 60 8 Q 45 28 8 20 Z" fill="#DC2626" stroke="#B91C1C" strokeWidth={1.5} />
            <Path d="M 16 16 L 24 38 L 12 38 Z" fill="#DC2626" stroke="#B91C1C" strokeWidth={1.5} />
            <Line x1={12} y1={38} x2={24} y2={38} stroke="#FDE047" strokeWidth={2} />
          </G>
        )}
        {accessory === 'leafSprout' && (
          <G transform="translate(120, 16)">
            <Path d="M 4 20 Q 4 4 0 0 C 0 -4 10 -4 8 2 Q 6 10 4 20" stroke="#16A34A" strokeWidth={2} fill="none" />
            <Path d="M 0 0 C -6 -6 -2 -14 6 -8 C 6 -2 2 -2 0 0 Z" fill="#22C55E" stroke="#16A34A" strokeWidth={1} />
          </G>
        )}
        {accessory === 'sakuraFlower' && (
          <G transform="translate(96, 32)">
            <Circle cx={6} cy={0} r={5} fill="#F472B6" />
            <Circle cx={12} cy={6} r={5} fill="#F472B6" />
            <Circle cx={8} cy={14} r={5} fill="#F472B6" />
            <Circle cx={0} cy={12} r={5} fill="#F472B6" />
            <Circle cx={-2} cy={4} r={5} fill="#F472B6" />
            <Circle cx={5} cy={6} r={3} fill="#FDE047" />
          </G>
        )}
        {accessory === 'sunhat' && (
          <G transform="translate(94, 24)">
            <Path d="M 12 16 C 12 4 48 4 48 16 Z" fill="#FDE047" stroke="#CA8A04" strokeWidth={1.5} />
            <Ellipse cx={30} cy={18} rx={32} ry={6} fill="#FEF08A" stroke="#CA8A04" strokeWidth={1.5} />
            <Path d="M 12 16 Q 30 18 48 16" stroke="#EA580C" strokeWidth={2} fill="none" />
          </G>
        )}
        {accessory === 'zongziBand' && (
          <G transform="translate(112, 18)">
            <Path d="M 0 16 L 14 0 L 24 16 Z" fill="#0D9488" stroke="#115E59" strokeWidth={1.5} />
            <Line x1={4} y1={10} x2={20} y2={10} stroke="#FDE047" strokeWidth={1.5} />
          </G>
        )}
        {accessory === 'sunglasses' && (
          <G transform="translate(100, 52)">
            <Rect x={0} y={0} width={22} height={14} rx={4} fill={ink} />
            <Rect x={26} y={0} width={22} height={14} rx={4} fill={ink} />
            <Line x1={22} y1={4} x2={26} y2={4} stroke={ink} strokeWidth={2} />
          </G>
        )}
        {accessory === 'partyHorn' && (
          <G transform="translate(132, 78) rotate(-15)">
            <Path d="M 0 4 L 28 0 L 28 8 Z" fill={accent} stroke={ink} strokeWidth={1.5} />
            <Circle cx={30} cy={4} r={3} fill={ink} />
          </G>
        )}
        {accessory === 'mooncake' && (
          <G transform="translate(100, 100)">
            <Circle cx={14} cy={14} r={12} fill="#D97706" stroke="#92400E" strokeWidth={1.5} />
            <Circle cx={14} cy={14} r={8} stroke="#FEF3C7" strokeWidth={1} fill="none" strokeDasharray="3,2" />
          </G>
        )}
        {accessory === 'witchHat' && (
          <G transform="translate(110, 10) rotate(-12)">
            <Path d="M 14 0 L 28 34 L 0 34 Z" fill="#581C87" stroke="#3B0764" strokeWidth={1.5} />
            <Ellipse cx={14} cy={34} rx={22} ry={5} fill="#3B0764" />
            <Rect x={3} y={28} width={22} height={4} fill="#FB923C" />
          </G>
        )}
        {accessory === 'warmScarf' && (
          <G transform="translate(94, 92)">
            <Path d="M 2 8 Q 32 20 62 8 Q 46 26 8 20 Z" fill="#EA580C" stroke="#9A3412" strokeWidth={1.5} />
            <Path d="M 14 16 L 22 36 L 10 36 Z" fill="#EA580C" stroke="#9A3412" strokeWidth={1.5} />
            <Line x1={10} y1={36} x2={22} y2={36} stroke="#FED7AA" strokeWidth={2} />
          </G>
        )}
      </Svg>
    </View>
  );
}

const LOCKED_COPY: Record<RecapStoryContentSceneId, [title: string, hint: string] | undefined> = {
  topSpot: ['recapStory_locked_topSpot', 'recapStory_locked_topSpotHint'],
  foodPodium: ['recapStory_locked_foodPodium', 'recapStory_locked_foodPodiumHint'],
  biggestDay: ['recapStory_locked_biggestDay', 'recapStory_locked_biggestDayHint'],
  discoveries: ['recapStory_locked_discoveries', 'recapStory_locked_discoveriesHint'],
  shoppingRegular: undefined, rideOrDie: undefined, ghosted: undefined, spotlight: undefined, versusLastMonth: undefined,
};

/** Podium columns read left to right as 2nd, 1st, 3rd; each rises in that order of reveal. */
const PODIUM_COLUMNS = [
  { rank: 1, height: 88, reveal: [0.25, 0.35] },
  { rank: 0, height: 132, reveal: [0.4, 0.5] },
  { rank: 2, height: 60, reveal: [0.1, 0.2] },
] as const;

interface PlaceCopy {
  kicker: string;
  headline: string;
  stat?: string;
  detail?: string;
  line?: string;
  /** A second beat that lands after the headline in full motion. */
  beat?: string;
  icon?: IconName;
  /** A full sentence as the headline: set smaller so it never truncates. */
  sentence?: boolean;
}

/** Capture and playback share this exact tree; only caller-owned motion changes its pose. */
export function RecapStoryFrame({ scene, mode, motion, progress, mascotConfig, monthLabel,
  categoryLabel, accessibilityPositionLabel, month, currency = 'MYR', hideAmounts = false }: RecapStoryFrameProps) {
  const { t, formatMonthLabel, formatLongDate } = useLanguage();
  const theme = getStoryThemeForMonth(month);
  const palette = theme.palettes[storyPaletteSlot(scene.type)];
  const ink = palette.foreground;
  const animate = mode === 'animated' && motion === 'full' ? progress : undefined;
  const pose = animate ? {
    opacity: animate.interpolate({ inputRange: [0, 0.16, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [{ translateY: animate.interpolate({ inputRange: [0, 0.2, 1], outputRange: [24, 0, 0], extrapolate: 'clamp' }) }],
  } : { opacity: 1, transform: [{ translateY: 0 }] };
  const ornamentPose = animate ? {
    transform: [{ rotate: animate.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'], extrapolate: 'clamp' }) }],
  } : { transform: [{ rotate: '0deg' }] };
  const reveal = (from: number, to: number) => animate
    ? { opacity: animate.interpolate({ inputRange: [0, from, to, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' }) }
    : { opacity: 1 };
  const mascotXml = useMemo(() => composeMascot({ ...mascotConfig, badgeIcon: 'none' }, 0), [mascotConfig]);

  const money = (value: number) => hideAmounts ? `${currencyPrefix(currency)} ••••` : fmtMoney(Math.abs(value), currency);
  const signedMoney = (value: number) => `${value < 0 ? '−' : value > 0 ? '+' : ''}${money(value)}`;
  const visitsText = (visits: number) => visits === 1 ? t('recapStory_visitsOne') : t('recapStory_visitsMany', { visits });
  const dayLabel = (day: string) => formatLongDate(new Date(`${day}T12:00:00`));
  const previousMonthLabel = month ? formatMonthLabel(prevMonthKey(month)) : '';
  const lineFor = (id: Parameters<typeof recapStoryLineKey>[1]) => t(recapStoryLineKey(month ?? '', id));

  let place: PlaceCopy | null = null;
  switch (scene.type) {
    case 'topSpot':
      place = {
        kicker: t('recapStory_topSpot_kicker'), headline: scene.name, stat: visitsText(scene.visits),
        detail: scene.everyDays <= 1 ? t('recapStory_topSpot_everyDay') : t('recapStory_topSpot_everyDays', { every: scene.everyDays }),
        line: lineFor('topSpot'), beat: t('recapStory_topSpot_total', { amount: money(scene.total) }),
        icon: CATEGORY_ICONS[scene.categoryId] ?? 'store',
      };
      break;
    case 'shoppingRegular':
      place = {
        kicker: t('recapStory_shoppingRegular_kicker'), headline: scene.name,
        stat: t('recapStory_shoppingRegular_trips', { visits: scene.visits }), line: lineFor('shoppingRegular'), icon: 'bag',
      };
      break;
    case 'discoveries':
      place = {
        kicker: t('recapStory_discoveries_kicker'),
        headline: scene.count === 1 ? t('recapStory_discoveries_countOne') : t('recapStory_discoveries_countMany', { count: scene.count }),
        stat: t('recapStory_discoveries_best', { name: scene.bestFind.name }),
        detail: scene.bestFind.visits > 1
          ? t('recapStory_discoveries_returned', { visits: scene.bestFind.visits })
          : t('recapStory_discoveries_once'),
        line: lineFor('discoveries'), icon: 'search',
      };
      break;
    case 'rideOrDie':
      place = {
        kicker: t('recapStory_rideOrDie_kicker'), headline: scene.name,
        stat: t('recapStory_rideOrDie_months', { months: scene.months }), line: lineFor('rideOrDie'), icon: 'heart',
      };
      break;
    case 'ghosted':
      place = {
        kicker: t('recapStory_ghosted_kicker'), headline: scene.name, stat: `${scene.previousVisits} → 0`,
        detail: t('recapStory_ghosted_detail', { visits: scene.previousVisits, previousMonth: previousMonthLabel }),
        line: lineFor('ghosted'), icon: 'eyeOff',
      };
      break;
    case 'biggestDay':
      place = {
        kicker: t('recapStory_biggestDay_kicker'), headline: dayLabel(scene.day),
        stat: scene.stops === 1
          ? t('recapStory_biggestDay_oneStop', { amount: money(scene.total) })
          : t('recapStory_biggestDay_stops', { amount: money(scene.total), stops: scene.stops }),
        line: lineFor('biggestDay'), icon: 'calendar',
      };
      break;
    case 'versusLastMonth': {
      const moved = scene.movedCategory;
      place = {
        kicker: t('recapStory_versusLastMonth_kicker'),
        headline: scene.change < 0
          ? t('recapStory_versusLastMonth_less', { amount: money(scene.change), previousMonth: previousMonthLabel })
          : scene.change > 0
            ? t('recapStory_versusLastMonth_more', { amount: money(scene.change), previousMonth: previousMonthLabel })
            : t('recapStory_versusLastMonth_same', { previousMonth: previousMonthLabel }),
        detail: moved ? t(moved.change > 0 ? 'recapStory_versusLastMonth_movedUp' : 'recapStory_versusLastMonth_movedDown',
          { category: categoryLabel(moved.categoryId), amount: money(moved.change) }) : undefined,
        line: t('recapStory_versusLastMonth_totals', { total: money(scene.total), previous: money(scene.previousTotal) }),
        icon: 'trending', sentence: true,
      };
      break;
    }
    default:
      break;
  }

  let spotlightTitle = '';
  let spotlightBody = '';
  let spotlightSubtitle = '';
  let spotlightTags: string[] = [];
  if (scene.type === 'spotlight') {
    const hl = scene.highlight;
    switch (hl.kind) {
      case 'tripAdventure': {
        const places = (hl.places ?? []).filter((name) => name.trim().length > 0).slice(0, 3);
        const [first = '', second = '', third = ''] = places;
        const named = places.length <= 1
          ? t('recapStorySpotlight_trips_one', { place: first })
          : places.length === 2
            ? t('recapStorySpotlight_trips_two', { first, second })
            : t('recapStorySpotlight_trips_three', { first, second, third });
        spotlightTitle = t('recapStorySpotlight_vehicle_title');
        spotlightBody = (hl.moreCount ?? 0) > 0
          ? t('recapStorySpotlight_trips_more', { places: named, count: hl.moreCount ?? 0 })
          : named;
        spotlightTags = places;
        break;
      }
      case 'techUpgrade':
        spotlightTitle = t('recapStorySpotlight_tech_title');
        spotlightBody = t('recapStorySpotlight_tech_body', { item: hl.itemLabel || 'gear' });
        spotlightSubtitle = hl.itemLabel || '';
        break;
      case 'vehicleMilestone':
        spotlightTitle = t('recapStorySpotlight_vehicle_title');
        spotlightBody = t('recapStorySpotlight_vehicle_body');
        spotlightSubtitle = hl.itemLabel || '';
        break;
      case 'homeMilestone':
        spotlightTitle = t('recapStorySpotlight_home_title');
        spotlightBody = t('recapStorySpotlight_home_body');
        spotlightSubtitle = hl.itemLabel || '';
        break;
      case 'giftCelebration':
        spotlightTitle = t('recapStorySpotlight_gift_title');
        spotlightBody = t('recapStorySpotlight_gift_body');
        spotlightSubtitle = hl.occasion ? (hl.occasion === 'birthday' ? 'Birthday' : hl.occasion === 'wedding' ? 'Wedding' : 'Celebration') : '';
        break;
      case 'incomeBoost':
        spotlightTitle = t('recapStorySpotlight_income_title');
        spotlightBody = t('recapStorySpotlight_income_body');
        spotlightSubtitle = hl.percentChange ? t('recapStorySpotlight_income_pct', { pct: hl.percentChange }) : '';
        break;
      case 'selfCare':
        spotlightTitle = t('recapStorySpotlight_wellness_title');
        spotlightBody = t('recapStorySpotlight_wellness_body');
        spotlightSubtitle = hl.itemLabel || '';
        break;
      case 'dates':
        spotlightTitle = t('recapStorySpotlight_dates_title');
        spotlightBody = t('recapStorySpotlight_dates_body', { count: hl.count || 1 });
        break;
    }
  }

  const podium = scene.type === 'foodPodium' ? {
    kicker: t('recapStory_foodPodium_kicker'),
    line: scene.topIsTopSpot ? t('recapStory_foodPodium_crown') : lineFor('foodPodium'),
  } : null;

  let finaleRows: { label: string; value: string }[] = [];
  let finaleClosing = '';
  let lockedRows: { title: string; hint: string }[] = [];
  if (scene.type === 'finale') {
    const { collage, cliffhanger } = scene;
    finaleRows = [
      collage.topSpot && { label: t('recapStory_finale_topSpot'), value: `${collage.topSpot.name} · ${visitsText(collage.topSpot.visits)}` },
      collage.foodPodium && { label: t('recapStory_finale_foodPodium'),
        value: collage.foodPodium.map((name, index) => `${index + 1}. ${name}`).join('  ') },
      collage.biggestDay && { label: t('recapStory_finale_biggestDay'),
        value: `${dayLabel(collage.biggestDay.day)} · ${money(collage.biggestDay.total)}` },
      collage.versusChange !== undefined && { label: t('recapStory_finale_versus'), value: signedMoney(collage.versusChange) },
    ].filter((row): row is { label: string; value: string } => !!row);
    finaleClosing = cliffhanger?.kind === 'challenger'
      ? t('recapStory_finale_challenger', { name: cliffhanger.name, visits: cliffhanger.visits })
      : cliffhanger?.kind === 'crown' ? t('recapStory_finale_crown', { name: cliffhanger.name })
      : cliffhanger?.kind === 'missesYou' ? t('recapStory_finale_missesYou', { name: cliffhanger.name })
      : t('recapStory_finale_seeYou');
    lockedRows = scene.locked.flatMap((id) => {
      const keys = LOCKED_COPY[id];
      return keys ? [{ title: t(keys[0]), hint: t(keys[1]) }] : [];
    });
  }
  const shortFinale = scene.type === 'finale' && scene.locked.length > 0;

  const summary = scene.type === 'ritual' ? t('recapStoryRitualTitle')
    : place ? [place.kicker, place.headline, place.stat, place.detail, place.line, place.beat].filter(Boolean).join('. ')
    : scene.type === 'foodPodium' ? [podium!.kicker, ...scene.places.map((entry, index) =>
      `${index + 1}. ${entry.name}, ${visitsText(entry.visits)}`), podium!.line].join('. ')
    : scene.type === 'spotlight' ? `${spotlightTitle}. ${spotlightBody}`
    : shortFinale ? [t('recapStory_short_kicker'), t('recapStory_short_body'),
      ...lockedRows.map((row) => `${row.title}: ${row.hint}`)].join('. ')
    : [t('recapStory_finale_kicker'), ...finaleRows.map((row) => `${row.label}: ${row.value}`), finaleClosing].join('. ');

  return (
    <View testID="recap-story-capture-frame" collapsable={false} accessible accessibilityRole="image"
      accessibilityLabel={[accessibilityPositionLabel, monthLabel, summary].filter(Boolean).join('. ')}
      style={[styles.frame, { backgroundColor: palette.background }]}>
      <View testID="story-artwork" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={styles.artwork} pointerEvents="none">
        <Animated.View style={[styles.ornaments, ornamentPose]}>
          {/* Both layers cover the whole card. Stacked in flow, they were squeezed to half height
              on web (moving the corner ring onto the copy) and pushed off the card on native. */}
          <View style={styles.ornamentLayer}>
            <Svg width={360} height={640} viewBox="0 0 360 640" accessible={false}>
              {/* Accent never carries copy. Two oversized, cropped gestures frame the story. */}
              <Path d="M284 14 L306 48 L346 36 L330 76 L366 102 L320 106 L310 150 L286 114 L246 130 L260 88 L226 62 L270 60 Z"
                transform="translate(40 -100)" fill={palette.accent} />
              {/* Kept in the lower-left corner so the stroke does not cross the mascot. */}
              <Circle cx={-78} cy={640} r={96} fill="none" stroke={palette.accent} strokeWidth={28} />
            </Svg>
          </View>
          <View style={styles.ornamentLayer}>
            <StoryMotifSvg motif={theme.motif} stroke={ink} fill={palette.accent} />
          </View>
        </Animated.View>
        <View style={styles.month}><Label color={ink}>{monthLabel}</Label></View>
        <Animated.View testID="story-scene-motion" style={[styles.scene, pose]}>
          {scene.type === 'ritual' && <>
            <View style={styles.ritualTitle}><Display color={ink} style={styles.headline}>{t('recapStoryRitualTitle')}</Display></View>
            <View style={styles.cow}><DancingCow size={208} motion={motion} progress={progress} exportMode={mode === 'export'} /></View>
          </>}
          {place && <>
            {!!place.icon && <View style={styles.placeIcon}><Icon name={place.icon} size={112} color={ink} stroke={1.5} /></View>}
            <Label weight={700} color={ink} style={styles.kicker}>{place.kicker}</Label>
            <Display color={ink} style={place.sentence ? styles.sentenceHeadline : styles.headline} numberOfLines={place.sentence ? 5 : 3}
              adjustsFontSizeToFit minimumFontScale={0.6}>{place.headline}</Display>
            {!!place.stat && <Title color={ink} style={styles.stat}>{place.stat}</Title>}
            {!!place.detail && <Body color={ink} style={styles.body}>{place.detail}</Body>}
            {!!place.line && <Body weight={700} color={ink} style={styles.body}>{place.line}</Body>}
            {!!place.beat && <Animated.View testID="story-amount-beat" style={[styles.beat, { borderColor: ink }, reveal(0.45, 0.6)]}>
              <Title color={ink}>{place.beat}</Title>
            </Animated.View>}
          </>}
          {scene.type === 'foodPodium' && <>
            <Label weight={700} color={ink} style={styles.kicker}>{podium!.kicker}</Label>
            <Body weight={700} color={ink} style={styles.podiumLine}>{podium!.line}</Body>
            <View style={styles.podium}>
              {PODIUM_COLUMNS.map(({ rank, height, reveal: [from, to] }) => {
                const entry = scene.places[rank];
                if (!entry) return <View key={rank} style={styles.podiumColumn} />;
                return <Animated.View key={rank} testID={`story-podium-${rank + 1}`} style={[styles.podiumColumn, reveal(from, to)]}>
                  {rank === 0 && <Title color={ink} style={styles.crown}>👑</Title>}
                  <Label weight={700} color={ink} numberOfLines={3} style={styles.podiumName}>{entry.name}</Label>
                  <Label color={ink} style={styles.podiumVisits}>{visitsText(entry.visits)}</Label>
                  <View style={[styles.podiumBlock, { height, borderColor: ink, backgroundColor: palette.accent }]}>
                    <Display numeric color={ink}>{String(rank + 1)}</Display>
                  </View>
                </Animated.View>;
              })}
            </View>
          </>}
          {scene.type === 'spotlight' && (
            <View style={styles.spotlightScene}>
              <View style={[styles.spotlightPill, { borderColor: ink }]}>
                <Icon name="sparkles" size={14} color={ink} />
                <Label weight={700} color={ink}>{t('recapStorySpotlightBadge')}</Label>
              </View>
              <View style={styles.spotlightIcon}>
                <Icon name={(scene.highlight.iconName as IconName) || 'sparkles'} size={96} color={ink} stroke={1.5} />
              </View>
              <View style={styles.spotlightContent}>
                <Display color={ink} style={styles.headline} numberOfLines={2} adjustsFontSizeToFit>{spotlightTitle}</Display>
                <Body color={ink} style={styles.body}>{spotlightBody}</Body>
                {spotlightTags.length > 0 ? (
                  <View style={styles.spotlightTags}>
                    {spotlightTags.map((tag, index) => (
                      <View key={`${tag}-${index}`} style={[styles.spotlightTag, styles.spotlightPlace, { borderColor: ink, borderWidth: 1 }]}>
                        <Label weight={700} color={ink}>{tag}</Label>
                      </View>
                    ))}
                  </View>
                ) : !!spotlightSubtitle && (
                  <View style={[styles.spotlightTag, { borderColor: ink, borderWidth: 1 }]}>
                    <Label weight={700} color={ink}>{spotlightSubtitle}</Label>
                  </View>
                )}
              </View>
            </View>
          )}
          {scene.type === 'finale' && !shortFinale && <>
            <Title color={ink} style={styles.finaleTitle}>{t('recapStory_finale_kicker')}</Title>
            <View style={styles.collage}>
              {finaleRows.map((row) => <View key={row.label} style={[styles.collageRow, { borderColor: ink }]}>
                <Label color={ink}>{row.label}</Label>
                <Title color={ink} numberOfLines={3} style={styles.collageValue}>{row.value}</Title>
              </View>)}
            </View>
            <Body weight={700} color={ink} style={styles.cliffhanger}>{finaleClosing}</Body>
          </>}
          {shortFinale && <>
            <Display color={ink} style={styles.headline}>{t('recapStory_short_kicker')}</Display>
            <Body color={ink} style={styles.body}>{t('recapStory_short_body')}</Body>
            <View style={styles.lockedList}>
              {lockedRows.map((row) => <View key={row.title} style={[styles.locked, { borderColor: ink }]}>
                <Label weight={700} color={ink}>{`🔒 ${row.title}`}</Label>
                <Label color={ink} style={styles.lockedHint}>{row.hint}</Label>
              </View>)}
            </View>
            <View style={styles.mascot}>
              <SvgXml xml={mascotXml} width={248} height={208} accessible={false} />
              <PipFestiveAccessory accessory={theme.pipAccessory} ink={ink} accent={palette.accent} />
            </View>
          </>}
        </Animated.View>
        <View style={styles.wordmark}><Label color={ink}>Pip</Label></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: STORY_LOGICAL_WIDTH, height: STORY_LOGICAL_HEIGHT, overflow: 'hidden' },
  artwork: { flex: 1 },
  ornaments: { ...StyleSheet.absoluteFillObject },
  ornamentLayer: { ...StyleSheet.absoluteFillObject },
  month: { position: 'absolute', top: 48, left: 32, right: 80 },
  scene: { position: 'absolute', top: 96, left: 32, right: 32, bottom: 72 },
  kicker: { marginBottom: 12, letterSpacing: 0.4 },
  headline: { lineHeight: 44, letterSpacing: -1 },
  sentenceHeadline: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  stat: { marginTop: 12, lineHeight: 28 },
  body: { marginTop: 12, lineHeight: 22 },
  beat: { alignSelf: 'flex-start', marginTop: 20, borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  placeIcon: { position: 'absolute', bottom: 8, right: -8, opacity: 0.9, transform: [{ rotate: '12deg' }] },
  ritualTitle: { width: 280 },
  cow: { position: 'absolute', bottom: 0, right: 0 },
  podiumLine: { lineHeight: 22 },
  podium: { position: 'absolute', left: 0, right: 0, bottom: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  podiumColumn: { flex: 1, alignItems: 'stretch' },
  crown: { textAlign: 'center', marginBottom: 4 },
  podiumName: { textAlign: 'center', lineHeight: 16 },
  podiumVisits: { textAlign: 'center', marginTop: 2, marginBottom: 6 },
  podiumBlock: { borderWidth: 2, borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: 'center', justifyContent: 'center' },
  finaleTitle: { lineHeight: 28 },
  collage: { marginTop: 16, gap: 10 },
  collageRow: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  collageValue: { marginTop: 2, lineHeight: 26, fontSize: 18 },
  cliffhanger: { marginTop: 16, lineHeight: 22 },
  lockedList: { marginTop: 20, gap: 10, width: 236 },
  locked: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, opacity: 0.85 },
  lockedHint: { marginTop: 2, fontWeight: '500' },
  // Drawn at the accessory artwork's own 248×208 size, then scaled to fit beside the locked list.
  mascot: { position: 'absolute', bottom: -36, right: -48, width: 248, height: 208, transform: [{ scale: 0.62 }] },
  spotlightScene: { flex: 1, justifyContent: 'space-between', paddingBottom: 16 },
  spotlightPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 },
  spotlightIcon: { alignSelf: 'center', marginVertical: 20 },
  spotlightContent: { gap: 8 },
  spotlightTag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 12 },
  spotlightTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  spotlightPlace: { marginTop: 0 },
  wordmark: { position: 'absolute', bottom: 40, right: 32 },
});
