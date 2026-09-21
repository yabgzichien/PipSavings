// Interactive net-worth area chart: scrub to select a month, with a simple time axis.
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import type { NetWorthPoint } from '../lib/networth';
import {
  areaPath,
  buildChartLayout,
  nearestPointIndex,
  polylinePath,
  xAxisLabels,
  type ChartLayout,
  type XAxisLabel,
} from '../lib/netWorthChart';
import { Caption } from './ui';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, spacing } from '../theme';

const CHART_HEIGHT = 180;
const PADDING = { top: 16, bottom: 16, left: 12, right: 12 };

export function NetWorthHistoryChart({
  series,
  selectedIndex,
  onSelectIndex,
  formatAxisLabel,
}: {
  series: NetWorthPoint[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  formatAxisLabel: (monthKey: string) => string;
}) {
  const theme = useAccent();
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);

  const layout = useMemo(
    () =>
      buildChartLayout(series, {
        width: width || 320,
        height: CHART_HEIGHT,
        padding: PADDING,
      }),
    [series, width]
  );

  const axis = useMemo(
    () => xAxisLabels(series.map((p) => p.monthKey), formatAxisLabel),
    [series, formatAxisLabel]
  );

  useEffect(() => {
    if (series.length === 0) return;
    if (selectedIndex < 0 || selectedIndex >= series.length) {
      onSelectIndex(series.length - 1);
    }
  }, [series, selectedIndex, onSelectIndex]);

  const selectAtX = (x: number) => {
    const idx = nearestPointIndex(layout, x);
    if (idx >= 0 && idx !== selectedIndex) onSelectIndex(idx);
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      runOnJS(selectAtX)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(selectAtX)(e.x);
    });

  const tap = Gesture.Tap().onEnd((e) => {
    runOnJS(selectAtX)(e.x);
  });

  const gesture = Gesture.Race(pan, tap);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next > 0 && next !== width) setWidth(next);
  };

  if (series.length === 0) return null;

  const selected = layout.points[Math.min(Math.max(selectedIndex, 0), layout.points.length - 1)];

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.line }]}
      onLayout={onLayout}
      accessibilityRole="adjustable"
      accessibilityLabel="Net worth chart"
      accessibilityValue={{
        text: selected ? `${selected.monthKey}: ${selected.net}` : undefined,
      }}
    >
      <GestureDetector gesture={gesture}>
        <View style={{ height: CHART_HEIGHT }}>
          {width > 0 ? (
            <ChartSvg
              layout={layout}
              selected={selected}
              accent={theme.accent}
              red={colors.red}
              line={colors.line}
              ink3={colors.ink3}
            />
          ) : null}
        </View>
      </GestureDetector>
      <AxisRow labels={axis} count={series.length} color={colors.ink2} />
    </View>
  );
}

function AxisRow({
  labels,
  count,
  color,
}: {
  labels: XAxisLabel[];
  count: number;
  color: string;
}) {
  if (count === 0 || labels.length === 0) return null;
  // Match the 6-month trend: a row of captions spaced across the plot.
  // For thinned labels, place each by flex weight of its index gap.
  return (
    <View style={styles.axisRow}>
      {labels.map((label, i) => {
        const prev = i === 0 ? 0 : labels[i - 1].index;
        const flex = Math.max(1, label.index - prev);
        const isFirst = i === 0;
        const isLast = i === labels.length - 1;
        return (
          <Caption
            key={`${label.index}-${label.text}`}
            color={color}
            style={[
              styles.axisLabel,
              { flex },
              isFirst && styles.axisFirst,
              isLast && styles.axisLast,
              !isFirst && !isLast && styles.axisMid,
            ]}
          >
            {label.text}
          </Caption>
        );
      })}
    </View>
  );
}

function ChartSvg({
  layout,
  selected,
  accent,
  red,
  line,
  ink3,
}: {
  layout: ChartLayout;
  selected: ChartLayout['points'][number] | undefined;
  accent: string;
  red: string;
  line: string;
  ink3: string;
}) {
  const w = layout.plotWidth + PADDING.left + PADDING.right;
  const h = CHART_HEIGHT;
  const area = areaPath(layout.points, layout.zeroY);

  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id="nwAbove" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accent} stopOpacity={0.28} />
          <Stop offset="1" stopColor={accent} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="nwBelow" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={red} stopOpacity={0.28} />
          <Stop offset="1" stopColor={red} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <Line
        x1={PADDING.left}
        x2={w - PADDING.right}
        y1={layout.zeroY}
        y2={layout.zeroY}
        stroke={line}
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {layout.minNet < 0 && layout.maxNet > 0 ? (
        <>
          <Path d={areaAboveZero(layout)} fill="url(#nwAbove)" />
          <Path d={areaBelowZero(layout)} fill="url(#nwBelow)" />
        </>
      ) : layout.maxNet <= 0 ? (
        <Path d={area} fill="url(#nwBelow)" />
      ) : (
        <Path d={area} fill="url(#nwAbove)" />
      )}

      {layout.segments.map((seg, i) => (
        <Path
          key={`seg-${i}`}
          d={polylinePath([seg.from, seg.to])}
          fill="none"
          stroke={seg.to.net < 0 && seg.from.net < 0 ? red : accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={seg.measured ? undefined : '6 5'}
          opacity={seg.measured ? 1 : 0.7}
        />
      ))}

      {layout.points.map((p) => (
        <Circle
          key={p.monthKey}
          cx={p.x}
          cy={p.y}
          r={p.measured ? 3.5 : 3}
          fill={p.measured ? (p.net < 0 ? red : accent) : '#ffffff'}
          stroke={p.measured ? 'none' : p.net < 0 ? red : accent}
          strokeWidth={p.measured ? 0 : 1.5}
        />
      ))}

      {selected ? (
        <>
          <Line
            x1={selected.x}
            x2={selected.x}
            y1={PADDING.top}
            y2={h - PADDING.bottom}
            stroke={ink3}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <Circle
            cx={selected.x}
            cy={selected.y}
            r={6}
            fill={selected.net < 0 ? red : accent}
            stroke="#fff"
            strokeWidth={2}
          />
        </>
      ) : null}
    </Svg>
  );
}

function areaAboveZero(layout: ChartLayout): string {
  const pts = layout.points.map((p) => ({
    x: p.x,
    y: Math.min(p.y, layout.zeroY),
  }));
  return areaPath(pts, layout.zeroY);
}

function areaBelowZero(layout: ChartLayout): string {
  const pts = layout.points.map((p) => ({
    x: p.x,
    y: Math.max(p.y, layout.zeroY),
  }));
  return areaPath(pts, layout.zeroY);
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
  },
  axisRow: {
    flexDirection: 'row',
    paddingHorizontal: PADDING.left,
    marginTop: spacing.xs,
  },
  axisLabel: {
    fontSize: 11,
  },
  axisFirst: { textAlign: 'left' },
  axisMid: { textAlign: 'center' },
  axisLast: { textAlign: 'right' },
});
