import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import { WidgetCustomizerScreen } from '../src/screens/WidgetCustomizerScreen';
import { TopBar } from '../src/components/ui';
import { MascotOptionTile } from '../src/components/MascotOptionTile';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../src/widget/mascot/config';

const mockConfirmAction = jest.fn();
jest.mock('../src/lib/platformAlert', () => ({
  confirmAction: (...args: unknown[]) => mockConfirmAction(...args),
}));

jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSetWidgetMascotConfig = jest.fn(async () => {});
let mockCurrentConfig = { ...DEFAULT_WIDGET_MASCOT_CONFIG };

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    widgetMascotConfig: mockCurrentConfig,
    setWidgetMascotConfig: mockSetWidgetMascotConfig,
  }),
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentInk: '#1c6b48',
    accentTint: '#eff7f4',
    accentSoft: '#dbece5',
    onTint: '#1c6b48',
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
}));
jest.mock('../src/billing/entitlement', () => ({ useEntitlement: () => ({ isPro: true }) }));
jest.mock('../src/billing/paywallContext', () => ({ usePaywall: () => ({ openPaywall: jest.fn() }) }));

describe('WidgetCustomizerScreen back confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentConfig = { ...DEFAULT_WIDGET_MASCOT_CONFIG };
  });

  it('exits immediately when back is clicked with no unsaved changes', async () => {
    const onBack = jest.fn();
    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(<WidgetCustomizerScreen onBack={onBack} />);
    });

    const topBar = renderer.root.findByType(TopBar);
    await act(async () => {
      topBar.props.onBack();
    });

    expect(mockConfirmAction).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('prompts confirmation when changes have been made', async () => {
    const onBack = jest.fn();
    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(<WidgetCustomizerScreen onBack={onBack} />);
    });

    // Find and press the "nerdy" preset option tile
    const tiles = renderer.root.findAllByType(MascotOptionTile);
    const nerdyTile = tiles.find((t: any) => t.props.label === 'Nerdy');
    expect(nerdyTile).toBeDefined();

    await act(async () => {
      nerdyTile.props.onPress();
    });

    // Now press back in TopBar
    const topBar = renderer.root.findByType(TopBar);
    await act(async () => {
      topBar.props.onBack();
    });

    // confirmAction should have been called instead of direct onBack
    expect(onBack).not.toHaveBeenCalled();
    expect(mockConfirmAction).toHaveBeenCalledTimes(1);

    const [title, body, confirmLabel, onConfirm, neutralAction, cancelLabel] =
      mockConfirmAction.mock.calls[0];

    expect(title).toBe('Quit without saving?');
    expect(body).toContain('unsaved changes');
    expect(confirmLabel).toBe('Quit without saving');
    expect(neutralAction.label).toBe('Save & Exit');
    expect(neutralAction.style).toBe('primary');
    expect(cancelLabel).toBe('Keep editing');

    // Clicking Quit without saving (onConfirm)
    onConfirm();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockSetWidgetMascotConfig).not.toHaveBeenCalled();
  });

  it('saves and exits when Save & Exit neutralAction is triggered', async () => {
    const onBack = jest.fn();
    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(<WidgetCustomizerScreen onBack={onBack} />);
    });

    // Find and press the "chef" preset option tile
    const tiles = renderer.root.findAllByType(MascotOptionTile);
    const chefTile = tiles.find((t: any) => t.props.label === 'Chef');
    expect(chefTile).toBeDefined();

    await act(async () => {
      chefTile.props.onPress();
    });

    const topBar = renderer.root.findByType(TopBar);
    await act(async () => {
      topBar.props.onBack();
    });

    const [, , , , neutralAction] = mockConfirmAction.mock.calls[0];
    await act(async () => {
      await neutralAction.onPress();
    });

    expect(mockSetWidgetMascotConfig).toHaveBeenCalledTimes(1);
    const saved = (mockSetWidgetMascotConfig.mock.calls as any)[0][0];
    expect(saved.preset).toBe('chef');
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
