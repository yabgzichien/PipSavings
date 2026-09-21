import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../src/widget/mascot/config';
import {
  FREE_WIDGET_ITEMS,
  widgetConfigRequiresPro,
  widgetItemTier,
} from '../src/billing/widgetEntitlements';

describe('widget customization entitlements', () => {
  it('keeps the stock widget free', () => {
    expect(widgetConfigRequiresPro(DEFAULT_WIDGET_MASCOT_CONFIG)).toBe(false);
  });

  it('keeps three complete presets free', () => {
    expect(widgetItemTier('preset', 'classic')).toBe('free');
    expect(widgetItemTier('preset', 'nerdy')).toBe('free');
    expect(widgetItemTier('preset', 'cool')).toBe('free');
    expect(widgetItemTier('preset', 'sassy')).toBe('free');
  });

  it('makes the three character sets Pro', () => {
    expect(widgetItemTier('preset', 'swordsman')).toBe('pro');
    expect(widgetItemTier('preset', 'scientist')).toBe('pro');
    expect(widgetItemTier('preset', 'chef')).toBe('pro');
    expect(widgetItemTier('preset', 'cowboy')).toBe('pro');
    expect(widgetItemTier('preset', 'cyborg')).toBe('pro');
    expect(widgetItemTier('preset', 'wizard')).toBe('pro');
  });

  it('keeps sassy lips free and the new costume parts Pro', () => {
    expect(widgetItemTier('mouth', 'lips')).toBe('free');
    expect(widgetItemTier('head', 'cowboyHat')).toBe('pro');
    expect(widgetItemTier('head', 'cyborgPlate')).toBe('pro');
    expect(widgetItemTier('head', 'wizardHat')).toBe('pro');
    expect(widgetItemTier('eyes', 'scanner')).toBe('pro');
    expect(widgetItemTier('holding', 'lasso')).toBe('pro');
    expect(widgetItemTier('holding', 'claw')).toBe('pro');
    expect(widgetItemTier('holding', 'wand')).toBe('pro');
  });

  it('detects a paid part even when the draft is custom', () => {
    expect(
      widgetConfigRequiresPro({
        ...DEFAULT_WIDGET_MASCOT_CONFIG,
        preset: 'custom',
        head: 'bandana',
      })
    ).toBe(true);
  });

  it('retains at least two Free choices in every artwork tab', () => {
    for (const ids of Object.values(FREE_WIDGET_ITEMS)) {
      expect(ids.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps sizes, badge styling, animation, and slots outside the paid check', () => {
    expect(
      widgetConfigRequiresPro({
        ...DEFAULT_WIDGET_MASCOT_CONFIG,
        mascotNotch: 5,
        buttonNotch: 1,
        animationNotch: 5,
        badgeIcon: 'sprout',
        badgeColor: 'violet',
        slot1: 'streak',
        slot2: 'none',
      })
    ).toBe(false);
  });
});
