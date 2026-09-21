import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtMoney } from '../lib/format';
import { computeSplit, fromCents, sharesFromSplit, toCents, validateSplit, type Participant } from '../lib/split';
import type { SplitDraft, SplitMethod } from '../lib/types';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { numFont, radius, shadowToggle, uiFont } from '../theme';
import { AddPersonModal } from './AddPersonModal';
import { Icon } from './Icon';
import { InfoButton } from './InfoButton';
import { BtnLabel, PrimaryButton } from './ui';

const METHODS: { key: SplitMethod; label: string; hint: string; labelZh: string; hintZh: string }[] = [
  { key: 'equal', label: 'Equal', hint: 'Everyone pays the same', labelZh: '均摊', hintZh: '所有人平摊费用' },
  { key: 'shares', label: 'Shares', hint: 'Someone ate double', labelZh: '份数', hintZh: '按人头份数分摊' },
  { key: 'exact', label: 'Exact', hint: 'Type what each person owes', labelZh: '指定金额', hintZh: '输入每人应付具体金额' },
];

/**
 * Divide a bill you paid in full. What comes back is what the ledger should record as your own
 * expense, plus what each friend owes you as a receivable.
 *
 * The arithmetic lives in lib/split.ts; this only collects who was there and how to cut it. The
 * running total is recomputed on every keystroke so the payer's own share is never a surprise.
 */
export function SplitSheet({
  visible,
  gross,
  currency = 'MYR',
  merchant,
  initial,
  onClose,
  onApply,
  onRemove,
}: {
  visible: boolean;
  /** The full amount that left the account. */
  gross: number;
  currency?: string;
  merchant?: string;
  /** An existing split, when re-opening one to change it. */
  initial?: SplitDraft | null;
  onClose: () => void;
  onApply: (draft: SplitDraft) => void;
  /** Offered only when there is an existing split to clear. */
  onRemove?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { people, addPerson } = useAppData();

  const [currentGross, setCurrentGross] = useState(gross ?? 0);
  const [editingGross, setEditingGross] = useState(false);
  const [grossInput, setGrossInput] = useState((gross ?? 0).toFixed(2));

  const [method, setMethod] = useState<SplitMethod>('equal');
  const [includeSelf, setIncludeSelf] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [exacts, setExacts] = useState<Record<string, string>>({});
  const [selfWeight, setSelfWeight] = useState(1);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-seed whenever the sheet opens, so re-opening an existing split shows what is already
  // there rather than whatever the last bill happened to leave behind.
  //
  // A saved 'shares' split needs its portions recovered from the amounts (`sharesFromSplit`),
  // because nothing persists the weights themselves. Without that this used to reset every
  // participant to one share, which re-cut the bill equally on open: a RM120 dinner saved as
  // 30/60/30 redisplayed as 40/40/40, and "Save split" then wrote those figures for real.
  // When the portions cannot be recovered faithfully the sheet drops to 'exact', which shows
  // the saved amounts unchanged rather than inventing a portioning that would alter them.
  useEffect(() => {
    if (!visible) return;
    const initialGross = initial ? initial.gross : gross;
    setCurrentGross(initialGross);
    setGrossInput(initialGross.toFixed(2));
    setEditingGross(false);
    if (initial && initial.shares.length > 0) {
      // Replayed against the gross the split was SAVED at, not the sheet's current one: the
      // portions are the user's intent, and re-applying them to an amount edited since is
      // what they'd expect. `itemized` has no portions to recover and never had.
      const recovered =
        initial.method === 'shares' ? sharesFromSplit(initial.gross, initial.ownShare, initial.shares) : null;
      const unrecoverable = initial.method === 'itemized' || (initial.method === 'shares' && !recovered);
      setMethod(unrecoverable ? 'exact' : initial.method);
      setPicked(initial.shares.map((s) => s.personId));
      setExacts(Object.fromEntries(initial.shares.map((s) => [s.personId, s.owed.toFixed(2)])));
      setWeights(recovered?.weights ?? {});
      setSelfWeight(recovered?.selfWeight ?? 1);
      setIncludeSelf(initial.ownShare > 0);
    } else {
      setMethod('equal');
      setPicked([]);
      setWeights({});
      setExacts({});
      setSelfWeight(1);
      setIncludeSelf(true);
    }
  }, [visible, initial, gross]);

  const commitGrossEdit = () => {
    const val = parseFloat(grossInput.replace(/[^0-9.]/g, ''));
    if (!isNaN(val) && val > 0) {
      const rounded = Math.round(val * 100) / 100;
      setCurrentGross(rounded);
      setGrossInput(rounded.toFixed(2));
    } else {
      setGrossInput(currentGross.toFixed(2));
    }
    setEditingGross(false);
  };

  const participants: Participant[] = useMemo(
    () =>
      picked.map((id) => ({
        personId: id,
        weight: weights[id] ?? 1,
        exact: parseFloat((exacts[id] ?? '').replace(/[^0-9.]/g, '')) || 0,
      })),
    [picked, weights, exacts]
  );

  const sumExacts = useMemo(() => {
    const totalCents = participants.reduce((s, p) => s + Math.max(0, toCents(p.exact ?? 0)), 0);
    return fromCents(totalCents);
  }, [participants]);

  const input = { gross: currentGross, participants, method, includeSelf, selfWeight };
  const error = useMemo(() => validateSplit(input), [currentGross, participants, method, includeSelf, selfWeight]);
  const result = useMemo(() => computeSplit(input), [currentGross, participants, method, includeSelf, selfWeight]);

  const canOverwriteGross = useMemo(() => {
    if (method !== 'exact' || sumExacts <= 0) return false;
    const grossCents = toCents(currentGross);
    const sumCents = toCents(sumExacts);
    if (sumCents > grossCents) return true;
    if (!includeSelf && sumCents !== grossCents) return true;
    return false;
  }, [method, sumExacts, currentGross, includeSelf]);

  const overwriteGross = () => {
    setCurrentGross(sumExacts);
    setGrossInput(sumExacts.toFixed(2));
  };

  const owedBy = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of result.shares) map[s.personId] = s.owed;
    return map;
  }, [result]);

  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const unpicked = useMemo(() => people.filter((p) => !picked.includes(p.id)), [people, picked]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addNew = async (name: string) => {
    const person = await addPerson(name);
    setPicked((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]));
  };

  const bump = (id: string, by: number) =>
    setWeights((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + by) }));

  const apply = () => {
    if (error) return;
    onApply({
      gross: currentGross,
      ownShare: result.ownShare,
      method,
      shares: result.shares.filter((s) => s.owed > 0),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.sheetAvoider}
        pointerEvents="box-none"
      >
        <View style={[styles.sheetCard, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <View style={styles.head}>
          <View style={{ flex: 1 }}>
            {editingGross ? (
              <View style={styles.headerEditRow}>
                <Text style={[styles.title, { color: colorTheme.ink }]}>
                  {isZh ? '分摊' : 'Split'}
                </Text>
                <TextInput
                  value={grossInput}
                  onChangeText={setGrossInput}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  onBlur={commitGrossEdit}
                  onSubmitEditing={commitGrossEdit}
                  style={[
                    styles.grossInput,
                    {
                      color: colorTheme.ink,
                      backgroundColor: colorTheme.surface2,
                      borderColor: theme.accent,
                    },
                  ]}
                />
                <Pressable
                  onPress={commitGrossEdit}
                  hitSlop={6}
                  style={[styles.headerConfirmBtn, { backgroundColor: theme.accent }]}
                  accessibilityLabel={isZh ? '确认' : 'Confirm'}
                >
                  <Icon name="check" size={14} color="#fff" stroke={2.6} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable
                  onPress={() => {
                    setGrossInput(currentGross.toFixed(2));
                    setEditingGross(true);
                  }}
                  style={styles.headerTitlePressable}
                  accessibilityLabel={isZh ? '修改账单总额' : 'Edit bill total'}
                >
                  <Text style={[styles.title, { color: colorTheme.ink }]}>
                    {isZh ? `分摊 ${fmtMoney(currentGross, currency)}` : `Split ${fmtMoney(currentGross, currency)}`}
                  </Text>
                  <Icon name="pencil" size={14} color={colorTheme.ink3} />
                </Pressable>
                <InfoButton entry="split_bill" />
              </View>
            )}
            {!!merchant && (
              <Text style={[styles.subtitle, { color: colorTheme.ink2 }]} numberOfLines={1}>
                {merchant}
              </Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={isZh ? '关闭' : 'Close'}>
            <Icon name="x" size={20} color={colorTheme.ink2} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
            {METHODS.map((m) => {
              const on = method === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setMethod(m.key)}
                  style={[styles.toggleBtn, on && styles.toggleBtnOn, on && { backgroundColor: colorTheme.surface }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && styles.toggleTextOn, on && { color: colorTheme.ink }]}>
                    {isZh ? m.labelZh : m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colorTheme.ink3 }]}>
            {isZh ? METHODS.find((m) => m.key === method)?.hintZh : METHODS.find((m) => m.key === method)?.hint}
          </Text>

          <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '同行人员' : 'Who else was there'}</Text>
          <View style={styles.chipWrap}>
            {unpicked.map((p) => (
              <Pressable key={p.id} onPress={() => toggle(p.id)} style={[styles.chip, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
                <Icon name="plus" size={13} color={theme.accent} stroke={2.4} />
                <Text style={[styles.chipText, { color: theme.onTint }]}>{p.name}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setAddPersonOpen(true)} style={[styles.chip, styles.addChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <Icon name="plus" size={13} color={colorTheme.ink2} stroke={2.4} />
              <Text style={[styles.chipText, { color: colorTheme.ink2 }]}>{isZh ? '添加人员' : 'Add a name'}</Text>
            </Pressable>
          </View>

          {picked.length === 0 ? (
            <Text style={[styles.empty, { color: colorTheme.ink3 }]}>
              {isZh ? '尚未添加同行人员。点击上方人员或新建人员。' : 'Nobody added yet. Tap a name above, or type a new one.'}
            </Text>
          ) : (
            <View style={styles.list}>
              {picked.map((id) => (
                <View key={id} style={[styles.personRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                  <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[styles.avatarText, { color: theme.onTint }]}>{(nameById[id] ?? '?').slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.personName, { color: colorTheme.ink }]} numberOfLines={1}>
                    {nameById[id] ?? (isZh ? '某人' : 'Someone')}
                  </Text>

                  {method === 'shares' && (
                    <View style={styles.stepper}>
                      <Pressable onPress={() => bump(id, -1)} style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]} hitSlop={4} accessibilityLabel="Fewer shares">
                        <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>−</Text>
                      </Pressable>
                      <Text style={[styles.stepValue, { color: colorTheme.ink }]}>{weights[id] ?? 1}</Text>
                      <Pressable onPress={() => bump(id, 1)} style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]} hitSlop={4} accessibilityLabel="More shares">
                        <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>+</Text>
                      </Pressable>
                    </View>
                  )}

                  {method === 'exact' ? (
                    <TextInput
                      value={exacts[id] ?? ''}
                      onChangeText={(v) => setExacts((prev) => ({ ...prev, [id]: v }))}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.exactInput, { color: colorTheme.ink, backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                    />
                  ) : (
                    <Text style={[styles.owed, { color: colorTheme.ink }]}>{fmtMoney(owedBy[id] ?? 0, currency)}</Text>
                  )}

                  <Pressable onPress={() => toggle(id)} hitSlop={8} accessibilityLabel={`Remove ${nameById[id] ?? 'person'}`}>
                    <Icon name="x" size={16} color={colorTheme.ink3} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={() => setIncludeSelf((v) => !v)}
            style={styles.selfRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: includeSelf }}
          >
            <View style={[styles.check, { borderColor: colorTheme.line, backgroundColor: colorTheme.surface }, includeSelf && styles.checkOn, includeSelf && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
              {includeSelf && <Icon name="check" size={13} color={theme.onAccent} stroke={2.6} />}
            </View>
            <Text style={[styles.selfText, { color: colorTheme.ink }]}>{isZh ? '我也参与了这笔账单' : 'I was on this bill too'}</Text>
            {includeSelf && method === 'shares' && (
              <View style={styles.stepper}>
                <Pressable onPress={() => setSelfWeight((w) => Math.max(1, w - 1))} style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]} hitSlop={4}>
                  <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>−</Text>
                </Pressable>
                <Text style={[styles.stepValue, { color: colorTheme.ink }]}>{selfWeight}</Text>
                <Pressable onPress={() => setSelfWeight((w) => w + 1)} style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]} hitSlop={4}>
                  <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>+</Text>
                </Pressable>
              </View>
            )}
          </Pressable>

          <View style={[styles.summary, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colorTheme.ink }]}>{isZh ? '个人支出' : 'Your expense'}</Text>
              <Text style={[styles.summaryValue, { color: colorTheme.ink }]}>{fmtMoney(result.ownShare, currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabelSoft, { color: colorTheme.ink2 }]}>{isZh ? '待收借款' : 'Owed to you'}</Text>
              <Text style={[styles.summaryValueSoft, { color: theme.accent }]}>
                {fmtMoney(result.shares.reduce((s, x) => s + x.owed, 0), currency)}
              </Text>
            </View>
            <Text style={[styles.summaryNote, { color: colorTheme.ink3 }]}>
              {isZh
                ? '仅将您个人承担的份额记为支出。其余部分将作为待收借款，待对方还款后结清。'
                : 'Only your share is recorded as spending. The rest becomes money owed to you, and clears when they pay you back.'}
            </Text>
          </View>

          {!!error && picked.length > 0 && (
            <View style={[styles.errorContainer, canOverwriteGross && { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <Text style={styles.error}>{error}</Text>
              {canOverwriteGross && (
                <Pressable
                  onPress={overwriteGross}
                  style={[styles.overwriteBtn, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}
                  accessibilityLabel={
                    isZh
                      ? `将账单总额改为 ${fmtMoney(sumExacts, currency)}`
                      : `Overwrite bill total to ${fmtMoney(sumExacts, currency)}`
                  }
                >
                  <Icon name="pencil" size={13} color={theme.accent} stroke={2.4} />
                  <Text style={[styles.overwriteText, { color: theme.onTint }]}>
                    {isZh
                      ? `将账单总额改为 ${fmtMoney(sumExacts, currency)}`
                      : `Overwrite bill total to ${fmtMoney(sumExacts, currency)}`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <View style={{ marginTop: 16 }}>
            <PrimaryButton onPress={apply} height={52} disabled={!!error}>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
              <BtnLabel>{isZh ? '保存分账' : 'Save split'}</BtnLabel>
            </PrimaryButton>
          </View>

          {!!onRemove && (
            <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={6}>
              <Icon name="trash" size={16} color="#b3261e" />
              <Text style={styles.removeText}>{isZh ? '取消分账' : 'Remove split'}</Text>
            </Pressable>
          )}
        </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <AddPersonModal visible={addPersonOpen} onClose={() => setAddPersonOpen(false)} onSubmit={addNew} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheetAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontFamily: uiFont(700), fontSize: 19 },
  headerTitlePressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grossInput: {
    minWidth: 90,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    fontFamily: numFont(700),
    fontSize: 17,
  },
  headerConfirmBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { fontFamily: uiFont(500), fontSize: 13, marginTop: 2 },
  toggle: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
  },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14 },
  toggleTextOn: {},
  hint: { fontFamily: uiFont(500), fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontFamily: uiFont(600), fontSize: 13 },
  addChip: { borderStyle: 'dashed' },
  empty: { fontFamily: uiFont(500), fontSize: 13, marginTop: 14, textAlign: 'center' },
  list: { marginTop: 14, gap: 8 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: uiFont(700), fontSize: 13 },
  personName: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5 },
  owed: { fontFamily: numFont(700), fontSize: 15 },
  exactInput: {
    width: 88,
    textAlign: 'right',
    fontFamily: numFont(700),
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontFamily: uiFont(700), fontSize: 15, lineHeight: 18 },
  stepValue: { fontFamily: numFont(700), fontSize: 14, minWidth: 14, textAlign: 'center' },
  selfRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {},
  selfText: { flex: 1, fontFamily: uiFont(600), fontSize: 14 },
  summary: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: uiFont(700), fontSize: 14 },
  summaryValue: { fontFamily: numFont(700), fontSize: 17 },
  summaryLabelSoft: { fontFamily: uiFont(600), fontSize: 13 },
  summaryValueSoft: { fontFamily: numFont(600), fontSize: 14 },
  summaryNote: { fontFamily: uiFont(500), fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  errorContainer: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 8,
  },
  error: { fontFamily: uiFont(600), fontSize: 12.5, color: '#b3261e', textAlign: 'center' },
  overwriteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 2,
  },
  overwriteText: { fontFamily: uiFont(700), fontSize: 13 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  removeText: { fontFamily: uiFont(700), fontSize: 14, color: '#b3261e' },
});
