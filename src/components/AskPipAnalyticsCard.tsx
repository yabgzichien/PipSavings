import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { AskPipAnalysisResult } from '../lib/askPip/analytics';
import { fmtMoney } from '../lib/format';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import type { DisplayCurrency } from '../state/useDisplayCurrency';
import { radius, spacing } from '../theme';
import { Body, Card, Caption, Label, SecondaryButton, Title } from './ui';

type Props = {
  result: AskPipAnalysisResult;
  displayCurrency: DisplayCurrency;
  onViewTransactions: () => void;
};

function statLabel(result: AskPipAnalysisResult, isZh: boolean): string {
  const labels = isZh
    ? { total: '总额', daily_mean: '每日平均', daily_median: '每日中位数', daily_stddev: '每日标准差', daily_variance: '每日方差', daily_min: '最低单日', daily_max: '最高单日', transaction_count: '交易笔数', largest_transaction: '最大单笔' }
    : { total: 'Total', daily_mean: 'Daily average', daily_median: 'Daily median', daily_stddev: 'Daily standard deviation', daily_variance: 'Daily variance', daily_min: 'Lowest day', daily_max: 'Highest day', transaction_count: 'Transaction count', largest_transaction: 'Largest transaction' };
  const measures = isZh
    ? { expense: '支出', income: '收入', net: '净额' }
    : { expense: 'spending', income: 'income', net: 'net cash flow' };
  return `${labels[result.request.statistic]} · ${measures[result.request.measure]}`;
}

function moneyValue(value: number, result: AskPipAnalysisResult, dc: DisplayCurrency): string {
  if (result.request.statistic === 'daily_variance') {
    const scale = dc.convert(1);
    return `${(value * scale * scale).toFixed(2)} ${dc.code}²`;
  }
  return fmtMoney(dc.convert(value), dc.code);
}

function displayValue(result: AskPipAnalysisResult, dc: DisplayCurrency): string {
  if (result.value === null) return '—';
  if (result.request.comparison === 'percent_change') return `${result.value.toFixed(1)}%`;
  if (result.request.statistic === 'transaction_count') return String(result.value);
  return moneyValue(result.value, result, dc);
}

function underlyingValue(value: number, result: AskPipAnalysisResult, dc: DisplayCurrency): string {
  if (result.request.statistic === 'transaction_count') return String(value);
  return moneyValue(value, result, dc);
}

export function AskPipAnalyticsCard({ result, displayCurrency, onViewTransactions }: Props) {
  const { isZh } = useLanguage();
  const colors = useThemeColors();
  const accent = useAccent();
  const rateAvailable = displayCurrency.code === 'MYR' || Number.isFinite(displayCurrency.rates[displayCurrency.code]);
  const dc = rateAvailable
    ? displayCurrency
    : { ...displayCurrency, code: 'MYR', convert: (value: number) => value };
  const noData = !result.hasData && !result.request.comparison;
  const range = `${result.request.dateFrom} – ${result.request.dateTo}`;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Label color={accent.accentInk}>{statLabel(result, isZh)}</Label>
        <Caption>{range}</Caption>
      </View>
      {noData ? (
        <Body>{isZh ? '这个时段没有符合条件的记录。' : 'No matching records in this period.'}</Body>
      ) : (
        <Title numeric>{displayValue(result, dc)}</Title>
      )}
      {result.unavailableReason === 'comparison_is_zero' && (
        <Body>{isZh ? '对比时段为零，因此无法计算百分比变化。' : 'Percentage change is unavailable because the comparison period is zero.'}</Body>
      )}
      {result.unavailableReason === 'date_range_is_future' && (
        <Body>{isZh ? '所选日期范围尚未开始。' : 'That date range has not started yet.'}</Body>
      )}
      {result.request.comparison && result.comparisonValue !== undefined && (
        <Caption>
          {isZh ? '本时段' : 'This period'} {underlyingValue(result.primaryValue, result, dc)} · {isZh ? '对比时段' : 'Comparison'} {underlyingValue(result.comparisonValue, result, dc)}
        </Caption>
      )}
      <View style={[styles.basis, { backgroundColor: colors.surface2, borderColor: colors.line2 }]}>
        <Caption>
          {result.basis === 'daily_totals_including_zero_days'
            ? (isZh ? `按每日总额计算 · 包含零支出日 · ${result.dayCount} 天` : `Daily totals · includes zero-spend days · ${result.dayCount} days`)
            : (isZh ? `${result.transactionCount} 笔记录` : `${result.transactionCount} records`)}
        </Caption>
        {result.usedFallbackDateCount > 0 && (
          <Caption>{isZh ? `${result.usedFallbackDateCount} 笔使用创建日期` : `${result.usedFallbackDateCount} used their created date`}</Caption>
        )}
      </View>
      {!rateAvailable && (
        <Caption>{isZh ? '缺少汇率，结果以 MYR 显示。' : 'Exchange rate unavailable; showing MYR.'}</Caption>
      )}
      {result.topTransactions?.map((txn) => (
        <View key={txn.id} style={styles.row}>
          <Body numberOfLines={1} style={styles.grow}>{txn.merchant}</Body>
          <Label numeric>{moneyValue(txn.amount, result, dc)}</Label>
        </View>
      ))}
      {result.groups?.map((group) => (
        <View key={group.id} style={styles.row}>
          <Body numberOfLines={1} style={styles.grow}>{group.label}</Body>
          <Label numeric>{moneyValue(group.value, result, dc)}</Label>
        </View>
      ))}
      <SecondaryButton onPress={onViewTransactions} height={46}>
        <Label color={accent.accentInk}>{isZh ? '查看符合条件的交易' : 'View matching transactions'}</Label>
      </SecondaryButton>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.md },
  header: { gap: spacing.xs },
  basis: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
});
