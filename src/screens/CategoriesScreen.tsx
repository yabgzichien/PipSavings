import React, { useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { BtnLabel, Card, CatBadge, Eyebrow, PrimaryButton, TopBar } from '../components/ui';
import { AddCategorySheet } from '../components/AddCategorySheet';
import { DeleteCategorySheet } from '../components/DeleteCategorySheet';
import { OverflowMenu } from '../components/OverflowMenu';
import { InvalidReplacementCategoryError, LastVisibleCategoryError, NoFallbackCategoryError } from '../db/categoriesRepo';
import { catColorsForHue } from '../lib/catColors';
import { resolveCategoryPresentation } from '../lib/categoryPresentation';
import { confirmAction, notify } from '../lib/platformAlert';
import type { Category, TxnType } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { radius, shadowToggle, uiFont } from '../theme';
import { EXPENSE_ICONS, INCOME_ICONS, isCustomIcon } from '../lib/categoryIcons';

export { EXPENSE_ICONS, INCOME_ICONS, isCustomIcon } from '../lib/categoryIcons';

const HUE_CHOICES = [12, 42, 70, 120, 162, 200, 248, 286, 330];

/** Keep a hidden category's row intact while removing it from the visible management list. */
export function partitionCategories<T extends Pick<Category, 'isHidden'>>(categories: T[]): { visible: T[]; hidden: T[] } {
  return {
    visible: categories.filter((category) => !category.isHidden),
    hidden: categories.filter((category) => category.isHidden),
  };
}

/**
 * How much of the user's history a deletion would re-file: the transactions filed under the
 * category plus the live recurring bills pointing at it. Zero means the destination genuinely
 * does not matter and the user need not be asked for one.
 */
export function deletionImpact(
  transactions: { categoryId?: string | null }[],
  commitments: { categoryId?: string | null; archived?: boolean }[],
  categoryId: string
): number {
  const txns = transactions.filter((txn) => txn.categoryId === categoryId).length;
  const bills = commitments.filter((bill) => !bill.archived && bill.categoryId === categoryId).length;
  return txns + bills;
}

/** Keep reviewing linked recurring payments distinct from confirming the category hide. */
export function recurringCategoryHideActions(
  reviewLabel: string,
  onConfirm: () => void | Promise<void>,
  onReview: () => void | Promise<void>
) {
  return {
    onConfirm,
    neutralAction: { label: reviewLabel, onPress: onReview },
  };
}

export function CategoriesScreen({ onBack, onReviewCommitments, embedded }: { onBack: () => void; onReviewCommitments: () => void; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, tCat, isZh } = useLanguage();
  const {
    categories,
    commitments,
    transactions,
    deleteCategory,
    setCategoryHidden,
    updateCategoryHue,
    updateCategoryIcon,
    updateCategoryLabel,
  } = useAppData();

  const [kind, setKind] = useState<TxnType>('expense');
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  /** The category whose deletion is waiting on the user choosing where its history goes. */
  const [deleting, setDeleting] = useState<Category | null>(null);

  // Which existing category is being edited, and its presentation overrides chosen so far.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState<string>('cart');
  const [editLabel, setEditLabel] = useState('');
  const [editHue, setEditHue] = useState(162);
  const [editBusy, setEditBusy] = useState(false);

  const iconChoices = kind === 'income' ? INCOME_ICONS : EXPENSE_ICONS;
  const list = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const { visible: visibleCategories, hidden: hiddenCategories } = useMemo(() => partitionCategories(list), [list]);
  const hideActionLabel = kind === 'income' ? t('hideFromNewIncome') : t('hideFromNewExpenses');
  const hiddenSectionTitle = kind === 'income' ? t('hiddenIncomeSectionTitle') : t('hiddenSectionTitle');
  const hiddenHistoryNote = kind === 'income' ? t('hiddenIncomeKeepsHistoryNote') : t('hiddenKeepsHistoryNote');

  const pickCustomIcon = async (setter: (uri: string) => void) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      const dataUri = a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
      setter(dataUri);
    }
  };

  // Close an open editor when switching lists so we never save changes onto a row the user cannot see.
  useEffect(() => {
    setEditingId(null);
  }, [kind]);

  const displayCategory = (category: Category): Category => ({
    ...category,
    ...resolveCategoryPresentation(category, isZh ? 'zh' : 'en'),
  });

  const toggleEdit = (category: Category) => {
    if (editingId === category.id) {
      setEditingId(null);
      return;
    }
    const presentation = resolveCategoryPresentation(category, isZh ? 'zh' : 'en');
    setEditingId(category.id);
    setEditIcon(presentation.icon);
    setEditLabel(category.labelOverride ?? '');
    setEditHue(presentation.hue);
  };

  const saveEditedCategory = async () => {
    if (!editingId || editBusy) return;
    const category = categories.find((entry) => entry.id === editingId);
    if (!category) return;
    const presentation = resolveCategoryPresentation(category, isZh ? 'zh' : 'en');
    setEditBusy(true);
    try {
      await Promise.all([
        editIcon !== presentation.icon ? updateCategoryIcon(editingId, editIcon) : Promise.resolve(),
        editHue !== presentation.hue ? updateCategoryHue(editingId, editHue) : Promise.resolve(),
        editLabel.trim() !== (category.labelOverride ?? '') ? updateCategoryLabel(editingId, editLabel) : Promise.resolve(),
      ]);
      setEditingId(null);
    } finally {
      setEditBusy(false);
    }
  };

  const hideCategory = async (category: Category) => {
    const label = tCat(category);
    const usedBy = commitments.filter((commitment) => !commitment.archived && commitment.categoryId === category.id).length;
    const proceed = async () => {
      try {
        await setCategoryHidden(category.id, true);
      } catch (error) {
        if (error instanceof LastVisibleCategoryError) {
          notify(
            t('hideLastVisibleTitle'),
            t('hideLastVisibleBody')
              .replace('{label}', label)
              .replace(/\{kind\}/g, error.kind === 'income' ? (isZh ? '收入' : 'income') : (isZh ? '支出' : 'expense'))
          );
          return;
        }
        throw error;
      }
    };

    if (usedBy > 0) {
      const actions = recurringCategoryHideActions(t('reviewRecurringPayments'), proceed, onReviewCommitments);
      confirmAction(
        t('hideUsedByCommitmentTitle'),
        t('hideUsedByCommitmentBody').replace('{count}', String(usedBy)).replace('{label}', label),
        category.kind === 'income' ? t('hideFromNewIncome') : t('hideFromNewExpenses'),
        actions.onConfirm,
        actions.neutralAction
      );
      return;
    }
    await proceed();
  };

  /** Shared failure handling for both deletion paths. */
  const runDelete = async (id: string, label: string, replacementId?: string) => {
    try {
      await deleteCategory(id, replacementId);
    } catch (e) {
      if (e instanceof NoFallbackCategoryError) {
        notify(
          isZh ? '请先添加其他分类' : 'Add another category first',
          isZh ? `“${label}”是您唯一的${e.kind === 'income' ? '收入' : '支出'}分类。请先添加新分类后再删除。` : `“${label}” is your only ${e.kind} category, so there's nowhere to move its transactions. Add another ${e.kind} category, then delete this one.`
        );
        return;
      }
      if (e instanceof InvalidReplacementCategoryError) {
        notify(
          isZh ? '无法转移到该分类' : "That category can't take them",
          isZh ? '请选择另一个同类型的分类。' : 'Pick another category of the same kind and try again.'
        );
        return;
      }
      throw e;
    }
  };

  const confirmDelete = (category: Category, label: string) => {
    const moving = deletionImpact(transactions, commitments, category.id);
    const candidates = list.filter((entry) => entry.id !== category.id);

    // Nothing is filed here, so nothing about the user's history changes and there is no
    // meaningful choice to offer — the plain confirmation is the honest one.
    if (moving === 0 || candidates.length === 0) {
      confirmAction(
        isZh ? '删除分类？' : 'Delete category?',
        isZh ? `确定要删除“${label}”吗？` : `Remove “${label}”? Its learned merchants are cleared.`,
        isZh ? '删除' : 'Delete',
        () => { void runDelete(category.id, label); }
      );
      return;
    }
    setDeleting(category);
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={t('categoriesTitle')} onBack={onBack} />
        </View>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* kind toggle */}
        <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
          {(['expense', 'income'] as TxnType[]).map((k) => {
            const on = kind === k;
            return (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.toggleBtn, on && [styles.toggleBtnOn, { backgroundColor: colorTheme.surface }]]}>
                <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && { color: colorTheme.ink }]}>
                  {k === 'expense' ? (isZh ? '支出' : 'Expense') : (isZh ? '收入' : 'Income')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* visible categories */}
        <Eyebrow style={{ marginBottom: 10 }}>
          {isZh ? `您的${kind === 'expense' ? '支出' : '收入'}分类` : `Your ${kind} categories`}
        </Eyebrow>
        <Card style={{ overflow: 'hidden' }}>
          {visibleCategories.map((c, i) => (
            <View key={c.id}>
              <View style={[styles.row, i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }]]}>
                <Pressable onPress={() => toggleEdit(c)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${t('editCategory')}: ${tCat(c)}`}>
                  <CatBadge category={displayCategory(c)} size={38} />
                </Pressable>
                <Text style={[styles.rowLabel, { color: colorTheme.ink }]} numberOfLines={1}>
                  {tCat(c)}
                </Text>
                {/* One trigger, three named actions. The row used to carry an edit pencil, an
                    unlabelled chevron meaning "hide" and a red trash icon, which put management
                    louder than the category itself and left hiding undiscoverable. */}
                <OverflowMenu
                  title={tCat(c)}
                  accessibilityLabel={`${isZh ? '更多操作' : 'More actions'}: ${tCat(c)}`}
                  actions={[
                    { label: t('editCategory'), icon: 'pencil', onPress: () => toggleEdit(c) },
                    { label: hideActionLabel, icon: 'chevronDown', onPress: () => { void hideCategory(c); } },
                    { label: isZh ? '删除分类' : 'Delete category', icon: 'trash', destructive: true, onPress: () => confirmDelete(c, tCat(c)) },
                  ]}
                />
              </View>

              {editingId === c.id && (
                <View style={[styles.editPanel, { backgroundColor: colorTheme.surface2, borderTopColor: colorTheme.line2 }]}>
                  <View style={{ gap: 5 }}>
                    <Text style={[styles.pickLabel, { color: colorTheme.ink2 }]}>{t('renameCategory')}</Text>
                    <TextInput
                      value={editLabel}
                      onChangeText={setEditLabel}
                      placeholder={tCat(c)}
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.input, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
                      maxLength={22}
                      accessibilityLabel={t('renameCategory')}
                    />
                    <Text style={[styles.helperText, { color: colorTheme.ink2 }]}>{t('renameCategoryHint')}</Text>
                  </View>

                  <View style={{ gap: 9 }}>
                    <Text style={[styles.pickLabel, { color: colorTheme.ink2 }]}>{t('categoryColor')}</Text>
                    <View style={styles.choiceWrap}>
                      {HUE_CHOICES.map((hue) => {
                        const selected = hue === editHue;
                        return (
                          <Pressable
                            key={hue}
                            onPress={() => setEditHue(hue)}
                            style={[styles.hueChoice, { backgroundColor: catColorsForHue(hue).solid }, selected && [styles.hueChoiceOn, { borderColor: colorTheme.ink }]]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`${t('categoryColor')} ${hue}`}
                          >
                            {selected && <Icon name="check" size={14} color="#fff" stroke={2.6} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <Text style={[styles.pickLabel, { color: colorTheme.ink2 }]}>{t('categoryIcon')}</Text>
                  <View style={styles.choiceWrap}>
                    {iconChoices.map((ic) => {
                      const on = ic === editIcon;
                      return (
                        <Pressable key={ic} onPress={() => setEditIcon(ic)} style={[styles.iconChoice, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, on && { borderColor: theme.accent, backgroundColor: theme.accentTint }]} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${t('categoryIcon')}: ${ic}`}>
                          <Icon name={ic} size={20} color={on ? theme.accent : colorTheme.ink2} stroke={1.9} />
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => pickCustomIcon(setEditIcon)}
                      style={[
                        styles.iconChoice,
                        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
                        isCustomIcon(editIcon) && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                        { minWidth: 68, flexDirection: 'row', gap: 4, paddingHorizontal: 6 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={isZh ? '从相册选择图标' : 'Choose an icon from your gallery'}
                    >
                      {isCustomIcon(editIcon) ? (
                        <Image source={{ uri: editIcon }} style={{ width: 22, height: 22, borderRadius: 4 }} resizeMode="cover" />
                      ) : (
                        <Icon name="image" size={17} color={theme.accent} stroke={2.0} />
                      )}
                      <Text style={{ fontSize: 10, fontFamily: uiFont(700), color: theme.accent }}>{isZh ? '相册' : 'Gallery'}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.editActions}>
                    <Pressable onPress={() => setEditingId(null)} style={styles.editActionBtn} disabled={editBusy} accessibilityRole="button" accessibilityLabel={isZh ? '取消编辑分类' : 'Cancel editing category'}>
                      <Text style={[styles.editActionText, { color: colorTheme.ink2 }]}>{t('cancel')}</Text>
                    </Pressable>
                    <Pressable onPress={() => { void saveEditedCategory(); }} style={styles.editActionBtn} disabled={editBusy} accessibilityRole="button" accessibilityLabel={isZh ? '保存分类更改' : 'Save category changes'}>
                      <Text style={[styles.editActionText, { color: theme.accent }]}>{editBusy ? (isZh ? '保存中…' : 'Saving…') : t('save')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          ))}
        </Card>

        {hiddenCategories.length > 0 && (
          <View style={{ marginTop: 26 }}>
            <Eyebrow style={{ marginBottom: 5 }}>{hiddenSectionTitle}</Eyebrow>
            <Text style={[styles.helperText, { color: colorTheme.ink2, marginBottom: 10 }]}>{hiddenHistoryNote}</Text>
            <Card style={{ overflow: 'hidden' }}>
              {hiddenCategories.map((c, i) => (
                <View key={c.id} style={[styles.row, i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }]]}>
                  <CatBadge category={displayCategory(c)} size={38} />
                  <View style={styles.hiddenCopy}>
                    <Text style={[styles.rowLabel, { color: colorTheme.ink }]} numberOfLines={1}>{tCat(c)}</Text>
                    <Text style={[styles.hiddenBadge, { color: colorTheme.ink2 }]}>{t('hiddenBadge')}</Text>
                  </View>
                  <Pressable onPress={() => { void setCategoryHidden(c.id, false); }} style={[styles.showAgainBtn, { borderColor: theme.accent, backgroundColor: theme.accentTint }]} accessibilityRole="button" accessibilityLabel={`${t('showAgain')}: ${tCat(c)}`}>
                    <Text style={[styles.showAgainText, { color: theme.accent }]}>{t('showAgain')}</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          </View>
        )}

        <View style={{ marginTop: 26 }}>
          <PrimaryButton onPress={() => setAddSheetVisible(true)} height={50}>
            <Icon name="plus" size={18} color="#fff" stroke={2.2} />
            <BtnLabel>{t('addCategory')}</BtnLabel>
          </PrimaryButton>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      <AddCategorySheet
        visible={addSheetVisible}
        kind={kind}
        onClose={() => setAddSheetVisible(false)}
        onCreated={() => setAddSheetVisible(false)}
        onActivated={() => setAddSheetVisible(false)}
      />
      <DeleteCategorySheet
        category={deleting}
        candidates={deleting ? list.filter((entry) => entry.id !== deleting.id) : []}
        movingCount={deleting ? deletionImpact(transactions, commitments, deleting.id) : 0}
        onCancel={() => setDeleting(null)}
        onConfirm={(replacementId) => {
          const target = deleting;
          setDeleting(null);
          if (target) void runDelete(target.id, tCat(target), replacementId);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toggle: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
  },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 },
  divider: { borderTopWidth: 1 },
  rowLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 15 },
  hiddenCopy: { flex: 1, minWidth: 0, gap: 2 },
  hiddenBadge: { fontFamily: uiFont(700), fontSize: 11.5 },
  showAgainBtn: { minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  showAgainText: { fontFamily: uiFont(700), fontSize: 12 },
  editPanel: { padding: 15, paddingTop: 12, borderTopWidth: 1, gap: 12 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
  editActionBtn: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  editActionText: { fontFamily: uiFont(700), fontSize: 13.5 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontFamily: uiFont(600),
    fontSize: 15,
  },
  pickLabel: { fontFamily: uiFont(600), fontSize: 12.5 },
  helperText: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 17 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  iconChoice: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hueChoice: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  hueChoiceOn: { borderWidth: 2.5 },
});
