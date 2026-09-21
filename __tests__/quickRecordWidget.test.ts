import React from 'react';
import { QuickRecordWidget } from '../src/widget/QuickRecordWidget';
import { DEFAULT_WIDGET_MASCOT_CONFIG, type BadgeIcon } from '../src/widget/mascot/config';
import { MASCOT_SIZES, BUTTON_SIZES, STREAK_COLUMN } from '../src/widget/mascot/sizing';
import { expandedStreakMetrics } from '../src/widget/mascot/chrome';

const cfg = (over = {}) => ({ ...DEFAULT_WIDGET_MASCOT_CONFIG, ...over });

/** Recursively collects every element carrying a clickActionData uri. */
function byUri(el: any): Record<string, any> {
  const out: Record<string, any> = {};
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const uri = node.props?.clickActionData?.uri;
    if (uri) out[uri] = node;
    React.Children.toArray(node.props?.children ?? []).forEach(walk);
  };
  walk(el);
  return out;
}

function findTextWidget(el: any, text: string): any | undefined {
  if (!el || typeof el !== 'object') return undefined;
  if (el.props?.text === text) return el;
  return React.Children.toArray(el.props?.children ?? [])
    .map((child) => findTextWidget(child, text))
    .find(Boolean);
}

function findElement(el: any, predicate: (node: any) => boolean): any | undefined {
  if (!el || typeof el !== 'object') return undefined;
  if (predicate(el)) return el;
  return React.Children.toArray(el.props?.children ?? [])
    .map((child) => findElement(child, predicate))
    .find(Boolean);
}

/** Android SvgWidget feeds the string to androidsvg's XML parser. A valueless attribute is
 *  well-formed HTML and what the in-app WebView preview accepts — and a parse error on device,
 *  where SvgWidget swallows SVGParseException and draws nothing. */
function valuelessXmlAttributes(xml: string): string[] {
  const found: string[] = [];
  for (const tag of xml.match(/<[^!?][^>]*>/g) ?? []) {
    if (tag.startsWith('</')) continue;
    const body = tag.replace(/^<\/?/, '').replace(/\/?>$/, '');
    const tokens = body.match(/[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?/g) ?? [];
    for (const token of tokens.slice(1)) {
      if (!token.includes('=')) found.push(token);
    }
  }
  return found;
}

function collectSvgDocuments(el: any): string[] {
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.props?.svg === 'string') out.push(node.props.svg);
    React.Children.toArray(node.props?.children ?? []).forEach(walk);
  };
  walk(el);
  return out;
}

describe('QuickRecordWidget layout', () => {
  it('renders mascot, income and expense targets by default', () => {
    const found = byUri(QuickRecordWidget({ streak: 5, config: cfg() }));
    expect(Object.keys(found).sort()).toEqual(
      ['pip://add', 'pip://add?type=expense', 'pip://add?type=income'].sort()
    );
  });

  it('drops only the emptied slot', () => {
    const found = byUri(QuickRecordWidget({ streak: 5, config: cfg({ slot2: 'none' }) }));
    expect(found['pip://add?type=income']).toBeDefined();
    expect(found['pip://add?type=expense']).toBeUndefined();
    expect(found['pip://add']).toBeDefined();
  });

  it('collapses to a single add target and enlarges mascot when both slots are empty', () => {
    const widget = QuickRecordWidget({ streak: 5, config: cfg({ slot1: 'none', slot2: 'none' }) });
    const found = byUri(widget);
    expect(Object.keys(found)).toEqual(['pip://add']);
    const json = JSON.stringify(widget);
    const enlargedW = Math.round(MASCOT_SIZES[3].w * 1.35);
    const enlargedH = Math.round(MASCOT_SIZES[3].h * 1.35);
    expect(json).toContain(`"width":${enlargedW},"height":${enlargedH}`);
  });

  it('shows the expanded streak count and 7 dots when fire is selected', () => {
    const dots = [true, true, false, true, false, false, true];
    const withFire = QuickRecordWidget({ streak: 9, dots, config: cfg({ slot1: 'streak', slot2: 'none' }) });
    const json = JSON.stringify(withFire);
    expect(json).toContain('data-streak-dots');
    const compact = QuickRecordWidget({ streak: 9, dots, config: cfg() });
    expect(JSON.stringify(compact)).not.toContain('data-streak-dots');
    const withNone = QuickRecordWidget({ streak: 9, dots, config: cfg({ slot1: 'none', slot2: 'none' }) });
    expect(JSON.stringify(withNone)).not.toContain('data-streak-dots');
  });

  it('keeps a multi-digit expanded streak count on one fitted line', () => {
    const widget = QuickRecordWidget({
      streak: 205,
      config: cfg({ slot1: 'streak', slot2: 'none', buttonNotch: 5 }),
    });
    const count = findTextWidget(widget, '205');

    expect(count).toBeDefined();
    expect(count.props.maxLines).toBe(1);
    expect(count.props.style).toEqual(expect.objectContaining({ adjustsFontSizeToFit: true, textAlign: 'center' }));
  });

  it('uses the same fixed streak column as the preview instead of weighted Android layout', () => {
    const widget = QuickRecordWidget({ streak: 205, config: cfg({ slot1: 'streak', slot2: 'none' }) });
    const streakColumn = findElement(
      widget,
      (node) => node.props?.style?.width === STREAK_COLUMN && node.props?.style?.flexDirection === 'column'
    );

    expect(streakColumn).toBeDefined();
  });

  it('keeps the largest fire and three-digit count within the streak column', () => {
    const m = expandedStreakMetrics(5);
    expect(m.icon + m.gap + 32).toBeLessThanOrEqual(STREAK_COLUMN);
  });

  it('scales the fire icon and count with buttonNotch when fire is selected', () => {
    const dots = [true, true, false, true, false, false, true];
    const notch1 = QuickRecordWidget({ streak: 9, dots, config: cfg({ slot1: 'streak', slot2: 'none', buttonNotch: 1 }) });
    const notch5 = QuickRecordWidget({ streak: 9, dots, config: cfg({ slot1: 'streak', slot2: 'none', buttonNotch: 5 }) });
    expect(JSON.stringify(notch1)).toContain('"width":18,"height":18');
    expect(JSON.stringify(notch5)).toContain('"width":30,"height":30');
    expect(JSON.stringify(notch1)).toContain('"fontSize":12');
    expect(JSON.stringify(notch5)).toContain('"fontSize":16');
  });

  it('honours the selected badge icon and colour when fire is selected, falling back to flame if none', () => {
    const withFire = QuickRecordWidget({
      streak: 9,
      config: cfg({
        slot1: 'streak',
        slot2: 'none',
        badgeIcon: 'star',
        badgeColor: 'blue',
      }),
    });
    const json = JSON.stringify(withFire);
    expect(json).toContain('data-streak-icon');
    expect(json).toContain('#2563EB');

    const withNone = JSON.stringify(
      QuickRecordWidget({
        streak: 9,
        config: cfg({ slot1: 'streak', slot2: 'none', badgeIcon: 'none' }),
      })
    );
    expect(withNone).toContain('data-streak-icon');
  });

  it('renders a streak badge in a slot without giving it a tap target', () => {
    // The badge is an indicator, not an action — the mascot stays the widget's only add target
    // besides the arrows, so the streak slot carries no clickAction.
    const found = byUri(QuickRecordWidget({ streak: 6, config: cfg({ slot2: 'streak' }) }));
    expect(Object.keys(found).sort()).toEqual(['pip://add', 'pip://add?type=income'].sort());

    const json = JSON.stringify(QuickRecordWidget({ streak: 6, config: cfg({ slot2: 'streak' }) }));
    expect(json).toContain('data-streak-icon');
    expect(json).toContain('"text":"6"');
  });

  it('suppresses the mascot pill when a slot shows the streak', () => {
    const withSlot = JSON.stringify(QuickRecordWidget({ streak: 6, config: cfg({ slot2: 'streak' }) }));
    expect(withSlot).not.toContain('data-part=\\"badge\\"');

    const withoutSlot = JSON.stringify(QuickRecordWidget({ streak: 6, config: cfg() }));
    expect(withoutSlot).toContain('data-part=\\"badge\\"');
  });

  it('applies the mascot and button size notches', () => {
    const el = QuickRecordWidget({ streak: 1, config: cfg({ mascotNotch: 2, buttonNotch: 5 }) });
    const json = JSON.stringify(el);
    expect(json).toContain(`"width":${MASCOT_SIZES[2].w}`);
    expect(json).toContain(`"width":${BUTTON_SIZES[5]}`);
  });

  it('renders the chosen badge colour in the mascot svg', () => {
    const el = QuickRecordWidget({ streak: 4, config: cfg({ badgeColor: 'blue' }) });
    expect(JSON.stringify(el)).toContain('#2563EB');
  });

  it('renders multi-digit streaks', () => {
    for (const n of [5, 12, 128]) {
      expect(JSON.stringify(QuickRecordWidget({ streak: n, config: cfg() }))).toContain(`>${n}<`);
    }
  });

  it('falls back to defaults when no config is passed', () => {
    const found = byUri(QuickRecordWidget({ streak: 0 }));
    expect(Object.keys(found)).toHaveLength(3);
  });
});

describe('QuickRecordWidget Android SVG documents', () => {
  const ICONS: BadgeIcon[] = ['flame', 'star', 'leaf', 'sprout'];

  it('emits well-formed XML for every badge icon in the expanded streak column', () => {
    // A boolean `data-streak-icon` (no ="...") is valid in the WebView preview and a parse
    // error for androidsvg. SvgWidget then draws a blank ImageView, so switching icons does
    // nothing — they all share this wrapper.
    for (const badgeIcon of ICONS) {
      const svgs = collectSvgDocuments(
        QuickRecordWidget({
          streak: 0,
          dots: [false, false, false, false, false, false, false],
          config: cfg({ slot1: 'streak', slot2: 'none', badgeIcon }),
        })
      );
      const badgeDoc = svgs.find((svg) => svg.includes('data-streak-icon'));
      expect(badgeDoc).toBeDefined();
      expect(valuelessXmlAttributes(badgeDoc!)).toEqual([]);
    }
  });

  it('emits well-formed XML for a compact streak slot badge too', () => {
    const svgs = collectSvgDocuments(
      QuickRecordWidget({ streak: 6, config: cfg({ slot1: 'income', slot2: 'streak', badgeIcon: 'sprout' }) })
    );
    const badgeDoc = svgs.find((svg) => svg.includes('data-streak-icon'));
    expect(badgeDoc).toBeDefined();
    expect(valuelessXmlAttributes(badgeDoc!)).toEqual([]);
  });
});
