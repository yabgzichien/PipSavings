import {
  HISTORY_RANGE_MONTHS,
  shiftWindowEnd,
  sliceSeriesWindow,
  xAxisLabels,
  type HistoryRange,
} from '../src/lib/netWorthChart';
import type { NetWorthPoint } from '../src/lib/networth';

function pts(keys: string[]): NetWorthPoint[] {
  return keys.map((monthKey, i) => ({
    monthKey,
    assets: 100 + i,
    liabilities: 0,
    net: 100 + i,
    measured: true,
  }));
}

describe('sliceSeriesWindow', () => {
  const series = pts([
    '2024-09', '2024-10', '2024-11', '2024-12',
    '2025-01', '2025-02', '2025-03',
    '2026-07', '2026-08', '2026-09',
  ]);

  it('returns the last N months ending at the series end by default', () => {
    const win = sliceSeriesWindow(series, '3m');
    expect(win.map((p) => p.monthKey)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('can end earlier so Sep–Dec 2024 is reachable with a 3m-ish window', () => {
    const win = sliceSeriesWindow(series, '3m', '2024-12');
    expect(win.map((p) => p.monthKey)).toEqual(['2024-10', '2024-11', '2024-12']);
  });

  it('returns the full series for all', () => {
    expect(sliceSeriesWindow(series, 'all').map((p) => p.monthKey)).toEqual(
      series.map((p) => p.monthKey)
    );
  });

  it('clamps a 12m window to available months when history is shorter', () => {
    const short = pts(['2026-07', '2026-08', '2026-09']);
    expect(sliceSeriesWindow(short, '12m').map((p) => p.monthKey)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });
});

describe('shiftWindowEnd', () => {
  const keys = ['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2026-09'];

  it('moves the window end earlier/later by one month in the series', () => {
    expect(shiftWindowEnd(keys, '2024-12', -1)).toBe('2024-11');
    expect(shiftWindowEnd(keys, '2024-11', 1)).toBe('2024-12');
  });

  it('clamps at the ends', () => {
    expect(shiftWindowEnd(keys, '2024-09', -1)).toBe('2024-09');
    expect(shiftWindowEnd(keys, '2026-09', 1)).toBe('2026-09');
  });
});

describe('HISTORY_RANGE_MONTHS', () => {
  it('maps presets to month counts', () => {
    expect(HISTORY_RANGE_MONTHS['3m']).toBe(3);
    expect(HISTORY_RANGE_MONTHS['12m']).toBe(12);
    expect(HISTORY_RANGE_MONTHS.all).toBeNull();
  });
});

describe('xAxisLabels', () => {
  it('keeps every label when the window is short', () => {
    const labels = xAxisLabels(['2026-07', '2026-08', '2026-09'], (k) => k.slice(5));
    expect(labels.map((l) => l.text)).toEqual(['07', '08', '09']);
  });

  it('thins labels for long windows but always keeps first and last', () => {
    const keys = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    const labels = xAxisLabels(keys, (k) => k);
    expect(labels[0].index).toBe(0);
    expect(labels[labels.length - 1].index).toBe(11);
    expect(labels.length).toBeLessThanOrEqual(6);
  });
});

describe('HistoryRange type surface', () => {
  it('accepts the three presets', () => {
    const ranges: HistoryRange[] = ['3m', '12m', 'all'];
    expect(ranges).toHaveLength(3);
  });
});

import { chartDataSparsity } from '../src/lib/netWorthChart';

describe('chartDataSparsity', () => {
  it('is empty when there are no points', () => {
    expect(chartDataSparsity([])).toEqual({ kind: 'empty', measuredCount: 0, totalCount: 0 });
  });

  it('is empty with a single month — one point is not a chart', () => {
    expect(
      chartDataSparsity([
        { monthKey: '2026-09', assets: 100, liabilities: 0, net: 100, measured: true },
      ])
    ).toEqual({ kind: 'empty', measuredCount: 1, totalCount: 1 });
  });

  it('is sparse when most points are carried forward', () => {
    const series = [
      { monthKey: '2026-01', assets: 100, liabilities: 0, net: 100, measured: true },
      { monthKey: '2026-02', assets: 100, liabilities: 0, net: 100, measured: false },
      { monthKey: '2026-03', assets: 100, liabilities: 0, net: 100, measured: false },
      { monthKey: '2026-04', assets: 100, liabilities: 0, net: 100, measured: false },
      { monthKey: '2026-05', assets: 110, liabilities: 0, net: 110, measured: true },
    ];
    expect(chartDataSparsity(series).kind).toBe('sparse');
    expect(chartDataSparsity(series).measuredCount).toBe(2);
  });

  it('is ok with two+ measured months that are not mostly carried', () => {
    const series = [
      { monthKey: '2026-01', assets: 100, liabilities: 0, net: 100, measured: true },
      { monthKey: '2026-02', assets: 120, liabilities: 0, net: 120, measured: true },
      { monthKey: '2026-03', assets: 130, liabilities: 0, net: 130, measured: true },
    ];
    expect(chartDataSparsity(series)).toEqual({ kind: 'ok', measuredCount: 3, totalCount: 3 });
  });
});
