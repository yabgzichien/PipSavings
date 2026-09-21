// Stub catalog for the `mouth` slot. Task 3 fills in the remaining parts. There is no `none`
// entry for this slot — Pip always has a mouth.
import type { MascotPart } from './types';
import { Z } from './types';

const INK = '#7A4800';
const TEETH = '#FFFDF5';
const TONGUE = '#E85D83';
const LIP_DARK = '#9D3157';
const LIP = '#E85D83';
const LIP_LIGHT = '#FFD2DE';
const GUARD_GOLD = '#C8A02E';
const GUARD_GOLD_DARK = '#7C5F12';
const HILT_WRAP = '#232A31';
const SAYA_PALE = '#EDE6D6';
const SAYA_PALE_EDGE = '#93805C';
const BLADE = '#DCE6EC';
const BLADE_EDGE = '#8298A6';

export const MOUTH_PARTS: Record<string, MascotPart> = {
  /** Transcribed from Pip.tsx:1125-1136 (`Mouth`), the `idle` branch (the final fallback
   *  return, marked `// idle`). */
  smile: {
    id: 'smile',
    slot: 'mouth',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="smile"><path d="M43 64 Q50 72 57 64" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" /></g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:311-331 (`Grin`). */
  grin: {
    id: 'grin',
    slot: 'mouth',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="grin">
    <path d="M36 64 H64 Q62.5 79 50 79 Q37.5 79 36 64 Z" fill="${TEETH}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" />
    <g stroke="${INK}" stroke-linecap="round" fill="none">
      <g stroke-width="1.3">
        <line x1="43" y1="64" x2="43" y2="74" />
        <line x1="50" y1="64" x2="50" y2="76" />
        <line x1="57" y1="64" x2="57" y2="74" />
      </g>
      <path d="M39.5 72.6 Q50 78 60.5 72.6" stroke-width="1.8" />
    </g>
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:1125-1136 (`Mouth`), the `happy` branch (Pip.tsx:1126). */
  open: {
    id: 'open',
    slot: 'mouth',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="open"><path d="M39 63 Q50 78 61 63 Q50 71 39 63 Z" fill="${INK}" /></g>`,
      },
    ],
  },

  /** Re-sourced per coordinator ruling: transcribed from Pip.tsx:983-1009 (`EatingFace`), mouth
   *  group only (`pip-eating-mouth`, Pip.tsx:990-995) — the eyes there (Pip.tsx:986-989) are the
   *  `blissful` id's source instead. The original brief cited `ScientistFace`'s mouth for this id,
   *  but that shape is a closed asymmetric line with no tongue in it; `EatingFace`'s filled open
   *  mouth plus its `TONGUE`-coloured ellipse is the actual tongue-bearing shape in `Pip.tsx`. */
  tongue: {
    id: 'tongue',
    slot: 'mouth',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="tongue">
    <path d="M39.5 64.5 Q50 61.5 60.5 64.5 Q59.5 79.5 50 79.5 Q40.5 79.5 39.5 64.5 Z" fill="${INK}" />
    <ellipse cx="50" cy="75.4" rx="5.6" ry="3.4" fill="${TONGUE}" />
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:586-599 (`SassyFace` lips). Two lobes plus a highlight so the
   *  gloss still reads at widget size without photo-real texture. */
  lips: {
    id: 'lips',
    slot: 'mouth',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="lips">
    <path d="M39 68 C42 63.5 46 63 50 65.2 C54 63 58 63.5 61 68 C56.8 69.8 53.2 70.2 50 70.2 C46.8 70.2 43.2 69.8 39 68 Z" fill="${LIP_DARK}" />
    <path d="M39 68 C44 69.2 56 69.2 61 68 C58.2 75.7 41.8 75.7 39 68 Z" fill="${LIP}" stroke="${LIP_DARK}" stroke-width="0.9" />
    <path d="M52.7 71.5 Q55.5 70.4 58 71.2" fill="none" stroke="${LIP_LIGHT}" stroke-width="1.5" stroke-linecap="round" opacity="0.9" />
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:704-741 (`MouthKatana`). `rotation={-16} originX={50} originY={70}`
   *  becomes `transform="rotate(-16 50 70)"` per transcription rule 4. Drawn at `Z.FRONT`, ahead
   *  of the coin, per the brief — unlike the swordsman pose in `Pip.tsx`, this id stands alone
   *  without `Grin`'s teeth underneath it, since `mouth` is a single-choice slot. */
  katanaBite: {
    id: 'katanaBite',
    slot: 'mouth',
    layers: [
      {
        z: Z.FRONT,
        svg: `<g data-part="katanaBite" transform="rotate(-16 50 70)">
    <path d="M62.5 66.5 L92 66.5 L101 70 L92 73.5 L62.5 73.5 Z" fill="${BLADE}" stroke="${BLADE_EDGE}" stroke-width="1.2" stroke-linejoin="round" />
    <path d="M65 68.3 L90 68.3" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.75" />
    <path d="M65 72.1 Q78 70.6 91 72" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0.45" />
    <rect x="57.6" y="64" width="4.4" height="12" rx="1.7" fill="${GUARD_GOLD}" stroke="${GUARD_GOLD_DARK}" stroke-width="1.1" />
    <rect x="19" y="66.2" width="38.6" height="7.6" rx="2.6" fill="${HILT_WRAP}" stroke="${SAYA_PALE_EDGE}" stroke-width="1.1" />
    <g stroke="${SAYA_PALE}" stroke-width="1.4" stroke-linecap="round" opacity="0.9">
      <line x1="25" y1="66.6" x2="29" y2="73.4" />
      <line x1="29" y1="66.6" x2="25" y2="73.4" />
      <line x1="36" y1="66.6" x2="40" y2="73.4" />
      <line x1="40" y1="66.6" x2="36" y2="73.4" />
      <line x1="47" y1="66.6" x2="51" y2="73.4" />
      <line x1="51" y1="66.6" x2="47" y2="73.4" />
    </g>
    <rect x="15.2" y="65.2" width="4.2" height="9.6" rx="1.6" fill="${GUARD_GOLD}" stroke="${GUARD_GOLD_DARK}" stroke-width="1.1" />
  </g>`,
      },
    ],
  },
};
