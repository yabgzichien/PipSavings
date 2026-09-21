import {
  DEFAULT_WIDGET_MASCOT_CONFIG,
  mascotConfigForTier,
  parseWidgetMascotConfig,
  serializeWidgetMascotConfig,
} from '../src/widget/mascot/config';

describe('widget mascot config backup round-trip', () => {
  it('survives serialize -> payload -> parse unchanged', () => {
    const original = {
      ...DEFAULT_WIDGET_MASCOT_CONFIG,
      preset: 'custom' as const,
      head: 'goggles',
      eyes: 'big',
      mascotNotch: 2 as const,
      slot2: 'none' as const,
      badgeColor: 'violet' as const,
    };
    const payloadValue = serializeWidgetMascotConfig(original);
    expect(parseWidgetMascotConfig(payloadValue)).toEqual(original);
  });

  it('a payload missing the field restores to defaults rather than failing', () => {
    const settings: Record<string, unknown> = { motionSetting: 'full' };
    const raw =
      typeof settings.widgetMascotConfig === 'string' ? settings.widgetMascotConfig : null;
    expect(parseWidgetMascotConfig(raw)).toEqual(DEFAULT_WIDGET_MASCOT_CONFIG);
  });
});

describe('mascotConfigForTier', () => {
  const custom = serializeWidgetMascotConfig({
    ...DEFAULT_WIDGET_MASCOT_CONFIG,
    head: 'goggles' as const,
  });

  it('keeps a customized config for a Pro user', () => {
    expect(mascotConfigForTier(custom, true)).toBe(custom);
  });

  // The widget lives on a home screen other people can see, so a downgrade has to look like a
  // deliberate default rather than a locked or broken widget.
  it('falls back to the default config for a free user', () => {
    expect(mascotConfigForTier(custom, false)).toBe(
      serializeWidgetMascotConfig(DEFAULT_WIDGET_MASCOT_CONFIG)
    );
  });

  it('returns the default rather than throwing on unparseable input', () => {
    expect(mascotConfigForTier('{{{', false)).toBe(
      serializeWidgetMascotConfig(DEFAULT_WIDGET_MASCOT_CONFIG)
    );
  });
});
