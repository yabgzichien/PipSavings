import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Body, Label } from '../ui';
import { shouldShowRecapStoryInvitation } from '../../lib/recapStory';
import { persistRecapStoryHomeHandledMonth } from '../../state/store';
import type { Transaction } from '../../lib/types';
import * as haptics from '../../lib/haptics';
import { useLanguage } from '../../i18n';
import { useAccent } from '../../state/accent';
import { useThemeColors } from '../../state/colorScheme';
import { radius, spacing } from '../../theme';
import { DancingCow } from './DancingCow';

export interface RecapEntryProps {
  transactions: Transaction[];
  now: Date;
  handledMonth?: string | null;
  onDismiss?: (month: string) => void;
  onOpenStory?: (month: string) => void;
  onOpen?: (month: string) => void;
}

/** Days 1-7 invitation for the previous calendar month's story. */
export function RecapEntry({
  transactions,
  now,
  handledMonth = null,
  onDismiss,
  onOpenStory,
  onOpen,
}: RecapEntryProps) {
  const invitation = shouldShowRecapStoryInvitation(transactions, now, handledMonth ?? null);
  const { t, isZh } = useLanguage();
  const accent = useAccent();
  const colors = useThemeColors();

  if (!invitation.visible) return null;

  const handleDismiss = async () => {
    haptics.tap();
    await persistRecapStoryHomeHandledMonth(invitation.month);
    onDismiss?.(invitation.month);
  };

  const handleOpen = async () => {
    haptics.tap();
    await persistRecapStoryHomeHandledMonth(invitation.month);
    onOpenStory?.(invitation.month);
    onOpen?.(invitation.month);
  };

  return (
    <View style={[styles.entry, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <DancingCow size={44} motion="off" />
        </View>
        <View style={styles.copy}>
          <Body weight={700}>{t('recapStoryInviteTitle')}</Body>
          <Label weight={500} color={colors.ink2}>
            {isZh ? '你的月度小故事已准备好。' : 'Your monthly story is ready.'}
          </Label>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          testID="recap-entry-dismiss"
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('recapStoryDismiss')}
          style={({ pressed }) => [
            styles.button,
            styles.dismissButton,
            { opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Label color={colors.ink2}>{t('recapStoryDismiss')}</Label>
        </Pressable>
        <Pressable
          testID="recap-entry-open"
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel={t('recapStoryOpen')}
          style={({ pressed }) => [
            styles.button,
            styles.openButton,
            { backgroundColor: accent.accent, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Label color={accent.onAccent} weight={700}>
            {t('recapStoryOpen')}
          </Label>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: '#F6D750',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    borderWidth: 1,
    borderColor: '#D7D2CB',
  },
  openButton: {},
});
