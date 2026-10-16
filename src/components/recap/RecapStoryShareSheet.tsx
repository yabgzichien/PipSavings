import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../i18n';
import { sceneHasAmounts, type RecapStoryModel, type RecapStoryScene } from '../../lib/recapStory';
import { recapStoryCaptureAdapter } from '../../lib/recapStoryCapture';
import { RECAP_STORY_DOWNLOAD_FILENAME } from '../../lib/recapStoryExport';
import type { WidgetMascotConfig } from '../../widget/mascot/config';
import { radius, spacing } from '../../theme';
import { STORY_LOGICAL_HEIGHT, STORY_LOGICAL_WIDTH } from '../../lib/recapStoryTheme';
import { Body, Label, Title } from '../ui';
import { RecapStoryFrame } from './RecapStoryFrame';
import { RecapStoryExportSurface } from './RecapStoryExportSurface';

type SceneId = RecapStoryScene['id'];
type ExportAction = 'share' | 'save' | 'download';
type ResultState =
  | { kind: 'idle' }
  | { kind: 'share-unavailable' }
  | { kind: 'permission-denied' }
  | { kind: 'capture-failed' }
  | { kind: 'partial'; saved: number; selected: number }
  | { kind: 'saved' }
  | { kind: 'instagram-unavailable' };

export interface RecapStoryShareSheetProps {
  model: RecapStoryModel;
  mascotConfig: WidgetMascotConfig;
  monthLabel: string;
  categoryLabel: (categoryId: string) => string;
  initialSceneId?: SceneId;
  onClose: () => void;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function cleanupUris(uris: readonly string[]): Promise<void> {
  for (const uri of uris) {
    try {
      await recapStoryCaptureAdapter.cleanup(uri);
    } catch {
      // Cleanup remains best effort, and a failed file cannot strand later files.
    }
  }
}

function SheetButton({ label, onPress, disabled = false, emphasized = false }: {
  label: string; onPress: () => void; disabled?: boolean; emphasized?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={[styles.button, emphasized && styles.primary, disabled && styles.disabled]}>
    <Label color={emphasized ? '#FFFFFF' : '#191919'}>{label}</Label>
  </Pressable>;
}

export function RecapStoryShareSheet({ model, mascotConfig, monthLabel, categoryLabel,
  initialSceneId, onClose }: RecapStoryShareSheetProps) {
  const { t, isZh } = useLanguage();
  const insets = useSafeAreaInsets();
  const [selectedIds, setSelectedIds] = useState<SceneId[]>(() => {
    if (initialSceneId && model.scenes.some((scene) => scene.id === initialSceneId)) return [initialSceneId];
    const defaults = model.scenes.filter((scene) => model.defaultSelectedSceneIds.includes(scene.id)).map((scene) => scene.id);
    return (defaults.length ? defaults : [model.scenes[0].id]).slice(0, Platform.OS === 'web' ? 1 : model.scenes.length);
  });
  const [exportSceneId, setExportSceneId] = useState<SceneId>(() => initialSceneId
    ?? model.defaultSelectedSceneIds[0]
    ?? model.scenes[0].id);
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'capturing'>('idle');
  const [result, setResult] = useState<ResultState>({ kind: 'idle' });
  // Share-time privacy lives only as long as this sheet: every session starts with amounts shown.
  const [hiddenAmountIds, setHiddenAmountIds] = useState<SceneId[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);
  const exportRef = useRef<React.ComponentRef<typeof View>>(null);
  const running = useRef(false);
  const cancelRequested = useRef(false);
  const mounted = useRef(true);
  const lastAttempt = useRef<{ action: ExportAction; sceneId?: SceneId }>({ action: 'save' });
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const exportScene = model.scenes.find((scene) => scene.id === exportSceneId) ?? model.scenes[0];
  const amountSceneIds = model.scenes.filter(sceneHasAmounts).map((scene) => scene.id);
  const hiddenSet = new Set(hiddenAmountIds);
  const allAmountsHidden = amountSceneIds.length > 0 && amountSceneIds.every((id) => hiddenSet.has(id));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRequested.current = true;
    };
  }, []);

  function toggleScene(sceneId: SceneId) {
    if (running.current) return;
    setResult({ kind: 'idle' });
    if (Platform.OS === 'web') {
      setSelectedIds([sceneId]);
      return;
    }
    if (selectedSet.has(sceneId)) {
      if (selectedIds.length === 1) {
        AccessibilityInfo.announceForAccessibility(isZh ? '至少保留一张卡片。' : 'Keep at least one card selected.');
        return;
      }
      setSelectedIds(selectedIds.filter((id) => id !== sceneId));
      return;
    }
    if (selectedIds.length >= model.scenes.length) {
      AccessibilityInfo.announceForAccessibility(
        isZh ? `最多选择 ${model.scenes.length} 张卡片。` : `Choose up to ${model.scenes.length} cards.`
      );
      return;
    }
    const wanted = new Set([...selectedIds, sceneId]);
    setSelectedIds(model.scenes.filter((scene) => wanted.has(scene.id)).map((scene) => scene.id));
  }

  function toggleAmounts(sceneId: SceneId) {
    if (running.current) return;
    setHiddenAmountIds(hiddenSet.has(sceneId) ? hiddenAmountIds.filter((id) => id !== sceneId) : [...hiddenAmountIds, sceneId]);
  }

  function toggleAllAmounts() {
    if (running.current) return;
    setHiddenAmountIds(allAmountsHidden ? [] : amountSceneIds);
  }

  function checkCancelled() {
    if (cancelRequested.current || !mounted.current) throw new Error('capture-cancelled');
  }

  async function renderAndCapture(sceneId: SceneId): Promise<string> {
    checkCancelled();
    setExportSceneId(sceneId);
    await nextFrame();
    checkCancelled();
    await nextFrame();
    checkCancelled();
    if (!exportRef.current) throw new Error('capture-surface-unavailable');
    return recapStoryCaptureAdapter.capture(exportRef.current);
  }

  async function runExport(action: ExportAction, sceneId?: SceneId) {
    if (running.current || !mounted.current || selectedIds.length === 0) return;
    if (Platform.OS === 'web' && action !== 'download') return;
    if (action === 'download' && selectedIds.length !== 1) return;
    running.current = true;
    cancelRequested.current = false;
    lastAttempt.current = { action, sceneId };
    setCaptureStatus('capturing');
    setResult({ kind: 'idle' });
    const attempted = action === 'save' ? [...selectedIds] : [sceneId ?? selectedIds[0]];
    const captures: { id: SceneId; uri: string }[] = [];
    try {
      if (action === 'share') {
        const available = await recapStoryCaptureAdapter.canShare();
        checkCancelled();
        if (!available) {
          setResult({ kind: 'share-unavailable' });
          return;
        }
      }
      if (action === 'save') {
        const permission = await recapStoryCaptureAdapter.requestSavePermission();
        checkCancelled();
        if (permission === 'denied') {
          setResult({ kind: 'permission-denied' });
          return;
        }
      }
      // The single surface is reused only after each capture resolves. Collect
      // every returned URI before checking cancellation so it is always cleaned.
      for (const id of attempted) {
        const uri = await renderAndCapture(id);
        captures.push({ id, uri });
        checkCancelled();
      }
      if (action === 'share') {
        await recapStoryCaptureAdapter.share(captures[0].uri);
        return;
      }
      if (action === 'download') {
        await recapStoryCaptureAdapter.download(captures[0].uri, RECAP_STORY_DOWNLOAD_FILENAME);
        return;
      }
      const failed: SceneId[] = [];
      let saved = 0;
      for (const capture of captures) {
        try {
          await recapStoryCaptureAdapter.save(capture.uri);
          saved += 1;
        } catch {
          failed.push(capture.id);
        }
        checkCancelled();
      }
      if (cancelRequested.current || !mounted.current) return;
      if (failed.length) {
        setSelectedIds(failed);
        setResult({ kind: 'partial', saved, selected: attempted.length });
      } else {
        setResult({ kind: 'saved' });
      }
    } catch {
      if (!cancelRequested.current && mounted.current) setResult({ kind: 'capture-failed' });
    } finally {
      await cleanupUris(captures.map(({ uri }) => uri));
      running.current = false;
      if (mounted.current) setCaptureStatus('idle');
      if (cancelRequested.current && mounted.current) onClose();
    }
  }

  function stopAndClose() {
    if (!mounted.current) return;
    setConfirmClose(false);
    cancelRequested.current = true;
    if (!running.current) onClose();
  }

  function requestClose() {
    if (!running.current) {
      onClose();
      return;
    }
    // React Native Web's Alert.alert is a no-op; render its confirmation here.
    if (Platform.OS === 'web') {
      setConfirmClose(true);
      return;
    }
    Alert.alert(t('recapStoryCloseCaptureTitle'), t('recapStoryCloseCaptureBody'), [
      { text: isZh ? '继续保存' : 'Keep saving', style: 'cancel' },
      { text: isZh ? '停止并关闭' : 'Stop and close', style: 'destructive', onPress: stopAndClose },
    ]);
  }

  const resultMessage = result.kind === 'share-unavailable' ? t('recapStoryShareUnavailable')
    : result.kind === 'permission-denied'
      ? (isZh ? '照片权限仅用于批量保存卡片；你仍可分享一张卡片。' : 'Photos access is only needed to save cards in a batch; you can still share one card.')
      : result.kind === 'capture-failed' ? t('recapStoryCaptureFailed')
      : result.kind === 'partial'
        ? (isZh ? `已保存 ${result.saved} / ${result.selected} 张卡片` : `${result.saved} of ${result.selected} cards saved`)
        : result.kind === 'saved' ? t('recapStorySavedToPhotos')
        : result.kind === 'instagram-unavailable'
          ? `${t('recapStorySavedToPhotos')}. ${isZh ? '未安装 Instagram，或暂时无法打开。' : 'Instagram is not installed or could not be opened.'}`
          : '';
  const sceneLabels: Record<SceneId, string> = isZh
    ? { ritual: '每月仪式', topSpot: '第一名', foodPodium: '美食领奖台', shoppingRegular: '常逛的店', discoveries: '新发现',
      rideOrDie: '铁杆老主顾', ghosted: '被冷落的它', biggestDay: '花得最多的一天', spotlight: '特别故事',
      versusLastMonth: '和上个月比', finale: '你的这个月' }
    : { ritual: 'Monthly ritual', topSpot: '#1 spot', foodPodium: 'Food podium', shoppingRegular: 'Go-to shop',
      discoveries: 'New discoveries', rideOrDie: 'Ride or die', ghosted: 'The one you ghosted', biggestDay: 'Biggest day',
      spotlight: 'Special story', versusLastMonth: 'Versus last month', finale: 'Your month' };

  return <Modal transparent animationType="slide" visible onRequestClose={requestClose}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(spacing.base, insets.bottom) }]}>
        <View style={styles.header}>
          <Title color="#191919">{isZh ? '选择卡片' : 'Choose cards'}</Title>
          <SheetButton label={isZh ? '关闭分享选项' : 'Close share options'} onPress={requestClose} />
        </View>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentSpacing}>
        <Label color="#555555">{isZh ? `已选择 ${selectedIds.length} / ${Platform.OS === 'web' ? 1 : model.scenes.length} 张`
          : `${selectedIds.length} of ${Platform.OS === 'web' ? 1 : model.scenes.length} selected`}</Label>
        <ScrollView horizontal contentContainerStyle={styles.choices} showsHorizontalScrollIndicator={false}>
          {model.scenes.map((scene) => {
            const checked = selectedSet.has(scene.id);
            const hidden = hiddenSet.has(scene.id);
            const label = `${sceneLabels[scene.id]}. ${checked ? (isZh ? '已选择' : 'Selected') : (isZh ? '未选择' : 'Not selected')}`;
            return <View key={scene.id} style={styles.choiceColumn}>
              <Pressable testID={`story-choice-${scene.id}`} accessibilityRole="checkbox"
                accessibilityLabel={label} accessibilityState={{ checked, disabled: captureStatus === 'capturing' }}
                disabled={captureStatus === 'capturing'} onPress={() => toggleScene(scene.id)}
                style={[styles.choice, checked && styles.choiceSelected]}>
                <View pointerEvents="none" style={styles.thumbnailViewport}>
                  <View style={styles.thumbnailScale}>
                    <RecapStoryFrame scene={scene} mode="export" motion="off" mascotConfig={mascotConfig}
                      monthLabel={monthLabel} categoryLabel={categoryLabel} month={model.month}
                      currency={model.currency} hideAmounts={hidden} />
                  </View>
                </View>
                <View style={styles.choiceLabel}><Label color="#191919">{checked ? '✓ ' : '○ '}{sceneLabels[scene.id]}</Label></View>
              </Pressable>
              {sceneHasAmounts(scene) && <Pressable testID={`story-amounts-${scene.id}`} accessibilityRole="switch"
                accessibilityLabel={t(hidden ? 'recapStory_amountsHidden' : 'recapStory_amountsShown')}
                accessibilityState={{ checked: hidden, disabled: captureStatus === 'capturing' }}
                disabled={captureStatus === 'capturing'} onPress={() => toggleAmounts(scene.id)}
                style={[styles.amountSwitch, hidden && styles.amountSwitchOn]}>
                <Label color={hidden ? '#FFFFFF' : '#191919'}>
                  {`${hidden ? '•••• ' : ''}${t(hidden ? 'recapStory_amountsHidden' : 'recapStory_amountsShown')}`}
                </Label>
              </Pressable>}
            </View>;
          })}
        </ScrollView>
        {amountSceneIds.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={t('recapStory_hideAllAmounts')}
          accessibilityState={{ checked: allAmountsHidden, disabled: captureStatus === 'capturing' }}
          disabled={captureStatus === 'capturing'} onPress={toggleAllAmounts}
          style={[styles.button, styles.hideAll, allAmountsHidden && styles.amountSwitchOn]}>
          <Label color={allAmountsHidden ? '#FFFFFF' : '#191919'}>{`${allAmountsHidden ? '✓ ' : '○ '}${t('recapStory_hideAllAmounts')}`}</Label>
        </Pressable>}
        {!!resultMessage && <View accessibilityLiveRegion="polite"><Body color="#191919">{resultMessage}</Body></View>}
        {confirmClose && <View accessibilityRole="alert" style={styles.disclosure}>
          <Title color="#191919">{t('recapStoryCloseCaptureTitle')}</Title>
          <Body color="#191919">{t('recapStoryCloseCaptureBody')}</Body>
          <SheetButton label={isZh ? '继续保存' : 'Keep saving'} onPress={() => setConfirmClose(false)} />
          <SheetButton label={isZh ? '停止并关闭' : 'Stop and close'} onPress={stopAndClose} />
        </View>}
        </ScrollView>
        <View style={styles.actions}>
          {Platform.OS === 'web'
            ? <SheetButton label={isZh ? '下载卡片' : 'Download card'} onPress={() => runExport('download')} disabled={captureStatus === 'capturing'} emphasized />
            : <>
              {selectedIds.length === 1 && <SheetButton label={t('recapStoryShareCard')} onPress={() => runExport('share')} disabled={captureStatus === 'capturing'} />}
              <SheetButton label={isZh ? '保存所选卡片' : 'Save selected cards'} onPress={() => runExport('save')}
                disabled={captureStatus === 'capturing'} emphasized={result.kind === 'share-unavailable'} />
            </>}
          {(result.kind === 'capture-failed' || result.kind === 'partial')
            && <SheetButton label={isZh ? '重试' : 'Retry'} onPress={() => runExport(lastAttempt.current.action, lastAttempt.current.sceneId)} disabled={captureStatus === 'capturing'} />}
          {Platform.OS !== 'web' && (result.kind === 'capture-failed' || result.kind === 'permission-denied') && selectedIds.length > 1
            && <SheetButton label={isZh ? '分享一张卡片' : 'Share one card'} onPress={() => runExport('share', selectedIds[0])} disabled={captureStatus === 'capturing'} />}
          {Platform.OS !== 'web' && (result.kind === 'saved' || result.kind === 'instagram-unavailable')
            && <SheetButton label={t('recapStoryOpenInstagram')} onPress={async () => {
              try {
                if (!(await recapStoryCaptureAdapter.openInstagram()) && mounted.current) setResult({ kind: 'instagram-unavailable' });
              } catch {
                if (mounted.current) setResult({ kind: 'instagram-unavailable' });
              }
            }} />}
        </View>
      </View>
      <RecapStoryExportSurface ref={exportRef} scene={exportScene} mascotConfig={mascotConfig}
        monthLabel={monthLabel} categoryLabel={categoryLabel} month={model.month}
        currency={model.currency} hideAmounts={hiddenSet.has(exportScene.id)} />
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.44)' },
  sheet: { maxHeight: '86%', backgroundColor: '#FFFFFF', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg, paddingHorizontal: spacing.base, gap: spacing.md, overflow: 'hidden' },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  content: { flexShrink: 1 },
  contentSpacing: { gap: spacing.md },
  choices: { gap: spacing.md, paddingVertical: spacing.xs },
  choiceColumn: { width: 120, gap: spacing.xs },
  choice: { minWidth: 120, minHeight: 44, width: 120, borderWidth: 2, borderColor: '#D7D2CB', borderRadius: radius.sm,
    padding: spacing.sm, gap: spacing.sm, overflow: 'hidden' },
  choiceSelected: { borderColor: '#5B3FD6', borderWidth: 3 },
  thumbnailViewport: { width: 96, height: 96 * STORY_LOGICAL_HEIGHT / STORY_LOGICAL_WIDTH, overflow: 'hidden', borderRadius: radius.sm },
  thumbnailScale: { width: STORY_LOGICAL_WIDTH, height: STORY_LOGICAL_HEIGHT, transform: [{ scale: 96 / STORY_LOGICAL_WIDTH }], transformOrigin: 'top left' },
  choiceLabel: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  amountSwitch: { minWidth: 44, minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: '#BBB4AA',
    paddingHorizontal: spacing.sm, justifyContent: 'center', alignItems: 'center' },
  amountSwitchOn: { backgroundColor: '#191919', borderColor: '#191919' },
  hideAll: { alignSelf: 'flex-start' },
  disclosure: { borderRadius: radius.sm, backgroundColor: '#F3F0FF', padding: spacing.base, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: { minWidth: 44, minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: '#BBB4AA',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md, justifyContent: 'center', alignItems: 'center' },
  primary: { backgroundColor: '#5B3FD6', borderColor: '#5B3FD6' },
  disabled: { opacity: 0.5 },
});
