// Presets are named slot configs, nothing more. Picking one writes all four slots; touching any
// individual slot afterwards flips `preset` to 'custom' (handled by the customizer screen).
import type { WidgetMascotConfig, PresetId } from './config';

export type PresetSlots = Pick<WidgetMascotConfig, 'head' | 'eyes' | 'mouth' | 'holding'>;

export const PRESETS: Record<PresetId, PresetSlots> = {
  classic: { head: 'none', eyes: 'default', mouth: 'smile', holding: 'none' },
  nerdy: { head: 'propellerCap', eyes: 'big', mouth: 'smile', holding: 'lollipop' },
  cool: { head: 'none', eyes: 'shades', mouth: 'grin', holding: 'thumbsUp' },
  sassy: { head: 'none', eyes: 'sassy', mouth: 'lips', holding: 'none' },
  swordsman: { head: 'bandana', eyes: 'scarred', mouth: 'katanaBite', holding: 'crossedKatana' },
  scientist: { head: 'goggles', eyes: 'default', mouth: 'smile', holding: 'flask' },
  chef: { head: 'strawHat', eyes: 'blissful', mouth: 'tongue', holding: 'noodleBowl' },
  cowboy: { head: 'cowboyHat', eyes: 'default', mouth: 'grin', holding: 'lasso' },
  cyborg: { head: 'cyborgPlate', eyes: 'scanner', mouth: 'smile', holding: 'claw' },
  wizard: { head: 'wizardHat', eyes: 'default', mouth: 'smile', holding: 'wand' },
};

export function applyPreset(config: WidgetMascotConfig, id: PresetId): WidgetMascotConfig {
  return { ...config, ...PRESETS[id], preset: id };
}
