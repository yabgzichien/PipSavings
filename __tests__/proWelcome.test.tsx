// The Pro welcome is the one-shot beat after becoming Pro. It must stay a short
// confirmation (Pip + one line + close), pair the save chime with the haptic, and
// not wait forever for a tap.
import React from 'react';
const TestRenderer = require('react-test-renderer');
import { Pip } from '../src/components/Pip';
import { ProWelcome } from '../src/components/ProWelcome';
import { Display } from '../src/components/ui';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

let mockReducedMotion = true;
jest.mock('../src/state/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));
jest.mock('../src/lib/haptics', () => ({
  tap: jest.fn(),
  commit: jest.fn(),
  payoff: jest.fn(),
  warn: jest.fn(),
}));
jest.mock('../src/lib/sound', () => ({ payoff: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const haptics = jest.requireMock('../src/lib/haptics') as { payoff: jest.Mock };
const sound = jest.requireMock('../src/lib/sound') as { payoff: jest.Mock };

function renderWelcome(onDone = jest.fn()) {
  let tree: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <ProWelcome title="Welcome to Pip Pro" closeLabel="Close" onDone={onDone} />
    );
  });
  return { tree: tree!, onDone };
}

describe('Pro welcome', () => {
  beforeEach(() => {
    mockReducedMotion = true;
    jest.useFakeTimers();
    haptics.payoff.mockClear();
    sound.payoff.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a larger Pip celebrating and the welcome line', () => {
    const { tree } = renderWelcome();
    expect(tree.root.findByProps({ children: 'Welcome to Pip Pro' })).toBeDefined();
    const pip = tree.root.findByType(Pip);
    expect(pip.props.expr).toBe('proud');
    expect(pip.props.celebrate).toBe(true);
    expect(pip.props.partyHat).toBe(true);
    expect(pip.props.size).toBe(144);
  });

  it('fires the save chime and the haptic together when it appears', () => {
    renderWelcome();
    expect(haptics.payoff).toHaveBeenCalledTimes(1);
    expect(sound.payoff).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after 2.7s, not before', () => {
    const { onDone } = renderWelcome();
    TestRenderer.act(() => {
      jest.advanceTimersByTime(2699);
    });
    expect(onDone).not.toHaveBeenCalled();
    TestRenderer.act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('dismisses from the close button and does not fire onDone again when the timer lands', () => {
    const { tree, onDone } = renderWelcome();
    TestRenderer.act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Close' }).props.onPress();
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    TestRenderer.act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not add a Pro badge or extra copy', () => {
    const { tree } = renderWelcome();
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Pip Pro active' })).toHaveLength(0);
    expect(tree.root.findAllByType(Display)).toHaveLength(1);
  });

  it('skips fireworks when motion is reduced', () => {
    const { tree } = renderWelcome();
    expect(tree.root.findAllByProps({ testID: 'pro-welcome-fireworks' })).toHaveLength(0);
  });

  it('bursts fireworks around Pip when motion is on', () => {
    mockReducedMotion = false;
    const { tree } = renderWelcome();
    expect(tree.root.findAllByProps({ testID: 'pro-welcome-fireworks' }).length).toBeGreaterThan(0);
  });
});
