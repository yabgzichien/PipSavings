import React from 'react';
const TestRenderer = require('react-test-renderer');
import { WidgetCustomizerScreen } from '../src/screens/WidgetCustomizerScreen';
import { MascotOptionTile } from '../src/components/MascotOptionTile';
import { PrimaryButton } from '../src/components/ui';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSetWidgetMascotConfig = jest.fn(async () => {});
const mockOpenPaywall = jest.fn();

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    widgetMascotConfig: require('../src/widget/mascot/config').DEFAULT_WIDGET_MASCOT_CONFIG,
    setWidgetMascotConfig: mockSetWidgetMascotConfig,
  }),
}));
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: false }),
}));
jest.mock('../src/billing/paywallContext', () => ({
  usePaywall: () => ({ openPaywall: mockOpenPaywall }),
}));

describe('Free widget premium previews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the customizer without immediately opening the paywall', async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<WidgetCustomizerScreen onBack={jest.fn()} />);
    });

    expect(mockOpenPaywall).not.toHaveBeenCalled();
  });

  it('previews a premium preset but gates persistence', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<WidgetCustomizerScreen onBack={jest.fn()} />);
    });

    const chef = tree!.root
      .findAllByType(MascotOptionTile)
      .find((tile: any) => tile.props.label === 'Chef');
    expect(chef?.props.requiresPro).toBe(true);

    await TestRenderer.act(async () => {
      chef!.props.onPress();
    });

    const save = tree!.root.findByType(PrimaryButton);
    await TestRenderer.act(async () => {
      save.props.onPress();
    });

    expect(mockSetWidgetMascotConfig).not.toHaveBeenCalled();
    expect(mockOpenPaywall).toHaveBeenCalledWith('widget_custom', 'widgetCustomizer');
  });

  it('hands the draft to navigation so it survives the paywall round trip', async () => {
    const onDraftChange = jest.fn();
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <WidgetCustomizerScreen onBack={jest.fn()} onDraftChange={onDraftChange} />
      );
    });

    const chef = tree.root
      .findAllByType(MascotOptionTile)
      .find((tile: any) => tile.props.label === 'Chef');
    await TestRenderer.act(async () => {
      chef.props.onPress();
    });

    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'chef' }));
  });
});
