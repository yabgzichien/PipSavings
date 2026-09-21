import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '../state/accent';
import { platformShadow, uiFont } from '../theme';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { TourAnchor } from './TourAnchor';
import * as haptics from '../lib/haptics';

export type NavTab = 'home' | 'activity' | 'networth' | 'settings';

const ICONS: Record<NavTab, (stroke: string, fill: string) => React.ReactNode> = {
  home: (stroke, fill) => (
    <Path d="M3 12L12 3l9 9v8a1 1 0 01-1 1h-5v-5H9v5H4a1 1 0 01-1-1z" fill={fill} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  ),
  activity: (stroke) => (
    <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  ),
  networth: (stroke) => (
    <G fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 17l6-6 4 4 7-7" />
      <Path d="M16.5 8H21v4.5" />
    </G>
  ),
  settings: (stroke) => (
    <G fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round">
      <Line x1={3.5} y1={6} x2={20.5} y2={6} />
      <Line x1={3.5} y1={12} x2={20.5} y2={12} />
      <Line x1={3.5} y1={18} x2={20.5} y2={18} />
      <Circle cx={8} cy={6} r={2.2} fill="none" />
      <Circle cx={16} cy={12} r={2.2} fill="none" />
      <Circle cx={10} cy={18} r={2.2} fill="none" />
    </G>
  ),
};

/** Tabs the guided tour spotlights directly (see App.tsx's TourStepKey). `home` and `add` are
 *  reached other ways (the raised + button has its own anchor above), so they're absent here. */
const TAB_TOUR_ANCHORS: Partial<Record<NavTab, string>> = {
  activity: 'tour_activity_tab',
  networth: 'tour_networth_tab',
  settings: 'tour_settings_tab',
};

/** Persistent bottom tab bar for the tracker app. `badges` shows a count over a tab's icon.
 *
 *  `onAdd` mounts the raised centre button that opens the add-a-transaction flow. It lives here
 *  rather than on the Home feed because capture is the app's core loop and used to sit four cards
 *  down the dashboard scroll: on a phone the user had to scroll to reach the one action they
 *  open the app to perform. In the tab bar it is on screen from every primary tab, always. */
export function BottomNav({
  active,
  onNavigate,
  onAdd,
  badges,
  activeTourAnchor = null,
}: {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  onAdd?: () => void;
  badges?: Partial<Record<NavTab, number>>;
  activeTourAnchor?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t } = useLanguage();

  const tabs: { key: NavTab; label: string }[] = [
    { key: 'home', label: t('tabHome') },
    { key: 'activity', label: t('tabActivity') },
    { key: 'networth', label: t('tabNetWorth') },
    { key: 'settings', label: t('tabSettings') },
  ];

  const renderTab = ({ key, label }: { key: NavTab; label: string }) => {
    const on = key === active;
    // The icon stays ink3 (decoration); the label is meaningful nav text so it gets ink2 —
    // ink3 measures ~2.2-2.5:1 contrast, below what body/label text needs.
    const tint = on ? theme.accent : colorTheme.ink3;
    const labelColor = on ? theme.accent : colorTheme.ink2;
    const badge = badges?.[key] ?? 0;
    const tab = (
      <Pressable
        key={key}
        onPress={() => {
          if (key === 'settings') haptics.tap();
          onNavigate(key);
        }}
        style={styles.tab}
        hitSlop={6}
        accessibilityRole="tab"
        accessibilityLabel={badge > 0 ? `${label}, ${badge} new` : label}
        accessibilityState={{ selected: on }}
      >
        <View>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            {ICONS[key](tint, key === 'home' && on ? theme.accent : 'none')}
          </Svg>
          {badge > 0 && (
            <View style={[styles.badge, { backgroundColor: colorTheme.red, borderColor: colorTheme.surface }]}>
              <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, { color: labelColor, fontFamily: uiFont(on ? 700 : 500) }]}>{label}</Text>
      </Pressable>
    );
    const anchorId = TAB_TOUR_ANCHORS[key];
    if (anchorId) {
      // `style` keeps this tab's flex:1 in effect for the brief window it's wrapped in a
      // measurement View (see TourAnchor) — the Pressable inside keeps its own padding/gap.
      return (
        <TourAnchor key={key} id={anchorId} activeId={activeTourAnchor} style={{ flex: 1 }}>
          {tab}
        </TourAnchor>
      );
    }
    return tab;
  };

  return (
    <View style={[styles.bar, { backgroundColor: colorTheme.surface, borderTopColor: colorTheme.line, paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
      {tabs.slice(0, 2).map(renderTab)}
      {onAdd && (
        <View style={styles.addSlot}>
          {/* The lift lives on this wrapper rather than on the button itself: a TourAnchor's
              measurement View auto-sizes to its child, and a negative top margin on that child
              collapses into the wrapper's own box on web (standard CSS margin collapsing),
              which reports a squashed, mispositioned rect. Keeping the button margin-free
              inside TourAnchor keeps its measured rect matching what's actually on screen. */}
          <View style={styles.addBtnLift}>
            <TourAnchor id="tour_plus_btn" activeId={activeTourAnchor}>
              <Pressable
                onPress={onAdd}
                style={({ pressed }) => [
                  styles.addBtn,
                  { borderColor: colorTheme.surface },
                  { backgroundColor: theme.accent, ...platformShadow(theme.accent, 0.34, 14, { width: 0, height: 6 }, 6) },
                  pressed && { transform: [{ scale: 0.94 }] },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('tabAdd')}
              >
                <Svg width={26} height={26} viewBox="0 0 24 24">
                  <Line x1={12} y1={5} x2={12} y2={19} stroke={theme.onAccent} strokeWidth={2.4} strokeLinecap="round" />
                  <Line x1={5} y1={12} x2={19} y2={12} stroke={theme.onAccent} strokeWidth={2.4} strokeLinecap="round" />
                </Svg>
              </Pressable>
            </TourAnchor>
          </View>
          <Text style={[styles.label, styles.addLabel, { color: theme.accent }]}>{t('tabAdd')}</Text>
        </View>
      )}
      {tabs.slice(2).map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 9,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  label: { fontSize: 11 },
  // The raised centre action. `addBtnLift`'s marginTop lifts the circle above the bar's top
  // edge so it reads as the one thing on the bar that does something rather than a fifth
  // destination; the surface ring keeps it legible where it overlaps the content behind. The
  // lift lives on this wrapper rather than on addBtn itself — see the comment where it's used.
  addSlot: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  addBtnLift: { marginTop: -26 },
  addBtn: {
    width: 54,
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  addLabel: { fontFamily: uiFont(700), marginTop: 1 },
  // Red count bubble pinned to the top-right of the tab icon.
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontFamily: uiFont(800), lineHeight: 12 },
});
