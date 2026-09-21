import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Body } from './ui';
import * as haptics from '../lib/haptics';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { spacing } from '../theme';

export function ChatStreakStrip({
  streak,
  week,
  todayIndex,
  onPress,
}: {
  streak: number;
  week: boolean[];
  todayIndex: number;
  onPress: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t } = useLanguage();

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={t('viewCalendar')}
    >
      <View style={styles.flame}>
        <Svg width={16} height={20} viewBox="0 0 82 100" fill="none">
          <Path
            d="M49 12.5C53.5 22 57 32 58.6 39.6C61.1 33.2 65.4 28.9 70 26.8C73.2 33.8 79.6 47.2 80 64C80.4 82.2 62.9 99 41 99C19.1 99 1.6 82.2 2 64C2.2 56.2 4.1 51.4 7.6 46.8C9.1 39.9 17 26.7 25.2 20C26.7 27.2 30.7 36.2 36.6 42.6C40.1 46.2 43.1 42.2 44.6 35C45.7 29.6 47.2 20 49 12.5Z"
            fill="#faa81a"
          />
          <Path
            d="M34.5 42C38 47.5 41.5 51.5 43.5 55.5C45.5 51.5 48 48 51 45.5C55.5 52 58.5 60 58.5 67.5C58.5 78.5 50.7 88.5 41 88.5C31.3 88.5 23.5 78.5 23.5 67.5C23.5 58.5 28.5 48.5 34.5 42Z"
            fill="#f26a22"
          />
          <Path
            d="M42.5 61C46 67 49 72.5 49 77.5C49 82.5 46 86 42.5 86C39 86 36 82.5 36 77.5C36 72.5 39 67 42.5 61Z"
            fill="#e2402a"
          />
        </Svg>
      </View>
      <Body weight={700} numeric>
        {streak}
      </Body>
      <View style={styles.dots}>
        {week.map((done, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              done
                ? { backgroundColor: theme.accent }
                : i === todayIndex
                  ? { borderWidth: 2, borderColor: theme.accent }
                  : { borderWidth: 1, borderColor: colorTheme.ink3 },
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  flame: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 999 },
});
