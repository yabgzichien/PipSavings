// Pure chart geometry + demo series for NetWorthHistoryScreen.
import type { NetWorthPoint } from './networth';

export interface ChartPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ChartSize {
  width: number;
  height: number;
  padding: ChartPadding;
}

export interface ChartPoint {
  x: number;
  y: number;
  index: number;
  monthKey: string;
  net: number;
  measured: boolean;
}

export interface ChartSegment {
  from: ChartPoint;
  to: ChartPoint;
  measured: boolean;
}

export interface ChartLayout {
  points: ChartPoint[];
  segments: ChartSegment[];
  zeroY: number;
  minNet: number;
  maxNet: number;
  plotWidth: number;
  plotHeight: number;
}

function yFor(net: number, minNet: number, maxNet: number, top: number, plotHeight: number): number {
  const range = maxNet - minNet;
  if (range === 0) return top + plotHeight / 2;
  return top + (1 - (net - minNet) / range) * plotHeight;
}

/** Map a net-worth series into plot coordinates. Always includes a zero baseline in the range. */
export function buildChartLayout(series: NetWorthPoint[], size: ChartSize): ChartLayout {
  const { width, height, padding } = size;
  const plotWidth = Math.max(0, width - padding.left - padding.right);
  const plotHeight = Math.max(0, height - padding.top - padding.bottom);
  const nets = series.map((p) => p.net);
  const dataMin = nets.length ? Math.min(...nets) : 0;
  const dataMax = nets.length ? Math.max(...nets) : 0;
  const minNet = Math.min(0, dataMin);
  const maxNet = Math.max(0, dataMax);
  const n = series.length;
  const points: ChartPoint[] = series.map((p, index) => {
    const x = n <= 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (n - 1)) * plotWidth;
    const y = yFor(p.net, minNet, maxNet, padding.top, plotHeight);
    return { x, y, index, monthKey: p.monthKey, net: p.net, measured: p.measured };
  });
  const segments: ChartSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    // A segment is "measured" only when both endpoints were measured that month —
    // otherwise the connection is a carried-forward (dashed) claim.
    segments.push({
      from: points[i - 1],
      to: points[i],
      measured: points[i - 1].measured && points[i].measured,
    });
  }
  return {
    points,
    segments,
    zeroY: yFor(0, minNet, maxNet, padding.top, plotHeight),
    minNet,
    maxNet,
    plotWidth,
    plotHeight,
  };
}

export function nearestPointIndex(layout: ChartLayout, x: number): number {
  if (layout.points.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(layout.points[0].x - x);
  for (let i = 1; i < layout.points.length; i++) {
    const d = Math.abs(layout.points[i].x - x);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/** Build SVG path `d` for a polyline through the given points. */
export function polylinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

/** Closed area under the line down to `baselineY`. */
export function areaPath(points: { x: number; y: number }[], baselineY: number): string {
  if (points.length === 0) return '';
  const line = polylinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

/**
 * Deterministic 24-month demo series ending at `now`'s month.
 * Long enough to exercise 1M / 3M / 12M / All range windows.
 */
export function demoNetWorthSeries(now: Date = new Date()): NetWorthPoint[] {
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = 24;
  const base = 12_400;
  const out: NetWorthPoint[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(end.getFullYear(), end.getMonth() - (months - 1 - i), 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const t = i / Math.max(1, months - 1);
    const wobble = Math.sin(i * 0.55) * 0.04;
    const net = Math.round(base * (1 + t * 0.38 + wobble));
    const liabilities = Math.round(4200 - i * 35);
    const assets = net + liabilities;
    out.push({ monthKey, assets, liabilities, net, measured: i % 3 !== 2 });
  }
  return out;
}

export type HistoryRange = '3m' | '12m' | 'all';

export const HISTORY_RANGE_MONTHS: Record<HistoryRange, number | null> = {
  '3m': 3,
  '12m': 12,
  all: null,
};

/**
 * Slice `series` to the last `range` months ending at `endMonthKey` (inclusive).
 * When `endMonthKey` is omitted, ends at the newest point. `all` returns the full series.
 */
export function sliceSeriesWindow(
  series: NetWorthPoint[],
  range: HistoryRange,
  endMonthKey?: string | null
): NetWorthPoint[] {
  if (series.length === 0) return [];
  if (range === 'all') return series;

  const count = HISTORY_RANGE_MONTHS[range] ?? series.length;
  let endIdx = series.length - 1;
  if (endMonthKey) {
    const found = series.findIndex((p) => p.monthKey === endMonthKey);
    if (found >= 0) endIdx = found;
  }
  const startIdx = Math.max(0, endIdx - count + 1);
  return series.slice(startIdx, endIdx + 1);
}

/** Move the window end along the series by `delta` steps (−1 earlier, +1 later). */
export function shiftWindowEnd(
  monthKeys: string[],
  endMonthKey: string,
  delta: number
): string {
  if (monthKeys.length === 0) return endMonthKey;
  const idx = monthKeys.indexOf(endMonthKey);
  const at = idx >= 0 ? idx : monthKeys.length - 1;
  const next = Math.min(monthKeys.length - 1, Math.max(0, at + delta));
  return monthKeys[next];
}

export interface XAxisLabel {
  index: number;
  text: string;
}

/**
 * Pick a sparse set of x-axis labels for the visible window.
 * Short windows keep every month; longer ones keep first, last, and evenly spaced middles.
 */
export function xAxisLabels(
  monthKeys: string[],
  format: (monthKey: string) => string,
  maxLabels: number = 6
): XAxisLabel[] {
  const n = monthKeys.length;
  if (n === 0) return [];
  if (n <= maxLabels) {
    return monthKeys.map((key, index) => ({ index, text: format(key) }));
  }
  const indexes = new Set<number>([0, n - 1]);
  const inner = maxLabels - 2;
  for (let i = 1; i <= inner; i++) {
    indexes.add(Math.round((i * (n - 1)) / (inner + 1)));
  }
  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => ({ index, text: format(monthKeys[index]) }));
}

export type ChartSparsityKind = 'empty' | 'sparse' | 'ok';

export interface ChartSparsity {
  kind: ChartSparsityKind;
  measuredCount: number;
  totalCount: number;
}

/**
 * Whether the series has enough *measured* months for a useful history chart.
 * - empty: fewer than 2 months (a single point isn't a chart)
 * - sparse: fewer than 2 measured months, or measured months are ≤ 40% of the series
 *   (mostly carried-forward flatline)
 * - ok: at least two measured months and a meaningful share of the series
 */
export function chartDataSparsity(series: NetWorthPoint[]): ChartSparsity {
  const totalCount = series.length;
  const measuredCount = series.filter((p) => p.measured).length;
  if (totalCount < 2) {
    return { kind: 'empty', measuredCount, totalCount };
  }
  if (measuredCount < 2) return { kind: 'sparse', measuredCount, totalCount };
  if (measuredCount / totalCount <= 0.4) return { kind: 'sparse', measuredCount, totalCount };
  return { kind: 'ok', measuredCount, totalCount };
}

