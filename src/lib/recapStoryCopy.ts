import { recapStoryVariant } from './recapStory';

/** How many reviewed one-liners each scene rotates through, month to month. */
export const RECAP_STORY_LINE_VARIANTS = {
  topSpot: 3,
  foodPodium: 2,
  shoppingRegular: 2,
  discoveries: 2,
  rideOrDie: 3,
  ghosted: 3,
  biggestDay: 3,
} as const;

export type RecapStoryLineScene = keyof typeof RECAP_STORY_LINE_VARIANTS;

/** The one-liner a scene shows this month: stable on replay, different next month. */
export function recapStoryLineKey(month: string, sceneId: RecapStoryLineScene): string {
  return `recapStory_${sceneId}_line${recapStoryVariant(month, sceneId, RECAP_STORY_LINE_VARIANTS[sceneId])}`;
}

const lineKeys = Object.entries(RECAP_STORY_LINE_VARIANTS).flatMap(([sceneId, count]) =>
  Array.from({ length: count }, (_, variant) => `recapStory_${sceneId}_line${variant}`));

/** Every translation key the story scenes and share sheet read. */
export const RECAP_STORY_COPY_KEYS: readonly string[] = [
  'recapStory_visitsOne', 'recapStory_visitsMany',
  'recapStory_topSpot_kicker', 'recapStory_topSpot_everyDay', 'recapStory_topSpot_everyDays', 'recapStory_topSpot_total',
  'recapStory_foodPodium_kicker', 'recapStory_foodPodium_crown',
  'recapStory_shoppingRegular_kicker', 'recapStory_shoppingRegular_trips',
  'recapStory_discoveries_kicker', 'recapStory_discoveries_countOne', 'recapStory_discoveries_countMany',
  'recapStory_discoveries_best', 'recapStory_discoveries_returned', 'recapStory_discoveries_once',
  'recapStory_rideOrDie_kicker', 'recapStory_rideOrDie_months',
  'recapStory_ghosted_kicker', 'recapStory_ghosted_detail',
  'recapStory_biggestDay_kicker', 'recapStory_biggestDay_stops', 'recapStory_biggestDay_oneStop',
  'recapStory_versusLastMonth_kicker', 'recapStory_versusLastMonth_less', 'recapStory_versusLastMonth_more',
  'recapStory_versusLastMonth_same', 'recapStory_versusLastMonth_movedUp', 'recapStory_versusLastMonth_movedDown',
  'recapStory_versusLastMonth_totals',
  'recapStory_finale_kicker', 'recapStory_finale_topSpot', 'recapStory_finale_foodPodium', 'recapStory_finale_biggestDay',
  'recapStory_finale_versus', 'recapStory_finale_challenger', 'recapStory_finale_crown', 'recapStory_finale_missesYou',
  'recapStory_finale_seeYou',
  'recapStory_short_kicker', 'recapStory_short_body',
  'recapStory_locked_topSpot', 'recapStory_locked_topSpotHint',
  'recapStory_locked_foodPodium', 'recapStory_locked_foodPodiumHint',
  'recapStory_locked_biggestDay', 'recapStory_locked_biggestDayHint',
  'recapStory_locked_discoveries', 'recapStory_locked_discoveriesHint',
  'recapStory_hideAllAmounts', 'recapStory_amountsShown', 'recapStory_amountsHidden',
  ...lineKeys,
];
