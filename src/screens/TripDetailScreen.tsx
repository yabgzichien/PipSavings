import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditTransactionModal } from '../components/EditTransactionModal';
import { Icon } from '../components/Icon';
import { OverflowMenu } from '../components/OverflowMenu';
import { Pip } from '../components/Pip';
import { TripBadge } from '../components/TripBadge';
import { TripIconPickerSheet } from '../components/TripIconPickerSheet';
import { TxnRow } from './AllTransactionsScreen';
import { Amount, Body, Card, Caption, CatBadge, Eyebrow, Label, PrimaryButton, Title, TopBar } from '../components/ui';
import { fmtMoney } from '../lib/format';
import { confirmAction } from '../lib/platformAlert';
import { outstanding } from '../lib/split';
import { computeTripTotals, expensesForTrip, reassignedFromOtherTrips } from '../lib/trips';
import type { Category, Transaction } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useLanguage } from '../i18n';
import { radius, spacing, uiFont } from '../theme';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null };

/**
 * Picker for "Add existing expenses": every expense not already in this trip, so a charge
 * logged before the trip screen existed (or attached to the wrong trip) can still be pulled
 * in. Kept local to this screen rather than a shared component — there's no other place in the
 * app that needs a bare multi-select transaction list.
 */
function AddExistingExpensesModal({
  visible,
  onClose,
  tripId,
  tripName,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, tCat, isZh, formatShortDate } = useLanguage();
  const { transactions, catById, trips, setTransactionsTrip } = useAppData();
  const dc = useDisplayCurrency();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Every other trip's name, keyed by id, so a row already belonging to one can say so —
  // moving it here is a legitimate, spec-anticipated edit, but only if the user can see what
  // it costs the trip it's leaving.
  const tripNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tr of trips) map[tr.id] = tr.name;
    return map;
  }, [trips]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((tx) => tx.type === 'expense' && tx.tripId !== tripId)
      .filter((tx) => {
        if (!q) return true;
        const cat = catById[tx.categoryId ?? 'other'] ?? fallback;
        return (
          (tx.merchantRaw ?? '').toLowerCase().includes(q) ||
          (tx.remark ?? '').toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt));
  }, [transactions, tripId, query, catById]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applySelection = async () => {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    try {
      await setTransactionsTrip([...selected], tripId);
      setSelected(new Set());
      setQuery('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const commit = () => {
    if (selected.size === 0 || saving) return;
    // Some of what's selected already belongs to another trip — moving it is a legitimate,
    // explicit edit (spec §6.3), but it has to actually be explicit: say what's about to happen,
    // by name, before it happens. Nothing is blocked, this only asks for a beat of confirmation.
    // Counted against every transaction, not the search-filtered candidates: a selected row the
    // user has since typed out of view is still going to move.
    const reassignCount = reassignedFromOtherTrips(transactions, [...selected], tripId);
    if (reassignCount === 0) {
      void applySelection();
      return;
    }
    confirmAction(
      t('moveToTripConfirmTitle', { trip: tripName }),
      t('moveToTripConfirmBody', { n: reassignCount, trip: tripName }),
      t('moveToTripConfirmAction'),
      applySelection
    );
  };

  const handleClose = () => {
    setSelected(new Set());
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'} style={styles.sheetAvoider} pointerEvents="box-none">
        <View style={[styles.sheetCard, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <View style={styles.sheetHead}>
            <Title>{t('addExistingExpenses')}</Title>
            <Pressable onPress={handleClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('cancel')}>
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>

          <View style={[styles.searchRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
            <Icon name="search" size={16} color={colorTheme.ink3} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('searchTransactionsPlaceholder')}
              placeholderTextColor={colorTheme.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.searchInput, { color: colorTheme.ink }]}
            />
          </View>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {candidates.length === 0 ? (
              <Caption color={colorTheme.ink2} style={{ textAlign: 'center', paddingVertical: spacing.lg }}>
                {isZh ? '没有可添加的支出' : 'No expenses available to add'}
              </Caption>
            ) : (
              candidates.map((tx) => {
                const cat = catById[tx.categoryId ?? 'other'] ?? fallback;
                const on = selected.has(tx.id);
                const otherTripName = tx.tripId ? tripNameById[tx.tripId] : undefined;
                return (
                  <Pressable
                    key={tx.id}
                    onPress={() => toggle(tx.id)}
                    style={({ pressed }) => [styles.pickRow, { borderColor: colorTheme.line2 }, pressed && { backgroundColor: colorTheme.surface2 }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={
                      otherTripName
                        ? `${tCat(cat)} ${fmtMoney(tx.nativeAmount ?? tx.amount, tx.currency)} · ${t('inOtherTrip', { name: otherTripName })}`
                        : `${tCat(cat)} ${fmtMoney(tx.nativeAmount ?? tx.amount, tx.currency)}`
                    }
                  >
                    <View style={[styles.checkbox, { borderColor: colorTheme.line }, on && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                      {on && <Icon name="check" size={13} color="#fff" stroke={2.6} />}
                    </View>
                    <CatBadge category={cat} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body weight={700} numberOfLines={1}>
                        {tx.remark?.trim() || tx.merchantRaw || tCat(cat)}
                      </Body>
                      <Caption color={colorTheme.ink2}>{formatShortDate(tx.date ?? tx.createdAt)}</Caption>
                      {otherTripName && (
                        <View style={[styles.otherTripChip, { backgroundColor: theme.accentTint }]}>
                          <Icon name="pin" size={10} color={theme.accentInk} />
                          <Text style={[styles.otherTripChipText, { color: theme.onTint }]} numberOfLines={1}>
                            {t('inOtherTrip', { name: otherTripName })}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Amount value={tx.nativeAmount ?? tx.amount} currency={tx.currency} size={14} weight={700} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={{ marginTop: spacing.md }}>
            <PrimaryButton onPress={commit} disabled={selected.size === 0 || saving}>
              <Text style={styles.primaryLabel}>
                {t('addToTrip')}{selected.size > 0 ? ` · ${selected.size}` : ''}
              </Text>
            </PrimaryButton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function TripDetailScreen({
  tripId,
  onBack,
  onAddExpense,
  embedded,
  initialCategoryId,
}: {
  tripId: string;
  onBack: () => void;
  /** Opens the normal add flow with this trip prefilled and visible. */
  onAddExpense: (tripId: string, tripName: string) => void;
  embedded?: boolean;
  initialCategoryId?: string;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, tCat, isZh, formatShortDate } = useLanguage();
  const { trips, transactions, catById, splits, shares, renameTrip, setTripArchived, setTripIcon, deleteTrip } = useAppData();
  const dc = useDisplayCurrency();

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const trip = trips.find((tr) => tr.id === tripId);

  /** Set by tapping a category in the breakdown: the list below narrows to that category. */
  const [categoryFilter, setCategoryFilter] = useState<string | null>(initialCategoryId ?? null);

  const tripTxns = useMemo(() => expensesForTrip(transactions, tripId), [transactions, tripId]);
  const totals = useMemo(() => computeTripTotals(transactions, tripId, dc.convertTxn), [transactions, tripId, dc]);
  const sortedTxns = useMemo(
    () => [...tripTxns]
      .filter((txn) => !categoryFilter || (txn.categoryId ?? 'other') === categoryFilter)
      .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt)),
    [tripTxns, categoryFilter]
  );

  const owedByTxn = useMemo(() => {
    const openBySplit: Record<string, number> = {};
    for (const s of shares) {
      if (s.status !== 'open') continue;
      openBySplit[s.splitId] = (openBySplit[s.splitId] ?? 0) + outstanding(s);
    }
    const map: Record<string, { owed: number; gross: number }> = {};
    for (const split of splits) {
      const owed = openBySplit[split.id] ?? 0;
      if (owed > 0) map[split.txnId] = { owed, gross: split.gross };
    }
    return map;
  }, [splits, shares]);

  if (!trip) {
    return (
      <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
        {!embedded && (
          <View style={{ paddingTop: insets.top + 4 }}>
            <TopBar title={t('tripsTitle')} onBack={onBack} />
          </View>
        )}
        <View style={styles.center}>
          <Pip size={64} expr="curious" />
          <Body color={colorTheme.ink2} style={{ marginTop: spacing.md }}>
            {isZh ? '找不到该行程。' : "This trip couldn't be found."}
          </Body>
        </View>
      </View>
    );
  }

  const openRename = () => {
    setDraftName(trip.name);
    setRenaming(true);
  };
  const saveRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || savingName) return;
    setSavingName(true);
    try {
      if (trimmed !== trip.name) await renameTrip(trip.id, trimmed);
      setRenaming(false);
    } finally {
      setSavingName(false);
    }
  };

  const confirmDelete = () => {
    confirmAction(t('deleteTripTitle'), t('deleteTripBody'), t('delete'), async () => {
      await deleteTrip(trip.id);
      onBack();
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar
            title={trip.name}
            onBack={onBack}
            // Rename, archive and delete are all occasional. Behind one trigger they stop competing
            // with the two things this screen is for: what the trip cost, and adding to it.
            right={
              <OverflowMenu
                title={trip.name}
                accessibilityLabel={`${isZh ? '更多操作' : 'More actions'}: ${trip.name}`}
                size={17}
                actions={[
                  { label: isZh ? '重命名行程' : 'Rename trip', icon: 'pencil', onPress: openRename },
                  {
                    label: trip.archived ? t('unarchiveTrip') : t('archiveTrip'),
                    icon: 'folder',
                    onPress: () => { void setTripArchived(trip.id, !trip.archived); },
                  },
                  // Stated, not asked: `deleteTripTitle` is the confirmation's question and reads
                  // wrong as a menu item the user has not chosen yet.
                  { label: isZh ? '移除行程' : 'Remove trip', icon: 'trash', destructive: true, onPress: confirmDelete },
                ]}
              />
            }
          />
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
        {renaming && (
          <Card style={styles.renameCard}>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('tripNamePlaceholder')}
              placeholderTextColor={colorTheme.ink3}
              style={[styles.input, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink }]}
              maxLength={60}
              autoFocus
            />
            <View style={styles.renameActions}>
              <Pressable onPress={() => setRenaming(false)} style={styles.renameActionBtn} disabled={savingName}>
                <Label weight={700} color={colorTheme.ink2}>{t('cancel')}</Label>
              </Pressable>
              <Pressable onPress={saveRename} style={styles.renameActionBtn} disabled={savingName || !draftName.trim()}>
                <Label weight={700} color={theme.accent}>{t('save')}</Label>
              </Pressable>
            </View>
          </Card>
        )}

        <Card style={styles.hero}>
          {/* The icon is its own edit affordance: it sits where the user is already looking and
              costs no row of its own, so a wrong auto-guess is one tap from fixed. */}
          <Pressable
            onPress={() => setIconPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('tripIconChange')}
            style={({ pressed }) => [styles.heroIcon, pressed && { opacity: 0.7 }]}
          >
            <TripBadge trip={trip} size={44} rad={14} muted={trip.archived} />
          </Pressable>
          <Eyebrow>{t('tripRecordedExpenses')}</Eyebrow>
          <Amount value={totals.recordedExpenses} currency={dc.code} size={32} weight={700} />
          <Caption color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>
            {t('tripCountExpenses', { n: totals.txnCount })}
            {trip.archived ? ` · ${t('archivedTrips')}` : ''}
          </Caption>
        </Card>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => onAddExpense(trip.id, trip.name)}
            style={[styles.actionBtn, { backgroundColor: theme.accentInk }]}
            accessibilityRole="button"
          >
            <Icon name="plus" size={16} color="#fff" />
            <Text style={styles.actionBtnLabel}>{isZh ? '添加支出' : 'Add expense'}</Text>
          </Pressable>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={[styles.actionBtn, styles.actionBtnSecondary, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}
            accessibilityRole="button"
          >
            <Icon name="folder" size={16} color={colorTheme.ink} />
            <Text style={[styles.actionBtnLabel, { color: colorTheme.ink }]}>{t('addExistingExpenses')}</Text>
          </Pressable>
        </View>

        {totals.byCategory.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: spacing.base, marginBottom: spacing.sm }}>
              {isZh ? '按分类' : 'By category'}
            </Eyebrow>
            <Card style={styles.listCard}>
              {totals.byCategory.map((b, i) => {
                const cat = catById[b.categoryId] ?? fallback;
                const pct = totals.recordedExpenses > 0 ? Math.round((b.amount / totals.recordedExpenses) * 100) : 0;
                const on = categoryFilter === b.categoryId;
                return (
                  // A share of the total is a question ("what was the RM480 of food?"), so the
                  // row answers it: tapping narrows the list below to that category, tapping
                  // again clears it.
                  <Pressable
                    key={b.categoryId}
                    onPress={() => setCategoryFilter(on ? null : b.categoryId)}
                    style={({ pressed }) => [
                      styles.breakdownRow,
                      i > 0 && styles.divider,
                      i > 0 && { borderTopColor: colorTheme.line2 },
                      (pressed || on) && { backgroundColor: on ? theme.accentTint : colorTheme.surface2 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${tCat(cat)} ${pct}%`}
                  >
                    <CatBadge category={cat} size={36} />
                    <Text style={[styles.breakdownLabel, { color: colorTheme.ink }]} numberOfLines={1}>{tCat(cat)}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Amount value={b.amount} currency={dc.code} size={14} weight={700} />
                      <Caption color={colorTheme.ink2}>{pct}%</Caption>
                    </View>
                    <Icon name={on ? 'x' : 'chevronRight'} size={15} color={on ? theme.accent : colorTheme.ink3} />
                  </Pressable>
                );
              })}
            </Card>
          </>
        )}

        <Eyebrow style={{ marginTop: spacing.base, marginBottom: spacing.sm }}>
          {categoryFilter
            ? `${isZh ? '交易明细' : 'Transactions'} · ${tCat(catById[categoryFilter] ?? fallback)}`
            : (isZh ? '交易明细' : 'Transactions')}
        </Eyebrow>
        {sortedTxns.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Pip size={64} expr="curious" float />
            <Body color={colorTheme.ink2} style={{ textAlign: 'center', marginTop: spacing.md, lineHeight: 20 }}>
              {t('emptyTripBody')}
            </Body>
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {sortedTxns.map((tx, i) => (
              <View key={tx.id} style={[i > 0 && styles.divider, i > 0 && { borderTopColor: colorTheme.line2 }]}>
                <TxnRow
                  txn={tx}
                  cat={catById[tx.categoryId ?? 'other'] ?? fallback}
                  owed={owedByTxn[tx.id]}
                  dc={dc}
                  first={i === 0}
                  last={i === sortedTxns.length - 1}
                  selectMode={false}
                  isSel={false}
                  theme={theme}
                  colorTheme={colorTheme}
                  onPress={setEditing}
                  onLongPress={() => {}}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <EditTransactionModal txn={editing} onClose={() => setEditing(null)} />
      <AddExistingExpensesModal visible={pickerOpen} onClose={() => setPickerOpen(false)} tripId={trip.id} tripName={trip.name} />
      <TripIconPickerSheet
        visible={iconPickerOpen}
        trip={trip}
        onClose={() => setIconPickerOpen(false)}
        onPick={(icon) => {
          setIconPickerOpen(false);
          void setTripIcon(trip.id, icon);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },

  renameCard: { padding: spacing.base, marginBottom: spacing.md },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.base, marginTop: spacing.sm },
  renameActionBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },

  heroIcon: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  hero: { padding: spacing.base, marginBottom: spacing.md, alignItems: 'flex-start' },

  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 48, borderRadius: radius.sm },
  actionBtnSecondary: { borderWidth: 1 },
  actionBtnLabel: { fontFamily: uiFont(700), fontSize: 13.5, color: '#fff' },

  listCard: { overflow: 'hidden' },
  divider: { borderTopWidth: 1 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  breakdownLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5 },

  emptyCard: { padding: spacing.lg, alignItems: 'center' },

  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontFamily: uiFont(600), fontSize: 15 },

  // Add-existing-expenses sheet
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.base, paddingTop: spacing.sm, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  searchInput: { flex: 1, fontFamily: uiFont(600), fontSize: 14, paddingVertical: 11 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  checkbox: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  // Same pill idiom as AllTransactionsScreen's owedChip: a small tinted badge carrying one fact
  // the row would otherwise hide, sitting right under the row's date line.
  otherTripChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  otherTripChipText: { fontFamily: uiFont(600), fontSize: 10.5 },
  primaryLabel: { fontFamily: uiFont(700), fontSize: 15, color: '#fff' },
});
