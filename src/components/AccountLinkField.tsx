// src/components/AccountLinkField.tsx
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CLASS_BY_ID, type LinkEffect } from '../lib/networth';
import type { Account, AccountKind } from '../lib/types';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useGlossary } from '../state/glossary';
import { useModalHandoff } from '../lib/modalHandoff';
import { radius, uiFont } from '../theme';
import { AddAccountModal } from './AddAccountModal';
import { Icon, type IconName } from './Icon';
import { InfoButton } from './InfoButton';
import { BrandLogo, matchBrand } from './BrandLogo';

/**
 * Control to tie a transaction to an asset/liability account. The account is
 * chosen from a dropdown; when one is picked, an effect toggle (adds to /
 * reduces) appears for liability accounts only. Presentational — the parent
 * owns selectedId + effect and decides the default effect on select.
 *
 * For asset accounts the direction is never ambiguous (an expense can only
 * ever draw the account down), so the toggle stays hidden and the caller's
 * `defaultLinkEffect` derivation is trusted as-is. Liability accounts are
 * genuinely ambiguous (an expense could be a new charge or a repayment), so
 * the toggle — and its glossary explainer — stays visible there.
 *
 * Omit `effect`/`onEffect` (e.g. a scanned batch, where each row's direction is
 * derived per-transaction) to render the dropdown alone with no effect toggle.
 * Pass `required` (add flows) to drop the "None" option — an account is
 * mandatory and the parent seeds a default (Cash) selection.
 */
export function AccountLinkField({
  accounts,
  selectedId,
  effect,
  onSelect,
  onEffect,
  label,
  required = false,
  infoEntry,
  emptyCreateLabel,
  createAccountInitialKind,
  createAccountInitialClass,
}: {
  accounts: Account[];
  selectedId: string | null;
  effect?: LinkEffect;
  onSelect: (id: string | null) => void;
  onEffect?: (e: LinkEffect) => void;
  label?: string;
  required?: boolean;
  infoEntry?: string;
  /** Replaces an empty required picker with a direct create action. */
  emptyCreateLabel?: string;
  /** Context supplied by the caller so the new-account sheet opens ready for the needed type. */
  createAccountInitialKind?: AccountKind;
  createAccountInitialClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // "Create new account" swaps this dropdown for the new-account sheet; on iOS the second modal
  // has to wait for the first to finish dismissing or it is never presented at all.
  const { request: requestCreateSheet, onDismiss: onDropdownDismissed } = useModalHandoff();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const displayLabel = label ?? (isZh ? '账户' : 'Account');
  const active = accounts.filter((a) => !a.archived);
  const sel = active.find((a) => a.id === selectedId) ?? null;
  const selBrand = sel ? matchBrand(sel.name) : null;

  const choose = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Text style={[styles.label, { color: colorTheme.ink2, marginBottom: 0 }]}>{displayLabel}</Text>
        {infoEntry && <InfoButton entry={infoEntry} />}
      </View>

      {active.length === 0 && emptyCreateLabel ? (
        <Pressable
          onPress={() => setCreating(true)}
          accessibilityLabel={emptyCreateLabel}
          style={[styles.emptyCreate, { backgroundColor: theme.accentTint, borderColor: theme.accent }]}
        >
          <Icon name="plus" size={17} color={theme.accent} stroke={2.4} />
          <Text style={[styles.emptyCreateText, { color: theme.onTint }]}>{emptyCreateLabel}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => setOpen(true)} style={[styles.trigger, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {sel ? (
            selBrand ? (
              <BrandLogo brand={selBrand} size={18} />
            ) : (
              <Icon name={(CLASS_BY_ID[sel.cls]?.icon ?? 'wallet') as IconName} size={16} color={colorTheme.ink2} />
            )
          ) : null}
          <Text
            style={[
              styles.triggerText,
              { color: colorTheme.ink },
              !sel && [styles.triggerPlaceholder, { color: colorTheme.ink3 }],
            ]}
            numberOfLines={1}
          >
            {sel ? sel.name : required ? (isZh ? '选择账户' : 'Select account') : (isZh ? '无' : 'None')}
          </Text>
          <Icon name="chevronDown" size={18} color={colorTheme.ink3} />
        </Pressable>
      )}

      {sel && effect && onEffect && sel.kind === 'liability' && (
        <>
          <View style={styles.effectLabelRow}>
            <Text style={[styles.effectLabel, { color: colorTheme.ink3 }]}>{isZh ? '变动方向' : 'Direction'}</Text>
            <InfoButton entry="card_direction" />
          </View>
          <View style={[styles.effectRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
            {(['subtract', 'add'] as LinkEffect[]).map((e) => {
              const on = effect === e;
              return (
                <Pressable key={e} onPress={() => onEffect(e)} style={[styles.effectBtn, on && { backgroundColor: theme.accentInk }]}>
                  <Text style={[styles.effectText, { color: colorTheme.ink2 }, on && styles.effectTextOn]}>
                    {e === 'subtract'
                      ? (isZh ? `偿还 ${sel.name}` : `Pays down ${sel.name}`)
                      : (isZh ? `计入 ${sel.name}` : `Adds to ${sel.name}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Modal visible={open} transparent animationType="fade" onDismiss={onDropdownDismissed} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.menuWrap} pointerEvents="box-none">
          <View style={[styles.menu, { backgroundColor: colorTheme.bg, borderColor: colorTheme.line2 }]}>
            <Text style={[styles.menuTitle, { color: colorTheme.ink2 }]}>{isZh ? '账户' : 'Account'}</Text>
            <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">
              {!required && <Option label={isZh ? '无' : 'None'} active={!selectedId} onPress={() => choose(null)} />}
              {active.map((a) => (
                <Option
                  key={a.id}
                  label={a.name}
                  icon={(CLASS_BY_ID[a.cls]?.icon ?? 'wallet') as IconName}
                  active={selectedId === a.id}
                  onPress={() => choose(a.id)}
                />
              ))}
            </ScrollView>
            <View style={[styles.menuDivider, { backgroundColor: colorTheme.line2 }]} />
            <Pressable
              onPress={() => {
                setOpen(false);
                requestCreateSheet(() => setCreating(true));
              }}
              style={styles.option}
            >
              <Icon name="plus" size={16} color={theme.accent} stroke={2.2} />
              <Text style={[styles.optionText, { color: theme.accent }]}>{isZh ? '创建新账户' : 'Create new account'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <AddAccountModal
        visible={creating}
        initialKind={createAccountInitialKind}
        initialClass={createAccountInitialClass}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          choose(id);
        }}
      />
    </View>
  );
}

function Option({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: IconName;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const brand = matchBrand(label);
  return (
    <Pressable onPress={onPress} style={[styles.option, active && { backgroundColor: theme.accentTint }]}>
      {brand ? (
        <BrandLogo brand={brand} size={18} />
      ) : icon ? (
        <Icon name={icon} size={16} color={active ? theme.accent : colorTheme.ink3} />
      ) : (
        <View style={styles.optionIconSpacer} />
      )}
      <Text style={[styles.optionText, { color: colorTheme.ink }, active && { color: theme.onTint }]} numberOfLines={1}>
        {label}
      </Text>
      {active && <Icon name="check" size={16} color={theme.accent} stroke={2.4} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  triggerText: { flex: 1, fontFamily: uiFont(600), fontSize: 16 },
  triggerPlaceholder: {},
  emptyCreate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  emptyCreateText: { fontFamily: uiFont(700), fontSize: 15 },
  effectLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  effectLabel: { fontFamily: uiFont(600), fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  effectRow: { flexDirection: 'row', borderRadius: 999, padding: 3, marginTop: 6, borderWidth: 1 },
  effectBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999 },
  effectText: { fontFamily: uiFont(600), fontSize: 12.5 },
  effectTextOn: { color: '#fff' },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  menuWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  menu: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 8,
    maxHeight: '70%',
  },
  menuTitle: { fontFamily: uiFont(700), fontSize: 13, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  menuScroll: { flexGrow: 0 },
  menuDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  optionIconSpacer: { width: 16 },
  optionText: { flex: 1, fontFamily: uiFont(600), fontSize: 15 },
});
