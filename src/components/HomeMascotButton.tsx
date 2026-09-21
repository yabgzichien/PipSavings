import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TaskListSheet } from './TaskListSheet';
import { Pip } from './Pip';
import { MascotTierMarker } from './ProUi';
import { computeExploreTaskStatus, type ExploreTask } from '../lib/tasks';
import { lastActiveDay, localDayNumber } from '../lib/streak';
import * as haptics from '../lib/haptics';
import { useAppData } from '../state/store';
import { useNow } from '../state/useNow';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { uiFont } from '../theme';

const SLEEPY_LAPSED_DAYS = 4;

export function HomeMascotButton({
  onPress,
  sleepy,
  pendingCount,
  isPro,
}: {
  onPress: () => void;
  sleepy: boolean;
  pendingCount: number;
  isPro: boolean;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t } = useLanguage();

  return (
    <View style={styles.mascotWrap}>
      <Pressable
        testID="home-mascot-button"
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        style={({ pressed }) => [styles.pipBubble, { backgroundColor: theme.accentTint }, pressed && { transform: [{ scale: 0.94 }] }]}
        accessibilityRole="button"
        accessibilityLabel={
          pendingCount > 0
            ? `${pendingCount} ${t('exploreTasksBadgeLabel')}, ${isPro ? t('comparePro') : t('compareFree')}`
            : `${t('exploreTasksSheetTitle')}, ${isPro ? t('comparePro') : t('compareFree')}`
        }
      >
        {sleepy ? <Pip size={44} expr="sleepy" /> : <Pip size={49} expr="idle" float />}
        {pendingCount > 0 && (
          <View style={[styles.mascotBadge, { backgroundColor: colorTheme.red, borderColor: colorTheme.bg }]}>
            <Text style={styles.mascotBadgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.mascotTierMarker} pointerEvents="none">
        <MascotTierMarker isPro={isPro} label={isPro ? t('comparePro') : t('compareFree')} />
      </View>
    </View>
  );
}

export function HomeMascot({
  onGuideExploreTask,
}: {
  onGuideExploreTask: (task: ExploreTask) => void;
}) {
  const now = useNow();
  const { tasksDone, transactions } = useAppData();
  const { isPro } = useEntitlement();
  const [open, setOpen] = useState(false);
  const taskStatus = useMemo(() => computeExploreTaskStatus(tasksDone), [tasksDone]);
  const sleepy = useMemo(() => {
    if (transactions.length === 0) return false;
    const last = lastActiveDay(transactions, now);
    if (last === null) return false;
    return localDayNumber(now) - last >= SLEEPY_LAPSED_DAYS;
  }, [transactions, now]);

  return (
    <>
      <HomeMascotButton
        sleepy={sleepy}
        pendingCount={taskStatus.pendingCount}
        isPro={isPro}
        onPress={() => setOpen(true)}
      />
      <TaskListSheet
        visible={open}
        tasksDone={tasksDone}
        onClose={() => setOpen(false)}
        onGuide={(task) => {
          setOpen(false);
          onGuideExploreTask(task);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  mascotWrap: { position: 'relative', overflow: 'visible', alignItems: 'center' },
  pipBubble: { width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  mascotBadge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 17.6,
    height: 17.6,
    borderRadius: 999,
    paddingHorizontal: 4.4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  mascotBadgeText: { color: '#fff', fontSize: 10.5, fontFamily: uiFont(800), lineHeight: 13 },
  mascotTierMarker: { alignItems: 'center', marginTop: 2 },
});
