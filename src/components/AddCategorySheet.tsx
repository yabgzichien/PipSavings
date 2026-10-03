import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OPTIONAL_GROUPS, optionalCategoriesForKind, searchOptionalCategories, type OptionalCategory } from '../data/optionalCategories';
import { useLanguage } from '../i18n';
import { OPTIONAL_CATEGORY_TRANSLATIONS, OPTIONAL_GROUP_TITLES } from '../i18n/categoryTranslations';
import { notify } from '../lib/platformAlert';
import { createOpeningGuard } from '../lib/openingGuard';
import type { Category, TxnType } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';
import { CreateCategoryForm } from './AddCategoryModal';
import { BtnLabel, CatBadge, PrimaryButton } from './ui';

type SheetTab = 'suggested' | 'create';

function catalogueCategory(category: OptionalCategory): Category {
  return {
    id: category.id,
    label: category.label,
    icon: category.icon,
    hue: category.hue,
    kind: category.kind,
    isDefault: false,
    isHidden: false,
    templateKey: category.templateKey,
    labelOverride: null,
    iconOverride: null,
    hueOverride: null,
  };
}

/** Shared category picker: activate supplied suggestions in a batch or create one custom row. */
export function AddCategorySheet({
  visible,
  kind,
  onClose,
  onCreated,
  onActivated,
}: {
  visible: boolean;
  kind: TxnType;
  onClose: () => void;
  onCreated?: (categoryId: string) => void;
  onActivated?: (categoryIds: string[]) => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const colorTheme = useThemeColors();
  const { isZh, t } = useLanguage();
  const { categories, activateSuggested } = useAppData();
  const [tab, setTab] = useState<SheetTab>('suggested');
  const [query, setQuery] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const openingGuard = useRef(createOpeningGuard());

  // Whether Pip supplies anything for the kind being added. Income has no catalogue today, and
  // an empty Suggested tab reads as a broken feature — so when there is nothing to suggest the
  // sheet is simply the custom form.
  const hasSuggestions = useMemo(() => optionalCategoriesForKind(kind).length > 0, [kind]);

  // Layout effects run after a committed visible change but before the frame is presented.
  // That gives a programmatic close/reopen the same stale-work protection as a user close,
  // without mutating refs during a render that React may later discard.
  useLayoutEffect(() => {
    if (visible) {
      openingGuard.current.open();
      setTab(hasSuggestions ? 'suggested' : 'create');
      setQuery('');
      setSelectedKeys([]);
      setBusy(false);
    } else {
      openingGuard.current.close();
    }

    // Invalidate pending work if the sheet unmounts while visible. This cleanup is also
    // safe under StrictMode's effect setup/cleanup replay because each committed setup
    // owns the generation it invalidates on cleanup.
    return () => {
      openingGuard.current.close();
    };
  }, [visible, hasSuggestions]);

  const language = isZh ? 'zh' : 'en';
  const matches = useMemo(() => searchOptionalCategories(query, language, kind), [kind, language, query]);
  const matchesByGroup = useMemo(
    () => new Map(OPTIONAL_GROUPS.map((group) => [group, matches.filter((category) => category.group === group)])),
    [matches]
  );
  const categoryByTemplateKey = useMemo(
    () => new Map(categories.flatMap((category) => (category.templateKey ? [[category.templateKey, category] as const] : []))),
    [categories]
  );

  const toggleSelection = (templateKey: string) => {
    setSelectedKeys((current) => (
      current.includes(templateKey)
        ? current.filter((key) => key !== templateKey)
        : [...current, templateKey]
    ));
  };

  const closeCurrentOpening = () => {
    openingGuard.current.close();
    onClose();
  };

  const activateSelected = async () => {
    if (busy || selectedKeys.length === 0) return;
    const operation = openingGuard.current.beginOperation();
    if (operation === null) return;
    setBusy(true);
    let ids: string[];
    try {
      ids = await activateSuggested(selectedKeys);
    } catch {
      if (openingGuard.current.isCurrent(operation)) {
        notify(t('activationFailedTitle'), t('activationFailedBody'));
        setBusy(false);
      }
      return;
    }
    if (!openingGuard.current.isCurrent(operation)) return;
    onActivated?.(ids);
    if (openingGuard.current.isCurrent(operation)) {
      closeCurrentOpening();
    }
  };

  const showAgain = async (templateKey: string) => {
    if (busy) return;
    const operation = openingGuard.current.beginOperation();
    if (operation === null) return;
    setBusy(true);
    try {
      await activateSuggested([templateKey]);
    } catch {
      if (openingGuard.current.isCurrent(operation)) {
        notify(t('activationFailedTitle'), t('activationFailedBody'));
      }
    }
    if (openingGuard.current.isCurrent(operation)) {
      setBusy(false);
    }
  };

  if (!visible) return <Modal visible={false} transparent />;

  const actionLabel = selectedKeys.length === 1
    ? t('addOneCategory')
    : t('addNCategories').replace('{n}', String(selectedKeys.length));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeCurrentOpening}>
      <Pressable style={styles.backdrop} onPress={closeCurrentOpening} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={[styles.center, { pointerEvents: 'box-none' }]}
      >
        <View style={[styles.card, { backgroundColor: colorTheme.surface, marginBottom: insets.bottom }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: colorTheme.ink }]}>{t('addCategorySheetTitle')}</Text>
            <Pressable onPress={closeCurrentOpening} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={isZh ? '关闭' : 'Close'}>
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>

          {hasSuggestions && (
            <View style={[styles.tabs, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
              {([
                ['suggested', t('tabSuggested')],
                ['create', t('tabCreateYourOwn')],
              ] as const).map(([value, label]) => {
                const active = tab === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setTab(value)}
                    style={[styles.tab, active && { backgroundColor: colorTheme.surface }]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={label}
                  >
                    <Text style={[styles.tabText, { color: colorTheme.ink2 }, active && { color: colorTheme.ink }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {hasSuggestions && tab === 'suggested' ? (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('searchSuggestedPlaceholder')}
                placeholderTextColor={colorTheme.ink3}
                style={[styles.search, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink }]}
                accessibilityLabel={t('searchSuggestedPlaceholder')}
                returnKeyType="search"
              />
              <ScrollView style={styles.suggestions} contentContainerStyle={styles.suggestionsContent} keyboardShouldPersistTaps="handled">
                {matches.length === 0 ? (
                  <Text style={[styles.empty, { color: colorTheme.ink2 }]}>{t('noSuggestionsMatch')}</Text>
                ) : OPTIONAL_GROUPS.map((group) => {
                  const entries = matchesByGroup.get(group) ?? [];
                  if (entries.length === 0) return null;
                  return (
                    <View key={group} style={styles.group}>
                      <Text style={[styles.groupTitle, { color: colorTheme.ink2 }]}>{OPTIONAL_GROUP_TITLES[group][language]}</Text>
                      {entries.map((suggestion) => {
                        const translation = OPTIONAL_CATEGORY_TRANSLATIONS[suggestion.templateKey]?.[language] ?? { name: suggestion.label, desc: '' };
                        const present = categoryByTemplateKey.get(suggestion.templateKey);
                        const selected = selectedKeys.includes(suggestion.templateKey);

                        if (present && !present.isHidden) {
                          return (
                            <View key={suggestion.templateKey} style={[styles.row, styles.staticRow, { borderColor: colorTheme.line }]}>
                              <CatBadge category={catalogueCategory(suggestion)} size={40} />
                              <View style={styles.rowCopy}>
                                <Text style={[styles.rowName, { color: colorTheme.ink }]}>{translation.name}</Text>
                                <Text style={[styles.rowDescription, { color: colorTheme.ink2 }]}>{translation.desc}</Text>
                              </View>
                              <Text style={[styles.added, { color: colorTheme.ink2 }]}>{t('suggestionAdded')}</Text>
                            </View>
                          );
                        }

                        if (present?.isHidden) {
                          return (
                            <View key={suggestion.templateKey} style={[styles.row, { borderColor: colorTheme.line }]}>
                              <CatBadge category={catalogueCategory(suggestion)} size={40} />
                              <View style={styles.rowCopy}>
                                <Text style={[styles.rowName, { color: colorTheme.ink }]}>{translation.name}</Text>
                                <Text style={[styles.rowDescription, { color: colorTheme.ink2 }]}>{translation.desc}</Text>
                              </View>
                              <Pressable
                                onPress={() => { void showAgain(suggestion.templateKey); }}
                                disabled={busy}
                                style={[styles.showAgain, { borderColor: accent.accent, backgroundColor: accent.accentTint }]}
                                accessibilityRole="button"
                                accessibilityLabel={`${translation.name}: ${t('suggestionShowAgain')}`}
                              >
                                <Text style={[styles.showAgainText, { color: accent.onTint }]}>{t('suggestionShowAgain')}</Text>
                              </Pressable>
                            </View>
                          );
                        }

                        return (
                          <Pressable
                            key={suggestion.templateKey}
                            onPress={() => toggleSelection(suggestion.templateKey)}
                            disabled={busy}
                            style={[
                              styles.row,
                              { borderColor: colorTheme.line },
                              selected && { borderColor: accent.accent, backgroundColor: accent.accentTint },
                            ]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            accessibilityLabel={`${translation.name}. ${translation.desc}`}
                          >
                            <CatBadge category={catalogueCategory(suggestion)} size={40} />
                            <View style={styles.rowCopy}>
                              <Text style={[styles.rowName, { color: colorTheme.ink }]}>{translation.name}</Text>
                              <Text style={[styles.rowDescription, { color: colorTheme.ink2 }]}>{translation.desc}</Text>
                            </View>
                            <View style={[styles.checkbox, { borderColor: selected ? accent.accent : colorTheme.line2, backgroundColor: selected ? accent.accent : 'transparent' }]}>
                              {selected && <Icon name="check" size={16} color={accent.onAccent} stroke={2.8} />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </ScrollView>
              {selectedKeys.length > 0 && (
                <View style={styles.confirm}>
                  <PrimaryButton onPress={() => { void activateSelected(); }} disabled={busy} height={50}>
                    <Icon name="plus" size={18} color="#fff" stroke={2.2} />
                    <BtnLabel>{actionLabel}</BtnLabel>
                  </PrimaryButton>
                </View>
              )}
            </>
          ) : (
            <ScrollView contentContainerStyle={styles.createContent} keyboardShouldPersistTaps="handled">
              <CreateCategoryForm
                kind={kind}
                onCreated={(categoryId) => {
                  onCreated?.(categoryId);
                  onClose();
                }}
              />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  center: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  card: { borderRadius: radius.lg, padding: 18, maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontFamily: uiFont(700), fontSize: 17 },
  tabs: { flexDirection: 'row', borderRadius: radius.sm, borderWidth: 1, padding: 3, marginBottom: 12 },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.sm - 3, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontFamily: uiFont(700), fontSize: 13 },
  search: { minHeight: 44, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 13, fontFamily: uiFont(600), fontSize: 14, marginBottom: 10 },
  suggestions: { flexGrow: 0, flexShrink: 1 },
  suggestionsContent: { gap: 14, paddingBottom: 2 },
  group: { gap: 7 },
  groupTitle: { fontFamily: uiFont(700), fontSize: 12.5, paddingHorizontal: 2 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  staticRow: { opacity: 0.82 },
  rowCopy: { flex: 1, gap: 2 },
  rowName: { fontFamily: uiFont(700), fontSize: 14.5 },
  rowDescription: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 16 },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  added: { fontFamily: uiFont(700), fontSize: 12 },
  showAgain: { minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  showAgainText: { fontFamily: uiFont(700), fontSize: 12 },
  empty: { fontFamily: uiFont(600), fontSize: 14, paddingVertical: 22, textAlign: 'center' },
  confirm: { marginTop: 14 },
  createContent: { paddingTop: 2, paddingBottom: 2 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
});
