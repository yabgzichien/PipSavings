import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from './Icon';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export function clampZoomScale(value: number): number {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function containedImageSize(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  const containRatio = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
  return {
    width: imageWidth * containRatio,
    height: imageHeight * containRatio,
  };
}

function clampOffset(value: number, limit: number): number {
  'worklet';
  return Math.min(limit, Math.max(-limit, value));
}

export function ZoomableImageViewer({
  visible,
  uri,
  topInset,
  onClose,
}: {
  visible: boolean;
  uri: string;
  topInset: number;
  onClose: () => void;
}) {
  const [zoomPercent, setZoomPercent] = useState(100);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const contentWidth = useSharedValue(0);
  const contentHeight = useSharedValue(0);

  const resetTransform = () => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
    setZoomPercent(100);
  };

  useEffect(() => {
    resetTransform();
  }, [uri, visible]);

  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (alive && width > 0 && height > 0) setNaturalSize({ width, height });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  const updateContainedSize = (width: number, height: number) => {
    viewportWidth.value = width;
    viewportHeight.value = height;
    const contained = containedImageSize(naturalSize.width, naturalSize.height, width, height);
    contentWidth.value = contained.width;
    contentHeight.value = contained.height;
  };

  useEffect(() => {
    if (viewportWidth.value <= 0 || viewportHeight.value <= 0) return;
    const contained = containedImageSize(
      naturalSize.width,
      naturalSize.height,
      viewportWidth.value,
      viewportHeight.value,
    );
    contentWidth.value = contained.width;
    contentHeight.value = contained.height;
  }, [naturalSize]);

  const applyAccessibleScale = (nextScale: number) => {
    const next = clampZoomScale(nextScale);
    scale.value = withTiming(next);
    savedScale.value = next;
    if (next === 1) {
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedX.value = 0;
      savedY.value = 0;
    }
    setZoomPercent(Math.round(next * 100));
  };

  const pinch = useMemo(
    () => Gesture.Pinch()
      .withTestId('zoomable-image-pinch')
      .onUpdate((event) => {
        const next = clampZoomScale(savedScale.value * event.scale);
        scale.value = next;
        const maxX = Math.max(0, (contentWidth.value * next - viewportWidth.value) / 2);
        const maxY = Math.max(0, (contentHeight.value * next - viewportHeight.value) / 2);
        translateX.value = clampOffset(savedX.value, maxX);
        translateY.value = clampOffset(savedY.value, maxY);
      })
      .onEnd((event) => {
        const next = clampZoomScale(savedScale.value * event.scale);
        scale.value = next;
        savedScale.value = next;
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        runOnJS(setZoomPercent)(Math.round(next * 100));
      }),
    [contentHeight, contentWidth, savedScale, savedX, savedY, scale, translateX, translateY, viewportHeight, viewportWidth],
  );

  const pan = useMemo(
    () => Gesture.Pan()
      .onUpdate((event) => {
        if (scale.value <= 1) return;
        const maxX = Math.max(0, (contentWidth.value * scale.value - viewportWidth.value) / 2);
        const maxY = Math.max(0, (contentHeight.value * scale.value - viewportHeight.value) / 2);
        translateX.value = clampOffset(savedX.value + event.translationX, maxX);
        translateY.value = clampOffset(savedY.value + event.translationY, maxY);
      })
      .onEnd(() => {
        savedX.value = translateX.value;
        savedY.value = translateY.value;
      }),
    [contentHeight, contentWidth, savedX, savedY, scale, translateX, translateY, viewportHeight, viewportWidth],
  );

  const gesture = useMemo(() => Gesture.Simultaneous(pinch, pan), [pan, pinch]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) updateContainedSize(width, height);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <GestureDetector gesture={gesture}>
          <Animated.View
            testID="zoomable-image-surface"
            style={styles.surface}
            onLayout={onLayout}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Image preview"
            accessibilityHint="Pinch to zoom and drag to move around the image"
            accessibilityValue={{ min: 100, max: 500, now: zoomPercent, text: `${zoomPercent}%` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') applyAccessibleScale(savedScale.value + 0.5);
              if (event.nativeEvent.actionName === 'decrement') applyAccessibleScale(savedScale.value - 0.5);
            }}
          >
            <Animated.Image source={{ uri }} style={[styles.image, animatedStyle]} resizeMode="contain" />
          </Animated.View>
        </GestureDetector>
        <Pressable
          onPress={onClose}
          style={[styles.close, { top: topInset + 12 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close image preview"
        >
          <Icon name="x" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,14,12,0.92)',
  },
  surface: {
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  close: {
    position: 'absolute',
    right: 18,
    padding: 8,
  },
});
