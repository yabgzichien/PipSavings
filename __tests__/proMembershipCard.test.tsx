import React from 'react';
const TestRenderer = require('react-test-renderer');
import { ProMembershipCard } from '../src/components/ProMembershipCard';
import { en } from '../src/i18n/translations/en';

jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));

describe('Pro membership card', () => {
  it('uses distinct custom artwork for Free and active Pro states', async () => {
    let freeTree: any;
    let proTree: any;
    await TestRenderer.act(async () => {
      freeTree = TestRenderer.create(
        <ProMembershipCard isPro={false} onUpgrade={jest.fn()} t={(key) => en[key]} />
      );
      proTree = TestRenderer.create(
        <ProMembershipCard isPro onUpgrade={jest.fn()} t={(key) => en[key]} />
      );
    });

    const freeArt = freeTree!.root.findByProps({ testID: 'pro-membership-art' });
    const proArt = proTree!.root.findByProps({ testID: 'pro-membership-art' });
    expect(freeArt.props.source).not.toEqual(proArt.props.source);
    expect(freeArt.props.accessible).toBe(false);
    expect(proArt.props.accessible).toBe(false);
  });

  it('gives a free user one compact upgrade action without account-management links', async () => {
    const onUpgrade = jest.fn();
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ProMembershipCard isPro={false} onUpgrade={onUpgrade} t={(key) => en[key]} />
      );
    });

    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'pro-membership-primary' }).props.onPress();
    });
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(tree!.root.findByProps({ children: 'Upgrade to Pro' })).toBeDefined();
    expect(tree!.root.findAllByProps({ children: 'Enter code' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ children: 'Restore purchases' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ children: 'Manage subscription' })).toHaveLength(0);
  });

  it('shows Pro as a status instead of an account-management action', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ProMembershipCard isPro onUpgrade={jest.fn()} t={(key) => en[key]} />
      );
    });

    expect(tree!.root.findByProps({ children: 'Your Pro is active' })).toBeDefined();
    expect(tree!.root.findAllByProps({ testID: 'pro-membership-primary' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ children: 'Manage subscription' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ children: 'Your premium features are ready' })).toHaveLength(0);
  });

  it('does not draw the gradient Pro edge border', async () => {
    let freeTree: any;
    let proTree: any;
    await TestRenderer.act(async () => {
      freeTree = TestRenderer.create(
        <ProMembershipCard isPro={false} onUpgrade={jest.fn()} t={(key) => en[key]} />
      );
      proTree = TestRenderer.create(
        <ProMembershipCard isPro onUpgrade={jest.fn()} t={(key) => en[key]} />
      );
    });

    const freeStops = freeTree!.root.findAll(
      (node: any) => typeof node.props?.stopColor === 'string'
    );
    const proStops = proTree!.root.findAll(
      (node: any) => typeof node.props?.stopColor === 'string'
    );
    expect(freeStops).toHaveLength(0);
    expect(proStops).toHaveLength(0);
  });
});