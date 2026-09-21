// src/components/DateRangeSheet.tsx
// The tap-only date-range picker behind the Trips create form's date row.
//
// Why a calendar and not two text fields: trip dates are optional metadata, and asking someone to
// type "2026-09-12" twice — correctly, on a phone keyboard — to record something optional meant
// most trips simply had no dates. Tapping two days costs nothing, and it makes an unparseable or
// end-before-start value impossible to produce rather than something to validate after the fact.
//
// Drawn by hand rather than pulled from a picker library: the app ships no native date-picker
// module (adding one would force a dev-client rebuild), it already draws month grids in
// CalendarScreen, and a native picker would ignore the accent/dark theming everything else here
// follows. All the arithmetic and selection rules live in lib/dateRange.ts, under test.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  applyRangeTap,
  buildMonthGrid,
  formatDay,
  formatMonthTitle,
  initialCursor,
  rangePosition,
  shiftMonth,
  todayIso,
  type DateRange,
  type MonthCursor,
} from '../lib/dateRange';
import { tap } from '../lib/haptics';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';
import { BtnLabel, Label, PrimaryButton } from './ui';

/** Mon-first, matching CalendarScreen's week convention so the two calendars read alike. */
const WEEKDAYS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'];

export function DateRangeSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: DateRange;
  /** The chosen range. `end` is null when only a start was picked; both null after Clear. */
  onApply: (range: DateRange) => void;
  onClose: () => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();

  const [draft, setDraft] = useState<DateRange>(value);
  const [cursor, setCursor] = useState<MonthCursor>(() => initialCursor(value));

  // Re-seed on open only, mirroring AmountSheet: while the sheet is up the draft belongs to the
  // user, and a parent re-render must not stamp over a half-made selection.
  useEffect(() => {
    if (visible) {
      setDraft(value);
      setCursor(initialCursor(value));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayIso();
  const cells = buildMonthGrid(cursor.year, cursor.month);

  const page = (delta: number) => {
    tap();
    setCursor((c) => shiftMonth(c, delta));
  };

  const pickDay = (iso: string, inMonth: boolean) => {
    tap();
    setDraft((d) => applyRangeTap(d, iso));
    // Tapping a spillover day follows it into its own month, so the day just selected stays on
    // screen instead of sitting in the faded margin of the month the user has moved on from.
    if (!inMonth) setCursor({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });
  };

  const clear = () => {
    tap();
    setDraft({ start: null, end: null });
  };

  const done = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('cancel')} />
      <View style={styles.avoider}>
        <View style={[styles.card, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />

          <View style={styles.header}>
            <Pressable
              onPress={() => page(-1)}
              style={({ pressed }) => [styles.pager, pressed && { opacity: 0.5 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={isZh ? '上个月' : 'Previous month'}
            >
              <Icon name="chevronLeft" size={18} color={colorTheme.ink2} stroke={2.2} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: colorTheme.ink }]} accessibilityRole="header">
              {formatMonthTitle(cursor, isZh)}
            </Text>
            <Pressable
              onPress={() => page(1)}
              style={({ pressed }) => [styles.pager, pressed && { opacity: 0.5 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={isZh ? '下个月' : 'Next month'}
            >
              <Icon name="chevronRight" size={18} color={colorTheme.ink2} stroke={2.2} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {(isZh ? WEEKDAYS_ZH : WEEKDAYS_EN).map((w, i) => (
              <View key={i} style={styles.cell}>
                <Text style={[styles.weekday, { color: colorTheme.ink3 }]}>{w}</Text>
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((cell) => {
              const pos = rangePosition(cell.iso, draft);
              const isEndpoint = pos === 'start' || pos === 'end' || pos === 'single';
              const isToday = cell.iso === today;
              // The tint band is what makes a multi-day span read as one continuous stretch; it
              // fills the whole cell for spanned days and only the inner half under an endpoint,
              // so the band appears to start and stop under the accent circles.
              const banded = pos === 'start' || pos === 'end' || pos === 'middle';
              return (
                <Pressable
                  key={cell.iso}
                  onPress={() => pickDay(cell.iso, cell.inMonth)}
                  style={styles.cell}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isEndpoint || pos === 'middle' }}
                  accessibilityLabel={formatDay(cell.iso, isZh)}
                >
                  {banded && (
                    <View
                      style={[
                        styles.band,
                        { backgroundColor: theme.accentTint },
                        pos === 'start' && styles.bandStart,
                        pos === 'end' && styles.bandEnd,
                      ]}
                    />
                  )}
                  <View
                    style={[
                      styles.day,
                      isEndpoint && { backgroundColor: theme.accentInk },
                      !isEndpoint && isToday && { borderWidth: 1.5, borderColor: theme.accentSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        {
                          color: isEndpoint
                            ? theme.onAccent
                            : cell.inMonth
                              ? colorTheme.ink
                              : colorTheme.ink3,
                        },
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={clear}
              style={styles.clearBtn}
              disabled={!draft.start}
              accessibilityRole="button"
              accessibilityState={{ disabled: !draft.start }}
            >
              <Label weight={700} color={draft.start ? colorTheme.ink2 : colorTheme.ink3}>
                {t('clear')}
              </Label>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton onPress={done}>
                <Icon name="check" size={19} color="#fff" stroke={2.4} />
                <BtnLabel>{t('done')}</BtnLabel>
              </PrimaryButton>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CELL_HEIGHT = 44; // the minimum comfortable tap target; 6 rows of it set the sheet's height

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  pager: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontFamily: uiFont(700), fontSize: 16 },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekday: { fontFamily: uiFont(600), fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Exactly a seventh, so seven columns tile the width with no rounding gap between the tint
  // bands — a percentage-based gap would break the continuous span.
  cell: { width: `${100 / 7}%`, height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  band: { ...StyleSheet.absoluteFillObject, marginVertical: 4 },
  bandStart: { left: '50%' },
  bandEnd: { right: '50%' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: uiFont(600), fontSize: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  clearBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
