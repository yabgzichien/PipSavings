// Stub catalog for the `head` slot. Task 3 fills in the remaining parts (propellerHat,
// bandana, lab goggles, etc); this task only needs `none` and `strawHat` for its own tests.
import type { MascotPart } from './types';
import { Z } from './types';

const STRAW = '#F0DCA4';
const STRAW_LINE = '#B08A3E';
const HAT_BAND = '#D6453F';
const CAP_YELLOW = '#F5C542';
const CAP_RED = '#E8453C';
const CAP_TRIM = '#3F6FD1';
const CAP_BRIM = '#2E9E5B';
const CAP_BRIM_LINE = '#1F7A44';
const BAND = '#1F8A52';
const BAND_DARK = '#14603A';
const BAND_LIGHT = '#35B26C';
const GOGGLE_FRAME = '#2B3138';
const GOGGLE_STRAP = '#3C4650';
const GOGGLE_LENS = '#BFE7F2';
const COWBOY = '#C08A4A';
const COWBOY_LINE = '#7A4E1E';
const COWBOY_BAND = '#4A2E14';
const COWBOY_STAR = '#FFD34D';
const CYBORG_METAL = '#8A96A3';
const CYBORG_METAL_DARK = '#3C4650';
const CYBORG_RIVET = '#DCE6EC';
const CYBORG_GLOW = '#22B8BE';
const CYBORG_GLOW_LIGHT = '#8FE9EC';
const WIZARD = '#5B3FA8';
const WIZARD_DARK = '#3A2678';
const WIZARD_BRIM = '#7B5CC8';
const WIZARD_BAND = '#2A1860';
const WIZARD_STAR = '#FFD34D';

export const HEAD_PARTS: Record<string, MascotPart> = {
  none: { id: 'none', slot: 'head', layers: [] },

  /** Transcribed from Pip.tsx:409-441 (`StrawHat`). Crown and band are drawn before the brim so
   *  the brim's near edge occludes their base — that paint order is preserved here inside a
   *  single layer rather than split across z bands. */
  strawHat: {
    id: 'strawHat',
    slot: 'head',
    layers: [
      {
        z: Z.HEAD,
        svg: `<g data-part="strawHat">
    <path d="M25 38 L29 27 C29.5 21 37 17.5 50 17.5 C63 17.5 70.5 21 71 27 L75 38 Z" fill="${STRAW}" stroke="${STRAW_LINE}" stroke-width="1.8" stroke-linejoin="round" />
    <path d="M29.9 27 L70.1 27 L73.74 37 L26.26 37 Z" fill="${HAT_BAND}" />
    <ellipse cx="50" cy="40.5" rx="34" ry="7" fill="rgba(120,80,20,0.2)" />
    <ellipse cx="50" cy="38" rx="36" ry="6.5" fill="${STRAW}" stroke="${STRAW_LINE}" stroke-width="1.8" />
    <ellipse cx="50" cy="38" rx="29" ry="4.8" fill="none" stroke="${STRAW_LINE}" stroke-width="1.1" opacity="0.45" />
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:448-461 (`PropellerCap`). Shares `strawHat`'s crown/brim silhouette
   *  so it lands on the same spot on the head, but the color-blocked crown halves and trim
   *  slivers are drawn as a single flat shape rather than split by z — nothing here occludes
   *  anything else in the part. */
  propellerCap: {
    id: 'propellerCap',
    slot: 'head',
    layers: [
      {
        z: Z.HEAD,
        svg: `<g data-part="propellerCap">
    <path d="M25 38 L29 27 C29.5 21 37 17.5 50 17.5 L50 38 Z" fill="${CAP_YELLOW}" />
    <path d="M75 38 L71 27 C70.5 21 63 17.5 50 17.5 L50 38 Z" fill="${CAP_RED}" />
    <path d="M25 38 L29 27 C29.5 21 33 18.5 36 18.3 L32 38 Z" fill="${CAP_TRIM}" />
    <path d="M75 38 L71 27 C70.5 21 67 18.5 64 18.3 L68 38 Z" fill="${CAP_TRIM}" />
    <line x1="50" y1="17.5" x2="50" y2="38" stroke="${CAP_TRIM}" stroke-width="1.2" opacity="0.5" />
    <ellipse cx="50" cy="40.5" rx="34" ry="7" fill="rgba(20,50,30,0.18)" />
    <ellipse cx="50" cy="38" rx="36" ry="6.5" fill="${CAP_BRIM}" stroke="${CAP_BRIM_LINE}" stroke-width="1.8" />
    <ellipse cx="50" cy="38" rx="29" ry="4.8" fill="none" stroke="${CAP_BRIM_LINE}" stroke-width="1.1" opacity="0.45" />
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:603-630 (`Bandana`). `testID`s dropped per transcription rule 5. */
  bandana: {
    id: 'bandana',
    slot: 'head',
    layers: [
      {
        z: Z.HEAD,
        svg: `<g data-part="bandana">
    <path d="M20 42.8 C12.5 40 6.5 41.2 1.5 37.2 C4 43.6 9 47.4 16 48.4 L11.8 44.6 L19.5 47 Z" fill="${BAND_DARK}" />
    <path d="M20.5 47.2 C14.5 50 9.5 54 4 57.2 C10.5 58.2 16 56 20.8 51.8 L15.6 52.6 Z" fill="${BAND}" />
    <path d="M23.75 36 A 33 33 0 0 0 18.55 46 Q 50 51.5 81.45 46 A 33 33 0 0 0 76.25 36 Q 50 41 23.75 36 Z" fill="${BAND}" />
    <path d="M27 38.6 Q50 43 73 38.6" fill="none" stroke="${BAND_LIGHT}" stroke-width="2" stroke-linecap="round" opacity="0.75" />
    <path d="M25 44.6 Q50 49.4 75 44.6" fill="none" stroke="${BAND_DARK}" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
    <path d="M17 41.5 L23.5 39.5 L24 49 L17.5 47.5 Z" fill="${BAND_LIGHT}" stroke="${BAND_DARK}" stroke-width="1.4" stroke-linejoin="round" />
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:757-787 (`LabGoggles`). The `[36, 64].map(...)` lens loop is
   *  unrolled into two literal groups per transcription rule 1 (no JSX left to map over). */
  goggles: {
    id: 'goggles',
    slot: 'head',
    layers: [
      {
        z: Z.HEAD,
        svg: `<g data-part="goggles">
    <path d="M20.9 40.5 A 33 33 0 0 0 18.1 47.6 Q 50 53 81.9 47.6 A 33 33 0 0 0 79.1 40.5 Q 50 45.6 20.9 40.5 Z" fill="${GOGGLE_STRAP}" />
    <path d="M23 42.6 Q50 47.6 77 42.6" fill="none" stroke="${GOGGLE_FRAME}" stroke-width="1.6" opacity="0.55" stroke-linecap="round" />
    <line x1="41" y1="37.5" x2="59" y2="37.5" stroke="${GOGGLE_FRAME}" stroke-width="5" stroke-linecap="round" />
    <g>
      <circle cx="36" cy="36.5" r="9.2" fill="${GOGGLE_FRAME}" />
      <circle cx="36" cy="36.5" r="6.4" fill="${GOGGLE_LENS}" />
      <path d="M31.6 36.5 A 4.6 4.6 0 0 1 35.4 32.3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.75" />
    </g>
    <g>
      <circle cx="64" cy="36.5" r="9.2" fill="${GOGGLE_FRAME}" />
      <circle cx="64" cy="36.5" r="6.4" fill="${GOGGLE_LENS}" />
      <path d="M59.6 36.5 A 4.6 4.6 0 0 1 63.4 32.3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.75" />
    </g>
  </g>`,
      },
    ],
  },

  /** Leather Stetson: taller pinched crown than the straw hat, a wider brim, and a gold star
   *  concho on the band so it still reads at widget size. Crown first, brim last, same occlusion
   *  trick as strawHat. */
  cowboyHat: {
    id: 'cowboyHat',
    slot: 'head',
    layers: [
      {
        z: Z.HEAD,
        svg: `<g data-part="cowboyHat">
    <path d="M27 39 L31 22 C33 12 40 8 50 8 C60 8 67 12 69 22 L73 39 Z" fill="${COWBOY}" stroke="${COWBOY_LINE}" stroke-width="1.8" stroke-linejoin="round" />
    <path d="M50 8 L47.6 39 L52.4 39 Z" fill="${COWBOY_LINE}" opacity="0.28" />
    <path d="M31.6 25 L68.4 25 L71.6 36 L28.4 36 Z" fill="${COWBOY_BAND}" />
    <path d="M50 27.2 L51.8 31 L56.2 31.4 L52.8 34.2 L53.8 38.4 L50 36.2 L46.2 38.4 L47.2 34.2 L43.8 31.4 L48.2 31 Z" fill="${COWBOY_STAR}" stroke="${COWBOY_LINE}" stroke-width="0.6" stroke-linejoin="round" />
    <ellipse cx="50" cy="41.2" rx="38" ry="7.2" fill="rgba(90,50,10,0.2)" />
    <ellipse cx="50" cy="38.4" rx="41" ry="7.4" fill="${COWBOY}" stroke="${COWBOY_LINE}" stroke-width="1.8" />
    <ellipse cx="50" cy="38.4" rx="31" ry="5.2" fill="none" stroke="${COWBOY_LINE}" stroke-width="1.1" opacity="0.45" />
  </g>`,
      },
    ],
  },

  /** Left-side cranial plate, rivets, and a cyan antenna. Sits on the temple so the scanner eye
   *  and the sprout still have room. */
  cyborgPlate: {
    id: 'cyborgPlate',
    slot: 'head',
    layers: [
      {
        z: Z.HEAD,
        svg: `<g data-part="cyborgPlate">
    <line x1="30" y1="22" x2="22" y2="6.5" stroke="${CYBORG_METAL_DARK}" stroke-width="2.6" stroke-linecap="round" />
    <circle cx="22" cy="5.4" r="3.4" fill="${CYBORG_GLOW}" stroke="${CYBORG_METAL_DARK}" stroke-width="1.3" />
    <circle cx="22" cy="5.4" r="1.5" fill="${CYBORG_GLOW_LIGHT}" />
    <path d="M17.5 48 C15.5 38 21 25 36 19.5 C43 17.5 47 22 44.5 28.5 L38 44 C29.5 52 20.5 53 17.5 48 Z" fill="${CYBORG_METAL}" stroke="${CYBORG_METAL_DARK}" stroke-width="1.6" stroke-linejoin="round" />
    <path d="M22 36 L36 24" fill="none" stroke="${CYBORG_RIVET}" stroke-width="1.3" opacity="0.55" stroke-linecap="round" />
    <circle cx="28" cy="27.5" r="1.5" fill="${CYBORG_RIVET}" />
    <circle cx="23.6" cy="36.5" r="1.5" fill="${CYBORG_RIVET}" />
    <circle cx="32.2" cy="38.2" r="1.5" fill="${CYBORG_RIVET}" />
    <circle cx="26.4" cy="43.8" r="2.1" fill="${CYBORG_GLOW}" />
    <circle cx="26.4" cy="43.8" r="0.9" fill="${CYBORG_GLOW_LIGHT}" />
  </g>`,
      },
    ],
  },

  /** Tall starry cone with a shallow brim. Crown first so the brim occludes its base, matching
   *  strawHat; the cone covers the sprout the way partyHat does in Pip.tsx. */
  wizardHat: {
    id: 'wizardHat',
    slot: 'head',
    layers: [
      {
        z: Z.HEAD,
        svg: `<g data-part="wizardHat">
    <path d="M24 39 L30 21 C33 11 40 3.4 50 1.4 C60 3.4 67 11 70 21 L76 39 Z" fill="${WIZARD}" stroke="${WIZARD_DARK}" stroke-width="1.6" stroke-linejoin="round" />
    <path d="M50 1.4 L50 39 L70 21 Z" fill="${WIZARD_DARK}" opacity="0.22" />
    <g fill="${WIZARD_STAR}">
      <circle cx="45.5" cy="14.5" r="1.4" />
      <circle cx="54.2" cy="12.8" r="1.2" />
      <circle cx="48.2" cy="22.4" r="1.3" />
      <circle cx="56.4" cy="21.2" r="1.1" />
    </g>
    <path d="M36.2 25.5 L63.8 25.5 L67.4 35.4 L32.6 35.4 Z" fill="${WIZARD_BAND}" />
    <path d="M50 27.2 L51.3 30 L54.4 30.3 L52.1 32.3 L52.7 35.4 L50 33.8 L47.3 35.4 L47.9 32.3 L45.6 30.3 L48.7 30 Z" fill="${WIZARD_STAR}" />
    <ellipse cx="50" cy="40.4" rx="36" ry="6.6" fill="rgba(40,20,80,0.2)" />
    <ellipse cx="50" cy="38" rx="38" ry="6.4" fill="${WIZARD_BRIM}" stroke="${WIZARD_DARK}" stroke-width="1.6" />
  </g>`,
      },
    ],
  },
};
