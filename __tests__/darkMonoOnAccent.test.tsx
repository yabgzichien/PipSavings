import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BottomNav } from '../src/components/BottomNav';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#ffffff',
    onAccent: '#000000',
    accentSoft: '#2a2a2a',
    accentTint: '#1f1f1f',
    onTint: '#ededed',
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#0a0a0a',
    surface: '#181818',
    line: 'rgba(237,237,237,0.10)',
    ink: '#ededed',
    ink2: '#9a9a9a',
    ink3: '#8f8f8f',
  }),
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({ t: (key: string) => key, isZh: false }),
}));

const TestRenderer = require('react-test-renderer');

function render(element: React.ReactElement) {
  let tree: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(element);
  });
  return tree!;
}

describe('dark Monochrome onAccent contrast', () => {
  it('paints the add plus with onAccent so it survives a white accent fill', () => {
    const tree = render(
      <BottomNav active="home" onNavigate={() => {}} onAdd={() => {}} />
    );
    const plus = tree.root.findAll((node: any) =>
      node.props?.x1 === 12 && node.props?.y1 === 5 && node.props?.x2 === 12 && node.props?.y2 === 19
    );
    expect(plus.length).toBeGreaterThan(0);
    expect(plus[0].props.stroke).toBe('#000000');
  });
});

describe('dark Monochrome streak glyphs', () => {
  const dashboardSource = readFileSync(
    resolve(__dirname, '../src/screens/DashboardScreen.tsx'),
    'utf8'
  );

  it('paints completed-dot check and leaf with onAccent, not hardcoded white', () => {
    const weekBlock = dashboardSource.slice(
      dashboardSource.indexOf('week.map((done, i)'),
      dashboardSource.indexOf('function TodayDotSpinner')
    );
    expect(weekBlock).toContain('stroke={theme.onAccent}');
    expect(weekBlock).not.toMatch(/stroke="#fff"/);
  });
});

describe('dark Monochrome calendar leftovers', () => {
  const calendarSource = readFileSync(
    resolve(__dirname, '../src/screens/CalendarScreen.tsx'),
    'utf8'
  );

  it('does not paint income/expense-only days with a light-mode wash', () => {
    expect(calendarSource).not.toContain('#e8f5ee');
    expect(calendarSource).not.toContain('#fce8e6');
    expect(calendarSource).not.toContain('#f5ceca');
  });

  it('does not hardcode white for selected day numbers sitting on the accent fill', () => {
    expect(calendarSource).not.toMatch(/cellDaySelected:\s*\{\s*color:\s*'#fff'/);
    expect(calendarSource).not.toMatch(/miniCellTextSelected:\s*\{\s*color:\s*'#fff'/);
  });
});

describe('dark Monochrome onAccent on accent fills', () => {
  it('paints date-range endpoints with onAccent, not hardcoded white', () => {
    const source = readFileSync(resolve(__dirname, '../src/components/DateRangeSheet.tsx'), 'utf8');
    expect(source).toContain('theme.onAccent');
    expect(source).not.toMatch(/isEndpoint\s*\n\s*\?\s*'#fff'/);
  });

  it('paints the quick-add submit check with onAccent, not hardcoded white', () => {
    const source = readFileSync(resolve(__dirname, '../src/components/QuickAddField.tsx'), 'utf8');
    expect(source).toContain('theme.onAccent');
    expect(source).not.toMatch(/canSubmit \? '#fff'/);
  });

  it('paints selected demo avatars with onAccent, not hardcoded white', () => {
    const source = readFileSync(resolve(__dirname, '../src/screens/onboarding/DemoStep.tsx'), 'utf8');
    expect(source).toContain('theme.onAccent');
    expect(source).not.toMatch(/on \? '#fff'/);
  });

  it('paints the selected category-chip check with onAccent, not hardcoded white', () => {
    const source = readFileSync(resolve(__dirname, '../src/components/ui.tsx'), 'utf8');
    const chip = source.slice(source.indexOf('function CategoryChip'), source.indexOf('/* ── Pip speech'));
    expect(chip).toContain('theme.onAccent');
    expect(chip).not.toMatch(/color="#fff"/);
  });
});
