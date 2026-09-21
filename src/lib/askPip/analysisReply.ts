import { fmtMoney } from '../format';
import type { AskPipAnalysisResult } from './analytics';

export interface AskPipAnalysisReplyOptions {
  currency: string;
  convert: (amountMyr: number) => number;
  isZh: boolean;
}

function period(result: AskPipAnalysisResult): string {
  return `${result.request.dateFrom} to ${result.request.dateTo}`;
}

function money(value: number, options: AskPipAnalysisReplyOptions): string {
  return fmtMoney(options.convert(value), options.currency);
}

function variance(value: number, options: AskPipAnalysisReplyOptions): string {
  const scale = options.convert(1);
  return `${(value * scale * scale).toFixed(2)} ${options.currency}²`;
}

function amountForStatistic(
  value: number,
  result: AskPipAnalysisResult,
  options: AskPipAnalysisReplyOptions,
): string {
  return result.request.statistic === 'daily_variance'
    ? variance(value, options)
    : money(value, options);
}

function englishSubject(result: AskPipAnalysisResult): string {
  const measure = result.request.measure === 'expense'
    ? 'spending'
    : result.request.measure === 'income'
      ? 'income'
      : 'net cash flow';
  switch (result.request.statistic) {
    case 'daily_mean': return `average daily ${measure}`;
    case 'daily_median': return `median daily ${measure}`;
    case 'daily_stddev': return `daily ${measure} standard deviation`;
    case 'daily_variance': return `daily ${measure} variance`;
    case 'daily_min': return `lowest daily ${measure}`;
    case 'daily_max': return `highest daily ${measure}`;
    case 'largest_transaction': return result.request.measure === 'income' ? 'largest income' : 'largest expense';
    case 'transaction_count': return `${result.request.measure} transaction count`;
    default: return measure;
  }
}

function chineseSubject(result: AskPipAnalysisResult): string {
  const measure = result.request.measure === 'expense' ? '支出' : result.request.measure === 'income' ? '收入' : '净现金流';
  switch (result.request.statistic) {
    case 'daily_mean': return `每日平均${measure}`;
    case 'daily_median': return `每日中位数${measure}`;
    case 'daily_stddev': return `每日${measure}标准差`;
    case 'daily_variance': return `每日${measure}方差`;
    case 'daily_min': return `最低单日${measure}`;
    case 'daily_max': return `最高单日${measure}`;
    case 'largest_transaction': return `最大单笔${measure}`;
    case 'transaction_count': return `${measure}交易笔数`;
    default: return measure;
  }
}

function englishPrimary(
  result: AskPipAnalysisResult,
  options: AskPipAnalysisReplyOptions,
): string {
  const value = result.value ?? 0;
  const range = period(result);
  if (result.request.statistic === 'transaction_count') {
    const count = Math.round(value);
    return `You recorded ${count} ${result.request.measure} transaction${count === 1 ? '' : 's'} from ${range}.`;
  }
  const formatted = amountForStatistic(value, result, options);
  if (result.request.statistic === 'total') {
    if (result.request.measure === 'expense') return `You spent ${formatted} from ${range}.`;
    if (result.request.measure === 'income') return `You received ${formatted} from ${range}.`;
    return `Your net cash flow was ${formatted} from ${range}.`;
  }
  return `Your ${englishSubject(result)} was ${formatted} from ${range}.`;
}

function chinesePrimary(
  result: AskPipAnalysisResult,
  options: AskPipAnalysisReplyOptions,
): string {
  const value = result.value ?? 0;
  const range = `${result.request.dateFrom} 至 ${result.request.dateTo}`;
  if (result.request.statistic === 'transaction_count') {
    const label = result.request.measure === 'expense' ? '支出' : result.request.measure === 'income' ? '收入' : '净额';
    return `你在 ${range} 期间记录了 ${Math.round(value)} 笔${label}交易。`;
  }
  const formatted = amountForStatistic(value, result, options);
  if (result.request.statistic === 'total') {
    if (result.request.measure === 'expense') return `你在 ${range} 期间共支出 ${formatted}。`;
    if (result.request.measure === 'income') return `你在 ${range} 期间共收入 ${formatted}。`;
    return `你在 ${range} 期间的净现金流为 ${formatted}。`;
  }
  const measure = result.request.measure === 'expense' ? '支出' : result.request.measure === 'income' ? '收入' : '净现金流';
  const statistic = {
    daily_mean: '每日平均',
    daily_median: '每日中位数',
    daily_stddev: '每日标准差',
    daily_variance: '每日方差',
    daily_min: '最低单日',
    daily_max: '最高单日',
    largest_transaction: '最大单笔',
    total: '',
    transaction_count: '',
  }[result.request.statistic];
  return `你在 ${range} 期间的${statistic}${measure}为 ${formatted}。`;
}

function comparisonReply(
  result: AskPipAnalysisResult,
  options: AskPipAnalysisReplyOptions,
): string {
  const subject = options.isZh ? chineseSubject(result) : englishSubject(result);
  const primary = amountForStatistic(result.primaryValue, result, options);
  const comparison = amountForStatistic(result.comparisonValue ?? 0, result, options);
  if (result.unavailableReason === 'comparison_is_zero') {
    return options.isZh
      ? `本时段的${subject}为 ${primary}；对比时段为 ${comparison}，因此无法计算百分比变化。`
      : `${result.request.measure === 'expense' && result.request.statistic === 'total' ? 'You spent' : `Your ${subject} was`} ${primary}; the comparison period was ${comparison}, so a percentage change is unavailable.`;
  }
  const value = result.value ?? 0;
  if (result.request.comparison === 'difference') {
    if (value === 0) {
      return options.isZh
        ? `本时段的${subject}与对比时段相同，均为 ${primary}。`
        : `Your ${subject} was unchanged from the comparison period at ${primary}.`;
    }
    const direction = value > 0 ? (options.isZh ? '高' : 'higher') : (options.isZh ? '低' : 'lower');
    const difference = amountForStatistic(Math.abs(value), result, options);
    return options.isZh
      ? `本时段的${subject}比对比时段${direction} ${difference}。`
      : `Your ${subject} was ${difference} ${direction} than the comparison period.`;
  }
  const direction = value > 0 ? (options.isZh ? '高' : 'more') : value < 0 ? (options.isZh ? '低' : 'less') : (options.isZh ? '相同' : 'the same');
  if (options.isZh) {
    return value === 0
      ? `本时段的${subject}为 ${primary}，与对比时段相同。`
      : `本时段的${subject}为 ${primary}，比对比时段${direction} ${Math.abs(value).toFixed(1)}%。`;
  }
  const lead = result.request.measure === 'expense' && result.request.statistic === 'total'
    ? `You spent ${primary}`
    : `Your ${subject} was ${primary}`;
  return value === 0
    ? `${lead}, the same as the comparison period.`
    : `${lead}, ${Math.abs(value).toFixed(1)}% ${direction} than the comparison period.`;
}

export function formatAskPipAnalysisReply(
  result: AskPipAnalysisResult,
  options: AskPipAnalysisReplyOptions,
): string {
  if (result.unavailableReason === 'date_range_is_future') {
    const measure = result.request.measure === 'expense' ? 'spending' : result.request.measure === 'income' ? 'income' : 'net cash flow';
    return options.isZh
      ? `该时段尚未开始。已记录的${measure}金额为 ${money(0, options)}。`
      : `That period has not started. The recorded ${measure} amount is ${money(0, options)}.`;
  }
  if (result.request.comparison) return comparisonReply(result, options);
  return options.isZh ? chinesePrimary(result, options) : englishPrimary(result, options);
}
