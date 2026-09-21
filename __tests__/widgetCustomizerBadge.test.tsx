import React from 'react';
import { WidgetCustomizerBadge } from '../src/components/WidgetCustomizerBadge';
import { DARK_COLORS, LIGHT_COLORS } from '../src/theme';

const TestRenderer = require('react-test-renderer');

let mockThemeColors = LIGHT_COLORS;
let mockScheme: 'light' | 'dark' = 'light';

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentInk: '#1c6b48',
    accentTint: '#eff7f4',
    accentSoft: '#dbece5',
    onTint: '#1c6b48',
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => mockThemeColors,
  useResolvedScheme: () => mockScheme,
}));

describe('WidgetCustomizerBadge', () => {
  beforeEach(() => {
    mockThemeColors = LIGHT_COLORS;
    mockScheme = 'light';
  });

  it('renders correctly with default size (38x38) and radius (11)', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<WidgetCustomizerBadge />);
    });
    const json = tree.toJSON();
    expect(json.props.bbWidth).toBe(38);
    expect(json.props.bbHeight).toBe(38);
    expect(json.props.minX).toBe(0);
    expect(json.props.minY).toBe(0);
    expect(json.props.vbWidth).toBe(38);
    expect(json.props.vbHeight).toBe(38);

    // Group children: base rects, widget card shell, divider, mascot, quick-button, sparkle
    const group = json.children[0];
    expect(group.children.length).toBeGreaterThanOrEqual(6);
    // Base rect rx
    const baseRect = group.children[0];
    expect(baseRect.props.rx).toBe(11);
  });

  it('supports custom size and radius props', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<WidgetCustomizerBadge size={44} rad={14} />);
    });
    const json = tree.toJSON();
    expect(json.props.bbWidth).toBe(44);
    expect(json.props.bbHeight).toBe(44);
    const group = json.children[0];
    const baseRect = group.children[0];
    expect(baseRect.props.rx).toBe(14);
  });

  it('renders dark mode surface adaptation when active scheme is dark', () => {
    mockThemeColors = DARK_COLORS;
    mockScheme = 'dark';
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<WidgetCustomizerBadge />);
    });
    const json = tree.toJSON();
    const group = json.children[0];
    // Find widget card rect (2nd or 3rd child)
    const cardRect = group.children.find(
      (c: any) => c.type === 'RNSVGRect' && c.props.width === '30' && c.props.height === '24'
    );
    expect(cardRect).toBeDefined();
    expect(cardRect.props.fill).toBeDefined();
  });
});
