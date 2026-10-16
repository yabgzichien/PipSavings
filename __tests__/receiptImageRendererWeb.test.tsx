import React from 'react';
const { act, create } = require('react-test-renderer');
import { ReceiptImageRenderer } from '../src/components/ReceiptImageRenderer.web';

// The jest-expo environment has a `window` but no DOM event system, so give the component the
// two methods it uses and capture its listener to drive messages by hand.
type Listener = (event: { data: unknown; source: unknown }) => void;
let listeners: Listener[] = [];
const realAdd = (window as any).addEventListener;
const realRemove = (window as any).removeEventListener;

beforeEach(() => {
  listeners = [];
  (window as any).addEventListener = (type: string, fn: Listener) => {
    if (type === 'message') listeners.push(fn);
  };
  (window as any).removeEventListener = (type: string, fn: Listener) => {
    if (type === 'message') listeners = listeners.filter((l) => l !== fn);
  };
});
afterEach(() => {
  (window as any).addEventListener = realAdd;
  (window as any).removeEventListener = realRemove;
});

describe('ReceiptImageRenderer (web)', () => {
  const html = '<!DOCTYPE html><html><head></head><body></body></html>';
  const ownWindow = { id: 'own-frame' };
  const message = (dataUrl: string) => ({ __pipReceipt: JSON.stringify({ dataUrl }) });

  const mount = async (onImage: (u: string) => void) => {
    let tree: any;
    await act(async () => {
      tree = create(<ReceiptImageRenderer html={html} onImage={onImage} />, {
        createNodeMock: () => ({ contentWindow: ownWindow }),
      });
    });
    return tree;
  };

  it('runs the generated page sandboxed, without access to the app origin', async () => {
    const tree = await mount(jest.fn());
    const frame = tree.root.findByType('iframe');
    expect(frame.props.sandbox).toBe('allow-scripts');
    // Adding same-origin back would hand the page this app's localStorage (saved AI keys).
    expect(String(frame.props.sandbox)).not.toContain('allow-same-origin');
    expect(frame.props.srcDoc).toContain('window.ReactNativeWebView');
    await act(async () => tree.unmount());
  });

  it('accepts the image from its own frame', async () => {
    const onImage = jest.fn();
    const tree = await mount(onImage);
    expect(listeners).toHaveLength(1);
    listeners[0]({ data: message('data:image/png;base64,REAL'), source: ownWindow });
    expect(onImage).toHaveBeenCalledWith('data:image/png;base64,REAL');
    await act(async () => tree.unmount());
  });

  it('ignores image messages posted by any other window', async () => {
    const onImage = jest.fn();
    const tree = await mount(onImage);
    listeners[0]({ data: message('data:image/png;base64,FORGED'), source: { id: 'another-tab' } });
    listeners[0]({ data: message('data:image/png;base64,FORGED'), source: null });
    expect(onImage).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});
