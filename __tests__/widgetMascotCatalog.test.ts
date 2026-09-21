import { PART_CATALOG } from '../src/widget/mascot/parts';
import { PRESETS, applyPreset } from '../src/widget/mascot/presets';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../src/widget/mascot/config';
import { composeMascot } from '../src/widget/mascot/compose';

const EXPECTED = {
  head: ['none', 'strawHat', 'propellerCap', 'bandana', 'goggles', 'cowboyHat', 'cyborgPlate', 'wizardHat'],
  eyes: ['default', 'big', 'sassy', 'shades', 'scarred', 'blissful', 'scanner'],
  mouth: ['smile', 'grin', 'open', 'tongue', 'katanaBite', 'lips'],
  holding: ['none', 'lollipop', 'noodleBowl', 'flask', 'thumbsUp', 'crossedKatana', 'lasso', 'claw', 'wand'],
} as const;

describe('part catalog', () => {
  for (const [slot, ids] of Object.entries(EXPECTED)) {
    it(`has every ${slot} option`, () => {
      expect(Object.keys(PART_CATALOG[slot as keyof typeof EXPECTED]).sort()).toEqual([...ids].sort());
    });
  }

  it('tags every non-empty part with its own data-part id and its declared slot', () => {
    for (const [slot, parts] of Object.entries(PART_CATALOG)) {
      for (const [id, part] of Object.entries(parts)) {
        expect(part.id).toBe(id);
        expect(part.slot).toBe(slot);
        if (part.layers.length > 0) {
          expect(part.layers.some((l) => l.svg.includes(`data-part="${id}"`))).toBe(true);
        }
      }
    }
  });

  it('emits no JSX-isms — every part is valid SVG-string syntax', () => {
    for (const parts of Object.values(PART_CATALOG)) {
      for (const part of Object.values(parts)) {
        for (const layer of part.layers) {
          expect(layer.svg).not.toMatch(/=\{/);            // strokeWidth={2}
          expect(layer.svg).not.toMatch(/\s(strokeWidth|strokeLinecap|fillOpacity|testID)=/);
          expect(layer.svg).not.toMatch(/<[A-Z]/);          // <Circle>
        }
      }
    }
  });
});

describe('presets', () => {
  it('classic reproduces the default slots', () => {
    expect(PRESETS.classic).toEqual({
      head: DEFAULT_WIDGET_MASCOT_CONFIG.head,
      eyes: DEFAULT_WIDGET_MASCOT_CONFIG.eyes,
      mouth: DEFAULT_WIDGET_MASCOT_CONFIG.mouth,
      holding: DEFAULT_WIDGET_MASCOT_CONFIG.holding,
    });
  });

  it('names only ids that exist in the catalog', () => {
    for (const slots of Object.values(PRESETS)) {
      for (const [slot, id] of Object.entries(slots)) {
        expect(PART_CATALOG[slot as keyof typeof PRESETS.classic][id]).toBeDefined();
      }
    }
  });

  it('applyPreset writes all four slots and records the preset id', () => {
    const c = applyPreset(DEFAULT_WIDGET_MASCOT_CONFIG, 'swordsman');
    expect(c.preset).toBe('swordsman');
    expect(c.head).toBe(PRESETS.swordsman.head);
    expect(c.holding).toBe(PRESETS.swordsman.holding);
  });

  it('every preset composes without throwing', () => {
    for (const id of Object.keys(PRESETS)) {
      const c = applyPreset(DEFAULT_WIDGET_MASCOT_CONFIG, id as keyof typeof PRESETS);
      expect(() => composeMascot(c, 3)).not.toThrow();
      expect(composeMascot(c, 3)).toContain('<svg');
    }
  });

  it('puts the propeller cap on the lollipop nerdy look', () => {
    expect(PRESETS.nerdy).toEqual({
      head: 'propellerCap',
      eyes: 'big',
      mouth: 'smile',
      holding: 'lollipop',
    });
  });

  it('sassy transcribes the glow, lashes and glossy lips', () => {
    expect(PRESETS.sassy).toEqual({
      head: 'none',
      eyes: 'sassy',
      mouth: 'lips',
      holding: 'none',
    });
    const lashes = PART_CATALOG.eyes.sassy.layers.map((l) => l.svg).join('\n');
    expect(lashes).toContain('M34.5 52.5 Q40 47 45.5 52.5');
    expect(lashes).toContain('M34.8 51.6 L30.6 48.4');
    expect(lashes).toContain('#FFE08A');
    expect(PART_CATALOG.eyes.sassy.layers.some((l) => l.z < 0)).toBe(true);
    expect(PART_CATALOG.mouth.lips.layers[0].svg).toContain('#E85D83');
  });

  it('cowboy, cyborg and wizard are complete character looks', () => {
    expect(PRESETS.cowboy).toEqual({
      head: 'cowboyHat',
      eyes: 'default',
      mouth: 'grin',
      holding: 'lasso',
    });
    expect(PRESETS.cyborg).toEqual({
      head: 'cyborgPlate',
      eyes: 'scanner',
      mouth: 'smile',
      holding: 'claw',
    });
    expect(PRESETS.wizard).toEqual({
      head: 'wizardHat',
      eyes: 'default',
      mouth: 'smile',
      holding: 'wand',
    });
  });
});

/** Spec §10.5: an absent config must render the mascot the widget shipped with. Asserted as
 *  "every shape from the original hand-written SVG is still emitted" rather than byte equality,
 *  because composition legitimately adds data-part attributes and reorders by z.
 *
 *  These literals come from QuickRecordWidget.tsx as it stood before this feature. The default
 *  mouth intentionally preserves that widget's `Q50 72`/3.4 geometry even though Pip.tsx's
 *  in-app idle mouth differs slightly, because users who never customize must see no change. */
describe('default composition preserves the original artwork', () => {
  const ORIGINAL_SHAPES = [
    'M50 26 C50 18 50 14 50 12',                              // sprout stem
    '<circle cx="50" cy="56" r="33" fill="#F5B42A" />',       // coin edge
    '<circle cx="50" cy="56" r="26.6" fill="#FAC438" />',     // coin face
    'cx="40" cy="55" r="4.2"',                                // left eye
    'cx="60" cy="55" r="4.2"',                                // right eye
    'M43 64 Q50 72 57 64',                                    // original widget smile
  ];

  it('emits every shape the pre-customization mascot drew', () => {
    const svg = composeMascot(DEFAULT_WIDGET_MASCOT_CONFIG, 5);
    for (const shape of ORIGINAL_SHAPES) {
      expect(svg).toContain(shape);
    }
  });

  it('still draws the amber flame badge with the streak count', () => {
    const svg = composeMascot(DEFAULT_WIDGET_MASCOT_CONFIG, 5);
    expect(svg).toContain('#FAA81A');
    expect(svg).toContain('>5<');
  });
});
