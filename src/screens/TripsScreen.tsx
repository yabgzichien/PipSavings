import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { Amount, Body, Card, Caption, Eyebrow, Label, PrimaryButton, Title, TopBar } from '../components/ui';
import { DateRangeSheet } from '../components/DateRangeSheet';
import { TripBadge, TripGlyph } from '../components/TripBadge';
import { TripIconPickerSheet } from '../components/TripIconPickerSheet';
import { formatRangeLabel } from '../lib/dateRange';
import type { DateRange } from '../lib/dateRange';
import {
  extractBaseTripName,
  getTripNameRecommendations,
  loadStoredFrequencies,
  recordTripSubmission,
} from '../lib/recommendations';
import { computeTripTotals } from '../lib/trips';
import type { Trip } from '../lib/trips';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useLanguage } from '../i18n';
import { radius, spacing, uiFont } from '../theme';

/**
 * One trip in the list: name, recorded-expenses total, and how many transactions carry it.
 * Archived rows get the same shape plus an inline unarchive action, so a trip that only needs
 * one correction doesn't require opening the detail screen first.
 */
function TripRow({
  trip,
  onPress,
  archived,
  onUnarchive,
}: {
  trip: Trip;
  onPress: () => void;
  archived?: boolean;
  onUnarchive?: () => void;
}) {
  const colorTheme = useThemeColors();
  const { transactions } = useAppData();
  const dc = useDisplayCurrency();
  const { t } = useLanguage();
  const totals = useMemo(() => computeTripTotals(transactions, trip.id, dc.convertTxn), [transactions, trip.id, dc]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={trip.name}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colorTheme.surface2 }]}
    >
      <TripBadge trip={trip} size={40} rad={13} muted={archived} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body weight={700} numberOfLines={1} color={archived ? colorTheme.ink2 : colorTheme.ink}>
          {trip.name}
        </Body>
        <Caption color={colorTheme.ink2} style={{ marginTop: 2 }}>
          {t('tripCountExpenses', { n: totals.txnCount })}
        </Caption>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Amount value={totals.recordedExpenses} currency={dc.code} size={15} weight={700} color={archived ? colorTheme.ink2 : colorTheme.ink} />
        {archived && onUnarchive ? (
          <Pressable onPress={onUnarchive} hitSlop={8} style={styles.inlineAction} accessibilityRole="button" accessibilityLabel={t('unarchiveTrip')}>
            <Label weight={700} color={colorTheme.ink2}>{t('unarchiveTrip')}</Label>
          </Pressable>
        ) : (
          <View style={{ marginTop: 6 }}>
            <Icon name="chevronRight" size={15} color={colorTheme.ink3} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function TripsScreen({
  onBack,
  onOpenTrip,
  embedded,
}: {
  onBack: () => void;
  onOpenTrip: (tripId: string) => void;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const { trips, addTrip, setTripArchived } = useAppData();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [dates, setDates] = useState<DateRange>({ start: null, end: null });
  const [pickingDates, setPickingDates] = useState(false);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = useMemo(
    () => trips.filter((tr) => !tr.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [trips]
  );
  const archived = useMemo(
    () => trips.filter((tr) => tr.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [trips]
  );

  const dateLabel = formatRangeLabel(dates, isZh);

  const [customTripCounts, setCustomTripCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadStoredFrequencies().then((res) => {
      setCustomTripCounts(res.trips);
    });
  }, []);

  const tripRecommendations = useMemo(
    () => getTripNameRecommendations(trips, name, isZh, undefined, customTripCounts),
    [trips, name, isZh, customTripCounts]
  );

  const openCreate = () => {
    setName('');
    setIcon(null);
    setDates({ start: null, end: null });
    setCreating(true);
  };

  const submitCreate = async () => {
    const trimmed = name.trim();
    const startDate = dates.start;
    const endDate = dates.end;
    if (!trimmed || !startDate || !endDate || saving) return;
    setSaving(true);
    try {
      const base = extractBaseTripName(trimmed);
      if (base) {
        void recordTripSubmission(trimmed);
        setCustomTripCounts((prev) => ({
          ...prev,
          [base.toLowerCase()]: (prev[base.toLowerCase()] || 0) + 1,
        }));
      }
      // No format check: the calendar is the only producer, so both values are valid
      // 'YYYY-MM-DD' strings by construction.
      const created = await addTrip(trimmed, startDate, endDate, icon);
      setCreating(false);
      onOpenTrip(created.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={t('tripsTitle')} onBack={onBack} />
        </View>
      )}

      {/* A trip list grows without bound, and the create form pushes it further down with the
          keyboard open, so this has to scroll — a plain View simply clipped everything past the
          fold with no way to reach it. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {creating && (
          <Card style={styles.createCard}>
            <Label weight={700} style={{ marginBottom: spacing.sm }}>{t('newTrip')}</Label>
            <View style={[styles.nameField, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('tripNamePlaceholder')}
                placeholderTextColor={colorTheme.ink3}
                style={[styles.input, styles.nameInput, { color: colorTheme.ink }]}
                maxLength={60}
                autoFocus
              />
              <Pressable
                onPress={() => setPickingIcon(true)}
                accessibilityRole="button"
                accessibilityLabel={t('tripIconChange')}
                style={({ pressed }) => [
                  styles.nameIconButton,
                  { backgroundColor: 'transparent', opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <TripGlyph trip={{ name, icon }} size={22} color={theme.accent} />
              </Pressable>
            </View>
            {tripRecommendations.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                style={styles.chipRow}
                contentContainerStyle={styles.chipContent}
              >
                {tripRecommendations.map((dest) => (
                  <Pressable
                    key={dest.name}
                    onPress={() => setName(dest.name)}
                    style={({ pressed }) => [
                      styles.destChip,
                      {
                        backgroundColor: colorTheme.surface,
                        borderColor: colorTheme.line,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={dest.name}
                  >
                    <TripGlyph trip={{ name: dest.name, icon: null }} size={16} color={theme.accent} />
                    <Label weight={500} color={colorTheme.ink}>{dest.name}</Label>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Caption color={colorTheme.ink2} style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
              {t('tripDatesRequired')}
            </Caption>
            {/* One tappable row, not two text fields: the calendar is the only way to set these
                now, so there is no format to get wrong and no keyboard to dismiss. */}
            <Pressable
              onPress={() => setPickingDates(true)}
              style={({ pressed }) => [
                styles.input,
                styles.dateRow,
                { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={dateLabel ?? t('addDates')}
            >
              <Icon name="calendar" size={16} color={colorTheme.ink2} />
              <Text style={[styles.dateText, { color: dateLabel ? colorTheme.ink : colorTheme.ink3 }]} numberOfLines={1}>
                {dateLabel ?? t('addDates')}
              </Text>
            </Pressable>
            <View style={styles.createActions}>
              <Pressable onPress={() => setCreating(false)} style={styles.createActionBtn} disabled={saving}>
                <Label weight={700} color={colorTheme.ink2}>{t('cancel')}</Label>
              </Pressable>
              <Pressable onPress={submitCreate} style={styles.createActionBtn} disabled={saving || !name.trim() || !dates.start || !dates.end}>
                <Label weight={700} color={!name.trim() || !dates.start || !dates.end ? colorTheme.ink3 : theme.accent}>{t('save')}</Label>
              </Pressable>
            </View>
          </Card>
        )}

        {!creating && (
          <PrimaryButton onPress={openCreate} height={50}>
            <Icon name="plus" size={17} color="#fff" />
            <Text style={styles.newTripLabel}>{t('newTrip')}</Text>
          </PrimaryButton>
        )}

        {active.length === 0 && !creating ? (
          <Card style={styles.emptyCard}>
            <Pip size={64} expr="curious" float />
            <Title style={{ marginTop: spacing.md }}>{isZh ? '暂无行程' : 'No trips yet'}</Title>
            <Body color={colorTheme.ink2} style={{ textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 }}>
              {isZh ? '创建一个行程，把这趟的支出归到一起。' : "Create a trip to keep its expenses together."}
            </Body>
          </Card>
        ) : (
          active.length > 0 && (
            <>
              <Eyebrow style={{ marginTop: spacing.base, marginBottom: spacing.sm }}>
                {isZh ? '进行中' : 'Active'}
              </Eyebrow>
              <Card style={styles.listCard}>
                {active.map((trip, i) => (
                  <View key={trip.id} style={[i > 0 && styles.divider, i > 0 && { borderTopColor: colorTheme.line2 }]}>
                    <TripRow trip={trip} onPress={() => onOpenTrip(trip.id)} />
                  </View>
                ))}
              </Card>
            </>
          )
        )}

        {archived.length > 0 && (
          <>
            <Pressable
              onPress={() => setShowArchived((v) => !v)}
              style={styles.showArchivedRow}
              accessibilityRole="button"
              accessibilityState={{ expanded: showArchived }}
            >
              <Icon name={showArchived ? 'chevronUp' : 'chevronDown'} size={14} color={colorTheme.ink2} />
              <Label weight={700} color={colorTheme.ink2}>
                {t('showArchived')} · {archived.length}
              </Label>
            </Pressable>
            {showArchived && (
              <Card style={[styles.listCard, { marginBottom: spacing.xl }]}>
                {archived.map((trip, i) => (
                  <View key={trip.id} style={[i > 0 && styles.divider, i > 0 && { borderTopColor: colorTheme.line2 }]}>
                    <TripRow
                      trip={trip}
                      archived
                      onPress={() => onOpenTrip(trip.id)}
                      onUnarchive={() => setTripArchived(trip.id, false)}
                    />
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <DateRangeSheet
        visible={pickingDates}
        value={dates}
        onApply={setDates}
        onClose={() => setPickingDates(false)}
      />
      <TripIconPickerSheet
        visible={pickingIcon}
        trip={{
          id: 'new-trip',
          name,
          createdAt: '',
          archived: false,
          startDate: dates.start,
          endDate: dates.end,
          icon,
        }}
        onClose={() => setPickingIcon(false)}
        onPick={(nextIcon) => {
          setIcon(nextIcon);
          setPickingIcon(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  newTripLabel: { fontFamily: uiFont(700), fontSize: 15, color: '#fff', marginLeft: 8 },
  createCard: { padding: spacing.base, marginBottom: spacing.md },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontFamily: uiFont(600), fontSize: 15 },
  nameField: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  nameInput: { flex: 1, minWidth: 0, borderWidth: 0 },
  nameIconButton: { width: 44, height: 44, marginRight: spacing.xs, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  dateText: { flex: 1, minWidth: 0, fontFamily: uiFont(600), fontSize: 14 },
  createActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.base, marginTop: spacing.md },
  createActionBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  listCard: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, minHeight: 44 },
  divider: { borderTopWidth: 1 },
  inlineAction: { marginTop: 6, minHeight: 24, justifyContent: 'center' },
  emptyCard: { padding: spacing.lg, alignItems: 'center', marginTop: spacing.base },
  showArchivedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, marginTop: spacing.base },
  chipRow: { marginTop: spacing.sm },
  chipContent: { gap: spacing.xs, paddingHorizontal: 0, paddingVertical: spacing.xs },
  destChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: 32,
  },
});
