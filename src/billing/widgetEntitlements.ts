import type { WidgetMascotConfig } from '../widget/mascot/config';

export type WidgetEntitlementCategory = 'preset' | 'head' | 'eyes' | 'mouth' | 'holding';
export type WidgetItemTier = 'free' | 'pro';

export const FREE_WIDGET_ITEMS: Record<WidgetEntitlementCategory, readonly string[]> = {
  preset: ['classic', 'nerdy', 'cool', 'sassy'],
  head: ['none', 'propellerCap'],
  eyes: ['default', 'big', 'sassy', 'shades'],
  mouth: ['smile', 'grin', 'open', 'lips'],
  holding: ['none', 'lollipop', 'thumbsUp'],
};

export function widgetItemTier(category: WidgetEntitlementCategory, id: string): WidgetItemTier {
  return FREE_WIDGET_ITEMS[category].includes(id) ? 'free' : 'pro';
}

export function widgetConfigRequiresPro(config: WidgetMascotConfig): boolean {
  if (config.preset !== 'custom' && widgetItemTier('preset', config.preset) === 'pro') {
    return true;
  }
  return (
    widgetItemTier('head', config.head) === 'pro' ||
    widgetItemTier('eyes', config.eyes) === 'pro' ||
    widgetItemTier('mouth', config.mouth) === 'pro' ||
    widgetItemTier('holding', config.holding) === 'pro'
  );
}
