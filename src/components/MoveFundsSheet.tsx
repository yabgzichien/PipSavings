import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n';
import { todayISO } from '../lib/duplicates';
import { currencyPrefix, fmtMoney } from '../lib/format';
import { tap } from '../lib/haptics';
import { CLASS_BY_ID } from '../lib/networth';
import { deriveMove, pickerAccounts, validateMove } from '../lib/moveFunds';
import { round2 } from '../lib/currency';
import { decimalsFor } from '../lib/currencies';
import type { Account } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { numFont, radius, spacing, type } from '../theme';
import { matchBrand, BrandLogo } from './BrandLogo';
import { Icon, type IconName } from './Icon';
import { Amount, Body, BtnLabel, Caption, Eyebrow, Label, PrimaryButton, Title } from './ui';

type Independent = 'amount' | 'newTo';
type PickerSide = 'from' | 'to';

export function MoveFundsSheet({
  visible,
  initialFromId = null,
  onClose,
}: {
  visible: boolean;
  initialFromId?: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colors = useThemeColors();
  const { t } = useLanguage();
  const { accounts, accountValues, moveLiquidFunds } = useAppData();

  const [fromId, setFromId] = useState<string | null>(initialFromId);
  const [toId, setToId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [toBalanceText, setToBalanceText] = useState('');
  const [independent, setIndependent] = useState<Independent>('amount');
  const [picker, setPicker] = useState<PickerSide | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFromId(initialFromId);
    setToId(null);
    setAmountText('');
    setToBalanceText('');
    setIndependent('amount');
    setPicker(null);
    setSaving(false);
  }, [visible, initialFromId]);

  const from = fromId ? accounts.find((a) => a.id === fromId) ?? null : null;
  const to = toId ? accounts.find((a) => a.id === toId) ?? null : null;
  const fromBalance = from ? accountValues[from.id] ?? 0 : 0;
  const toBalance = to ? accountValues[to.id] ?? 0 : 0;
  const currency = from?.currency ?? to?.currency ?? 'MYR';
  const decimals = decimalsFor(currency);

  const parsedAmount = round2(parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0);
  const parsedTo = round2(parseFloat(toBalanceText.replace(/[^0-9.]/g, '')) || 0);

  const proposal = from && to
    ? deriveMove(
        fromBalance,
        toBalance,
        independent === 'amount' ? { kind: 'amount', amount: parsedAmount } : { kind: 'newTo', newTo: parsedTo }
      )
    : null;

  const amount = proposal?.amount ?? parsedAmount;
  const guard = from && to && amount > 0 ? validateMove({ from, to, amount, fromBalance }) : null;
  const canSave = !!proposal && !guard && !saving;

  const fromChoices = pickerAccounts(accounts, toId, to?.currency ?? from?.currency ?? null);
  const toChoices = pickerAccounts(accounts, fromId, from?.currency ?? to?.currency ?? null);

  const editToBalance = () => {
    tap();
    const next = proposal?.newTo ?? toBalance;
    setToBalanceText(next > 0 ? next.toFixed(decimals) : '');
    setIndependent('newTo');
  };

  const flip = () => {
    tap();
    setFromId(toId);
    setToId(fromId);
    setIndependent('amount');
  };

  const save = async () => {
    if (!from || !to || !proposal || !canSave) return;
    setSaving(true);
    const err = await moveLiquidFunds(from.id, to.id, proposal.amount, todayISO());
    setSaving(false);
    if (err === 'insufficient') return;
    if (err) return;
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.avoider}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom + spacing.base }]}>
          <View style={[styles.handle, { backgroundColor: colors.line }]} />
          <View style={styles.head}>
            <Title>{t('move')}</Title>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('close')}>
              <Icon name="x" size={20} color={colors.ink2} />
            </Pressable>
          </View>

          <AccountCard
            eyebrow={t('moveFrom')}
            account={from}
            balance={fromBalance}
            onPick={() => { tap(); setPicker('from'); }}
            placeholder={t('moveSelectAccount')}
          >
            <View style={[styles.amountRow, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
              <Caption color={colors.ink2}>{currencyPrefix(currency)}</Caption>
              <TextInput
                value={independent === 'amount' ? amountText : proposal ? String(proposal.amount) : amountText}
                onChangeText={(text) => {
                  setIndependent('amount');
                  setAmountText(text);
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.ink3}
                style={[styles.amountInput, { color: colors.ink }]}
                accessibilityLabel={t('moveFrom')}
              />
            </View>
          </AccountCard>

          <Pressable
            onPress={flip}
            style={[styles.flip, { backgroundColor: colors.surface, borderColor: colors.line }]}
            accessibilityRole="button"
            accessibilityLabel={t('moveSwapAccounts')}
          >
            <Icon name="swap" size={16} color={theme.accent} stroke={2.2} />
          </Pressable>

          <AccountCard
            eyebrow={t('moveTo')}
            account={to}
            balance={toBalance}
            onPick={() => { tap(); setPicker('to'); }}
            placeholder={t('moveSelectAccount')}
          >
            {independent === 'newTo' ? (
              <View style={[styles.amountRow, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
                <Caption color={colors.ink2}>{currencyPrefix(currency)}</Caption>
                <TextInput
                  value={toBalanceText}
                  onChangeText={setToBalanceText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.ink3}
                  style={[styles.amountInput, { color: colors.ink }]}
                  accessibilityLabel={t('moveTo')}
                  autoFocus
                />
              </View>
            ) : (
              <Pressable onPress={editToBalance} accessibilityRole="button" accessibilityLabel={t('moveTapToEditBalance')}>
                {proposal ? (
                  <Amount value={proposal.newTo} currency={currency} size={22} />
                ) : (
                  <Body color={colors.ink3}>0.00</Body>
                )}
                <Caption color={theme.accent} style={styles.tapHint}>{t('moveTapToEditBalance')}</Caption>
              </Pressable>
            )}
          </AccountCard>

          {guard === 'insufficient' && from ? (
            <Caption color={colors.red} style={styles.error}>
              {t('moveInsufficient', { name: from.name, balance: fmtMoney(fromBalance, currency) })}
            </Caption>
          ) : null}

          <View style={styles.cta}>
            <PrimaryButton onPress={save} disabled={!canSave} height={52}>
              <BtnLabel>
                {proposal ? t('moveCta', { amount: fmtMoney(proposal.amount, currency) }) : t('move')}
              </BtnLabel>
            </PrimaryButton>
          </View>

          {picker ? (
            <AccountPicker
              title={picker === 'to' ? t('moveTo') : t('moveFrom')}
              accounts={picker === 'to' ? toChoices : fromChoices}
              selectedId={picker === 'to' ? toId : fromId}
              values={accountValues}
              onClose={() => setPicker(null)}
              onSelect={(id) => {
                tap();
                if (picker === 'to') setToId(id);
                else setFromId(id);
                setPicker(null);
              }}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AccountCard({
  eyebrow,
  account,
  balance,
  onPick,
  placeholder,
  children,
}: {
  eyebrow: string;
  account: Account | null;
  balance: number;
  onPick: () => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  const brand = account ? matchBrand(account.name) : null;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Eyebrow style={styles.cardEyebrow}>{eyebrow}</Eyebrow>
      <Pressable onPress={onPick} style={styles.accountRow} accessibilityRole="button" accessibilityLabel={account?.name ?? placeholder}>
        {account ? (
          brand ? (
            <BrandLogo brand={brand} size={28} />
          ) : (
            <Icon name={(CLASS_BY_ID[account.cls]?.icon ?? 'wallet') as IconName} size={18} color={colors.ink2} />
          )
        ) : null}
        <View style={styles.accountCopy}>
          <Body weight={700} numberOfLines={1}>{account ? account.name : placeholder}</Body>
          {account ? <Caption color={colors.ink2}>{fmtMoney(balance, account.currency)}</Caption> : null}
        </View>
        <Icon name="chevronDown" size={16} color={colors.ink3} />
      </Pressable>
      <View style={styles.cardField}>{children}</View>
    </View>
  );
}

function AccountPicker({
  title,
  accounts,
  selectedId,
  values,
  onClose,
  onSelect,
}: {
  title: string;
  accounts: Account[];
  selectedId: string | null;
  values: Record<string, number>;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const colors = useThemeColors();
  const theme = useAccent();
  return (
    <View style={styles.pickerLayer} pointerEvents="box-none">
      <Pressable style={styles.pickerBackdrop} onPress={onClose} />
      <View style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Label color={colors.ink2} style={styles.pickerTitle}>{title}</Label>
        {accounts.map((account) => {
          const brand = matchBrand(account.name);
          const on = account.id === selectedId;
          return (
            <Pressable
              key={account.id}
              onPress={() => onSelect(account.id)}
              style={styles.pickerRow}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              {brand ? (
                <BrandLogo brand={brand} size={22} />
              ) : (
                <Icon name={(CLASS_BY_ID[account.cls]?.icon ?? 'wallet') as IconName} size={16} color={colors.ink2} />
              )}
              <Body weight={700} style={styles.pickerName} numberOfLines={1}>{account.name}</Body>
              <Caption color={on ? theme.accent : colors.ink2}>{fmtMoney(values[account.id] ?? 0, account.currency)}</Caption>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.base,
  },
  handle: { width: 32, height: 4, borderRadius: 4, alignSelf: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.base },
  card: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md },
  cardEyebrow: { marginBottom: spacing.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountCopy: { flex: 1, minWidth: 0 },
  cardField: { marginTop: spacing.sm },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: type.title, padding: 0 },
  tapHint: { marginTop: spacing.xs },
  flip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: -12,
    zIndex: 1,
  },
  error: { marginTop: spacing.sm },
  cta: { marginTop: spacing.base },
  pickerLayer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  picker: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: '30%',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
  },
  pickerTitle: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  pickerName: { flex: 1 },
});
