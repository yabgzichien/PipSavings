import {
  DEFAULT_WIDGET_MASCOT_CONFIG,
  type Notch,
  type SlotContent,
  type WidgetMascotConfig,
} from '../src/widget/mascot/config';
import {
  BUTTON_SIZES,
  DECLARED_MIN_HEIGHT_DP,
  DECLARED_MIN_WIDTH_DP,
  MASCOT_SIZES,
  STREAK_SLOT_SIZES,
  contentHeight,
  contentWidth,
  fitsDeclaredMinimum,
} from '../src/widget/mascot/sizing';

const NOTCHES: Notch[] = [1, 2, 3, 4, 5];
const CONTENTS: SlotContent[] = ['income', 'expense', 'streak', 'none'];

const cfg = (over: Partial<WidgetMascotConfig> = {}): WidgetMascotConfig => ({
  ...DEFAULT_WIDGET_MASCOT_CONFIG,
  ...over,
});

describe('size ladders', () => {
  it('centres the default on notch 3', () => {
    expect(DEFAULT_WIDGET_MASCOT_CONFIG.mascotNotch).toBe(3);
    expect(DEFAULT_WIDGET_MASCOT_CONFIG.buttonNotch).toBe(3);
  });

  it('every mascot notch is larger than the old ladder it replaced', () => {
    // The old ladder ran 38..58 wide with 58 as the default. The smallest new notch must clear
    // the old default's neighbours, which is the whole point of the rescale: nothing tiny.
    expect(MASCOT_SIZES[1].w).toBeGreaterThan(48);
    expect(MASCOT_SIZES[3].w).toBeGreaterThan(58);
  });

  it('both ladders increase monotonically', () => {
    for (let n = 2; n <= 5; n++) {
      expect(MASCOT_SIZES[n as Notch].w).toBeGreaterThan(MASCOT_SIZES[(n - 1) as Notch].w);
      expect(MASCOT_SIZES[n as Notch].h).toBeGreaterThan(MASCOT_SIZES[(n - 1) as Notch].h);
      expect(BUTTON_SIZES[n as Notch]).toBeGreaterThan(BUTTON_SIZES[(n - 1) as Notch]);
      expect(STREAK_SLOT_SIZES[n as Notch]).toBeGreaterThan(STREAK_SLOT_SIZES[(n - 1) as Notch]);
    }
  });

  it('gives a streak slot more room than an arrow at the same notch', () => {
    // A streak slot carries an icon plus up to three digits; an arrow is one glyph.
    for (const n of NOTCHES) {
      expect(STREAK_SLOT_SIZES[n]).toBeGreaterThan(BUTTON_SIZES[n]);
    }
  });
});

describe('contentWidth', () => {
  it('drops a slot entirely when it holds nothing', () => {
    const both = cfg();
    const one = cfg({ slot2: 'none' });
    expect(contentWidth(one)).toBe(contentWidth(both) - (1 + BUTTON_SIZES[both.buttonNotch]));
  });

  it('is symmetric between the two slots', () => {
    expect(contentWidth(cfg({ slot1: 'income', slot2: 'none' }))).toBe(
      contentWidth(cfg({ slot1: 'none', slot2: 'income' }))
    );
  });

  it('costs more for a streak slot than an arrow slot', () => {
    expect(contentWidth(cfg({ slot2: 'streak' }))).toBeGreaterThan(contentWidth(cfg({ slot2: 'expense' })));
  });

  /** Arrows-off is not a narrower widget — the freed space carries an expanded streak column
   *  wider than the arrows it replaced. Preserved from the pre-slots design. */
  it('swaps in the wider expanded column when both slots are empty', () => {
    const none = cfg({ slot1: 'none', slot2: 'none' });
    expect(contentWidth(none)).toBeGreaterThan(contentWidth(cfg()));
  });

  it('counts the expanded streak column rather than a compact slot when fire is selected', () => {
    // Layout is padding 16 + mascot lane 74 + streak column 68. Treating this as a 34dp
    // compact slot under-reports overflow, so the customizer stays quiet while the home
    // widget clips the 7-day row.
    expect(contentWidth(cfg({ slot1: 'streak', slot2: 'none' }))).toBe(158);
    expect(contentWidth(cfg({ slot1: 'none', slot2: 'streak' }))).toBe(158);
  });

  it('grows with the mascot notch in every layout case', () => {
    for (const [slot1, slot2] of [
      ['income', 'expense'],
      ['streak', 'none'],
      ['none', 'none'],
    ] as const) {
      const small = contentWidth(cfg({ mascotNotch: 1, slot1, slot2 }));
      const large = contentWidth(cfg({ mascotNotch: 5, slot1, slot2 }));
      expect(large).toBeGreaterThan(small);
    }
  });

  it('never returns a non-finite or negative width', () => {
    for (const m of NOTCHES) {
      for (const b of NOTCHES) {
        for (const slot1 of CONTENTS) {
          for (const slot2 of CONTENTS) {
            const w = contentWidth(cfg({ mascotNotch: m, buttonNotch: b, slot1, slot2 }));
            expect(Number.isFinite(w)).toBe(true);
            expect(w).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

/**
 * The declared manifest minimum no longer has to cover every size the user can pick — a bigger
 * mascot is theirs to accommodate by resizing the widget on the home screen. What it MUST cover
 * is the stock configuration, so a freshly placed widget never clips.
 */
describe('declared minimum', () => {
  it('fits the default configuration with headroom', () => {
    const d = DEFAULT_WIDGET_MASCOT_CONFIG;
    expect(contentWidth(d)).toBeLessThanOrEqual(DECLARED_MIN_WIDTH_DP);
    expect(contentHeight(d)).toBeLessThanOrEqual(DECLARED_MIN_HEIGHT_DP);
  });

  it('fits every configuration at or below the default mascot notch', () => {
    for (const m of [1, 2, 3] as Notch[]) {
      for (const b of NOTCHES) {
        for (const slot1 of CONTENTS) {
          for (const slot2 of CONTENTS) {
            // Two streak slots is unreachable: parseWidgetMascotConfig clears the second and
            // the customizer will not offer it. Only an object literal can express it.
            if (slot1 === 'streak' && slot2 === 'streak') continue;
            const c = cfg({ mascotNotch: m, buttonNotch: b, slot1, slot2 });
            expect(fitsDeclaredMinimum(c)).toBe(true);
          }
        }
      }
    }
  });

  it('reports honestly when a large configuration needs a bigger widget', () => {
    // This is what the customizer hints on. It must be true for at least the top of the ladder,
    // otherwise the hint is dead code and the declared minimum is lying.
    const big = cfg({ mascotNotch: 5, buttonNotch: 5, slot1: 'streak', slot2: 'expense' });
    expect(contentWidth(big)).toBeGreaterThan(DECLARED_MIN_WIDTH_DP);
    expect(fitsDeclaredMinimum(big)).toBe(false);
  });
});

describe('contentHeight', () => {
  it('follows the mascot ladder once it exceeds the declared minimum', () => {
    expect(contentHeight(cfg({ mascotNotch: 5 }))).toBeGreaterThan(contentHeight(cfg({ mascotNotch: 1 })));
    expect(contentHeight(cfg({ mascotNotch: 5 }))).toBeGreaterThanOrEqual(MASCOT_SIZES[5].h);
  });
});
