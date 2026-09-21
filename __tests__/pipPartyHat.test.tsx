import React from 'react';
import { Pip } from '../src/components/Pip';

jest.mock('../src/state/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

const TestRenderer = require('react-test-renderer');

const render = (element: React.ReactElement) => {
  let tree: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(element);
  });
  return tree!;
};

const PIECES = [
  'pip-party-hat',
  'pip-party-hat-cone',
  'pip-party-hat-dots',
  'pip-party-hat-rim',
  'pip-party-hat-confetti',
];

describe('Pip party hat', () => {
  it('renders the 🥳 cone hat, dots, rim and confetti', () => {
    const tree = render(<Pip size={100} partyHat />);

    for (const testID of PIECES) {
      expect(tree.root.findAllByProps({ testID }).length).toBeGreaterThan(0);
    }
  });

  it('is scoped to the pose — a plain Pip carries none of it', () => {
    const tree = render(<Pip size={100} />);

    for (const testID of PIECES) {
      expect(tree.root.findAllByProps({ testID }).length).toBe(0);
    }
  });

  it('wears the party hat instead of a straw or propeller cap', () => {
    const tree = render(<Pip size={100} partyHat hat propellerHat />);

    expect(tree.root.findAllByProps({ testID: 'pip-party-hat' }).length).toBeGreaterThan(0);
    for (const fill of ['#F0DCA4', '#E8453C']) {
      expect(tree.root.findAllByProps({ fill }).length).toBe(0);
    }
  });

  it('tucks the sprout away so the cone can sit on the head', () => {
    const plain = render(<Pip size={100} />);
    expect(plain.root.findAllByProps({ testID: 'pip-sprout' }).length).toBeGreaterThan(0);

    const party = render(<Pip size={100} partyHat />);
    expect(party.root.findAllByProps({ testID: 'pip-sprout' }).length).toBe(0);
  });
});
