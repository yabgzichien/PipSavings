// Stub catalog for the `eyes` slot. Task 3 fills in the remaining parts. There is no `none`
// entry for this slot — Pip always has eyes.
import type { MascotPart } from './types';
import { Z } from './types';

const INK = '#7A4800';
const SHADE_FRAME = '#232323';
const SHADE_LENS = '#2E2E33';
const SCAR = '#A9503A';
const SCAR_LIGHT = '#D98C72';
const SCAN_FRAME = '#1A3A40';
const SCAN_GLOW = '#22B8BE';
const SCAN_LIGHT = '#8FE9EC';

export const EYES_PARTS: Record<string, MascotPart> = {
  /** Transcribed from Pip.tsx:221-266 (`Eyes`), the `idle` branch: neither the happy/proud,
   *  sleepy, think nor sheepish special cases apply, so only the EYES.idle pupil pair renders
   *  (Pip.tsx:161-165). */
  default: {
    id: 'default',
    slot: 'eyes',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="default">
    <g>
      <circle cx="40" cy="55" r="4.2" fill="${INK}" />
      <circle cx="41.5" cy="53.5" r="1.3" fill="#fff" />
    </g>
    <g>
      <circle cx="60" cy="55" r="4.2" fill="${INK}" />
      <circle cx="61.5" cy="53.5" r="1.3" fill="#fff" />
    </g>
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:335-344 (`NerdEyes`). */
  big: {
    id: 'big',
    slot: 'eyes',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="big">
    <circle cx="39" cy="55" r="6.2" fill="${INK}" />
    <circle cx="41.3" cy="52.6" r="1.8" fill="#fff" />
    <circle cx="61" cy="55" r="6.2" fill="${INK}" />
    <circle cx="63.3" cy="52.6" r="1.8" fill="#fff" />
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:498-547 (`SassyFace`) plus Pip.tsx:538-547 (`SassyGlow`). The
   *  widget previously kept only eyes + brows so the 48dp lashes would not smear; the sassy
   *  preset now needs the winged liner, fanned lashes and gold halo that the in-app pose shows. */
  sassy: {
    id: 'sassy',
    slot: 'eyes',
    layers: [
      {
        z: Z.BEHIND,
        svg: `<g data-part="sassy" fill="#FFE08A">
    <circle cx="50" cy="56" r="41" opacity="0.05" />
    <circle cx="50" cy="56" r="38.5" opacity="0.07" />
    <circle cx="50" cy="56" r="36" opacity="0.09" />
    <circle cx="50" cy="56" r="34" opacity="0.12" />
  </g>`,
      },
      {
        z: Z.FACE,
        svg: `<g data-part="sassy">
    <g>
      <ellipse cx="40" cy="55.5" rx="4.9" ry="5.4" fill="${INK}" />
      <circle cx="41.9" cy="53.3" r="1.7" fill="#fff" />
      <circle cx="38.4" cy="57.6" r="0.9" fill="#fff" opacity="0.7" />
      <ellipse cx="60" cy="55.5" rx="4.9" ry="5.4" fill="${INK}" />
      <circle cx="61.9" cy="53.3" r="1.7" fill="#fff" />
      <circle cx="58.4" cy="57.6" r="0.9" fill="#fff" opacity="0.7" />
    </g>
    <g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M31.5 45.5 Q37.5 41.5 45 44.5" stroke-width="2.3" opacity="0.82" />
      <path d="M55 44.5 Q62.5 41.5 68.5 45.5" stroke-width="2.3" opacity="0.82" />
      <path d="M34.5 52.5 Q40 47 45.5 52.5" stroke-width="2.8" />
      <path d="M54.5 52.5 Q60 47 65.5 52.5" stroke-width="2.8" />
      <path d="M34.8 51.6 L30.6 48.4" stroke-width="1.8" />
      <path d="M36.6 49.8 L33.8 46.8" stroke-width="1.6" />
      <path d="M33.9 53.4 L29.4 52.4" stroke-width="1.7" />
      <path d="M65.2 51.6 L69.4 48.4" stroke-width="1.8" />
      <path d="M63.4 49.8 L66.2 46.8" stroke-width="1.6" />
      <path d="M66.1 53.4 L70.6 52.4" stroke-width="1.7" />
    </g>
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:283-310 (`Sunglasses` + `Brows`). Brows are drawn first, matching
   *  Pip.tsx:1480-1481's draw order, so the frame's temples sit over the brow ends. */
  shades: {
    id: 'shades',
    slot: 'eyes',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="shades">
    <g stroke="${INK}" stroke-width="4.2" stroke-linecap="round">
      <line x1="32.5" y1="39.5" x2="45.5" y2="41.5" />
      <line x1="67.5" y1="39.5" x2="54.5" y2="41.5" />
    </g>
    <g>
      <path d="M47 51.5 Q50 48.6 53 51.5" stroke="${SHADE_FRAME}" stroke-width="2.6" fill="none" stroke-linecap="round" />
      <path d="M29 50.5 L24.5 47.8" stroke="${SHADE_FRAME}" stroke-width="2.6" fill="none" stroke-linecap="round" />
      <path d="M71 50.5 L75.5 47.8" stroke="${SHADE_FRAME}" stroke-width="2.6" fill="none" stroke-linecap="round" />
      <rect x="29" y="47" width="18" height="12.5" rx="5.6" fill="${SHADE_LENS}" stroke="${SHADE_FRAME}" stroke-width="1.7" />
      <rect x="53" y="47" width="18" height="12.5" rx="5.6" fill="${SHADE_LENS}" stroke="${SHADE_FRAME}" stroke-width="1.7" />
      <ellipse cx="34.5" cy="50.5" rx="3" ry="1.7" fill="#fff" opacity="0.32" transform="rotate(-20 34.5 50.5)" />
      <ellipse cx="58.5" cy="50.5" rx="3" ry="1.7" fill="#fff" opacity="0.32" transform="rotate(-20 58.5 50.5)" />
    </g>
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:639-670 (`SwordsmanFace`), eye + scar only per the brief: the open
   *  eye (Pip.tsx:651-655), the closed eye (Pip.tsx:657-662) and the scar (Pip.tsx:664-667). The
   *  brows (Pip.tsx:644-647) are dropped — they belong to the `head` bandana's silhouette, not
   *  this slot. */
  scarred: {
    id: 'scarred',
    slot: 'eyes',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="scarred">
    <g>
      <circle cx="39.5" cy="58" r="4.6" fill="${INK}" />
      <circle cx="41.2" cy="56.2" r="1.5" fill="#fff" />
      <path d="M33.6 55.4 Q39.5 52.4 45.4 56" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" />
    </g>
    <g fill="none" stroke="${INK}" stroke-linecap="round">
      <path d="M54.6 57.4 Q60.6 61.2 66.6 56.8" stroke-width="2.8" />
      <path d="M66.6 56.8 L69.4 55" stroke-width="1.8" opacity="0.8" />
    </g>
    <g stroke-linecap="round" fill="none">
      <path d="M64.4 45.4 Q61.6 55 60.2 63.6" stroke="${SCAR}" stroke-width="2.4" />
      <path d="M64.4 45.4 Q61.6 55 60.2 63.6" stroke="${SCAR_LIGHT}" stroke-width="0.9" opacity="0.8" />
    </g>
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:983-998 (`EatingFace`), eyes only (Pip.tsx:986-989) — the mouth
   *  (Pip.tsx:990-995) belongs to a different slot. */
  blissful: {
    id: 'blissful',
    slot: 'eyes',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="blissful" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round">
    <path d="M32.5 55.5 Q39.5 47.5 46.5 55.5" />
    <path d="M53.5 55.5 Q60.5 47.5 67.5 55.5" />
  </g>`,
      },
    ],
  },

  /** One ordinary Pip eye, one cyan scanner visor — the cyborg read at widget size. */
  scanner: {
    id: 'scanner',
    slot: 'eyes',
    layers: [
      {
        z: Z.FACE,
        svg: `<g data-part="scanner">
    <circle cx="40" cy="55" r="4.2" fill="${INK}" />
    <circle cx="41.5" cy="53.5" r="1.3" fill="#fff" />
    <rect x="52" y="48.6" width="18.4" height="13" rx="3.4" fill="${SCAN_FRAME}" stroke="${SCAN_GLOW}" stroke-width="1.6" />
    <rect x="54.2" y="52" width="14" height="6" rx="1.5" fill="${SCAN_GLOW}" />
    <rect x="56.2" y="53.2" width="5.2" height="3.4" rx="0.8" fill="${SCAN_LIGHT}" />
    <line x1="55" y1="61.2" x2="67.4" y2="61.2" stroke="${SCAN_LIGHT}" stroke-width="1.1" stroke-linecap="round" opacity="0.7" />
  </g>`,
      },
    ],
  },
};
