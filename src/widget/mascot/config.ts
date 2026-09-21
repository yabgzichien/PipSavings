// The widget mascot's saved look. Stored as one JSON blob under a single app_meta key because
// it is only ever read and written whole.
//
// parseWidgetMascotConfig MUST NOT THROW. It is called from widgetTask.tsx, which runs in a
// headless background context: a throw there fails a home-screen render with no UI to report it.
// Every field falls back independently, so one bad value never discards the rest of the config.

export const WIDGET_MASCOT_CONFIG_KEY = 'widget_mascot_config';

export type SlotId = 'head' | 'eyes' | 'mouth' | 'holding';
export type Notch = 1 | 2 | 3 | 4 | 5;
export type BadgeIcon = 'flame' | 'star' | 'leaf' | 'sprout' | 'none';
export type BadgeColor = 'amber' | 'red' | 'green' | 'blue' | 'violet';
export type PresetId =
  | 'classic'
  | 'nerdy'
  | 'cool'
  | 'sassy'
  | 'swordsman'
  | 'scientist'
  | 'chef'
  | 'cowboy'
  | 'cyborg'
  | 'wizard';

/**
 * What occupies one of the two slots to the right of the mascot.
 *
 * The slots are positional, not semantic: `slot1` is nearer the mascot and `slot2` sits outside
 * it. Either can hold either arrow, a streak badge, or nothing — so an income arrow beside a
 * streak badge is a valid layout, as is a lone expense arrow.
 */
export type SlotContent = 'income' | 'expense' | 'streak' | 'none';

export interface WidgetMascotConfig {
  version: 2;
  preset: PresetId | 'custom';
  head: string;
  eyes: string;
  mouth: string;
  holding: string;
  mascotNotch: Notch;
  buttonNotch: Notch;
  animationNotch: Notch;
  slot1: SlotContent;
  slot2: SlotContent;
  badgeIcon: BadgeIcon;
  badgeColor: BadgeColor;
}

/** The stock widget: both arrows, a mid-ladder mascot, amber flame badge. */
export const DEFAULT_WIDGET_MASCOT_CONFIG: WidgetMascotConfig = {
  version: 2,
  preset: 'classic',
  head: 'none',
  eyes: 'default',
  mouth: 'smile',
  holding: 'none',
  mascotNotch: 3,
  buttonNotch: 3,
  animationNotch: 3,
  slot1: 'income',
  slot2: 'expense',
  badgeIcon: 'flame',
  badgeColor: 'amber',
};

const PRESET_IDS: readonly string[] = [
  'classic',
  'nerdy',
  'cool',
  'sassy',
  'swordsman',
  'scientist',
  'chef',
  'cowboy',
  'cyborg',
  'wizard',
  'custom',
];
const BADGE_ICONS: readonly string[] = ['flame', 'star', 'leaf', 'sprout', 'none'];
const BADGE_COLORS: readonly string[] = ['amber', 'red', 'green', 'blue', 'violet'];
const SLOT_CONTENTS: readonly string[] = ['income', 'expense', 'streak', 'none'];

/** Part-id validity is checked against the catalog at compose time, not here — config.ts stays
 *  free of catalog imports so it can be read without pulling the whole art registry in. The one
 *  exception is the shape check: ids must be non-empty strings. */
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function oneOf(v: unknown, allowed: readonly string[], fallback: string): string {
  return typeof v === 'string' && allowed.includes(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function notch(v: unknown, fallback: Notch): Notch {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : fallback;
}

/**
 * v1 stored the arrows as two independent booleans. v2 stores two positional slots that can each
 * hold either arrow, a streak badge, or nothing.
 *
 * A stored config that fails to migrate silently resets someone's customized widget to stock, so
 * every v1 combination is mapped explicitly and pinned by test. A blob with no `version` predates
 * versioning and is treated as v1; v1's own default was both arrows on, which is why absent
 * booleans fall back to true rather than to v2's defaults.
 */
function migrateArrowsFromV1(o: Record<string, unknown>): Pick<WidgetMascotConfig, 'slot1' | 'slot2'> {
  const income = bool(o.showIncome, true);
  const expense = bool(o.showExpense, true);
  if (income && expense) return { slot1: 'income', slot2: 'expense' };
  if (income) return { slot1: 'income', slot2: 'none' };
  if (expense) return { slot1: 'expense', slot2: 'none' };
  return { slot1: 'none', slot2: 'none' };
}

/** Two streak counts side by side say nothing a single one does not. slot1 keeps it. */
function enforceSingleStreak(slots: Pick<WidgetMascotConfig, 'slot1' | 'slot2'>) {
  if (slots.slot1 === 'streak' && slots.slot2 === 'streak') {
    return { slot1: slots.slot1, slot2: 'none' as const };
  }
  return slots;
}

export function parseWidgetMascotConfig(raw: string | null): WidgetMascotConfig {
  const d = DEFAULT_WIDGET_MASCOT_CONFIG;
  if (!raw) return d;

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return d;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return d;
  const o = obj as Record<string, unknown>;

  const slots =
    o.version === 2
      ? {
          slot1: oneOf(o.slot1, SLOT_CONTENTS, d.slot1) as SlotContent,
          slot2: oneOf(o.slot2, SLOT_CONTENTS, d.slot2) as SlotContent,
        }
      : migrateArrowsFromV1(o);

  return {
    version: 2,
    preset: oneOf(o.preset, PRESET_IDS, d.preset) as PresetId | 'custom',
    head: str(o.head, d.head),
    eyes: str(o.eyes, d.eyes),
    mouth: str(o.mouth, d.mouth),
    holding: str(o.holding, d.holding),
    mascotNotch: notch(o.mascotNotch, d.mascotNotch),
    buttonNotch: notch(o.buttonNotch, d.buttonNotch),
    animationNotch: notch(o.animationNotch, d.animationNotch),
    ...enforceSingleStreak(slots),
    badgeIcon: oneOf(o.badgeIcon, BADGE_ICONS, d.badgeIcon) as BadgeIcon,
    badgeColor: oneOf(o.badgeColor, BADGE_COLORS, d.badgeColor) as BadgeColor,
  };
}

export function serializeWidgetMascotConfig(c: WidgetMascotConfig): string {
  return JSON.stringify(c);
}

/** A backup may carry a Pro-only look. Restoring it without entitlement degrades silently to
 *  the default: the widget sits on a home screen other people see, so a locked or broken
 *  widget there is worse than a plain one. Re-subscribing restores the stored look, because
 *  the original value stays in the backup rather than being rewritten. */
export function mascotConfigForTier(raw: string, isPro: boolean): string {
  if (isPro) return raw;
  return serializeWidgetMascotConfig(DEFAULT_WIDGET_MASCOT_CONFIG);
}
