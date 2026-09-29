import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLanguage } from '../i18n';
import type { RepaymentCard } from '../lib/askPip/repaymentCard';
import { fmtMoney } from '../lib/format';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { numFont, radius, spacing, uiFont } from '../theme';
import { Body, Caption, Label } from './ui';

export interface AppliedRepayment {
  personName: string;
  merchant: string;
  outstanding: number;
  currency: string;
  accountName: string;
  amount: number;
  arrivalCurrency: string;
  paidOn: string;
  balanceBefore: number;
  balanceAfter: number;
}

export function AskPipRepaymentCard({
  card,
  applied,
  undoable,
  applying,
  error,
  onEdit,
  onSelectDebt,
  onApply,
  onUndo,
}: {
  card: RepaymentCard;
  applied: AppliedRepayment | null;
  undoable: boolean;
  applying: boolean;
  error: string | null;
  onEdit: (edit: { paidOn?: string; amount?: number | null; accountId?: string | null }) => void;
  onSelectDebt: (shareId: string) => void;
  onApply: () => void;
  onUndo: () => void;
}) {
  const { t } = useLanguage();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [amountText, setAmountText] = useState(card.amount == null ? '' : String(card.amount));
  const [dateText, setDateText] = useState(card.paidOn);

  useEffect(() => {
    setAmountText(card.amount == null ? '' : String(card.amount));
  }, [card.debt?.shareId, card.storedConversion, card.slots.cashAmount]);

  useEffect(() => {
    setDateText(card.paidOn);
  }, [card.paidOn]);

  if (applied) {
    return (
      <View style={[styles.card, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
        <Label>{t('askPipRepaymentApplied')}</Label>
        <Caption color={colorTheme.ink2}>
          {`${applied.personName} · ${applied.merchant} · ${fmtMoney(applied.outstanding, applied.currency)} → ${t('askPipRepaymentSettled')}`}
        </Caption>
        <Caption color={colorTheme.ink2}>
          {`${applied.accountName} · ${fmtMoney(applied.balanceBefore, applied.arrivalCurrency)} → ${fmtMoney(applied.balanceAfter, applied.arrivalCurrency)}`}
        </Caption>
        <Caption color={colorTheme.ink2}>{applied.paidOn}</Caption>
        {undoable ? (
          <Pressable
            onPress={onUndo}
            style={({ pressed }) => [styles.button, { borderColor: colorTheme.line, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
          >
            <Label>{t('askPipRepaymentUndo')}</Label>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const block = blockCopy(card, t);
  const arrival = card.slots.arrivalCurrency;

  return (
    <View style={[styles.card, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
      {card.debt ? (
        <View style={styles.block}>
          <Caption color={colorTheme.ink2}>{t('askPipRepaymentDebt')}</Caption>
          <Body>{`${card.debt.personName} · ${card.debt.merchant}`}</Body>
          <Caption color={colorTheme.ink2}>
            {`${t('askPipRepaymentNow')} ${fmtMoney(card.debt.outstanding, card.debt.currency)} · ${t('askPipRepaymentAfter')} ${t('askPipRepaymentSettled')}`}
          </Caption>
          {card.storedConversion != null ? (
            <Caption color={colorTheme.ink2}>
              {card.fxRate != null
                ? `${t('askPipRepaymentStored')} ${fmtMoney(card.debt.outstanding, card.debt.currency)} × ${card.fxRate} = ${fmtMoney(card.storedConversion, arrival)}`
                : `${t('askPipRepaymentStored')} ${fmtMoney(card.storedConversion, arrival)}`}
            </Caption>
          ) : null}
        </View>
      ) : null}

      {card.block === 'pick_debt' ? (
        <View style={styles.choices}>
          {card.debtChoices.map((debt) => (
            <Pressable
              key={debt.shareId}
              onPress={() => onSelectDebt(debt.shareId)}
              style={({ pressed }) => [styles.choice, { borderColor: colorTheme.line, opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
            >
              <Label>{`${debt.personName} · ${debt.merchant} · ${fmtMoney(debt.outstanding, debt.currency)}`}</Label>
            </Pressable>
          ))}
        </View>
      ) : null}

      {card.account || card.balanceBefore != null ? (
        <View style={styles.block}>
          <Caption color={colorTheme.ink2}>{t('askPipRepaymentWallet')}</Caption>
          {card.account && card.balanceBefore != null ? (
            <Caption color={colorTheme.ink2}>
              {`${card.account.name} · ${t('askPipRepaymentNow')} ${fmtMoney(card.balanceBefore, card.account.currency)}${card.balanceAfter != null ? ` · ${t('askPipRepaymentAfter')} ${fmtMoney(card.balanceAfter, card.account.currency)}` : ''}`}
            </Caption>
          ) : null}
        </View>
      ) : null}

      {card.accountSelectable && card.accountChoices.length > 0 ? (
        <View style={styles.block}>
          <Caption color={colorTheme.ink2}>{t('askPipRepaymentAccount')}</Caption>
          <View style={styles.choices}>
            {card.accountChoices.map((account) => {
              const selected = card.account?.id === account.id;
              return (
                <Pressable
                  key={account.id}
                  onPress={() => onEdit({ accountId: account.id })}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      borderColor: selected ? theme.accent : colorTheme.line,
                      backgroundColor: selected ? theme.accentTint : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <Label color={selected ? theme.accent : colorTheme.ink}>{account.name}</Label>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {card.debt ? (
        <View style={styles.fields}>
          <View style={styles.field}>
            <Caption color={colorTheme.ink2}>{t('askPipRepaymentAmount')}</Caption>
            <TextInput
              value={amountText}
              onChangeText={(text) => {
                setAmountText(text);
                const parsed = text.trim() === '' ? null : Number(text);
                onEdit({ amount: parsed != null && Number.isFinite(parsed) ? parsed : null });
              }}
              keyboardType="decimal-pad"
              style={[styles.input, { color: colorTheme.ink, borderColor: colorTheme.line, fontFamily: numFont(600) }]}
            />
          </View>
          <View style={styles.field}>
            <Caption color={colorTheme.ink2}>{t('askPipRepaymentDate')}</Caption>
            <TextInput
              value={dateText}
              onChangeText={(text) => {
                setDateText(text);
                onEdit({ paidOn: text });
              }}
              autoCapitalize="none"
              style={[styles.input, { color: colorTheme.ink, borderColor: colorTheme.line, fontFamily: uiFont(500) }]}
            />
          </View>
        </View>
      ) : null}

      {block ? <Caption color={colorTheme.red}>{block}</Caption> : null}
      {error ? <Caption color={colorTheme.red}>{error}</Caption> : null}

      <Pressable
        onPress={onApply}
        disabled={!card.applyEnabled || applying}
        style={({ pressed }) => [
          styles.apply,
          {
            backgroundColor: theme.accent,
            opacity: !card.applyEnabled || applying || pressed ? 0.45 : 1,
          },
        ]}
        accessibilityRole="button"
      >
        <Label color="#fff">{t('askPipRepaymentApply')}</Label>
      </Pressable>
    </View>
  );
}

function blockCopy(
  card: RepaymentCard,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  switch (card.block) {
    case 'missing_debt':
      return t('askPipRepaymentMissingDebt');
    case 'pick_debt':
      return t('askPipRepaymentPickDebt');
    case 'missing_rate':
      return t('askPipRepaymentMissingRate');
    case 'missing_account':
      return t('askPipRepaymentMissingAccount');
    case 'pick_account':
      return t('askPipRepaymentPickAccount');
    case 'currency_mismatch':
      return t('askPipRepaymentCurrencyMismatch', {
        name: card.mismatchAccount?.name ?? '',
        currency: card.mismatchAccount?.currency ?? '',
        arrival: card.slots.arrivalCurrency,
      });
    case 'future_date':
      return t('askPipRepaymentFutureDate');
    case 'empty_amount':
      return t('askPipRepaymentEmptyAmount');
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  block: { gap: spacing.xs },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fields: { flexDirection: 'row', gap: spacing.sm },
  field: { flex: 1, gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  apply: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
});
