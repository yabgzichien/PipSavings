import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Image as RNImage, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { B, Body, BubbleText, Caption, Label, PipSays, TopBar } from '../components/ui';
import { QuickAddField } from '../components/QuickAddField';
import { scanDocument } from '../lib/documentScanner';
import { TourAnchor } from '../components/TourAnchor';
import { notify } from '../lib/platformAlert';
import { SAMPLE_STATEMENTS } from '../data/sampleStatements';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { radius, spacing } from '../theme';

export interface PickedImage {
  uri: string;
  base64: string;
  mime: string;
}

/**
 * The add hub. Screenshot-of-an-app-you-already-have-open is the mechanism the business plan
 * leads with (docs/ui-design-plan.md §5) — a competitor already owns "AI reads a receipt", not
 * "reads whatever's already on your screen" — so scanning is first and open by default, not
 * collapsed behind an accordion.
 *
 * There is exactly ONE scan row. It used to be two ("statement or e-wallet" and "receipt"),
 * which read as duplicates and made the user classify the document before the camera even
 * opened. Now every capture hands off to ScanKindScreen, which asks which it was — a question
 * you can only answer sensibly once you're looking at the thing you photographed. Manual entry
 * follows as a quiet secondary row, so only the scan card carries the loud dashed drop-target
 * styling.
 */
export function AttachScreen({
  hasKey,
  onClose,
  onPicked,
  onManual,
  onQuickAdd,
  quickBusy,
  quickError,
  showSamples = false,
  isTutorial = false,
  activeTourAnchor = null,
}: {
  hasKey: boolean;
  onClose: () => void;
  onPicked: (img: PickedImage) => void;
  onManual: () => void;
  /** Hands the raw typed line to AddFlow, which owns parsing and routing. */
  onQuickAdd: (text: string) => void;
  quickBusy: boolean;
  quickError: string | null;
  /** Offer the bundled demo statements as one-tap samples (used during the judge tour)
   *  alongside the real upload options, so the app never injects an image on its own. */
  showSamples?: boolean;
  /** When true, formats Pip's speech bubble to guide the new user through their first scan. */
  isTutorial?: boolean;
  activeTourAnchor?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const [busy, setBusy] = useState(false);
  const effectiveShowSamples = showSamples || isTutorial;
  // Camera-vs-gallery is a detail of HOW you hand the image over, not a separate thing to add.
  // Expanded by default: scanning is the differentiator (see file header), so it should never
  // need an extra tap to reveal its own options.
  const [scanOpen, setScanOpen] = useState(true);
  useEffect(() => {
    if (effectiveShowSamples) setScanOpen(true);
  }, [effectiveShowSamples]);

  const handleResult = (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.uri && !a.base64) {
      notify('Hmm', isZh ? '无法读取该图片，请尝试其他图片。' : "That image couldn't be read. Try another one.");
      return;
    }
    onPicked({ uri: a.uri, base64: a.base64 || '', mime: a.mimeType ?? 'image/jpeg' });
  };

  const pickFromLibrary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify(isZh ? '需要权限' : 'Permission needed', isZh ? '请允许访问相册以添加截图。' : 'Allow photo access to attach a screenshot.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      handleResult(res);
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Native builds get the live-edge-detected scanner (a bounding box tracks the statement
      // on screen and crops to it on capture); web has no native side for it and keeps the
      // plain camera picker below. 'unavailable' also falls through here: an Expo Go build
      // without the dev-client native module degrades to the same plain picker rather than
      // dead-ending the user.
      if (Platform.OS !== 'web') {
        const outcome = await scanDocument();
        if (outcome.status === 'picked') {
          onPicked(outcome.image);
          return;
        }
        if (outcome.status === 'cancelled') return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify(isZh ? '需要权限' : 'Permission needed', isZh ? '请允许访问相机以拍摄小票。' : 'Allow camera access to snap a receipt.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      handleResult(res);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <TopBar title={isZh ? '记账' : 'Add transactions'} onBack={onClose} />

        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.sm }}>
          <PipSays expr="curious">
            <BubbleText>
              {isTutorial ? (
                t('tutorialScanCoaching')
              ) : isZh ? (
                <>扫描<B>小票</B>或已打开应用的账单截图，我将自动识别。稍后会询问单据类型。</>
              ) : (
                <>Scan a <B>receipt</B> or a screenshot of the app you already have open, and I’ll read it. I’ll ask which it was afterwards.</>
              )}
            </BubbleText>
          </PipSays>
        </View>

        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
          <QuickAddField onSubmit={onQuickAdd} busy={quickBusy} error={quickError} />
        </View>

        {!hasKey && (
          <Pressable onPress={onManual} style={[styles.keyNotice, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
            <Icon name="sparkles" size={18} color={theme.accentInk} />
            <Body weight={500} color={theme.onTint} style={{ flex: 1 }}>
              {isZh ? '当前暂无法扫描，请尝试手动记账。' : "Scanning isn't available right now. Enter a transaction manually instead."}
            </Body>
            <Icon name="chevronRight" size={16} color={theme.accentInk} />
          </Pressable>
        )}

        <View style={styles.group}>
          <SourceButton
            icon="scan"
            title={isZh ? '扫描' : 'Scan'}
            sub={isZh ? '小票、电子钱包截图或银行对账单' : 'A receipt, an e-wallet screenshot, or a bank statement'}
            onPress={() => setScanOpen((v) => !v)}
            disabled={busy}
            expanded={scanOpen}
            tone="primary"
          />

          {scanOpen && (
            <View style={[styles.nested, { borderLeftColor: theme.accentSoft }]}>
              {effectiveShowSamples && (
                <>
                  <Label weight={700} color={colorTheme.ink3} style={{ marginBottom: spacing.sm }}>
                    {isZh ? '没有现成截图？点击体验示例' : 'NO SCREENSHOT HANDY? TAP A SAMPLE'}
                  </Label>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs, paddingRight: spacing.xs }}
                  >
                    {SAMPLE_STATEMENTS.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => onPicked(s.image)}
                        style={[styles.sampleCard, { backgroundColor: colorTheme.surface, borderColor: theme.accentSoft }]}
                        disabled={busy}
                      >
                        <RNImage source={{ uri: s.image.uri }} style={[styles.sampleThumb, { backgroundColor: theme.accentTint }]} resizeMode="cover" />
                        <View style={{ padding: spacing.md }}>
                          <Label numberOfLines={1}>{s.label}</Label>
                          <Caption color={colorTheme.ink2} numberOfLines={1} style={{ marginTop: spacing.xs }}>{s.provider}</Caption>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Body weight={500} color={colorTheme.ink3} style={{ marginTop: spacing.md }}>
                    {isZh ? '或使用您自己的截图' : 'or use your own'}
                  </Body>
                </>
              )}
              <TourAnchor id="tour_gallery_btn" activeId={activeTourAnchor}>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: effectiveShowSamples ? spacing.md : 0 }}>
                  <MiniButton icon="camera" label={isZh ? '拍照' : 'Take a photo'} onPress={takePhoto} disabled={busy} />
                  <MiniButton icon="gallery" label={isZh ? '从相册选择' : 'From gallery'} onPress={pickFromLibrary} disabled={busy} />
                </View>
              </TourAnchor>
            </View>
          )}
        </View>

        <View style={styles.group}>
          <TourAnchor id="tour_manual_btn" activeId={activeTourAnchor}>
            <SourceButton
              icon="pencil"
              title={isZh ? '手动记账' : 'Enter it manually'}
              sub={isZh ? '手动输入一笔支出或收入' : 'Type one expense or income yourself'}
              onPress={onManual}
              disabled={busy}
              tone="quiet"
            />
          </TourAnchor>
        </View>

        <Caption color={colorTheme.ink2} style={styles.hint}>
          {isZh
            ? '截图仅发送至您选择的 AI 服务商以提取交易明细。快速输入的文字仅在本机无法识别时才会发送。手动记账数据仅保留在您的设备本地。'
            : 'Screenshots are sent to your chosen AI provider only to read the transactions. Quick-add text is sent only when your device can’t read it locally. Manual entries stay on your device.'}
        </Caption>
      </ScrollView>
    </View>
  );
}

function SourceButton({
  icon,
  title,
  sub,
  onPress,
  disabled,
  expanded,
  tone = 'quiet',
}: {
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
  /** Set on a row that opens options in place — the chevron then points down/up rather than
   *  right, so it never promises a screen change it does not make. */
  expanded?: boolean;
  /** Only the scan row is 'primary': dashed drop-target border and an accent icon tile. When
   *  every row shouted at the same volume the hub read as a wall of identical cards, so the
   *  secondary ways in are plain solid rows with a neutral tile. */
  tone?: 'primary' | 'quiet';
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const primary = tone === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      style={({ pressed }) => [
        styles.source,
        primary && styles.sourceDashed,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
        primary && expanded && styles.sourceOn,
        primary && expanded && { borderColor: theme.accentSoft, backgroundColor: theme.accentTint },
        { opacity: disabled ? 0.6 : pressed ? 0.9 : 1 },
      ]}
    >
      <View style={[styles.sourceIcon, { backgroundColor: primary ? theme.accentTint : colorTheme.bg }]}>
        <Icon name={icon} size={24} color={primary ? theme.accent : colorTheme.ink2} />
      </View>
      <View style={{ flex: 1 }}>
        <Body weight={700}>{title}</Body>
        <Label weight={500} color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>{sub}</Label>
      </View>
      <Icon
        name={expanded === undefined ? 'chevronRight' : expanded ? 'chevronDown' : 'chevronRight'}
        size={18}
        color={colorTheme.ink3}
      />
    </Pressable>
  );
}

/** A compact secondary choice inside an expanded row — how to hand a file over, not what to add. */
function MiniButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useAccent();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.mini,
        { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
        { opacity: disabled ? 0.6 : pressed ? 0.9 : 1 },
      ]}
    >
      <Icon name={icon} size={19} color={theme.accent} />
      <Label weight={700} color={theme.accentInk}>{label}</Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  keyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  group: { paddingHorizontal: spacing.base, paddingTop: spacing.md },
  nested: { marginLeft: spacing.md, paddingLeft: spacing.md, marginTop: spacing.md, borderLeftWidth: 2 },
  mini: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  sourceDashed: { borderStyle: 'dashed' },
  sourceOn: { borderStyle: 'solid' },
  sourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleCard: {
    width: 150,
    borderRadius: radius.md,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  sampleThumb: { width: '100%', height: 96 },
  hint: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    textAlign: 'center',
    lineHeight: 18,
  },
});
