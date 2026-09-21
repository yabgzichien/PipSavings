import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { MascotOptionTile, TILE_SIZE } from '../components/MascotOptionTile';
import { NotchedSlider } from '../components/NotchedSlider';
import { TabStrip } from '../components/TabStrip';
import { Body, BtnLabel, Caption, Card, Eyebrow, PrimaryButton, TopBar } from '../components/ui';
import { useLanguage } from '../i18n';
import { confirmAction } from '../lib/platformAlert';
import {
  isWidgetMascotConfigEqual,
  setSlot,
  setSlotContent,
} from '../lib/widgetCustomizer';
import {
  CUSTOMIZER_TABS,
  THUMB_FRAMES,
  isSlotTab,
  tabIsModified,
  type CustomizerTab,
} from '../lib/widgetCustomizerTabs';
import { useAccent } from '../state/accent';
import { useAppearanceStyle, useResolvedScheme, useThemeColors } from '../state/colorScheme';
import { resolveWidgetChrome } from '../lib/appearanceStyle';
import { useAppData } from '../state/store';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { widgetConfigRequiresPro, widgetItemTier } from '../billing/widgetEntitlements';
import { useBackHandler } from '../state/useBackHandler';
import { BADGE_THEMES, badgeIconSvg, badgeAnimationCss } from '../widget/mascot/badge';
import { DOWN_ARROW_SVG, UP_ARROW_SVG } from '../widget/mascot/chrome';
import { composeMascotThumbnail, composeWidgetPreview } from '../widget/mascot/previewCompose';
import type {
  BadgeColor,
  BadgeIcon,
  Notch,
  PresetId,
  SlotContent,
  WidgetMascotConfig,
} from '../widget/mascot/config';
import { PART_CATALOG } from '../widget/mascot/parts';
import { fitsDeclaredMinimum } from '../widget/mascot/sizing';
import { applyPreset, PRESETS } from '../widget/mascot/presets';

const BADGE_ICONS: BadgeIcon[] = ['flame', 'star', 'leaf', 'sprout', 'none'];
const BADGE_COLORS: BadgeColor[] = ['amber', 'red', 'green', 'blue', 'violet'];
const WIDGET_SLOTS: ('slot1' | 'slot2')[] = ['slot1', 'slot2'];
const SLOT_CONTENTS: SlotContent[] = ['income', 'expense', 'streak', 'none'];
const SLOT_TILE_SIZE = Math.round(TILE_SIZE * 0.75);

/** A sample streak for the preview, with a matching week: a 7-day streak means all seven days
 *  are active, so showing gaps here would preview a state that cannot exist. */
const PREVIEW_STREAK = 7;
const PREVIEW_DOTS = [true, true, true, true, true, true, true];

/** Drawn larger than life so the widget is legible on a phone, but at a FIXED multiplier rather
 *  than stretched to fill the card — otherwise every mascot and button size would render the
 *  same width and the two size sliders would appear to do nothing. */
const PREVIEW_SCALE = 1.5;

/** A slot choice's glyph, drawn at tile size. `none` gets an explicit empty marker rather than a
 *  blank tile, so "no button here" reads as a deliberate choice and not a rendering failure. */
function slotContentSvg(content: SlotContent, config: WidgetMascotConfig): string {
  if (content === 'income') return UP_ARROW_SVG;
  if (content === 'expense') return DOWN_ARROW_SVG;
  if (content === 'streak') {
    const icon = badgeIconSvg(config.badgeIcon === 'none' ? 'flame' : config.badgeIcon, config.badgeColor);
    return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">${icon ?? ''}</svg>`;
  }
  return `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="9" fill="none" stroke="#9E9686" stroke-width="2" stroke-dasharray="3 3" /></svg>`;
}

export function WidgetCustomizerScreen({ onBack, initialDraft, onDraftChange }: {
  onBack: () => void;
  initialDraft?: WidgetMascotConfig | null;
  onDraftChange?: (draft: WidgetMascotConfig | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { style } = useAppearanceStyle();
  const scheme = useResolvedScheme();
  const { t } = useLanguage();
  const { widgetMascotConfig, setWidgetMascotConfig } = useAppData();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [draft, setDraft] = useState(initialDraft ?? widgetMascotConfig);
  const [tab, setTab] = useState<CustomizerTab>('preset');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  // The whole widget, not just the mascot — otherwise the slot pickers and size sliders change
  // nothing on screen. See mascot/previewCompose.ts on why it is a second renderer.
  const preview = composeWidgetPreview(draft, PREVIEW_STREAK, PREVIEW_DOTS, resolveWidgetChrome(style, scheme));
  const fits = fitsDeclaredMinimum(draft);
  const previewW = preview.width * PREVIEW_SCALE;
  const previewH = preview.height * PREVIEW_SCALE;

  const previewHtml = useMemo(() => {
    const css = badgeAnimationCss(draft.animationNotch);
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; }
    svg { width: 100%; height: 100%; display: block; }
    ${css}
  </style>
</head>
<body>
  ${preview.svg}
</body>
</html>`;
  }, [draft.animationNotch, preview.svg]);

  const tabItems = useMemo(
    () =>
      CUSTOMIZER_TABS.map((id) => ({
        id,
        label: t(`widgetTab_${id}`),
        marked: tabIsModified(id, draft),
      })),
    [draft, t]
  );

  // Recomposed only when the tab or the underlying mascot changes, so dragging a size slider
  // does not rebuild a grid of hat thumbnails on every frame.
  const tiles = useMemo(() => {
    if (tab === 'preset') {
      return (Object.keys(PRESETS) as PresetId[]).map((id) => ({
        id,
        label: t(`widgetPreset_${id}`),
        selected: draft.preset === id,
        requiresPro: widgetItemTier('preset', id) === 'pro',
        svg: composeMascotThumbnail(applyPreset(draft, id), THUMB_FRAMES.preset),
        apply: () => setDraft((current) => applyPreset(current, id)),
      }));
    }
    if (isSlotTab(tab)) {
      return Object.keys(PART_CATALOG[tab]).map((id) => ({
        id,
        label: t(`widgetPart_${id}`),
        selected: draft[tab] === id,
        requiresPro: widgetItemTier(tab, id) === 'pro',
        svg: composeMascotThumbnail(setSlot(draft, tab, id), THUMB_FRAMES[tab]),
        apply: () => setDraft((current) => setSlot(current, tab, id)),
      }));
    }
    return [];
  }, [tab, draft, t]);

  const save = async () => {
    if (!isPro && widgetConfigRequiresPro(draft)) {
      openPaywall('widget_custom', 'widgetCustomizer');
      return;
    }
    setSaving(true);
    try {
      await setWidgetMascotConfig(draft);
      onDraftChange?.(null);
      onBack();
    } finally {
      setSaving(false);
    }
  };

  const presetName =
    draft.preset === 'custom' ? t('widgetPreviewHint') : t(`widgetPreset_${draft.preset}`);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'pip-badge-animations';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = badgeAnimationCss(draft.animationNotch);
  }, [draft.animationNotch]);

  const handleBack = () => {
    if (saving) return;
    const hasUnsavedChanges = !isWidgetMascotConfigEqual(draft, widgetMascotConfig);
    if (!hasUnsavedChanges) {
      onBack();
      return;
    }
    confirmAction(
      t('widgetUnsavedTitle'),
      t('widgetUnsavedBody'),
      t('widgetQuitWithoutSaving'),
      onBack,
      {
        label: t('widgetSaveAndQuit'),
        onPress: async () => {
          await save();
        },
        style: 'primary',
      },
      t('widgetKeepEditing')
    );
  };

  useBackHandler(() => {
    handleBack();
    return true;
  });

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title={t('widgetCustomizer')} onBack={handleBack} />
      </View>

      {/* Pinned: the preview must stay visible while options change, which is the whole reason
          this screen moved from one long scroll to tabs. */}
      <View style={styles.previewWrap}>
        <Card style={[styles.preview, { backgroundColor: theme.accentTint }]}>
          {Platform.OS === 'web' ? (
            <SvgXml
              xml={preview.svg}
              width={previewW}
              height={previewH}
            />
          ) : (
            <View style={{ width: previewW, height: previewH, overflow: 'hidden' }}>
              <WebView
                source={{ html: previewHtml }}
                style={{ width: previewW, height: previewH, backgroundColor: 'transparent' }}
                originWhitelist={['*']}
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                overScrollMode="never"
              />
            </View>
          )}
        </Card>
        <Caption color={colorTheme.ink2}>{presetName}</Caption>
      </View>

      <TabStrip items={tabItems} value={tab} onChange={setTab} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {tiles.length > 0 ? (
          <View style={styles.tiles}>
            {tiles.map((tile) => (
              <MascotOptionTile
                key={tile.id}
                svg={tile.svg}
                label={tile.label}
                selected={tile.selected}
                onPress={tile.apply}
                requiresPro={tile.requiresPro}
              />
            ))}
          </View>
        ) : null}

        {tab === 'badge' ? (
          <View style={styles.section}>
            <View style={styles.tiles}>
              {BADGE_ICONS.map((icon) => {
                const fragment = badgeIconSvg(icon === 'none' ? 'flame' : icon, draft.badgeColor);
                const svg =
                  icon === 'none'
                    ? slotContentSvg('none', draft)
                    : `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">${fragment ?? ''}</svg>`;
                return (
                  <MascotOptionTile
                    key={icon}
                    svg={svg}
                    label={t(`widgetBadge_${icon}`)}
                    selected={draft.badgeIcon === icon}
                    onPress={() => setDraft((current) => ({ ...current, badgeIcon: icon }))}
                  />
                );
              })}
            </View>
            <View style={styles.swatches}>
              {BADGE_COLORS.map((color) => {
                const selected = draft.badgeColor === color;
                return (
                  <Pressable
                    key={color}
                    onPress={() => setDraft((current) => ({ ...current, badgeColor: color }))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(`widgetColor_${color}`)}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: BADGE_THEMES[color].icon,
                        borderColor: selected ? colorTheme.ink : 'transparent',
                        borderWidth: selected ? 3 : 0,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Card style={styles.controlCard}>
            <NotchedSlider
              compact
              label={t('widgetMascotSize')}
              value={draft.mascotNotch}
              count={5}
              defaultValue={3}
              defaultLabel={t('widgetDefaultNotch', { value: 3 })}
              onChange={(value) =>
                setDraft((current) => ({ ...current, mascotNotch: value as Notch }))
              }
            />
            <NotchedSlider
              compact
              label={t('widgetButtonSize')}
              value={draft.buttonNotch}
              count={5}
              defaultValue={3}
              defaultLabel={t('widgetDefaultNotch', { value: 3 })}
              onChange={(value) =>
                setDraft((current) => ({ ...current, buttonNotch: value as Notch }))
              }
            />
            <NotchedSlider
              compact
              label={t('widgetAnimationSpeed')}
              value={draft.animationNotch}
              count={5}
              defaultValue={3}
              defaultLabel={t(`widgetAnimationSpeed_${draft.animationNotch}` as any)}
              onChange={(value) =>
                setDraft((current) => ({ ...current, animationNotch: value as Notch }))
              }
            />
          </Card>

          {WIDGET_SLOTS.map((which) => (
            <View key={which} style={styles.slotSection}>
              <Eyebrow style={styles.slotEyebrow}>{t(`widgetSlotPosition_${which}`)}</Eyebrow>
              <View style={styles.slotTiles}>
                {SLOT_CONTENTS.map((content) => (
                  <MascotOptionTile
                    key={content}
                    size={SLOT_TILE_SIZE}
                    svg={slotContentSvg(content, draft)}
                    label={t(`widgetSlotContent_${content}`)}
                    selected={draft[which] === content}
                    onPress={() => setDraft((current) => setSlotContent(current, which, content))}
                  />
                ))}
              </View>
            </View>
          ))}

          {!fits ? <Caption color={colorTheme.ink2}>{t('widgetNeedsBigger')}</Caption> : null}
        </View>
      </ScrollView>

      {/* Pinned: with tabs there is no longer an end-of-scroll for Save to sit at. */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12, borderTopColor: colorTheme.line, backgroundColor: colorTheme.bg },
        ]}
      >
        <PrimaryButton onPress={save} disabled={saving}>
          <BtnLabel>{saving ? t('saving') : t('save')}</BtnLabel>
        </PrimaryButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  previewWrap: { alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingBottom: 12 },
  preview: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24, gap: 20 },
  section: { gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  controlCard: { padding: 12, gap: 8 },
  slotSection: { gap: 6 },
  slotEyebrow: { fontSize: 10, letterSpacing: 0.8 },
  slotTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 40, height: 40, borderRadius: 999 },
  footer: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
