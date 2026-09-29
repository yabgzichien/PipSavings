import React from 'react';
import { ChatModeHome } from '../src/screens/ChatModeHome';
import { en } from '../src/i18n/translations/en';
import { LLMError } from '../src/llm/types';

const Renderer = require('react-test-renderer');

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({ accent: '#18794e', accentInk: '#ffffff', accentTint: '#e4f6ec', accentSoft: '#b6e4c8' }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#eef1ee', surface: '#ffffff', surface2: '#f6f8f6', ink: '#16201b', ink2: '#5d6b63', ink3: '#6a776f',
    line: 'rgba(20,40,30,0.08)', line2: 'rgba(20,40,30,0.05)', red: '#c0392b',
  }),
  useColorSchemeMode: () => ({ setMode: jest.fn() }),
}));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', rates: {}, convert: (value: number) => value }),
}));
jest.mock('../src/state/useNow', () => ({ useNow: () => new Date('2026-09-28T12:00:00') }));
jest.mock('../src/billing/entitlement', () => ({ useEntitlement: () => ({ isPro: false }) }));
jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    openShares: [], accounts: [], accountValues: {}, settleShare: jest.fn(), unsettleShare: jest.fn(),
    tasksDone: [], transactions: [],
  }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => {
    const actualEn = jest.requireActual('../src/i18n/translations/en').en;
    return { isZh: false, t: (key: string) => actualEn[key] ?? key };
  },
}));

function renderChat(hasKey: boolean, onNeedKey = jest.fn(), runModel = jest.fn()) {
  let tree: ReturnType<typeof Renderer.create>;
  Renderer.act(() => {
    tree = Renderer.create(
      <ChatModeHome
        onToggleDashboard={jest.fn()}
        onAttach={jest.fn()}
        onNeedKey={onNeedKey}
        onDiscloseSend={async () => true}
        onDisclosePhoto={async () => true}
        hasKey={hasKey}
        runModel={runModel}
        world={{ trips: [], people: [], categories: [], transactions: [] }}
        streak={0}
        week={[false, false, false, false, false, false, false]}
        todayIndex={0}
        freezeAvailable={false}
        graduated={false}
        startLabel={null}
        paused={false}
        needsYou={null}
        hasOwed={false}
        tripName={null}
        tripId={null}
        hasHoldings={false}
        onOpenCalendar={jest.fn()}
        onOpenOwed={jest.fn()}
        onOpenCommitments={jest.fn()}
      />,
    );
  });
  return tree!;
}

describe('Chat mode API key state', () => {
  it('shows a compact action that opens key setup when no key is active', () => {
    const onNeedKey = jest.fn();
    const tree = renderChat(false, onNeedKey);

    const action = tree.root.findByProps({ accessibilityLabel: 'Get an API key' });
    Renderer.act(() => action.props.onPress());

    expect(onNeedKey).toHaveBeenCalledTimes(1);
  });

  it('hides the no-key action when a key is active', () => {
    const tree = renderChat(true);

    expect(tree.root.findAllByProps({ accessibilityLabel: 'Get an API key' })).toHaveLength(0);
  });

  it('places the Dashboard mode toggle before the mascot', () => {
    const tree = renderChat(false);
    const controls = tree.root.findAll((node: any) => (
      node.props.accessibilityLabel === en.askPipToggleDashboard
      || node.props.testID === 'home-mascot-button'
    ));

    const order = controls.map((node: any) => (
      node.props.accessibilityLabel === en.askPipToggleDashboard ? 'toggle' : 'mascot'
    )).filter((kind: string, index: number, all: string[]) => index === 0 || kind !== all[index - 1]);
    expect(order).toEqual(['toggle', 'mascot']);
  });

  it('shows the user-key limit message without falling back from Chat mode', async () => {
    const runModel = jest.fn(async () => {
      throw new LLMError('rate_limit', 'Rate limit reached.');
    });
    const tree = renderChat(true, jest.fn(), runModel);
    const input = tree.root.findByProps({ placeholder: en.askPipComposerPlaceholder });

    Renderer.act(() => input.props.onChangeText('Find my coffee spending from last spring'));
    await Renderer.act(async () => {
      await input.props.onSubmitEditing();
      await Promise.resolve();
    });

    expect(runModel).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ children: en.askPipKeyLimit }).length).toBeGreaterThan(0);
  });
});
