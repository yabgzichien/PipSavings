// Stub catalog for the `holding` slot. Task 3 fills in the remaining parts; this task only
// needs `none` and `crossedKatana` for its own tests.
import type { MascotPart } from './types';
import { Z } from './types';

const SAYA_DARK = '#1E2A24';
const SAYA_DARK_EDGE = '#41604E';
const SAYA_PALE = '#EDE6D6';
const SAYA_PALE_EDGE = '#93805C';
const HILT_WRAP = '#232A31';
const GUARD_GOLD = '#C8A02E';
const GUARD_GOLD_DARK = '#7C5F12';
const HAND_FILL = '#FFF6E4';
const HAND_LINE = '#8A5A16';
const GLASS = '#EAF6FA';
const GLASS_EDGE = '#5F8298';
const BREW_TEAL = '#22B8BE';
const BREW_TEAL_LIGHT = '#8FE9EC';
const BREW_VIOLET = '#9E63EA';
const BREW_VIOLET_LIGHT = '#D9BDFF';
const BOWL = '#3C7AC4';
const BOWL_DARK = '#22558F';
const BOWL_LIGHT = '#9FC6F0';
const NOODLE = '#F7E6B8';
const NOODLE_LINE = '#C79E52';
const CHOPSTICK = '#D8A96A';
const CHOPSTICK_LINE = '#8A5A16';
const NARUTO_PINK = '#EE6E8E';
const SCALLION = '#4FAF6D';
const ROPE = '#D8A96A';
const ROPE_LINE = '#8A5A16';
const CLAW_METAL = '#8A96A3';
const CLAW_DARK = '#3C4650';
const CLAW_GLOW = '#22B8BE';
const WAND = '#E8C878';
const WAND_LINE = '#8A5A16';
const WAND_STAR = '#FFD34D';
const WAND_STAR_LINE = '#C48A14';

export const HOLDING_PARTS: Record<string, MascotPart> = {
  none: { id: 'none', slot: 'holding', layers: [] },

  /** Transcribed from Pip.tsx:352-365 (`Lollipop`) only, per coordinator ruling: `Hand` (needing
   *  `cx`/`cy`/`flip` never supplied by the brief) is never actually called for the `nerdy` pose in
   *  `Pip.tsx` — that pose calls only `<Lollipop />` (Pip.tsx:1536), which already draws its own
   *  small fist inline (the closing `Rect` below). The earlier synthesized `Hand` layer was dropped
   *  rather than guessing parameters for a call the source never makes. */
  lollipop: {
    id: 'lollipop',
    slot: 'holding',
    layers: [
      {
        z: Z.FRONT,
        svg: `<g data-part="lollipop">
    <line x1="83" y1="72" x2="75" y2="37" stroke="${HAND_FILL}" stroke-width="2.6" stroke-linecap="round" />
    <circle cx="75" cy="27" r="13" fill="#E8453C" stroke="#4A3220" stroke-width="1.6" />
    <circle cx="75" cy="27" r="10.4" fill="#F2954A" />
    <circle cx="75" cy="27" r="7.8" fill="#F5D93A" />
    <circle cx="75" cy="27" r="5.2" fill="#4FAF6D" />
    <circle cx="75" cy="27" r="2.6" fill="#4A90D9" />
    <ellipse cx="69.5" cy="21" rx="3.4" ry="2.1" fill="#fff" opacity="0.5" transform="rotate(-25 69.5 21)" />
    <rect x="77" y="67.5" width="12" height="11" rx="5.2" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2" />
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:1010-1063 (`NoodleBowl`) then Pip.tsx:1076-1107 (`Chopsticks`),
   *  matching the brief's citation order. `Pip.tsx`'s own render draws `Chopsticks` before
   *  `NoodleBowl` so the bowl's near rim can overlap the sticks (Pip.tsx:1546-1549), but the two
   *  shapes occupy disjoint x-ranges here (bowl: x 2-35, chopsticks: x 51-98) so the draw order
   *  makes no visible difference at this z. The `[...].map(...)` pair of stick lines
   *  (Pip.tsx:1079-1087) is unrolled per transcription rule 1. `Steam` (Pip.tsx:1116-1123) is not
   *  part of this citation and is dropped. */
  noodleBowl: {
    id: 'noodleBowl',
    slot: 'holding',
    layers: [
      {
        z: Z.FRONT,
        svg: `<g data-part="noodleBowl">
    <path d="M5.5 72 Q9 62 19 61.5 Q29 62 32.5 72 Z" fill="${NOODLE}" stroke="${NOODLE_LINE}" stroke-width="1.4" stroke-linejoin="round" />
    <g fill="none" stroke="${NOODLE_LINE}" stroke-width="1" stroke-linecap="round" opacity="0.7">
      <path d="M9 70 Q13 64.5 18 66" />
      <path d="M20.5 65.5 Q25.5 64.5 29 69.5" />
      <path d="M12 71.5 Q19 68 27 71.5" />
    </g>
    <circle cx="12.5" cy="66.2" r="3.4" fill="#FFF8EC" stroke="${NARUTO_PINK}" stroke-width="1.2" />
    <path d="M12.5 63.9 Q15 66.2 12.5 68.5 Q11.1 66.2 12.5 63.9 Z" fill="${NARUTO_PINK}" />
    <ellipse cx="24" cy="64.8" rx="2.6" ry="1.6" fill="${SCALLION}" transform="rotate(-18 24 64.8)" />
    <ellipse cx="18.5" cy="68.6" rx="2.2" ry="1.4" fill="${SCALLION}" transform="rotate(14 18.5 68.6)" />
    <path d="M3.5 71 L34.5 71 Q32.5 88 19 88 Q5.5 88 3.5 71 Z" fill="${BOWL}" stroke="${BOWL_DARK}" stroke-width="1.6" stroke-linejoin="round" />
    <path d="M3.5 71 A 15.5 3.8 0 0 0 34.5 71 Z" fill="${BOWL_LIGHT}" stroke="${BOWL_DARK}" stroke-width="1.4" />
    <path d="M6.5 79 Q12.5 81.6 19 80 Q25.5 78.4 31.4 81" fill="none" stroke="${BOWL_LIGHT}" stroke-width="2" stroke-linecap="round" opacity="0.85" />
    <path d="M13.5 87.4 L24.5 87.4 L22.6 91.4 L15.4 91.4 Z" fill="${BOWL_DARK}" />
    <rect x="2.6" y="77.5" width="12.8" height="11" rx="5" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2" />
    <g stroke="${HAND_LINE}" stroke-width="1.3" stroke-linecap="round" opacity="0.75">
      <line x1="6" y1="81.1" x2="12" y2="81.1" />
      <line x1="6" y1="84.7" x2="12" y2="84.7" />
    </g>
    <g>
      <line x1="98" y1="85.5" x2="60.5" y2="66" stroke="${CHOPSTICK_LINE}" stroke-width="4.6" stroke-linecap="round" />
      <line x1="98" y1="85.5" x2="60.5" y2="66" stroke="${CHOPSTICK}" stroke-width="2.8" stroke-linecap="round" />
    </g>
    <g>
      <line x1="94" y1="92" x2="60.5" y2="69.5" stroke="${CHOPSTICK_LINE}" stroke-width="4.6" stroke-linecap="round" />
      <line x1="94" y1="92" x2="60.5" y2="69.5" stroke="${CHOPSTICK}" stroke-width="2.8" stroke-linecap="round" />
    </g>
    <rect x="73.6" y="73.5" width="12.8" height="11" rx="5" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2" />
    <g stroke="${HAND_LINE}" stroke-width="1.3" stroke-linecap="round" opacity="0.75">
      <line x1="77" y1="77.1" x2="83" y2="77.1" />
      <line x1="77" y1="80.7" x2="83" y2="80.7" />
    </g>
    <g fill="none" stroke-linecap="round">
      <g stroke="${NOODLE_LINE}" stroke-width="3.4">
        <path d="M60.8 66.6 Q56 73.5 51.5 67.8" />
        <path d="M59.6 69.6 Q56.6 76 59.8 79.4" />
      </g>
      <g stroke="${NOODLE}" stroke-width="2">
        <path d="M60.8 66.6 Q56 73.5 51.5 67.8" />
        <path d="M59.6 69.6 Q56.6 76 59.8 79.4" />
      </g>
    </g>
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:898-931 (`ConicalFlask`) then Pip.tsx:943-972 (`TestTube`), both
   *  with their `Bubbles` calls omitted per transcription rule 7 (animated, and the rule names
   *  `ConicalFlask` as the example; `TestTube`'s `Bubbles` call is the same animated component and
   *  is dropped for the same reason). `TestTube`'s `rotation={12} originX={14} originY={52}`
   *  becomes `transform="rotate(12 14 52)"` on its wrapping group per transcription rule 4. */
  flask: {
    id: 'flask',
    slot: 'holding',
    layers: [
      {
        z: Z.FRONT,
        svg: `<g data-part="flask">
    <rect x="80.4" y="55" width="7.2" height="15" rx="1.4" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="1.3" />
    <rect x="78.2" y="52.4" width="11.6" height="3.8" rx="1.7" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="1.3" />
    <path d="M80.4 69 L72.6 86 Q71.6 88.6 74.4 88.6 L93.6 88.6 Q96.4 88.6 95.4 86 L87.6 69 Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="1.4" stroke-linejoin="round" />
    <path d="M78.1 77 Q81 75.3 84 76.4 Q87 77.5 89.9 76 L93.8 86 Q94.4 87.3 92.8 87.3 L75.2 87.3 Q73.6 87.3 74.2 86 Z" fill="${BREW_TEAL}" />
    <g fill="${BREW_TEAL_LIGHT}" opacity="0.85">
      <circle cx="79.8" cy="83" r="1.6" />
      <circle cx="86.4" cy="84.6" r="1.2" />
      <circle cx="88.6" cy="80.4" r="1" />
    </g>
    <path d="M79.6 71 L75 81.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity="0.5" />
    <rect x="78.2" y="59.5" width="12.4" height="11" rx="5" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2" />
    <g stroke="${HAND_LINE}" stroke-width="1.3" stroke-linecap="round" opacity="0.75">
      <line x1="81.6" y1="63.2" x2="87.2" y2="63.2" />
      <line x1="81.6" y1="66.8" x2="87.2" y2="66.8" />
    </g>
    <g transform="rotate(12 14 52)">
      <rect x="6.4" y="26.4" width="15.2" height="3.8" rx="1.7" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="1.3" />
      <path d="M8.6 29.4 L8.6 51 A 5.4 5.4 0 0 0 19.4 51 L19.4 29.4 Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="1.4" stroke-linejoin="round" />
      <path d="M10 41.4 Q14 39.8 18 41.4 L18 51 A 4 4 0 0 1 10 51 Z" fill="${BREW_VIOLET}" />
      <g fill="${BREW_VIOLET_LIGHT}" opacity="0.85">
        <circle cx="12.4" cy="48" r="1.3" />
        <circle cx="16.2" cy="51.4" r="1" />
      </g>
      <path d="M11 32 L11 44" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.5" />
      <rect x="7.6" y="33.5" width="12.8" height="11" rx="5" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2" />
      <g stroke="${HAND_LINE}" stroke-width="1.3" stroke-linecap="round" opacity="0.75">
        <line x1="11" y1="37.1" x2="17" y2="37.1" />
        <line x1="11" y1="40.7" x2="17" y2="40.7" />
      </g>
    </g>
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:465-472 (`Hands`), which calls `Hand({cx:14,cy:56,flip:true})` and
   *  `Hand({cx:84,cy:71})` (Pip.tsx:468-469); both are expanded here with `Hand`'s body
   *  (Pip.tsx:376-393) substituted in literally. */
  thumbsUp: {
    id: 'thumbsUp',
    slot: 'holding',
    layers: [
      {
        z: Z.FRONT,
        svg: `<g data-part="thumbsUp">
    <g>
      <line x1="11.4" y1="53" x2="7.6" y2="43.4" stroke="${HAND_LINE}" stroke-width="8.8" stroke-linecap="round" />
      <line x1="11.4" y1="53" x2="7.6" y2="43.4" stroke="${HAND_FILL}" stroke-width="6.2" stroke-linecap="round" />
      <rect x="7" y="49.5" width="14" height="13.5" rx="5.8" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2.1" />
      <g stroke="${HAND_LINE}" stroke-width="1.3" stroke-linecap="round" opacity="0.75">
        <line x1="10.6" y1="54.6" x2="17.4" y2="54.6" />
        <line x1="10.6" y1="58.6" x2="17.4" y2="58.6" />
      </g>
    </g>
    <g>
      <line x1="86.6" y1="68" x2="90.4" y2="58.4" stroke="${HAND_LINE}" stroke-width="8.8" stroke-linecap="round" />
      <line x1="86.6" y1="68" x2="90.4" y2="58.4" stroke="${HAND_FILL}" stroke-width="6.2" stroke-linecap="round" />
      <rect x="77" y="64.5" width="14" height="13.5" rx="5.8" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2.1" />
      <g stroke="${HAND_LINE}" stroke-width="1.3" stroke-linecap="round" opacity="0.75">
        <line x1="80.6" y1="69.6" x2="87.4" y2="69.6" />
        <line x1="80.6" y1="73.6" x2="87.4" y2="73.6" />
      </g>
    </g>
  </g>`,
      },
    ],
  },

  /** Transcribed from Pip.tsx:561-589 (`BackSwords`). Drawn at Z.BEHIND per the brief: the
   *  sheathed pair sits behind the coin body. `testID` is dropped per transcription rule 5. */
  crossedKatana: {
    id: 'crossedKatana',
    slot: 'holding',
    layers: [
      {
        z: Z.BEHIND,
        svg: `<g data-part="crossedKatana">
    <line x1="24" y1="36.8" x2="90" y2="86" stroke="${SAYA_DARK}" stroke-width="7.4" stroke-linecap="round" />
    <line x1="23" y1="38.1" x2="89" y2="87.3" stroke="${SAYA_DARK_EDGE}" stroke-width="1.5" stroke-linecap="round" />
    <line x1="76" y1="36.8" x2="10" y2="86" stroke="${SAYA_PALE}" stroke-width="7.4" stroke-linecap="round" />
    <line x1="77" y1="38.1" x2="11" y2="87.3" stroke="${SAYA_PALE_EDGE}" stroke-width="1.4" stroke-linecap="round" opacity="0.8" />
    <line x1="10" y1="26" x2="22.8" y2="35.6" stroke="${SAYA_PALE}" stroke-width="6.4" stroke-linecap="round" />
    <g stroke="${HILT_WRAP}" stroke-width="1.5" stroke-linecap="round">
      <line x1="12.2" y1="29.7" x2="15.5" y2="25.3" />
      <line x1="16.2" y1="32.7" x2="19.5" y2="28.3" />
    </g>
    <line x1="20" y1="41" x2="27.2" y2="31.4" stroke="${GUARD_GOLD}" stroke-width="3.6" stroke-linecap="round" />
    <line x1="20" y1="41" x2="27.2" y2="31.4" stroke="${GUARD_GOLD_DARK}" stroke-width="1" stroke-linecap="round" opacity="0.6" />
    <line x1="90" y1="26" x2="77.2" y2="35.6" stroke="${HILT_WRAP}" stroke-width="6.4" stroke-linecap="round" />
    <g stroke="${GUARD_GOLD}" stroke-width="1.5" stroke-linecap="round">
      <line x1="87.8" y1="29.7" x2="84.5" y2="25.3" />
      <line x1="83.8" y1="32.7" x2="80.5" y2="28.3" />
    </g>
    <line x1="80" y1="41" x2="72.8" y2="31.4" stroke="${GUARD_GOLD}" stroke-width="3.6" stroke-linecap="round" />
    <line x1="80" y1="41" x2="72.8" y2="31.4" stroke="${GUARD_GOLD_DARK}" stroke-width="1" stroke-linecap="round" opacity="0.6" />
  </g>`,
      },
    ],
  },

  /** A rope loop beside the face, coiled into the same small fist the lollipop uses. */
  lasso: {
    id: 'lasso',
    slot: 'holding',
    layers: [
      {
        z: Z.FRONT,
        svg: `<g data-part="lasso">
    <ellipse cx="82" cy="40" rx="13.5" ry="17.5" fill="none" stroke="${ROPE_LINE}" stroke-width="4.4" />
    <ellipse cx="82" cy="40" rx="13.5" ry="17.5" fill="none" stroke="${ROPE}" stroke-width="2.6" />
    <path d="M75 52 Q72 48 74 43" fill="none" stroke="${ROPE_LINE}" stroke-width="2.2" stroke-linecap="round" opacity="0.7" />
    <path d="M82 57.4 Q79 64 83 71" fill="none" stroke="${ROPE_LINE}" stroke-width="3.6" stroke-linecap="round" />
    <path d="M82 57.4 Q79 64 83 71" fill="none" stroke="${ROPE}" stroke-width="2" stroke-linecap="round" />
    <rect x="76" y="66.5" width="12.4" height="11" rx="5" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2" />
    <g stroke="${HAND_LINE}" stroke-width="1.3" stroke-linecap="round" opacity="0.75">
      <line x1="79.4" y1="70.2" x2="85" y2="70.2" />
      <line x1="79.4" y1="73.8" x2="85" y2="73.8" />
    </g>
  </g>`,
      },
    ],
  },

  /** A three-finger mechanical claw on the right, cyan joint so it belongs with the scanner eye. */
  claw: {
    id: 'claw',
    slot: 'holding',
    layers: [
      {
        z: Z.FRONT,
        svg: `<g data-part="claw">
    <line x1="88" y1="84" x2="86" y2="62" stroke="${CLAW_DARK}" stroke-width="8.2" stroke-linecap="round" />
    <line x1="88" y1="84" x2="86" y2="62" stroke="${CLAW_METAL}" stroke-width="5.4" stroke-linecap="round" />
    <circle cx="85.4" cy="59.5" r="4.6" fill="${CLAW_GLOW}" stroke="${CLAW_DARK}" stroke-width="1.4" />
    <path d="M85.4 59.5 Q93 48 97.5 38" fill="none" stroke="${CLAW_DARK}" stroke-width="4.4" stroke-linecap="round" />
    <path d="M85.4 59.5 Q93 48 97.5 38" fill="none" stroke="${CLAW_METAL}" stroke-width="2.6" stroke-linecap="round" />
    <path d="M85.4 59.5 Q96 62 102 54" fill="none" stroke="${CLAW_DARK}" stroke-width="4.4" stroke-linecap="round" />
    <path d="M85.4 59.5 Q96 62 102 54" fill="none" stroke="${CLAW_METAL}" stroke-width="2.6" stroke-linecap="round" />
    <path d="M97.5 38 Q99 34.5 95.4 33.6" fill="none" stroke="${CLAW_DARK}" stroke-width="3.2" stroke-linecap="round" />
    <path d="M102 54 Q105 52 103.4 48.4" fill="none" stroke="${CLAW_DARK}" stroke-width="3.2" stroke-linecap="round" />
    <rect x="80.4" y="70.5" width="12.8" height="11" rx="5" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2" />
  </g>`,
      },
    ],
  },

  /** Star-tipped wand with a few sparkles, held like the lollipop. */
  wand: {
    id: 'wand',
    slot: 'holding',
    layers: [
      {
        z: Z.FRONT,
        svg: `<g data-part="wand">
    <line x1="82" y1="78" x2="71" y2="24" stroke="${WAND_LINE}" stroke-width="3.4" stroke-linecap="round" />
    <line x1="82" y1="78" x2="71" y2="24" stroke="${WAND}" stroke-width="1.8" stroke-linecap="round" />
    <path d="M71 12.4 L73.2 19.2 L80.4 19.6 L74.8 24.2 L76.4 31.2 L71 27.4 L65.6 31.2 L67.2 24.2 L61.6 19.6 L68.8 19.2 Z" fill="${WAND_STAR}" stroke="${WAND_STAR_LINE}" stroke-width="1.1" stroke-linejoin="round" />
    <g fill="none" stroke="${WAND_STAR}" stroke-width="1.5" stroke-linecap="round">
      <path d="M84 16 L84 22 M81 19 L87 19" />
      <path d="M60 28 L60 33 M57.6 30.5 L62.4 30.5" />
      <path d="M88 32 L88 36.4 M85.8 34.2 L90.2 34.2" />
    </g>
    <rect x="76" y="67.5" width="12.4" height="11" rx="5" fill="${HAND_FILL}" stroke="${HAND_LINE}" stroke-width="2" />
    <g stroke="${HAND_LINE}" stroke-width="1.3" stroke-linecap="round" opacity="0.75">
      <line x1="79.4" y1="71.2" x2="85" y2="71.2" />
      <line x1="79.4" y1="74.8" x2="85" y2="74.8" />
    </g>
  </g>`,
      },
    ],
  },
};
