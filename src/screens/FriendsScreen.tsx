// src/screens/FriendsScreen.tsx
// Settings → Friends: everyone you split bills with, searchable, with add, rename and (for
// anyone never on a bill) delete. Debts live on the Owed screen; this is just the address book.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddPersonModal } from '../components/AddPersonModal';
import { FriendAvatar } from '../components/FriendAvatar';
import { Icon } from '../components/Icon';
import { Card, TopBar } from '../components/ui';
import { useLanguage } from '../i18n';
import { FRIEND_HUES, friendHueSlot, nameTaken, searchFriends, uniqueMonograms } from '../lib/friends';
import { confirmAction } from '../lib/platformAlert';
import type { Person } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { radius, uiFont } from '../theme';

export function FriendsScreen({ onBack, embedded }: { onBack: () => void; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { people, shares, addPerson, renamePerson, deletePerson } = useAppData();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Person | null>(null);

  const monograms = useMemo(() => uniqueMonograms(people), [people]);
  const billCount = useMemo(() => {
    const splitsByPerson = new Map<string, Set<string>>();
    for (const s of shares) {
      const set = splitsByPerson.get(s.personId) ?? new Set<string>();
      set.add(s.splitId);
      splitsByPerson.set(s.personId, set);
    }
    return (id: string) => splitsByPerson.get(id)?.size ?? 0;
  }, [shares]);
  const shown = useMemo(() => searchFriends(people, search), [people, search]);

  const takenMessage = isZh ? '已有同名好友' : 'You already have a friend with that name';

  const confirmDelete = (p: Person) =>
    confirmAction(
      isZh ? `删除 ${p.name}？` : `Delete ${p.name}?`,
      isZh ? '此好友不会再出现在分账选择中。' : 'They will no longer show up when you split a bill.',
      isZh ? '删除' : 'Delete',
      async () => {
        await deletePerson(p.id);
      }
    );

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={isZh ? '好友' : 'Friends'} onBack={onBack} />
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.toolbar}>
          <View style={[styles.searchRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
            <Icon name="search" size={16} color={colorTheme.ink2} />
            <TextInput
              testID="friends-search"
              value={search}
              onChangeText={setSearch}
              placeholder={isZh ? '搜索好友' : 'Search friends'}
              placeholderTextColor={colorTheme.ink3}
              style={[styles.searchInput, { color: colorTheme.ink }]}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel={isZh ? '清除搜索' : 'Clear search'}>
                <Icon name="x" size={14} color={colorTheme.ink2} />
              </Pressable>
            )}
          </View>
          <Pressable
            testID="friends-add"
            onPress={() => setAdding(true)}
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel={isZh ? '添加好友' : 'Add friend'}
          >
            <Icon name="plus" size={18} color={theme.onAccent} stroke={2.4} />
          </Pressable>
        </View>

        {people.length === 0 ? (
          <Text style={[styles.empty, { color: colorTheme.ink2 }]}>
            {isZh ? '还没有好友。分账时添加的人会出现在这里，也可以点击 + 先添加。' : 'No friends yet. People you split bills with show up here, or tap + to add someone now.'}
          </Text>
        ) : shown.length === 0 ? (
          <Text style={[styles.empty, { color: colorTheme.ink2 }]}>{isZh ? '没有匹配的好友' : 'No matching friends'}</Text>
        ) : (
          <Card style={{ overflow: 'hidden' }}>
            {shown.map((p, i) => {
              const bills = billCount(p.id);
              return (
                <View key={p.id} testID={`friend-${p.id}`} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colorTheme.line2 }]}>
                  <FriendAvatar monogram={monograms[p.id] ?? '?'} hue={FRIEND_HUES[friendHueSlot(p.id)]} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colorTheme.ink }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={[styles.sub, { color: colorTheme.ink2 }]}>
                      {bills === 0 ? (isZh ? '尚无账单' : 'No bills yet') : isZh ? `${bills} 笔账单` : `${bills} ${bills === 1 ? 'bill' : 'bills'}`}
                    </Text>
                  </View>
                  <Pressable
                    testID={`friend-rename-${p.id}`}
                    onPress={() => setRenaming(p)}
                    hitSlop={8}
                    style={styles.iconBtn}
                    accessibilityRole="button"
                    accessibilityLabel={isZh ? `重命名 ${p.name}` : `Rename ${p.name}`}
                  >
                    <Icon name="pencil" size={16} color={colorTheme.ink2} />
                  </Pressable>
                  {/* Anyone with bill history stays: their debts and past splits point at them. */}
                  {bills === 0 && (
                    <Pressable
                      testID={`friend-delete-${p.id}`}
                      onPress={() => confirmDelete(p)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel={isZh ? `删除 ${p.name}` : `Delete ${p.name}`}
                    >
                      <Icon name="trash" size={16} color={colorTheme.ink3} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </Card>
        )}
        {people.length > 0 && (
          <Text style={[styles.note, { color: colorTheme.ink3 }]}>
            {isZh ? '有账单记录的好友无法删除，但可以重命名。' : 'Friends with bills can be renamed but not deleted, so their history stays intact.'}
          </Text>
        )}
      </ScrollView>

      <AddPersonModal
        visible={adding}
        onClose={() => setAdding(false)}
        title={isZh ? '添加好友' : 'Add a friend'}
        validate={(name) => (nameTaken(people, name) ? takenMessage : null)}
        onSubmit={async (name) => {
          await addPerson(name);
        }}
      />
      <AddPersonModal
        visible={renaming !== null}
        onClose={() => setRenaming(null)}
        title={isZh ? '重命名好友' : 'Rename friend'}
        initialName={renaming?.name ?? ''}
        submitLabel={isZh ? '保存' : 'Save'}
        validate={(name) => (renaming && nameTaken(people, name, renaming.id) ? takenMessage : null)}
        onSubmit={async (name) => {
          if (renaming) await renamePerson(renaming.id, name);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  searchRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1 },
  searchInput: { flex: 1, fontFamily: uiFont(600), fontSize: 14, padding: 0 },
  addBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  name: { fontFamily: uiFont(600), fontSize: 15 },
  sub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 2 },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', fontFamily: uiFont(500), fontSize: 13.5, lineHeight: 20, paddingVertical: 32, paddingHorizontal: 12 },
  note: { fontFamily: uiFont(500), fontSize: 12, lineHeight: 17, marginTop: 12, paddingHorizontal: 4 },
});
