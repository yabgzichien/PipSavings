// __tests__/netWorthChart.test.ts
import {
  buildChartLayout,
  nearestPointIndex,
  demoNetWorthSeries,
} from '../src/lib/netWorthChart';

describe('buildChartLayout', () => {
  it('places a zero baseline and maps points into the plot', () => {
    const layout = buildChartLayout(
      [
        { monthKey: '2026-01', net: -200, assets: 800, liabilities: 1000, measured: true },
        { monthKey: '2026-02', net: 100, assets: 900, liabilities: 800, measured: false },
        { monthKey: '2026-03', net: 400, assets: 1100, liabilities: 700, measured: true },
      ],
      { width: 300, height: 160, padding: { top: 12, bottom: 12, left: 8, right: 8 } },
    );
    expect(layout.zeroY).toBeGreaterThan(layout.points[2].y);
    expect(layout.zeroY).toBeLessThan(layout.points[0].y);
    expect(layout.points).toHaveLength(3);
    expect(layout.segments.filter((s) => s.measured)).toHaveLength(0);
    expect(layout.segments.filter((s) => !s.measured)).toHaveLength(2);
  });

  it('handles a flat series without dividing by zero', () => {
    const layout = buildChartLayout(
      [
        { monthKey: '2026-01', net: 50, assets: 50, liabilities: 0, measured: true },
        { monthKey: '2026-02', net: 50, assets: 50, liabilities: 0, measured: true },
      ],
      { width: 200, height: 100, padding: { top: 10, bottom: 10, left: 0, right: 0 } },
    );
    expect(layout.points[0].y).toBe(layout.points[1].y);
  });
});

describe('nearestPointIndex', () => {
  it('returns the closest point by x', () => {
    const layout = buildChartLayout(
      [
        { monthKey: '2026-01', net: 10, assets: 10, liabilities: 0, measured: true },
        { monthKey: '2026-02', net: 20, assets: 20, liabilities: 0, measured: true },
        { monthKey: '2026-03', net: 30, assets: 30, liabilities: 0, measured: true },
      ],
      { width: 300, height: 100, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
    );
    expect(nearestPointIndex(layout, layout.points[1].x + 5)).toBe(1);
    expect(nearestPointIndex(layout, -10)).toBe(0);
  });
});

describe('demoNetWorthSeries', () => {
  it('returns 24 months ending at the given month, with a climbing shape', () => {
    const series = demoNetWorthSeries(new Date(2026, 8, 14)); // Sep 2026
    expect(series).toHaveLength(24);
    expect(series[0].monthKey).toBe('2024-10');
    expect(series[23].monthKey).toBe('2026-09');
    expect(series[23].net).toBeGreaterThan(series[0].net);
  });
});
