import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n';
import { FRIEND_HUES, friendHueSlot, nameTaken, recentFriendIds, searchFriends, uniqueMonograms } from '../lib/friends';
import type { Person } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { radius, uiFont } from '../theme';
import { FriendAvatar } from './FriendAvatar';
import { Icon, type IconName } from './Icon';
import { BtnLabel, Eyebrow, PrimaryButton } from './ui';

/** A non-friend choice listed above the friends, such as "You" or "Everyone on this bill". */
export interface PickerOption {
  id: string;
  label: string;
  icon: IconName;
}

/**
 * Pick who was on a bill (or who had one item): search, then any `options`, the `pinnedIds`
 * section, recent friends and everyone else. Tick as many as needed, or add someone new straight
 * from the search box. Selection changes apply as they happen; Done just closes.
 */
export function FriendPickerSheet({
  visible,
  selected,
  onChange,
  onClose,
  title,
  subtitle,
  options = [],
  pinnedIds = [],
  pinnedLabel,
}: {
  visible: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Listed first, outside search; ticked like any friend. */
  options?: PickerOption[];
  /** Friends to list in their own section ahead of Recent, e.g. those already on the bill. */
  pinnedIds?: string[];
  pinnedLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { people, shares, addPerson } = useAppData();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const monograms = useMemo(() => uniqueMonograms(people), [people]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const pinned = useMemo(() => pinnedIds.map((id) => byId.get(id)).filter((p): p is Person => Boolean(p)), [pinnedIds, byId]);
  const recent = useMemo(() => {
    const skip = new Set(pinnedIds);
    return recentFriendIds(people, shares ?? [])
      .filter((id) => !skip.has(id))
      .map((id) => byId.get(id))
      .filter((p): p is Person => Boolean(p));
  }, [people, shares, pinnedIds, byId]);
  const query = search.trim();
  const matches = useMemo(() => searchFriends(people, query), [people, query]);
  const canAddQuery = query.length > 0 && !nameTaken(people, query);
  const friendCount = selected.filter((id) => byId.has(id)).length;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const close = () => {
    setSearch('');
    onClose();
  };

  const toggle = (id: string) => onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const addQuery = async () => {
    if (!canAddQuery || adding) return;
    setAdding(true);
    try {
      const person = await addPerson(query);
      if (!selected.includes(person.id)) onChange([...selected, person.id]);
      setSearch('');
    } finally {
      setAdding(false);
    }
  };

  if (!visible) return <Modal visible={false} transparent />;

  const row = (p: Person) => {
    const on = selectedSet.has(p.id);
    return (
      <Pressable
        key={p.id}
        testID={`friend-row-${p.id}`}
        onPress={() => toggle(p.id)}
        style={[styles.row, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, on && { borderColor: theme.accent, backgroundColor: theme.accentTint }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={p.name}
      >
        <FriendAvatar monogram={monograms[p.id] ?? '?'} hue={FRIEND_HUES[friendHueSlot(p.id)]} />
        <Text style={[styles.name, { color: colorTheme.ink }]} numberOfLines={1}>
          {p.name}
        </Text>
        <View style={[styles.check, { borderColor: on ? theme.accent : colorTheme.line }, on && { backgroundColor: theme.accent }]}>
          {on && <Icon name="check" size={13} color={theme.onAccent} stroke={2.6} />}
        </View>
      </Pressable>
    );
  };

  const listedIds = new Set([...pinned, ...recent].map((p) => p.id));
  const rest = query ? matches : people.filter((p) => !listedIds.has(p.id));
  const restLabel = pinned.length + recent.length > 0 ? (isZh ? '其他好友' : 'Everyone else') : isZh ? '好友' : 'Friends';
  // Virtualised, so a long friend list costs the same to open (and to re-tick) as a short one.
  const sections = (
    query
      ? [{ key: 'matches', title: null, data: matches }]
      : [
          { key: 'pinned', title: pinnedLabel ?? (isZh ? '已选' : 'Selected'), data: pinned },
          { key: 'recent', title: isZh ? '最近' : 'Recent', data: recent },
          { key: 'rest', title: restLabel, data: rest },
        ]
  ).filter((sec) => sec.data.length > 0);

  const optionRow = (o: PickerOption) => {
    const on = selectedSet.has(o.id);
    return (
      <Pressable
        key={o.id}
        testID={`friend-row-${o.id}`}
        onPress={() => toggle(o.id)}
        style={[styles.row, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, on && { borderColor: theme.accent, backgroundColor: theme.accentTint }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={o.label}
      >
        <View style={[styles.plus, { backgroundColor: colorTheme.surface2 }]}>
          <Icon name={o.icon} size={16} color={colorTheme.ink2} />
        </View>
        <Text style={[styles.name, { color: colorTheme.ink }]} numberOfLines={1}>
          {o.label}
        </Text>
        <View style={[styles.check, { borderColor: on ? theme.accent : colorTheme.line }, on && { backgroundColor: theme.accent }]}>
          {on && <Icon name="check" size={13} color={theme.onAccent} stroke={2.6} />}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={[styles.avoider, { pointerEvents: 'box-none' }]}
      >
        <View style={[styles.sheet, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colorTheme.ink }]} numberOfLines={1}>
                {title ?? (isZh ? '谁一起吃？' : 'Who was there?')}
              </Text>
              {subtitle ? <Text style={[styles.subtitle, { color: colorTheme.ink2 }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel={isZh ? '关闭' : 'Close'}>
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>

          <View style={[styles.searchRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
            <Icon name="search" size={16} color={colorTheme.ink2} />
            <TextInput
              testID="friend-search"
              value={search}
              onChangeText={setSearch}
              placeholder={isZh ? '搜索或输入新名字' : 'Search or type a new name'}
              placeholderTextColor={colorTheme.ink3}
              style={[styles.searchInput, { color: colorTheme.ink }]}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canAddQuery) addQuery();
                else if (matches.length === 1) toggle(matches[0].id);
              }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel={isZh ? '清除搜索' : 'Clear search'}>
                <Icon name="x" size={14} color={colorTheme.ink2} />
              </Pressable>
            )}
          </View>

          <SectionList
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            sections={sections}
            keyExtractor={(p) => p.id}
            extraData={selectedSet}
            stickySectionHeadersEnabled={false}
            initialNumToRender={14}
            renderItem={({ item }) => <View style={styles.rowWrap}>{row(item)}</View>}
            renderSectionHeader={({ section }) => (section.title ? <Eyebrow style={styles.sectionHead}>{section.title}</Eyebrow> : null)}
            ListHeaderComponent={
              <>
                {canAddQuery && (
                  <Pressable
                    testID="friend-add-new"
                    onPress={addQuery}
                    disabled={adding}
                    style={[styles.row, styles.addRow, styles.rowWrap, { borderColor: theme.accentSoft, backgroundColor: theme.accentTint }]}
                    accessibilityRole="button"
                    accessibilityLabel={isZh ? `添加“${query}”` : `Add "${query}"`}
                  >
                    <View style={[styles.plus, { backgroundColor: theme.accent }]}>
                      <Icon name="plus" size={16} color={theme.onAccent} stroke={2.4} />
                    </View>
                    <Text style={[styles.name, { color: theme.onTint }]} numberOfLines={1}>
                      {isZh ? `添加“${query}”` : `Add “${query}”`}
                    </Text>
                  </Pressable>
                )}
                {!query && options.map((o) => (
                  <View key={o.id} style={styles.rowWrap}>
                    {optionRow(o)}
                  </View>
                ))}
              </>
            }
            ListEmptyComponent={
              people.length === 0 && !query ? (
                <Text style={[styles.empty, { color: colorTheme.ink2 }]}>
                  {isZh ? '还没有好友。在上方输入名字即可添加。' : 'No friends yet. Type a name above to add one.'}
                </Text>
              ) : query.length > 0 && !canAddQuery ? (
                <Text style={[styles.empty, { color: colorTheme.ink2 }]}>{isZh ? '没有匹配的好友' : 'No matching friends'}</Text>
              ) : null
            }
          />

          <View style={{ marginTop: 12 }}>
            <PrimaryButton onPress={close} height={50}>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
              <BtnLabel>
                {friendCount > 0
                  ? isZh
                    ? `完成（${friendCount} 位好友）`
                    : `Done · ${friendCount} ${friendCount === 1 ? 'friend' : 'friends'}`
                  : isZh
                    ? '完成'
                    : 'Done'}
              </BtnLabel>
            </PrimaryButton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10, maxHeight: '86%' },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontFamily: uiFont(700), fontSize: 17 },
  subtitle: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontFamily: uiFont(600), fontSize: 14, padding: 0 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  rowWrap: { marginBottom: 8 },
  sectionHead: { marginTop: 8, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1 },
  addRow: { borderStyle: 'dashed' },
  plus: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontFamily: uiFont(600), fontSize: 15 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', fontFamily: uiFont(500), fontSize: 13, paddingVertical: 24 },
});
