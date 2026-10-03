// src/components/TourSpotlight.tsx
// Guided onboarding spotlight overlay with darkened background, pulsating halo, and coach bubble.
// Renders four tiled dark panes around the targeted element cutout, keeping the control under it natively clickable.
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { spotlightFrames, type SpotlightRect } from '../lib/spotlight';
import { getTourAnchor, onTourAnchor, type AnchorReport } from '../lib/tourAnchorRect';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { platformShadow, radius, shadowCard, spacing, uiFont } from '../theme';
import { Pip } from './Pip';
import { Icon } from './Icon';

const CUTOUT_PADDING = 8;
const DIM_OPACITY = 0.65;

function rectStyle(r: SpotlightRect) {
  return { left: r.x, top: r.y, width: r.width, height: r.height };
}

export interface TourStepInfo {
  id: string;
  anchorId: string;
  stepNumber?: number;
  totalSteps?: number;
  badgeLabel?: string;
  title: string;
  body: string;
  showNext?: boolean;
  onNext?: () => void;
  onSkip?: () => void;
}

export function TourSpotlight({
  step,
  onDimPress,
}: {
  step: TourStepInfo | null;
  onDimPress?: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const [report, setReport] = useState<AnchorReport | null>(() => getTourAnchor());
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [frameOffset, setFrameOffset] = useState({ x: 0, y: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);
  const rootRef = useRef<View>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => onTourAnchor(setReport), []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) =>
      setReduceMotion(!!v)
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const useNative = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: useNative }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse]);

  useEffect(() => {
    rootRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setFrameOffset({ x, y });
        setFrameSize({ width, height });
      }
    });
  }, [report, step]);

  if (!step) return null;

  const local =
    report && report.id === step.anchorId && frameSize
      ? {
          x: report.rect.x - frameOffset.x,
          y: report.rect.y - frameOffset.y,
          width: report.rect.width,
          height: report.rect.height,
        }
      : null;
  const isCircle =
    step.anchorId === 'tour_plus_btn' ||
    step.anchorId === 'tour_split_info' ||
    step.anchorId === 'tour_recap_btn';
  const padding = isCircle ? 4 : CUTOUT_PADDING;
  const frames = frameSize ? spotlightFrames(frameSize, local, padding) : null;
  const cutout = frames?.cutout ?? null;

  // Decide coach card position (above or below cutout)
  const isTargetBottom = cutout && frameSize ? cutout.y > frameSize.height * 0.45 : true;

  const isFinalStep =
    !step.totalSteps ||
    step.stepNumber == null ||
    step.stepNumber === step.totalSteps;
  const nextLabel = isFinalStep ? t('tourGotIt') : t('tourNext');

  return (
    <View
      ref={rootRef}
      style={[StyleSheet.absoluteFill, { zIndex: 99 }]}
      pointerEvents="box-none"
      importantForAccessibility="no-hide-descendants"
    >
      {/* 4 Dim Panes around the cutout */}
      {frames && (
        <>
          {[frames.top, frames.bottom, frames.left, frames.right].map((r, i) => (
            <Pressable
              key={i}
              onPress={onDimPress ?? step.onNext}
              style={[
                styles.dim,
                rectStyle(r),
                { backgroundColor: '#000' },
              ]}
            />
          ))}

          {/* Animated Pulsating Halo around Cutout */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              rectStyle(frames.cutout),
              {
                borderRadius: isCircle ? 999 : radius.md,
                opacity: pulse,
                borderColor: theme.accent,
                ...platformShadow(theme.accent, 0.7, 14, { width: 0, height: 0 }, 0),
              },
            ]}
          />
        </>
      )}

      {/* Floating Pip Coach Card */}
      <View
        pointerEvents="box-none"
        style={[
          styles.coachCardContainer,
          isTargetBottom ? { bottom: cutout ? (frameSize ? frameSize.height - cutout.y + 12 : 90) : 100 } : { top: cutout ? cutout.y + cutout.height + 12 : 120 },
        ]}
      >
        <View
          style={[
            styles.coachCard,
            {
              backgroundColor: colorTheme.surface,
              borderColor: theme.accentSoft,
            },
          ]}
        >
          {/* Header Row */}
          <View style={styles.coachHead}>
            <Pip size={44} expr="curious" />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <View style={styles.stepBadgeRow}>
                <View style={[styles.stepBadge, { backgroundColor: theme.accentTint }]}>
                  <Text style={[styles.stepBadgeText, { color: theme.accent }]}>
                    {step.badgeLabel
                      ? step.badgeLabel
                      : step.stepNumber != null && step.totalSteps != null
                      ? isZh
                        ? `步骤 ${step.stepNumber}/${step.totalSteps}`
                        : `Step ${step.stepNumber} of ${step.totalSteps}`
                      : isZh
                      ? '探索指南'
                      : 'Feature Guide'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.coachTitle, { color: colorTheme.ink }]}>{step.title}</Text>
            </View>
            {step.onSkip && (
              <Pressable onPress={step.onSkip} hitSlop={8} style={styles.skipBtn}>
                <Icon name="x" size={16} color={colorTheme.ink3} />
              </Pressable>
            )}
          </View>

          {/* Body */}
          <Text style={[styles.coachBody, { color: colorTheme.ink2 }]}>{step.body}</Text>

          {/* Action Row */}
          <View style={styles.coachActions}>
            {step.onSkip && (
              <Pressable onPress={step.onSkip} hitSlop={6} style={styles.skipTextBtn}>
                <Text style={[styles.skipText, { color: colorTheme.ink3 }]}>{t('tourSkip')}</Text>
              </Pressable>
            )}
            {step.showNext && step.onNext && (
              <Pressable
                onPress={step.onNext}
                style={({ pressed }) => [
                  styles.nextBtn,
                  { backgroundColor: theme.accent },
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={[styles.nextBtnText, { color: theme.onAccent }]}>{nextLabel}</Text>
                <Icon name={isFinalStep ? 'check' : 'arrowRight'} size={14} color={theme.onAccent} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    opacity: DIM_OPACITY,
  },
  halo: {
    position: 'absolute',
    borderRadius: radius.md,
    borderWidth: 3,
  },
  coachCardContainer: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    alignItems: 'center',
  },
  coachCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.base,
    ...shadowCard,
  },
  coachHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepBadgeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  stepBadgeText: {
    fontFamily: uiFont(700),
    fontSize: 10.5,
  },
  coachTitle: {
    fontFamily: uiFont(700),
    fontSize: 16,
    lineHeight: 20,
  },
  skipBtn: {
    padding: 4,
  },
  coachBody: {
    fontFamily: uiFont(500),
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  coachActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  skipTextBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: uiFont(500),
    fontSize: 12.5,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    marginLeft: 'auto',
  },
  nextBtnText: {
    fontFamily: uiFont(700),
    fontSize: 13,
  },
});
