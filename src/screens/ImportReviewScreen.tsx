// src/screens/ImportReviewScreen.tsx
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddCategoryModal } from '../components/AddCategoryModal';
import { Icon } from '../components/Icon';
import { B, BtnLabel, BubbleText, Card, CatBadge, CategoryChip, Eyebrow, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { canActivateCurrency } from '../billing/currencyEntitlements';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { activateCurrency, getActiveCurrencies } from '../db/currencyRepo';
import { BASE_CURRENCY } from '../lib/currency';
import { shortDate } from '../lib/dates';
import { findDuplicate, todayISO } from '../lib/duplicates';
import { currencyPrefix, fmt, fmtMoney } from '../lib/format';
import { assignImported, detectSourceVocabulary, pendingLabel, resolvePending, PENDING_CAT } from '../lib/import';
import { notify } from '../lib/platformAlert';
import { DROP, type Category, type ExtractedTxn, type TxnType } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { numFont, radius, shadowToggle, uiFont } from '../theme';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null };

// Hues for categories the import wants to create, cycled so a batch of new
// labels does not come out all the same colour. Matches AddCategoryModal.
const NEW_CAT_HUES = [12, 42, 70, 120, 162, 200, 248, 286, 330];

interface Row {
  item: ExtractedTxn; // working copy (amount/type editable)
  categoryId: string;
  include: boolean;
  isDup: boolean;
}

/**
 * Review extracted rows before saving: auto-filled categories, editable
 * amount/type/category per row, removable rows, and duplicates excluded by
 * default. Confirms by handing back items + assignments (excluded → DROP).
 */
export function ImportReviewScreen({
  items,
  onCancel,
  onConfirm,
  updateAccountBalances,
  onToggleUpdateAccountBalances,
}: {
  items: ExtractedTxn[];
  onCancel: () => void;
  onConfirm: (items: ExtractedTxn[], assignments: (string | null)[]) => void;
  updateAccountBalances?: boolean;
  onToggleUpdateAccountBalances?: (val: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { categories, catById, memory, transactions, addCategory } = useAppData();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();
  const today = useMemo(() => todayISO(), []);

  // Does this file carry its own category taxonomy (a tracker export) rather
  // than free-text hints (a statement)? If so, offer to keep it as-is instead
  // of folding labels like "Toll" or "fyy" into the built-in buckets.
  const vocabulary = useMemo(() => detectSourceVocabulary(items, categories), [items, categories]);
  const newLabels = useMemo(
    () => vocabulary.labels.filter((l) => l.existingId === null),
    [vocabulary]
  );
  const offerKeep = vocabulary.isTracker && newLabels.length > 0;
  const [keepSource, setKeepSource] = useState(offerKeep);
  const [saving, setSaving] = useState(false);

  const assign = (keep: boolean) =>
    assignImported(items, memory, categories, catById, keep ? vocabulary : null);

  const [rows, setRows] = useState<Row[]>(() => {
    const cats = assign(offerKeep);
    return items.map((item, i) => {
      const isDup = !!findDuplicate(transactions, { merchant: item.merchant, amount: item.amount, date: item.date }, today);
      return { item: { ...item }, categoryId: cats[i], include: !isDup, isDup };
    });
  });
  const [editing, setEditing] = useState<number | null>(null);
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([BASE_CURRENCY]);
  const [activatingCode, setActivatingCode] = useState<string | null>(null);

  React.useEffect(() => {
    getActiveCurrencies().then(setActiveCurrencies);
  }, []);

  const unactivatedCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.item.currency && r.item.currency !== BASE_CURRENCY && !activeCurrencies.includes(r.item.currency)) {
        set.add(r.item.currency);
      }
    }
    return Array.from(set);
  }, [rows, activeCurrencies]);

  const onActivateCurrency = async (code: string) => {
    if (activatingCode) return;
    if (!canActivateCurrency(activeCurrencies, code, isPro)) {
      openPaywall('multi_currency');
      return;
    }
    setActivatingCode(code);
    try {
      const ok = await activateCurrency(code);
      if (!ok) {
        notify(`Couldn't fetch the ${code} rate.`, "Try again when you're online.");
        return;
      }
      const nextActive = await getActiveCurrencies();
      setActiveCurrencies(nextActive);
    } finally {
      setActivatingCode(null);
    }
  };

  // Stand-in categories for labels that do not exist yet, so the preview and
  // the row editor can show them before anything is written to the database.
  const pendingCats = useMemo<Category[]>(
    () =>
      newLabels.map((l, i) => ({
        id: `${PENDING_CAT}${l.label}`,
        label: l.label,
        icon: 'dots',
        hue: NEW_CAT_HUES[i % NEW_CAT_HUES.length],
        kind: l.kind,
        isDefault: false,
        isHidden: false,
        templateKey: null,
        labelOverride: null,
        iconOverride: null,
        hueOverride: null,
      })),
    [newLabels]
  );
  const displayCats = useMemo(
    () => (keepSource ? [...categories, ...pendingCats] : categories),
    [keepSource, categories, pendingCats]
  );
  const displayCatById = useMemo(
    () => Object.fromEntries(displayCats.map((c) => [c.id, c])) as Record<string, Category>,
    [displayCats]
  );

  const included = rows.filter((r) => r.include).length;
  const dupCount = rows.filter((r) => r.isDup).length;

  const patchRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** Re-file every row under the other scheme, keeping the tick boxes as they are. */
  const toggleKeepSource = (keep: boolean) => {
    setKeepSource(keep);
    const cats = assign(keep);
    setRows((prev) => prev.map((r, i) => ({ ...r, categoryId: cats[i] })));
  };

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const outItems = rows.map((r) => r.item);
      let assignments: (string | null)[] = rows.map((r) => (r.include ? r.categoryId : DROP));

      // Create the source's own categories, but only the ones still in use once
      // the user has finished unticking and re-filing rows.
      const wanted = new Set(assignments.map((a) => pendingLabel(a)).filter(Boolean) as string[]);
      if (wanted.size > 0) {
        const created: Record<string, string> = {};
        for (const cat of pendingCats) {
          if (!wanted.has(cat.label)) continue;
          created[cat.label] = await addCategory(cat.label, cat.icon, cat.hue, cat.kind);
        }
        assignments = resolvePending(assignments, created);
      }

      onConfirm(outItems, assignments);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Review import" onBack={onCancel} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        <PipSays expr="idle">
          <BubbleText>
            I found <B>{items.length}</B> transaction{items.length === 1 ? '' : 's'}. Check the categories and amounts, untick anything you don’t want, then import.
            {dupCount > 0 ? <BubbleText>{' '}I’ve unticked <B>{dupCount}</B> that look like duplicates.</BubbleText> : null}
          </BubbleText>
        </PipSays>

        {offerKeep && (
          <Card style={{ padding: 14, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => toggleKeepSource(!keepSource)} hitSlop={6} style={{ padding: 2 }}>
              <View
                style={[
                  styles.box,
                  { borderColor: colorTheme.line },
                  keepSource && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              >
                {keepSource && <Icon name="check" size={13} color="#fff" stroke={2.6} />}
              </View>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => toggleKeepSource(!keepSource)}>
              <Text style={[styles.merchant, { color: colorTheme.ink }]}>
                Keep this file’s own categories
              </Text>
              <Text style={[styles.meta, { color: colorTheme.ink2, marginTop: 2 }]}>
                {keepSource
                  ? `Adds ${newLabels.map((l) => l.label).join(', ')}`
                  : 'Off: rows go into your existing categories instead'}
              </Text>
            </Pressable>
          </Card>
        )}

        {onToggleUpdateAccountBalances !== undefined && (
          <Card style={{ padding: 14, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() => onToggleUpdateAccountBalances(!updateAccountBalances)}
              hitSlop={6}
              style={{ padding: 2 }}
            >
              <View
                style={[
                  styles.box,
                  { borderColor: colorTheme.line },
                  updateAccountBalances && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              >
                {updateAccountBalances && <Icon name="check" size={13} color="#fff" stroke={2.6} />}
              </View>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => onToggleUpdateAccountBalances(!updateAccountBalances)}>
              <Text style={[styles.merchant, { color: colorTheme.ink }]}>
                Update asset & liability balances
              </Text>
              <Text style={[styles.meta, { color: colorTheme.ink2, marginTop: 2 }]}>
                Apply imported income and expenses to adjust asset and liability account balances
              </Text>
            </Pressable>
          </Card>
        )}

        {unactivatedCurrencies.map((code) => (
          <Card
            key={code}
            style={{
              padding: 14,
              marginTop: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.merchant, { color: colorTheme.ink }]}>
                Detected {code} transactions
              </Text>
              <Text style={[styles.meta, { color: colorTheme.ink2, marginTop: 2 }]}>
                Add {code} to convert and track expenses in this currency.
              </Text>
            </View>
            <Pressable
              onPress={() => onActivateCurrency(code)}
              disabled={activatingCode === code}
              style={[
                styles.addCurrencyBtn,
                { backgroundColor: theme.accent },
                activatingCode === code && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Add ${code}`}
            >
              {activatingCode === code ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.addCurrencyBtnText}>Add {code}</Text>
              )}
            </Pressable>
          </Card>
        ))}

        <Eyebrow style={{ marginTop: 18, marginBottom: 10 }}>{included} of {rows.length} selected</Eyebrow>

        <Card style={{ overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const cat = displayCatById[r.categoryId] ?? fallback;
            const income = r.item.type === 'income';
            return (
              <View key={i} style={[styles.row, i > 0 && styles.divider, i > 0 && { borderTopColor: colorTheme.line2 }, !r.include && styles.rowOff]}>
                <Pressable onPress={() => patchRow(i, { include: !r.include })} hitSlop={6} style={styles.check}>
                  <View style={[styles.box, { borderColor: colorTheme.line }, r.include && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                    {r.include && <Icon name="check" size={13} color="#fff" stroke={2.6} />}
                  </View>
                </Pressable>

                <Pressable style={styles.rowMain} onPress={() => setEditing(i)}>
                  <CatBadge category={cat} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.merchant, { color: colorTheme.ink }]} numberOfLines={1}>{cat.label}</Text>
                    <View style={styles.metaRow}>
                      <Text style={[styles.meta, { color: colorTheme.ink2 }]} numberOfLines={1}>
                        {[r.item.merchant, r.item.date ? shortDate(r.item.date) : null].filter(Boolean).join(' · ')}
                      </Text>
                      {Boolean(r.item.tripName) && (
                        <View style={[styles.tripTag, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                          <Text style={[styles.tripTagText, { color: colorTheme.ink2 }]} numberOfLines={1}>✈️ {r.item.tripName}</Text>
                        </View>
                      )}
                      {r.isDup && <Text style={styles.dupTag}>duplicate</Text>}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.amount, { color: income ? theme.accent : colorTheme.ink }]}>
                      {income ? '+' : ''}{fmtMoney(r.item.amount, r.item.currency)}
                    </Text>
                    <Icon name="pencil" size={13} color={colorTheme.ink3} />
                  </View>
                </Pressable>
              </View>
            );
          })}
        </Card>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2, paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton onPress={confirm} disabled={included === 0 || saving}>
          <Icon name="check" size={19} color="#fff" stroke={2.4} />
          <BtnLabel>Import {included} transaction{included === 1 ? '' : 's'}</BtnLabel>
        </PrimaryButton>
      </View>

      <RowEditModal
        row={editing != null ? rows[editing] : null}
        categories={displayCats}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (editing != null) patchRow(editing, patch);
          setEditing(null);
        }}
      />
    </View>
  );
}

/** Bottom-sheet editor for a single pre-save row (amount + type + category). */
function RowEditModal({
  row,
  categories,
  onClose,
  onSave,
}: {
  row: Row | null;
  categories: Category[];
  onClose: () => void;
  onSave: (patch: Partial<Row>) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [amountText, setAmountText] = useState('');
  const [type, setType] = useState<TxnType>('expense');
  const [cat, setCat] = useState<string>('other');
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const openKey = row ? row.item.merchant + row.item.amount : null;
  React.useEffect(() => {
    if (row) {
      setAmountText(row.item.amount.toFixed(2));
      setType(row.item.type);
      setCat(row.categoryId);
      setExpanded(false);
    }
  }, [openKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const visible = useMemo(() => {
    if (expanded) return grid;
    const top4 = grid.slice(0, 4);
    if (top4.some((c) => c.id === cat)) return top4;
    const selected = grid.find((c) => c.id === cat);
    return selected ? [selected, ...top4].slice(0, 4) : top4;
  }, [grid, expanded, cat]);

  if (!row) return <Modal visible={false} transparent />;

  const switchType = (t: TxnType) => {
    if (t === type) return;
    setType(t);
    setCat((prev) => {
      const c = categories.find((x) => x.id === prev);
      return c && c.kind === t ? prev : t === 'income' ? 'income' : 'other';
    });
  };

  const save = () => {
    const n = parseFloat(amountText.replace(/[^0-9.]/g, ''));
    const amount = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : row.item.amount;
    onSave({ item: { ...row.item, amount, type }, categoryId: cat });
  };

  const currentCatLabel = categories.find((c) => c.id === cat)?.label ?? (type === 'income' ? 'Income' : 'Expense');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.sheetAvoider}
        pointerEvents="box-none"
      >
        <View style={[styles.sheetCard, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: colorTheme.ink }]} numberOfLines={1}>{row.item.merchant || currentCatLabel}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Icon name="x" size={20} color={colorTheme.ink2} /></Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
            {(['expense', 'income'] as TxnType[]).map((k) => {
              const on = type === k;
              return (
                <Pressable key={k} onPress={() => switchType(k)} style={[styles.toggleBtn, on && [styles.toggleBtnOn, { backgroundColor: colorTheme.surface }]]}>
                  <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && { color: colorTheme.ink }]}>{k === 'expense' ? 'Expense' : 'Income'}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={[styles.rmPrefix, { color: colorTheme.ink2 }]}>
              {currencyPrefix(row.item.currency)}
            </Text>
            <TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" selectTextOnFocus style={[styles.amountInput, { color: colorTheme.ink, backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]} />
          </View>

          <Text style={[styles.fieldLabel, { color: colorTheme.ink2, marginTop: 18 }]}>Category</Text>
          <View style={styles.grid}>
            {visible.map((c) => (
              <View key={c.id} style={styles.gridCell}>
                <CategoryChip category={c} selected={cat === c.id} suggested={false} onPress={() => setCat(c.id)} />
              </View>
            ))}
            {expanded && (
              <View style={styles.gridCell}>
                <Pressable onPress={() => setAdding(true)} style={[styles.addChip, { borderColor: theme.accentSoft, backgroundColor: theme.accentTint }]}>
                  <Icon name="plus" size={16} color={theme.accent} stroke={2.2} />
                  <Text style={[styles.addChipText, { color: theme.accent }]}>New category</Text>
                </Pressable>
              </View>
            )}
          </View>
          {grid.length > 4 && (
            <Pressable onPress={() => setExpanded((e) => !e)} style={styles.moreBtn} hitSlop={6}>
              <Text style={[styles.moreText, { color: theme.accent }]}>{expanded ? 'Show less' : `Show all ${grid.length}`}</Text>
              <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                <Icon name="chevronDown" size={16} color={theme.accent} />
              </View>
            </Pressable>
          )}

          <View style={{ marginTop: 20 }}>
            <PrimaryButton onPress={save} height={52}>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
              <BtnLabel>Done</BtnLabel>
            </PrimaryButton>
          </View>
        </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <AddCategoryModal
        visible={adding}
        kind={type}
        onClose={() => setAdding(false)}
        onCreated={(id) => { setCat(id); setAdding(false); }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  rowOff: { opacity: 0.45 },
  divider: { borderTopWidth: 1 },
  check: { padding: 2 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  merchant: { fontFamily: uiFont(600), fontSize: 14.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  meta: { fontFamily: uiFont(500), fontSize: 12, flexShrink: 1 },
  dupTag: { fontFamily: uiFont(700), fontSize: 11, color: '#d98a00', backgroundColor: '#fbf0d8', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  tripTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1, overflow: 'hidden', maxWidth: 140 },
  tripTagText: { fontFamily: uiFont(600), fontSize: 10.5 },
  amount: { fontFamily: numFont(700), fontSize: 14 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheetAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { flex: 1, fontFamily: uiFont(700), fontSize: 19, marginRight: 12 },
  toggle: { flexDirection: 'row', borderRadius: 999, padding: 4, marginBottom: 18, borderWidth: 1 },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14 },
  toggleTextOn: {},
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rmPrefix: { fontFamily: numFont(600), fontSize: 18 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  addChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: 'dashed' },
  addChipText: { fontFamily: uiFont(700), fontSize: 13.5 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  moreText: { fontFamily: uiFont(600), fontSize: 13.5 },
  addCurrencyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCurrencyBtnText: {
    color: '#ffffff',
    fontFamily: uiFont(700),
    fontSize: 13,
  },
});
