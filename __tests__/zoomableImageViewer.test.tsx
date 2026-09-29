import React from 'react';
const { act, create } = require('react-test-renderer');
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { containedImageSize, ZoomableImageViewer } from '../src/components/ZoomableImageViewer';

it('fits a tall screenshot to the viewport before calculating zoom pan bounds', () => {
  expect(containedImageSize(1080, 6000, 360, 720)).toEqual({ width: 129.6, height: 720 });
});

describe('ZoomableImageViewer', () => {
  it('reports the zoom reached by a pinch and resets after closing', () => {
    let tree: any;
    const props = {
      visible: true,
      uri: 'file://statement.png',
      topInset: 24,
      onClose: jest.fn(),
    };

    act(() => {
      tree = create(<ZoomableImageViewer {...props} />);
    });

    act(() => {
      fireGestureHandler(getByGestureTestId('zoomable-image-pinch'), [
        { state: State.BEGAN, scale: 1 },
        { state: State.ACTIVE, scale: 2 },
        { state: State.END, scale: 2 },
      ]);
    });

    expect(tree.root.findByProps({ testID: 'zoomable-image-surface' }).props.accessibilityValue).toEqual({
      min: 100,
      max: 500,
      now: 200,
      text: '200%',
    });

    act(() => {
      tree.update(<ZoomableImageViewer {...props} visible={false} />);
    });
    act(() => {
      tree.update(<ZoomableImageViewer {...props} />);
    });

    expect(tree.root.findByProps({ testID: 'zoomable-image-surface' }).props.accessibilityValue.now).toBe(100);
  });
});
