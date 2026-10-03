import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../i18n';
import type { RecapStoryModel, RecapStoryScene } from '../../lib/recapStory';
import { createPlaybackState, recapStoryPlaybackReducer, STORY_DURATION_MS, storyAutoplays,
  type PlaybackEvent } from '../../lib/recapStoryPlayback';
import { STORY_LOGICAL_HEIGHT, STORY_LOGICAL_WIDTH } from '../../lib/recapStoryTheme';
import { pauseStoryIntro, resumeStoryIntro, stopStoryIntro, storyIntro } from '../../lib/sound';
import { useAppData } from '../../state/store';
import { useReducedMotion } from '../../state/useReducedMotion';
import type { WidgetMascotConfig } from '../../widget/mascot/config';
import { Icon, type IconName } from '../Icon';
import { Label } from '../ui';
import { RecapStoryFrame } from './RecapStoryFrame';
import { RecapStoryShareSheet } from './RecapStoryShareSheet';

export interface RecapStoryModalProps {
  visible: boolean;
  model: RecapStoryModel;
  mascotConfig: WidgetMascotConfig;
  onClose: () => void;
  onShareScene?: (sceneId: RecapStoryScene['id']) => void;
  onChooseCards?: () => void;
}

/** Conditional mounting makes playback and mute belong only to the current viewing session. */
export function RecapStoryModal(props: RecapStoryModalProps) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { if (!props.visible) setDismissed(false); }, [props.visible]);
  if (!props.visible || dismissed || props.model.scenes.length === 0) return null;
  return <StorySession key={props.model.month} {...props} onClose={() => {
    setDismissed(true);
    props.onClose();
  }} />;
}

function IconControl({ label, hint, icon, onPress }: {
  label: string; hint: string; icon: IconName; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
    onPress={onPress} hitSlop={8} style={styles.control}>
    <Icon name={icon} size={22} color="#FFFFFF" />
  </Pressable>;
}

function StorySession({ model, mascotConfig, onClose, onShareScene }: RecapStoryModalProps) {
  const { motionSetting, catById, transactions = [] } = useAppData();
  const reduced = useReducedMotion();
  const { t, tCat, isZh, formatMonthLabel } = useLanguage();
  const insets = useSafeAreaInsets();
  const autoplay = storyAutoplays(motionSetting, reduced);
  const motion = motionSetting === 'off' ? 'off' : autoplay ? 'full' : 'reduced';
  const [state, dispatch] = useReducer(recapStoryPlaybackReducer, undefined, createPlaybackState);
  // Navigation to the same clamped index still creates a fresh five-second card.
  const [restart, setRestart] = useState(0);
  const progress = useMemo(() => new Animated.Value(0), [state.index, state.cycle, restart]);
  const pausedProgress = useRef(0);
  const playedCycle = useRef<number | null>(null);
  const soundActive = useRef(false);
  const hold = useRef<{ started: number } | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [sessionModel, setSessionModel] = useState(model);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [shareInitialSceneId, setShareInitialSceneId] = useState<RecapStoryScene['id'] | undefined>(undefined);

  useEffect(() => { setSessionModel(model); }, [model]);

  const total = sessionModel.scenes.length;
  const scene = sessionModel.scenes[state.index] ?? sessionModel.scenes[0];
  const position = `${state.index + 1} of ${total}`;
  const status = state.paused ? (isZh ? '已暂停' : 'Paused') : position;
  const scale = Math.max(0, Math.min(stage.width / STORY_LOGICAL_WIDTH, stage.height / STORY_LOGICAL_HEIGHT));

  useEffect(() => { pausedProgress.current = 0; }, [progress]);

  useEffect(() => {
    if (!autoplay || state.paused || state.completed) return;
    let active = true;
    const animation = Animated.timing(progress, {
      toValue: 1, duration: (1 - pausedProgress.current) * STORY_DURATION_MS,
      easing: Easing.linear, useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (active && finished) dispatch({ type: 'TICK_COMPLETE', total });
    });
    return () => {
      active = false;
      progress.stopAnimation((value) => { pausedProgress.current = value; });
    };
  }, [progress, autoplay, state.paused, state.completed, total]);

  useEffect(() => {
    if (!autoplay || state.muted || state.completed) {
      if (soundActive.current) {
        soundActive.current = false;
        if (!autoplay || state.completed) {
          stopStoryIntro();
        } else {
          pauseStoryIntro();
        }
      }
      return;
    }

    if (playedCycle.current !== state.cycle) {
      playedCycle.current = state.cycle;
      soundActive.current = true;
      storyIntro(sessionModel.month);
    } else if (!soundActive.current) {
      soundActive.current = true;
      resumeStoryIntro();
    }
  }, [autoplay, state.muted, state.completed, state.cycle, sessionModel.month]);

  useEffect(() => {
    return () => {
      soundActive.current = false;
      stopStoryIntro();
    };
  }, []);

  function navigate(event: PlaybackEvent) {
    progress.stopAnimation();
    setRestart((value) => value + 1);
    dispatch(event);
  }

  function pause() {
    progress.stopAnimation((value) => { pausedProgress.current = value; });
    if (soundActive.current) pauseStoryIntro();
    dispatch({ type: 'PAUSE' });
  }

  function resume() {
    if (soundActive.current && autoplay && !state.muted) resumeStoryIntro();
    dispatch({ type: 'RESUME' });
  }

  function openShareCurrent() {
    pause();
    onShareScene?.(scene.id);
    setShareInitialSceneId(scene.id);
    setShareSheetVisible(true);
  }

  function handleMerchantCameo(merchant: string) {
    setSessionModel((current) => ({
      ...current,
      scenes: current.scenes.map((s) =>
        s.type === 'pattern' ? { ...s, merchantCameo: merchant } : s
      ),
    }));
  }

  const getCategoryLabel = (id: string) => catById[id] ? tCat(catById[id]) : (isZh ? '未分类' : 'Uncategorized');

  // The responder owns a native interaction handle from grant through release.
  // Keep that owner stable while its handlers read the latest scene and callbacks.
  const gestureActions = useRef({ paused: state.paused, scale, total, pause, resume, navigate });
  gestureActions.current = { paused: state.paused, scale, total, pause, resume, navigate };
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => {
      hold.current = { started: Date.now() };
    },
    onPanResponderRelease: (event, gesture) => {
      const { navigate, total, scale, paused, pause, resume } = gestureActions.current;
      const held = hold.current;
      if (!held) return;
      hold.current = null;
      if (Math.abs(gesture.dx) >= 48 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
        navigate(gesture.dx < 0 ? { type: 'NEXT', total } : { type: 'PREVIOUS' });
        return;
      }
      if (Date.now() - held.started >= 250 || Math.abs(gesture.dy) >= 48) return;
      const width = STORY_LOGICAL_WIDTH * scale;
      const x = event.nativeEvent.locationX;
      if (x < width / 3) navigate({ type: 'PREVIOUS' });
      else if (x > (width * 2) / 3) navigate({ type: 'NEXT', total });
      else if (paused) resume();
      else pause();
    },
    onPanResponderTerminate: () => { hold.current = null; },
    onPanResponderTerminationRequest: () => true,
  }));

  return <Modal visible animationType="none" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View accessibilityViewIsModal style={[styles.surround, {
      paddingTop: insets.top, paddingBottom: insets.bottom,
      paddingLeft: insets.left, paddingRight: insets.right,
    }]}>
      <View style={styles.toolbar}>
        <IconControl icon={state.muted ? 'speakerOff' : 'speaker'}
          label={t(state.muted ? 'recapStoryUnmute' : 'recapStoryMute')}
          hint={isZh ? '切换本次故事的声音' : 'Toggle sound for this viewing session'}
          onPress={() => dispatch({ type: 'TOGGLE_MUTE' })} />
        <IconControl icon="x" label={t('close')} hint={isZh ? '关闭故事' : 'Close the story'} onPress={onClose} />
      </View>
      <View testID="story-progress" accessibilityRole="progressbar" accessibilityLabel={position}
        accessibilityValue={{ min: 0, max: 100, now: state.completed ? 100 : Math.round(state.index / total * 100) }}
        style={styles.segments}>
        {sessionModel.scenes.map((card, index) => <View key={card.id} style={styles.segment}>
          <Animated.View style={[styles.fill, { width: index < state.index || state.completed ? '100%'
            : index === state.index ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%' }]} />
        </View>)}
      </View>
      <View testID="story-stage" style={styles.stage} onLayout={({ nativeEvent: { layout } }) => {
        setStage({ width: layout.width, height: layout.height });
      }}>
        <View testID="story-scaled-bounds" style={{ width: STORY_LOGICAL_WIDTH * scale,
          height: STORY_LOGICAL_HEIGHT * scale }}>
          <View style={{ width: STORY_LOGICAL_WIDTH, height: STORY_LOGICAL_HEIGHT,
            transform: [{ scale }], transformOrigin: 'top left' }}>
            <RecapStoryFrame scene={scene} mode="animated" motion={motion} progress={progress}
              mascotConfig={mascotConfig} monthLabel={formatMonthLabel(sessionModel.month)}
              categoryLabel={getCategoryLabel}
              accessibilityPositionLabel={position}
              month={sessionModel.month} />
          </View>
          {/* Receive touches in the displayed rectangle's coordinate system, independent
              of which text or illustration lies beneath the finger. */}
          <View testID="story-gesture-surface" accessible={false} importantForAccessibility="no"
            style={StyleSheet.absoluteFillObject} {...responder.panHandlers} />
        </View>
      </View>
      <View style={styles.footer}>
        <View style={styles.footerSide} />
        <View testID="story-status" accessible accessibilityLiveRegion="polite" accessibilityLabel={status}
          style={styles.status}><Label color="#FFFFFF">{position}</Label></View>
        <View style={styles.footerSide}>
          <IconControl icon="share" label={t('recapStoryShareCard')}
            hint={isZh ? '分享当前卡片' : 'Share the current card'} onPress={openShareCurrent} />
        </View>
      </View>
      {shareSheetVisible && <RecapStoryShareSheet
        model={sessionModel}
        transactions={transactions}
        mascotConfig={mascotConfig}
        monthLabel={formatMonthLabel(sessionModel.month)}
        categoryLabel={getCategoryLabel}
        initialSceneId={shareInitialSceneId}
        onClose={() => setShareSheetVisible(false)}
        onMerchantCameo={handleMerchantCameo}
      />}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  surround: { flex: 1, backgroundColor: '#000000' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  footerSide: { width: 44, alignItems: 'flex-end' },
  control: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
  segment: { flex: 1, height: 4, backgroundColor: '#555555', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#FFFFFF' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  status: { flex: 1, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
});
