import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect, G } from 'react-native-svg';
import { useReducedMotion } from '../state/useReducedMotion';
import { duration as motionDuration } from '../theme/motion';

/** The coin palette, shared with the (now retired) CoinMascot artwork so Pip reads as one
 *  character app-wide instead of a shape that recolours per accent preset. Deliberately fixed:
 *  the accent still drives buttons, chips and progress, just not the mascot. */
const COIN_RIM = '#F5B42A';
const COIN_FACE = '#FAC438';
const COIN_BEVEL = '#D99E18';
const COIN_INK = '#7A4800';
const LEAF_LEFT = '#1c7a4e';
const LEAF_RIGHT = '#2aab68';
const LEAF_STEM = '#185e3e';
const BLUSH = '#F07828';

/** Straw-hat palette (`hat`). Paler and far less saturated than the coin it sits on — a true
 *  straw yellow would sink into the gold — and the red band does most of the separating. */
const STRAW = '#F0DCA4';
const STRAW_LINE = '#B08A3E';
const HAT_BAND = '#D6453F';

/** Propeller-hat palette (`propellerHat`) — a color-blocked party cap matched to the reference
 *  toy: yellow/red crown halves with a blue seam and brim trim, and a green brim. */
const CAP_YELLOW = '#F5C542';
const CAP_RED = '#E8453C';
const CAP_TRIM = '#3F6FD1';
const CAP_BRIM = '#2E9E5B';
const CAP_BRIM_LINE = '#1F7A44';

/** 🥳-style party cone (`partyHat`). Blue with white dots and a gold rim, close to the emoji
 *  without borrowing the user's accent — this still has to read as one Pip. */
const PARTY_BLUE = '#3B7CFF';
const PARTY_BLUE_DARK = '#1F56C9';
const PARTY_DOT = '#FFFDF5';
const PARTY_RIM = '#FFD34D';
const PARTY_RIM_LINE = '#C48A14';
const PARTY_STREAMER = '#F472B6';

/** Cool-pose palette (`glasses`). The gloves are off-white with a warm brown outline rather than
 *  flat white: unoutlined pale hands disappear against a light page, and a neutral grey outline
 *  would pull them out of the coin's family. Teeth are near-white for the same reason. */
const SHADE_FRAME = '#232323';
const SHADE_LENS = '#2E2E33';
const HAND_FILL = '#FFF6E4';
const HAND_LINE = '#8A5A16';
const TEETH = '#FFFDF5';

/** Sassy-pose palette. The raspberry details are saturated enough to stay legible against the
 *  gold face without borrowing the user's accent colour, so this remains one consistent Pip. */
const SASSY_LIP_DARK = '#9D3157';
const SASSY_LIP = '#E85D83';
const SASSY_LIP_LIGHT = '#FFD2DE';
/** Warmer and paler than the coin rim so the halo separates from the body instead of just
 *  fattening it, but still inside the gold family so it never reads as a second colour. */
const SASSY_GLOW = '#FFE08A';

/** Nerd-pose palette (`nerdy`). */
const PIMPLE = '#E8703A';

/** Swordsman-pose palette (`swordsman`). Two rules hold it together: the bandana borrows the
 *  sprout's greens so the new gear still reads as Pip's own family, and every piece of kit gets
 *  an outline in the opposite value to its fill — the two sheathed swords are deliberately one
 *  dark and one pale so at least one of them separates from the page in either theme. */
const BAND = '#1F8A52';
const BAND_DARK = '#14603A';
const BAND_LIGHT = '#35B26C';
const SAYA_DARK = '#1E2A24';
const SAYA_DARK_EDGE = '#41604E';
const SAYA_PALE = '#EDE6D6';
const SAYA_PALE_EDGE = '#93805C';
const HILT_WRAP = '#232A31';
const GUARD_GOLD = '#C8A02E';
const GUARD_GOLD_DARK = '#7C5F12';
const BLADE = '#DCE6EC';
const BLADE_EDGE = '#8298A6';
/** The scar is warm rather than red: a true red on a gold face reads as a wound, and this is a
 *  healed line Pip is proud of. */
const SCAR = '#A9503A';
const SCAR_LIGHT = '#D98C72';
const EARRING = '#FFD75E';
const EARRING_LINE = '#6B4A12';

/** Scientist-pose palette (`scientist`). Two rules hold it together. Glass is a pale blue-white
 *  with a mid-blue outline rather than a transparent fill — real transparency would let the gold
 *  through and turn every flask into part of the coin — and both brews are hues this file uses
 *  nowhere else (a cool teal and a violet, neither gold nor sprout-green), so nothing on the bench
 *  can be misread as a piece of Pip. */
const GLASS = '#EAF6FA';
const GLASS_EDGE = '#5F8298';
const BREW_TEAL = '#22B8BE';
const BREW_TEAL_LIGHT = '#8FE9EC';
const BREW_VIOLET = '#9E63EA';
const BREW_VIOLET_LIGHT = '#D9BDFF';
const GOGGLE_FRAME = '#2B3138';
const GOGGLE_STRAP = '#3C4650';
const GOGGLE_LENS = '#BFE7F2';

/** Eating-pose palette (`eating`). The bowl is the one saturated blue on Pip anywhere, and that is
 *  deliberate: it sits directly against the coin, and every warm ceramic colour worth using (red,
 *  orange, terracotta) is either the propeller cap's red or close enough to the gold to smear into
 *  it. The noodles are paler than the coin rather than darker so the heap reads as food sitting in
 *  front of the body instead of a hole in it. */
const BOWL = '#3C7AC4';
const BOWL_DARK = '#22558F';
const BOWL_LIGHT = '#9FC6F0';
const NOODLE = '#F7E6B8';
const NOODLE_LINE = '#C79E52';
const CHOPSTICK = '#D8A96A';
const CHOPSTICK_LINE = '#8A5A16';
const NARUTO_PINK = '#EE6E8E';
/** Reused from the lollipop's green band rather than the sprout's, which would read as a leaf that
 *  fell in the soup. */
const SCALLION = '#4FAF6D';
/** The tongue borrows the sassy pose's raspberry rather than inventing another accent. */
const TONGUE = '#E85D83';

/** React Native Web has no native Animated module, so its "native" driver falls back to a
 * requestAnimationFrame loop. Let the browser compositor own the web bob instead; native apps
 * keep the real native driver below. */
export function shouldUsePipJsFloat(platform: string, float: boolean, reducedMotion: boolean): boolean {
  return platform !== 'web' && float && !reducedMotion;
}

export const PIP_WEB_FLOAT_STYLE = {
  animationDuration: '4.4s',
  animationIterationCount: 'infinite',
  animationKeyframes: [
    {
      '0%': { transform: 'translate3d(0, 0, 0)' },
      '50%': { transform: 'translate3d(0, -4px, 0)' },
      '100%': { transform: 'translate3d(0, 0, 0)' },
    },
  ],
  animationTimingFunction: 'ease-in-out',
  willChange: 'transform',
} as const;

/** Idea-bulb palette. Warmer and lighter than the coin so the bulb still reads as a separate
 *  lit object floating above Pip rather than a third piece of his body. */
const BULB_GLASS = '#FFE49A';
const BULB_RIM = '#E7A81B';
const BULB_RAY = '#F2B024';
const BULB_COLLAR = '#D8B564';
const BULB_SCREW = '#A8842F';

// docs/ui-engagement-plan.md Step 3: 4 static poses -> 7, each tied to something that actually
// happened rather than decoration. `sheepish` is reserved for Pip's own mistakes (a bad parse,
// a wrong guess) and must never fire in response to the user's spending  see §1 of that doc.
export type PipExpr = 'idle' | 'happy' | 'think' | 'curious' | 'proud' | 'sheepish' | 'sleepy';

/** Only expressions with open, circle-drawn eyes have anything to blink. `happy`/`proud` are
 *  already closed-eye grins and `sleepy` is already half-lidded, so all three are excluded
 *  rather than made to blink shut on top of an already-shut look. */
const BLINKABLE: PipExpr[] = ['idle', 'think', 'curious', 'sheepish'];

interface EyePos {
  cx: number;
  cy: number;
  r: number;
  hx: number;
  hy: number;
  hr: number;
}

/** Circle-eye geometry, one source of truth shared by `Eyes` (what renders) and `BlinkCover`
 *  (what covers it mid-blink) so the two can never drift out of alignment. */
const EYES: Record<'idle' | 'curious' | 'think' | 'sheepish', [EyePos, EyePos]> = {
  idle: [
    { cx: 40, cy: 55, r: 4.2, hx: 41.5, hy: 53.5, hr: 1.3 },
    { cx: 60, cy: 55, r: 4.2, hx: 61.5, hy: 53.5, hr: 1.3 },
  ],
  curious: [
    { cx: 40, cy: 55, r: 4.4, hx: 41.6, hy: 53.4, hr: 1.4 },
    { cx: 60, cy: 54, r: 5.2, hx: 61.8, hy: 52.2, hr: 1.6 },
  ],
  // Narrowed and glancing up-and-off-centre rather than front-on: reads as "working the
  // problem" instead of surprised. Paired with the single raised brow in `Eyes` below.
  think: [
    { cx: 42, cy: 50, r: 3.4, hx: 43.1, hy: 48.3, hr: 1.0 },
    { cx: 62, cy: 49, r: 3.4, hx: 63.1, hy: 47.3, hr: 1.0 },
  ],
  sheepish: [
    { cx: 40, cy: 58, r: 3.6, hx: 41.1, hy: 56.9, hr: 1.0 },
    { cx: 60, cy: 58, r: 3.6, hx: 61.1, hy: 56.9, hr: 1.0 },
  ],
};

/** Fixed (start -> outward) anchor points for the `celebrate` sparkle burst, chosen to stay
 *  clear of the face (roughly x 34-66, y 50-70) so a payoff never occludes the expression that
 *  is doing the actual emotional work. */
const SPARKLES: { x0: number; y0: number; x1: number; y1: number }[] = [
  { x0: 66, y0: 28.3, x1: 74, y1: 15 },
  { x0: 34, y0: 28.3, x1: 26, y1: 15 },
  { x0: 80, y0: 67, x1: 93, y1: 72 },
  { x0: 20, y0: 45, x1: 7, y1: 40 },
];

// react-native-svg's numeric props (cx/cy/r/ry/opacity) aren't typed to accept an Animated
// value, so `createAnimatedComponent` needs a narrow local re-type rather than the library's
// own. Contained to this file; nothing downstream sees it.
type AnimNum = number | Animated.Value | Animated.AnimatedInterpolation<number>;
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse) as unknown as React.ComponentType<{
  cx: AnimNum;
  cy: AnimNum;
  rx: AnimNum;
  ry: AnimNum;
  fill?: string;
}>;
const AnimatedCircle = Animated.createAnimatedComponent(Circle) as unknown as React.ComponentType<{
  cx: AnimNum;
  cy: AnimNum;
  r: AnimNum;
  fill?: string;
  opacity?: AnimNum;
}>;
/** Multiply each RGB channel of a #rrggbb hex by `factor` (brightness shade). */
function shade(hex: string, factor: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(c * factor)))
  );
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function Eyes({ expr, INK }: { expr: PipExpr; INK: string }) {
  if (expr === 'happy' || expr === 'proud') {
    // Closed, grinning arcs for both, `proud` swept 2px taller so the two read as related but
    // not identical at a glance (docs/ui-engagement-plan.md Step 3 visual direction).
    const lift = expr === 'proud' ? 2 : 0;
    return (
      <G fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round">
        <Path d={`M34 55 Q40 ${49 - lift} 46 55`} />
        <Path d={`M54 55 Q60 ${49 - lift} 66 55`} />
      </G>
    );
  }
  if (expr === 'sleepy') {
    return (
      <G fill={INK} opacity={0.85}>
        <Ellipse cx={40} cy={56} rx={5} ry={1.5} />
        <Ellipse cx={60} cy={56} rx={5} ry={1.5} />
      </G>
    );
  }
  const pair = EYES[expr as keyof typeof EYES] ?? EYES.idle;
  return (
    <G>
      {expr === 'think' && (
        // One raised brow, not two: the asymmetry is what makes it read as "thinking" rather
        // than "surprised".
        <Path d="M37 43 Q43 37 49 42" stroke={INK} strokeWidth={2.1} fill="none" strokeLinecap="round" />
      )}
      {expr === 'sheepish' && (
        <G stroke={INK} strokeWidth={2.1} strokeLinecap="round">
          <Path d="M35 50 L42 53.5" />
          <Path d="M65 50 L58 53.5" />
        </G>
      )}
      {pair.map((e, i) => (
        <G key={i}>
          <Circle cx={e.cx} cy={e.cy} r={e.r} fill={INK} />
          <Circle cx={e.hx} cy={e.hy} r={e.hr} fill="#fff" />
        </G>
      ))}
    </G>
  );
}

/** Covers a blinkable expression's eyes with the body colour, briefly, driven by `blink` going
 *  0 (open) -> 1 (shut) -> 0. A no-op render for any expression not in `BLINKABLE`. */
function BlinkCover({ expr, fill, blink }: { expr: PipExpr; fill: string; blink: Animated.Value }) {
  if (!BLINKABLE.includes(expr)) return null;
  const pair = EYES[expr as keyof typeof EYES];
  return (
    <G>
      {pair.map((e, i) => {
        const ry = blink.interpolate({ inputRange: [0, 1], outputRange: [0, e.r + 1] });
        return <AnimatedEllipse key={i} cx={e.cx} cy={e.cy} rx={e.r + 1.2} ry={ry} fill={fill} />;
      })}
    </G>
  );
}

/** Oversized shades, drawn wide enough to run most of the way across the face — the reference
 *  pose reads as smug because the glasses dominate, so a dainty pair would miss it. Bridge and
 *  temples go down first so the lenses cover the joins. */
function Sunglasses() {
  return (
    <G>
      <Path d="M47 51.5 Q50 48.6 53 51.5" stroke={SHADE_FRAME} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M29 50.5 L24.5 47.8" stroke={SHADE_FRAME} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M71 50.5 L75.5 47.8" stroke={SHADE_FRAME} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Rect x={29} y={47} width={18} height={12.5} rx={5.6} fill={SHADE_LENS} stroke={SHADE_FRAME} strokeWidth={1.7} />
      <Rect x={53} y={47} width={18} height={12.5} rx={5.6} fill={SHADE_LENS} stroke={SHADE_FRAME} strokeWidth={1.7} />
      <Ellipse cx={34.5} cy={50.5} rx={3} ry={1.7} fill="#fff" opacity={0.32} rotation={-20} originX={34.5} originY={50.5} />
      <Ellipse cx={58.5} cy={50.5} rx={3} ry={1.7} fill="#fff" opacity={0.32} rotation={-20} originX={58.5} originY={50.5} />
    </G>
  );
}

/** Two thick bars above the shades, inner ends dropped ~2 units. That tilt is the whole trick:
 *  level brows read blank behind sunglasses, inner-high reads worried, inner-low reads smug. */
function Brows({ INK }: { INK: string }) {
  return (
    <G stroke={INK} strokeWidth={4.2} strokeLinecap="round">
      <Line x1={32.5} y1={39.5} x2={45.5} y2={41.5} />
      <Line x1={67.5} y1={39.5} x2={54.5} y2={41.5} />
    </G>
  );
}

/** The reference pose's grin: a wide block of teeth rather than a drawn line. Vertical splits
 *  stop short of the bowl's edge so no tooth pokes through the outline, and the low arc is the
 *  lower row. Sized to sit clear of the blush above and the bevel edge below. */
function Grin({ INK }: { INK: string }) {
  return (
    <G>
      <Path
        d="M36 64 H64 Q62.5 79 50 79 Q37.5 79 36 64 Z"
        fill={TEETH}
        stroke={INK}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <G stroke={INK} strokeLinecap="round" fill="none">
        <G strokeWidth={1.3}>
          <Line x1={43} y1={64} x2={43} y2={74} />
          <Line x1={50} y1={64} x2={50} y2={76} />
          <Line x1={57} y1={64} x2={57} y2={74} />
        </G>
        <Path d="M39.5 72.6 Q50 78 60.5 72.6" strokeWidth={1.8} />
      </G>
    </G>
  );
}

/** Enlarged eyes for the `nerdy` pose — bigger than the plain-face `EYES.idle` pair so the face
 *  still reads at a glance now that nothing else (glasses, brows) fills the upper face. */
function NerdEyes({ INK }: { INK: string }) {
  return (
    <G>
      <Circle cx={39} cy={55} r={6.2} fill={INK} />
      <Circle cx={41.3} cy={52.6} r={1.8} fill="#fff" />
      <Circle cx={61} cy={55} r={6.2} fill={INK} />
      <Circle cx={63.3} cy={52.6} r={1.8} fill="#fff" />
    </G>
  );
}

/** A lollipop held up beside the face for the `nerdy` pose — a small fist (the cool pose's hand
 *  palette, so the two "held prop" ideas share a family) gripping a pale stick that runs up
 *  outside the right lens to a rainbow bullseye candy tucked beside the sprout. Five concentric
 *  bands rather than a gradient fill — react-native-svg gradients need a <Defs> registry, and
 *  flat concentric circles already match how every other fill in this file is drawn. Drawn after
 *  the glasses so the fist overlaps the coin's rim rather than butting into it, same as `Hands`. */
function Lollipop() {
  return (
    <G>
      <Line x1={83} y1={72} x2={75} y2={37} stroke={HAND_FILL} strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={75} cy={27} r={13} fill="#E8453C" stroke="#4A3220" strokeWidth={1.6} />
      <Circle cx={75} cy={27} r={10.4} fill="#F2954A" />
      <Circle cx={75} cy={27} r={7.8} fill="#F5D93A" />
      <Circle cx={75} cy={27} r={5.2} fill="#4FAF6D" />
      <Circle cx={75} cy={27} r={2.6} fill="#4A90D9" />
      <Ellipse cx={69.5} cy={21} rx={3.4} ry={2.1} fill="#fff" opacity={0.5} rotation={-25} originX={69.5} originY={21} />
      <Rect x={77} y={67.5} width={12} height={11} rx={5.2} fill={HAND_FILL} stroke={HAND_LINE} strokeWidth={2} />
    </G>
  );
}

/**
 * One floating thumbs-up glove — a fist with the thumb rising off its outer edge, and no arm
 * behind it, which is what the reference shows. `flip` mirrors the thumb so both hands angle up
 * and away from the coin.
 *
 * The thumb is two stacked round-capped strokes (outline width, then fill width) rather than a
 * traced outline: a capsule is exactly what a round cap gives for free. The fist then covers the
 * thumb's lower cap, and its own outline crossing there reads as the thumb crease.
 */
function Hand({ cx, cy, flip }: { cx: number; cy: number; flip?: boolean }) {
  const s = flip ? -1 : 1;
  const [tx0, ty0] = [cx + s * 2.6, cy - 3];
  const [tx1, ty1] = [cx + s * 6.4, cy - 12.6];
  const left = cx - 7;
  return (
    <G>
      <Line x1={tx0} y1={ty0} x2={tx1} y2={ty1} stroke={HAND_LINE} strokeWidth={8.8} strokeLinecap="round" />
      <Line x1={tx0} y1={ty0} x2={tx1} y2={ty1} stroke={HAND_FILL} strokeWidth={6.2} strokeLinecap="round" />
      <Rect x={left} y={cy - 6.5} width={14} height={13.5} rx={5.8} fill={HAND_FILL} stroke={HAND_LINE} strokeWidth={2.1} />
      {/* Curled-finger ridges. */}
      <G stroke={HAND_LINE} strokeWidth={1.3} strokeLinecap="round" opacity={0.75}>
        <Line x1={left + 3.6} y1={cy - 1.4} x2={left + 10.4} y2={cy - 1.4} />
        <Line x1={left + 3.6} y1={cy + 2.6} x2={left + 10.4} y2={cy + 2.6} />
      </G>
    </G>
  );
}

/**
 * A straw sun hat with a red band.
 *
 * The crown is 38 wide against a 66-wide head — a crown much narrower than that stops reading as
 * something the head could fit inside and turns into a cake perched on top. It's also deliberately
 * shallow (12 tall), both because that's the boater/sugegasa shape and because the leaves start at
 * y≈19: a taller crown would eat the sprout, which is Pip's most recognisable feature. The stub of
 * stem left showing between crown and leaves is what sells the hat as worn rather than pasted on.
 *
 * The brim's centre line sits at y=30, well inside the head's top (y=23), for the same reason — a
 * brim resting at the very top of the skull hovers. Brim first, then crown, or the crown's base
 * shows through. The band then sits inside the crown's deliberately straight-sided lower half,
 * which is the only reason a plain rect can hug it without poking out of the curve.
 */
function StrawHat() {
  return (
    <G>
      {/* Crown and band go down FIRST so the brim can occlude their base. That order is the whole
          illusion: on a wide-brim hat seen head-on you see the brim's near edge in front of the
          crown, and the crown emerges from behind it. Drawn the other way round the crown sits on
          top as a complete box and the hat reads as a cake on a plate.
          Everything below y≈28.5 here is therefore hidden, including the straight sides — those
          exist only so a plain <Rect> band can hug the crown without poking out of a curve. */}
      {/* The base flares out to x 25/75, wider than the dome above it, because the skull keeps
          widening as it drops: a straight-sided crown lets a sliver of gold show between its side
          and the brim's top edge. All of the flare below y≈32 is hidden by the brim. */}
      <Path
        d="M25 38 L29 27 C29.5 21 37 17.5 50 17.5 C63 17.5 70.5 21 71 27 L75 38 Z"
        fill={STRAW}
        stroke={STRAW_LINE}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* A trapezoid, not a rect, so it follows that flare instead of leaving bare corners where
          the crown has already widened past it. Inset 0.9 to clear the crown's own stroke. */}
      <Path d="M29.9 27 L70.1 27 L73.74 37 L26.26 37 Z" fill={HAT_BAND} />
      {/* Cast shadow, drawn just before the brim so only a crescent of it escapes below the brim's
          edge. This is what stops the hat reading as a disc hovering in front of Pip's face. */}
      <Ellipse cx={50} cy={40.5} rx={34} ry={7} fill="rgba(120,80,20,0.2)" />
      {/* ry is only 6.5 against rx 36: seen head-on a brim is a shallow band, and a deeper ellipse
          turns into a saucer that swallows the crown. */}
      <Ellipse cx={50} cy={38} rx={36} ry={6.5} fill={STRAW} stroke={STRAW_LINE} strokeWidth={1.8} />
      {/* One woven ring: the cheapest cue that the brim is straw rather than felt. */}
      <Ellipse cx={50} cy={38} rx={29} ry={4.8} fill="none" stroke={STRAW_LINE} strokeWidth={1.1} opacity={0.45} />
    </G>
  );
}

/**
 * A color-blocked propeller cap (`propellerHat`), sharing `StrawHat`'s crown/brim silhouette so
 * it sits in the same spot on Pip's head, but with a yellow/red split crown, blue edge slivers
 * (echoing the reference toy's side panels peeking past the front), and a green brim.
 */
function PropellerCap() {
  return (
    <G>
      <Path d="M25 38 L29 27 C29.5 21 37 17.5 50 17.5 L50 38 Z" fill={CAP_YELLOW} />
      <Path d="M75 38 L71 27 C70.5 21 63 17.5 50 17.5 L50 38 Z" fill={CAP_RED} />
      <Path d="M25 38 L29 27 C29.5 21 33 18.5 36 18.3 L32 38 Z" fill={CAP_TRIM} />
      <Path d="M75 38 L71 27 C70.5 21 67 18.5 64 18.3 L68 38 Z" fill={CAP_TRIM} />
      <Line x1={50} y1={17.5} x2={50} y2={38} stroke={CAP_TRIM} strokeWidth={1.2} opacity={0.5} />
      <Ellipse cx={50} cy={40.5} rx={34} ry={7} fill="rgba(20,50,30,0.18)" />
      <Ellipse cx={50} cy={38} rx={36} ry={6.5} fill={CAP_BRIM} stroke={CAP_BRIM_LINE} strokeWidth={1.8} />
      <Ellipse cx={50} cy={38} rx={29} ry={4.8} fill="none" stroke={CAP_BRIM_LINE} strokeWidth={1.1} opacity={0.45} />
    </G>
  );
}

/**
 * A tilted cone party hat (`partyHat`), the 🥳 read: blue crown, white dots, gold brim, and a
 * handful of confetti chips. Occupies the same head slot as the straw and propeller caps, and
 * covers the sprout so the cone sits on the coin instead of floating above a plant.
 *
 * Drawn inside the 100x100 box. The tilt is a group rotation around the brim, not a skewed
 * triangle — a skewed cone reads as a flat kite.
 */
function PartyHat() {
  return (
    <G testID="pip-party-hat">
      <G testID="pip-party-hat-confetti">
        <Rect x={71} y={15} width={5.2} height={3.2} rx={0.7} fill={PARTY_STREAMER} rotation={28} originX={73.6} originY={16.6} />
        <Rect x={76} y={29} width={4.2} height={4.2} rx={0.6} fill={PARTY_RIM} rotation={-16} originX={78.1} originY={31.1} />
        <Rect x={19} y={17} width={4.8} height={3} rx={0.6} fill={LEAF_RIGHT} rotation={-30} originX={21.4} originY={18.5} />
        <Rect x={15} y={33} width={3.4} height={5.2} rx={0.6} fill={PARTY_BLUE} rotation={20} originX={16.7} originY={35.6} />
      </G>
      <G testID="pip-party-hat-cone" rotation={-22} originX={50} originY={31}>
        <Ellipse cx={50} cy={33.4} rx={15} ry={5} fill="rgba(30,50,110,0.2)" />
        <Path d="M35.5 31 L64.5 31 L50 2.4 Z" fill={PARTY_BLUE} />
        <Path d="M35.5 31 L50 31 L50 2.4 Z" fill={PARTY_BLUE_DARK} opacity={0.28} />
        <G testID="pip-party-hat-dots" fill={PARTY_DOT}>
          <Circle cx={50} cy={9.2} r={1.7} />
          <Circle cx={44.8} cy={15.6} r={1.5} />
          <Circle cx={55.4} cy={14.8} r={1.6} />
          <Circle cx={46.6} cy={22.4} r={1.4} />
          <Circle cx={54.8} cy={21.6} r={1.5} />
          <Circle cx={50} cy={27.2} r={1.3} />
        </G>
        <Ellipse
          testID="pip-party-hat-rim"
          cx={50}
          cy={31}
          rx={14.6}
          ry={5}
          fill={PARTY_RIM}
          stroke={PARTY_RIM_LINE}
          strokeWidth={1.3}
        />
        <Circle cx={50} cy={2.8} r={2.5} fill={PARTY_DOT} />
        <Circle cx={50} cy={2.8} r={2.5} fill="none" stroke={PARTY_RIM_LINE} strokeWidth={0.8} />
      </G>
    </G>
  );
}

/** Both hands, deliberately not level: the reference holds one up by the face and one low and
 *  out. Mirrored heights would read as a jumping-jack rather than a pose. */
function Hands() {
  return (
    <G>
      <Hand cx={14} cy={56} flip />
      <Hand cx={84} cy={71} />
    </G>
  );
}

/**
 * A soft halo behind the sassy pose's coin. Four flat concentric rings at falling opacity rather
 * than a radial gradient: gradients in react-native-svg need a <Defs> registry, and stepped
 * circles are how every other soft edge in this file is drawn (see `Lollipop`). Four steps is the
 * point where the banding stops being visible at Pip's usual render sizes.
 *
 * Deliberately drawn before the sprout so the leaves sit in front of it — a glow that covered the
 * sprout would read as a sticker behind Pip rather than light coming off him.
 */
function SassyGlow() {
  return (
    <G testID="pip-sassy-glow" fill={SASSY_GLOW}>
      <Circle cx={50} cy={56} r={41} opacity={0.05} />
      <Circle cx={50} cy={56} r={38.5} opacity={0.07} />
      <Circle cx={50} cy={56} r={36} opacity={0.09} />
      <Circle cx={50} cy={56} r={34} opacity={0.12} />
    </G>
  );
}

/**
 * Pip's appearance-screen pose: a polished take on the beauty-filter attitude with open eyes,
 * fanned lashes, and glossy lips.
 */
function SassyFace() {
  return (
    <G testID="pip-sassy-face" accessibilityLabel="Pip posing with eyelashes and glossy lips">
      {/* Eyes first, liner and lashes over them: the liner is meant to sit on the upper lid, so
          the pupil has to be underneath it rather than drawn on top. */}
      <G testID="pip-sassy-eyes">
        <Ellipse cx={40} cy={55.5} rx={4.9} ry={5.4} fill={COIN_INK} />
        <Circle cx={41.9} cy={53.3} r={1.7} fill="#fff" />
        <Circle cx={38.4} cy={57.6} r={0.9} fill="#fff" opacity={0.7} />
        <Ellipse cx={60} cy={55.5} rx={4.9} ry={5.4} fill={COIN_INK} />
        <Circle cx={61.9} cy={53.3} r={1.7} fill="#fff" />
        <Circle cx={58.4} cy={57.6} r={0.9} fill="#fff" opacity={0.7} />
      </G>

      <G testID="pip-sassy-eyelashes" fill="none" stroke={COIN_INK} strokeLinecap="round" strokeLinejoin="round">
        {/* Brows arch high and taper toward the outside, which is what carries the attitude now
            that the eyes are open and doing their own work. */}
        <Path d="M31.5 45.5 Q37.5 41.5 45 44.5" strokeWidth={2.3} opacity={0.82} />
        <Path d="M55 44.5 Q62.5 41.5 68.5 45.5" strokeWidth={2.3} opacity={0.82} />

        {/* Winged upper liner, heavier than the brow so the lid reads as made up. */}
        <Path d="M34.5 52.5 Q40 47 45.5 52.5" strokeWidth={2.8} />
        <Path d="M54.5 52.5 Q60 47 65.5 52.5" strokeWidth={2.8} />

        {/* Fanned lashes grow toward the outside corners rather than forming a solid fringe. */}
        <Path d="M34.8 51.6 L30.6 48.4" strokeWidth={1.8} />
        <Path d="M36.6 49.8 L33.8 46.8" strokeWidth={1.6} />
        <Path d="M33.9 53.4 L29.4 52.4" strokeWidth={1.7} />
        <Path d="M65.2 51.6 L69.4 48.4" strokeWidth={1.8} />
        <Path d="M63.4 49.8 L66.2 46.8" strokeWidth={1.6} />
        <Path d="M66.1 53.4 L70.6 52.4" strokeWidth={1.7} />
      </G>

      <G testID="pip-sassy-lips">
        {/* Two distinct lobes and a tiny highlight read as gloss without photo-real texture. */}
        <Path
          d="M39 68 C42 63.5 46 63 50 65.2 C54 63 58 63.5 61 68 C56.8 69.8 53.2 70.2 50 70.2 C46.8 70.2 43.2 69.8 39 68 Z"
          fill={SASSY_LIP_DARK}
        />
        <Path
          d="M39 68 C44 69.2 56 69.2 61 68 C58.2 75.7 41.8 75.7 39 68 Z"
          fill={SASSY_LIP}
          stroke={SASSY_LIP_DARK}
          strokeWidth={0.9}
        />
        <Path d="M52.7 71.5 Q55.5 70.4 58 71.2" fill="none" stroke={SASSY_LIP_LIGHT} strokeWidth={1.5} strokeLinecap="round" opacity={0.9} />
      </G>
    </G>
  );
}

/**
 * The two sheathed katana Pip carries on his back, crossed behind the coin (`swordsman`).
 *
 * Both are drawn as straight capsules through the coin's centre (50, 56), one running
 * upper-left -> lower-right and one upper-right -> lower-left, so only the last ~17 units at each
 * end escape the r=33 rim: a hilt above each shoulder and a sheath tip below. Everything between
 * is hidden by the body, which is exactly what carries the "worn on the back" read — the swords
 * pass *behind* Pip rather than lying on top of him. Called before the body for that reason.
 *
 * One pale sheath and one dark: a matched pair would vanish together on a light or a dark page,
 * and this way one of the two always separates.
 */
function BackSwords() {
  return (
    <G testID="pip-swordsman-swords">
      {/* Sheaths first, then hilts, so each guard sits over the mouth of its own sheath. */}
      <Line x1={24} y1={36.8} x2={90} y2={86} stroke={SAYA_DARK} strokeWidth={7.4} strokeLinecap="round" />
      <Line x1={23} y1={38.1} x2={89} y2={87.3} stroke={SAYA_DARK_EDGE} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={76} y1={36.8} x2={10} y2={86} stroke={SAYA_PALE} strokeWidth={7.4} strokeLinecap="round" />
      <Line x1={77} y1={38.1} x2={11} y2={87.3} stroke={SAYA_PALE_EDGE} strokeWidth={1.4} strokeLinecap="round" opacity={0.8} />

      {/* Left sword: pale wrapped hilt against the dark sheath, and the reverse on the right, so
          neither sword reads as a recolour of the other. */}
      <Line x1={10} y1={26} x2={22.8} y2={35.6} stroke={SAYA_PALE} strokeWidth={6.4} strokeLinecap="round" />
      <G stroke={HILT_WRAP} strokeWidth={1.5} strokeLinecap="round">
        <Line x1={12.2} y1={29.7} x2={15.5} y2={25.3} />
        <Line x1={16.2} y1={32.7} x2={19.5} y2={28.3} />
      </G>
      <Line x1={20} y1={41} x2={27.2} y2={31.4} stroke={GUARD_GOLD} strokeWidth={3.6} strokeLinecap="round" />
      <Line x1={20} y1={41} x2={27.2} y2={31.4} stroke={GUARD_GOLD_DARK} strokeWidth={1} strokeLinecap="round" opacity={0.6} />

      <Line x1={90} y1={26} x2={77.2} y2={35.6} stroke={HILT_WRAP} strokeWidth={6.4} strokeLinecap="round" />
      <G stroke={GUARD_GOLD} strokeWidth={1.5} strokeLinecap="round">
        <Line x1={87.8} y1={29.7} x2={84.5} y2={25.3} />
        <Line x1={83.8} y1={32.7} x2={80.5} y2={28.3} />
      </G>
      <Line x1={80} y1={41} x2={72.8} y2={31.4} stroke={GUARD_GOLD} strokeWidth={3.6} strokeLinecap="round" />
      <Line x1={80} y1={41} x2={72.8} y2={31.4} stroke={GUARD_GOLD_DARK} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
    </G>
  );
}

/**
 * The green bandana (`swordsman`), taking the head slot the hats use.
 *
 * The band's top and bottom edges are arcs of the r=33 rim, so it wraps the skull instead of
 * being pasted across it, and both edges dip in the middle — the amount of dip is what sets the
 * viewing height, and a level band reads as a sticker. It stops at y≈36, clear of the sprout
 * (leaves end at y≈19), because the sprout is Pip's most recognisable feature and a band that ate
 * it would lose him.
 *
 * The knot and its two tails hang off the left because the right shoulder already carries a hilt;
 * splitting the silhouette's business across both sides would crowd it.
 */
function Bandana() {
  return (
    <G testID="pip-swordsman-bandana">
      {/* Both tails end in a cut notch. Without it a green rounded shape beside a green sprout
          reads as a third leaf — the fork is the only thing that says "cloth" at this size. */}
      <Path
        d="M20 42.8 C12.5 40 6.5 41.2 1.5 37.2 C4 43.6 9 47.4 16 48.4 L11.8 44.6 L19.5 47 Z"
        fill={BAND_DARK}
      />
      <Path
        d="M20.5 47.2 C14.5 50 9.5 54 4 57.2 C10.5 58.2 16 56 20.8 51.8 L15.6 52.6 Z"
        fill={BAND}
      />
      {/* Band body: arc down the left of the rim, a dipping lower edge, arc up the right, and a
          dipping top edge back. Both edges share the same dip so the band keeps its width. */}
      <Path
        d="M23.75 36 A 33 33 0 0 0 18.55 46 Q 50 51.5 81.45 46 A 33 33 0 0 0 76.25 36 Q 50 41 23.75 36 Z"
        fill={BAND}
      />
      {/* A single fold highlight along the top of the band. One line, not shading: the coin's own
          highlight is a single ellipse, and anything busier here fights the face below. */}
      <Path d="M27 38.6 Q50 43 73 38.6" fill="none" stroke={BAND_LIGHT} strokeWidth={2} strokeLinecap="round" opacity={0.75} />
      <Path d="M25 44.6 Q50 49.4 75 44.6" fill="none" stroke={BAND_DARK} strokeWidth={1.6} strokeLinecap="round" opacity={0.55} />
      {/* Knot, over the tails' roots so they read as coming out of it. */}
      <Path d="M17 41.5 L23.5 39.5 L24 49 L17.5 47.5 Z" fill={BAND_LIGHT} stroke={BAND_DARK} strokeWidth={1.4} strokeLinejoin="round" />
    </G>
  );
}

/**
 * The swordsman face: one open eye under a hard brow, one closed and scarred.
 *
 * The scar sits on Pip's left (screen right) and the eye under it is shut — that pairing is the
 * whole silhouette cue, and swapping either half loses it. It runs from just under the bandana to
 * the cheek in one stroke; breaking it into segments reads as damage rather than a healed line.
 */
function SwordsmanFace({ INK }: { INK: string }) {
  return (
    <G testID="pip-swordsman-face">
      {/* Both brows drop toward the nose. Level brows under a bandana read blank, and inner-high
          reads worried — inner-low is the only tilt that carries "set on it". */}
      <G testID="pip-swordsman-brows" stroke={INK} strokeWidth={3.8} strokeLinecap="round">
        <Line x1={31} y1={48} x2={45} y2={51.5} />
        <Line x1={69} y1={48} x2={55} y2={51.5} />
      </G>

      {/* Open eye: a narrowed lid over a full pupil, rather than a smaller pupil. Shrinking the
          pupil makes Pip look frightened; covering it makes him look focused. */}
      <G testID="pip-swordsman-open-eye">
        <Circle cx={39.5} cy={58} r={4.6} fill={INK} />
        <Circle cx={41.2} cy={56.2} r={1.5} fill="#fff" />
        <Path d="M33.6 55.4 Q39.5 52.4 45.4 56" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      </G>

      {/* Closed eye: one lid line with a short lash tick at the outer corner so the shut eye still
          reads as an eye and not as a stray stroke. */}
      <G testID="pip-swordsman-closed-eye" fill="none" stroke={INK} strokeLinecap="round">
        <Path d="M54.6 57.4 Q60.6 61.2 66.6 56.8" strokeWidth={2.8} />
        <Path d="M66.6 56.8 L69.4 55" strokeWidth={1.8} opacity={0.8} />
      </G>

      <G testID="pip-swordsman-scar" strokeLinecap="round" fill="none">
        <Path d="M64.4 45.4 Q61.6 55 60.2 63.6" stroke={SCAR} strokeWidth={2.4} />
        <Path d="M64.4 45.4 Q61.6 55 60.2 63.6" stroke={SCAR_LIGHT} strokeWidth={0.9} opacity={0.8} />
      </G>
    </G>
  );
}

/** Three studs down the right rim (`swordsman`), strung on one wire. Sat on the rim's edge rather
 *  than inside the face: gold studs on the gold bevel would need an outline heavy enough to read
 *  as holes, while the rim's curve gives them a silhouette for free. */
function Earrings() {
  return (
    <G testID="pip-swordsman-earrings">
      <Path d="M84.4 49.5 Q85.6 58 82.6 67.5" fill="none" stroke={EARRING_LINE} strokeWidth={1.3} />
      <Circle cx={84.2} cy={55} r={3} fill={EARRING} stroke={EARRING_LINE} strokeWidth={1.5} />
      <Circle cx={83.9} cy={61.3} r={3} fill={EARRING} stroke={EARRING_LINE} strokeWidth={1.5} />
      <Circle cx={82.3} cy={67.5} r={3} fill={EARRING} stroke={EARRING_LINE} strokeWidth={1.5} />
    </G>
  );
}

/**
 * The third sword: drawn, and gripped in Pip's teeth (`swordsman`).
 *
 * What's in the mouth is the *handle* — the bite lands on the wrapped tsuka, with the guard at the
 * corner of the mouth and the blade sweeping out past the right cheek. That's the whole point of
 * the pose: nobody bites a cutting edge. The handle therefore has to cross the grin, which is why
 * it runs from past the left rim to x≈60 while the blade owns everything to the right of the guard.
 *
 * Drawn over the grin rather than instead of it — the teeth showing above and below the tsuka are
 * what makes it read as *bitten* instead of floating in front of the face.
 *
 * The blade is as long as this box can hold. Two things fix its length and both are load-bearing:
 * the handle has to span the grin (x 36-64) for the bite to read, which pins the guard just right
 * of the mouth, and the tip cannot leave the 100-unit viewBox or it gets clipped. The 16° tilt is
 * what buys the rest — aiming the tip at the top-right corner is a longer run than straight across,
 * and the diagonal reads as a held pose rather than a diagram. Anything longer needs a bigger
 * canvas, which would shrink Pip at every existing call site.
 */
function MouthKatana() {
  return (
    <G testID="pip-swordsman-mouth-katana" rotation={-16} originX={50} originY={70}>
      {/* Long taper — the tip runs over the last 9 units rather than 7. A blade that ends in a
          stubby wedge reads short however far it actually reaches. */}
      <Path
        d="M62.5 66.5 L92 66.5 L101 70 L92 73.5 L62.5 73.5 Z"
        fill={BLADE}
        stroke={BLADE_EDGE}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Spine highlight and a hamon along the cutting edge: two lines are all a folded blade
          needs at this size, and they also stop the steel reading as a flat plank. */}
      <Path d="M65 68.3 L90 68.3" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.75} />
      <Path d="M65 72.1 Q78 70.6 91 72" fill="none" stroke="#fff" strokeWidth={1} strokeLinecap="round" opacity={0.45} />
      {/* Guard, kept to 12 tall rather than the blade's full clearance: any taller and its top
          corner reaches the closed eye, and the pose loses the scar it is built around. */}
      <Rect x={57.6} y={64} width={4.4} height={12} rx={1.7} fill={GUARD_GOLD} stroke={GUARD_GOLD_DARK} strokeWidth={1.1} />
      {/* The tsuka runs out past the left rim on purpose: a handle that stopped inside the coin
          would read as painted on the cheek rather than held. Dark with pale wraps, the inverse of
          the pale sheath it passes in front of — matched values there let the two merge into one
          long stick across the bottom-left of the pose. */}
      <Rect x={19} y={66.2} width={38.6} height={7.6} rx={2.6} fill={HILT_WRAP} stroke={SAYA_PALE_EDGE} strokeWidth={1.1} />
      <G stroke={SAYA_PALE} strokeWidth={1.4} strokeLinecap="round" opacity={0.9}>
        <Line x1={25} y1={66.6} x2={29} y2={73.4} />
        <Line x1={29} y1={66.6} x2={25} y2={73.4} />
        <Line x1={36} y1={66.6} x2={40} y2={73.4} />
        <Line x1={40} y1={66.6} x2={36} y2={73.4} />
        <Line x1={47} y1={66.6} x2={51} y2={73.4} />
        <Line x1={51} y1={66.6} x2={47} y2={73.4} />
      </G>
      {/* Gold pommel cap, so the handle's far end stops rather than fading into the page on a dark
          theme, and so the sword's two metal ends (cap and guard) frame the bite between them. */}
      <Rect x={15.2} y={65.2} width={4.2} height={9.6} rx={1.6} fill={GUARD_GOLD} stroke={GUARD_GOLD_DARK} strokeWidth={1.1} />
    </G>
  );
}

/**
 * Welding-style lab goggles pushed up onto the forehead (`scientist`), taking the head slot the
 * hats and the bandana use.
 *
 * Pushed *up* rather than worn over the eyes, and that is the whole call: lenses on the eyes win a
 * cheap "scientist" read but cost Pip the only feature doing emotional work, and a coin with two
 * blank discs for a face is not a character. On the forehead they still say lab at a glance, and
 * they carry the extra beat that he has been at this a while and has just lifted them to squint at
 * what he made.
 *
 * The strap is an arc pair off the r=33 rim (the same construction as `Bandana`) so it wraps the
 * skull, and the lenses then sit on top of it, tops at y≈27.5 against a skull edge of y≈26 at that
 * width — close enough to read as resting on the head, not floating above it.
 */
function LabGoggles() {
  return (
    <G testID="pip-scientist-goggles">
      {/* Strap first: the lens frames have to overlap it, or the goggles read as two badges with a
          separate headband behind them. */}
      <Path
        d="M20.9 40.5 A 33 33 0 0 0 18.1 47.6 Q 50 53 81.9 47.6 A 33 33 0 0 0 79.1 40.5 Q 50 45.6 20.9 40.5 Z"
        fill={GOGGLE_STRAP}
      />
      <Path d="M23 42.6 Q50 47.6 77 42.6" fill="none" stroke={GOGGLE_FRAME} strokeWidth={1.6} opacity={0.55} strokeLinecap="round" />
      {/* Bridge under the frames so its ends disappear behind them. */}
      <Line x1={41} y1={37.5} x2={59} y2={37.5} stroke={GOGGLE_FRAME} strokeWidth={5} strokeLinecap="round" />
      {[36, 64].map((cx) => (
        <G key={cx}>
          <Circle cx={cx} cy={36.5} r={9.2} fill={GOGGLE_FRAME} />
          <Circle cx={cx} cy={36.5} r={6.4} fill={GOGGLE_LENS} />
          {/* One swept highlight per lens, both leaning the same way: mirrored highlights read as
              two eyes staring, which is exactly the thing pushing the goggles up avoids. */}
          <Path
            d={`M${cx - 4.4} ${36.5} A 4.6 4.6 0 0 1 ${cx - 0.6} ${32.3}`}
            fill="none"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.75}
          />
        </G>
      ))}
    </G>
  );
}

/**
 * The scientist's face: brows at odds with each other, the far eye narrowed, and a closed mouth
 * pulled off-centre.
 *
 * Everything here is asymmetric on purpose. Concentration is the absence of symmetry — one brow up,
 * one eye lidded, the mouth tilted — where a matched pair of anything reads as posing for the
 * viewer. The lidded eye is on Pip's left (screen right), the same side as the flask he is holding,
 * so the squint has something to be aimed at.
 */
function ScientistFace({ INK }: { INK: string }) {
  return (
    <G testID="pip-scientist-face" accessibilityLabel="Pip in lab goggles, squinting at a flask">
      <G testID="pip-scientist-brows" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round">
        {/* Raised and arched on the open-eye side, flat and low over the squint. */}
        <Path d="M31.5 51.4 Q37.8 46.2 44.3 50" />
        <Path d="M56 51 Q62 49.4 68.2 51.2" />
      </G>

      <G testID="pip-scientist-eyes">
        <Circle cx={38.5} cy={58.5} r={4.8} fill={INK} />
        <Circle cx={40.4} cy={56.4} r={1.6} fill="#fff" />
        <Circle cx={61.5} cy={58.5} r={4.8} fill={INK} />
        <Circle cx={63.4} cy={56.4} r={1.6} fill="#fff" />
        {/* The squint is a lid drawn *over* a full pupil, not a smaller pupil — shrinking the pupil
            would make him look alarmed rather than focused (same rule as the swordsman's open eye). */}
        <Path d="M55.6 56.6 Q61.5 53.4 67.4 57" fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
      </G>

      {/* A closed, off-centre line: pulled up at one end and down at the other, which is the mouth
          of someone checking their work rather than performing for anyone. */}
      <G testID="pip-scientist-mouth">
        <Path d="M41.6 67.6 Q49.5 72.4 57.4 66.6" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      </G>
    </G>
  );
}

/**
 * A stream of bubbles drifting up out of a flask's mouth.
 *
 * The single moving part of the pose, and the reason it reads as *tinkering* rather than as a coin
 * holding props: nothing else on Pip says a reaction is still running. Three bubbles on one shared
 * clock, each offset by a third of the cycle through `Animated.modulo`, so the stream never gaps
 * and never needs three separate loops.
 *
 * Under reduced motion they mount frozen at their three phase positions instead of vanishing — the
 * flask should still look like it is doing something when the animation is off.
 */
function Bubbles({ x, y, color, testID }: { x: number; y: number; color: string; testID: string }) {
  const reducedMotion = useReducedMotion();
  const rise = useRef(new Animated.Value(0)).current;
  const dots = [
    { dx: 0, r: 2.2 },
    { dx: -3.6, r: 1.5 },
    { dx: 3.2, r: 1.8 },
  ];

  useEffect(() => {
    if (reducedMotion) {
      rise.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(rise, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: false, isInteraction: false })
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, rise]);

  if (reducedMotion) {
    return (
      <G testID={testID} fill={color}>
        {dots.map((d, i) => (
          <Circle key={i} cx={x + d.dx} cy={y - i * 6} r={d.r} opacity={0.7 - i * 0.15} />
        ))}
      </G>
    );
  }

  return (
    <G testID={testID}>
      {dots.map((d, i) => {
        // Each bubble runs the same 0->1 ramp a third of a cycle apart; modulo wraps it so the one
        // that reaches the top reappears at the mouth on the next frame.
        const phase = Animated.modulo(
          rise.interpolate({ inputRange: [0, 1], outputRange: [i / dots.length, i / dots.length + 1] }),
          1
        );
        const cy = phase.interpolate({ inputRange: [0, 1], outputRange: [y, y - 17] });
        // Drifts sideways as it climbs, and fades in and out rather than popping at either end.
        const cx = phase.interpolate({ inputRange: [0, 1], outputRange: [x + d.dx, x + d.dx * 1.9 - 1] });
        const opacity = phase.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.85, 0.6, 0] });
        return <AnimatedCircle key={i} cx={cx} cy={cy} r={d.r} opacity={opacity} fill={color} />;
      })}
    </G>
  );
}

/**
 * The conical flask in Pip's right hand (`scientist`), held out past the coin's rim.
 *
 * The brew is a second, inset shape rather than a clipped fill: react-native-svg clipping needs a
 * <Defs>/<ClipPath> registry, and every other "fill inside a fill" in this file (the coin's bevel,
 * the lollipop's bands) is drawn the same way. Its walls follow the body's own taper 1.6 units in,
 * so the glass keeps a visible edge all the way down instead of the liquid touching the outline.
 *
 * The fist grips the neck, not the body — a hand on the bulb would cover the one part of the prop
 * that carries the colour.
 */
function ConicalFlask() {
  return (
    <G testID="pip-scientist-flask">
      <Rect x={80.4} y={55} width={7.2} height={15} rx={1.4} fill={GLASS} stroke={GLASS_EDGE} strokeWidth={1.3} />
      <Rect x={78.2} y={52.4} width={11.6} height={3.8} rx={1.7} fill={GLASS} stroke={GLASS_EDGE} strokeWidth={1.3} />
      <Path
        d="M80.4 69 L72.6 86 Q71.6 88.6 74.4 88.6 L93.6 88.6 Q96.4 88.6 95.4 86 L87.6 69 Z"
        fill={GLASS}
        stroke={GLASS_EDGE}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {/* Surface waves rather than a level line: a flat meniscus reads as a solid block of colour
          poured into a wedge, and the wobble is what says the reaction is live. */}
      <Path
        d="M78.1 77 Q81 75.3 84 76.4 Q87 77.5 89.9 76 L93.8 86 Q94.4 87.3 92.8 87.3 L75.2 87.3 Q73.6 87.3 74.2 86 Z"
        fill={BREW_TEAL}
      />
      <G fill={BREW_TEAL_LIGHT} opacity={0.85}>
        <Circle cx={79.8} cy={83} r={1.6} />
        <Circle cx={86.4} cy={84.6} r={1.2} />
        <Circle cx={88.6} cy={80.4} r={1} />
      </G>
      {/* One sheen down the near wall — the same single-highlight rule the coin's body follows. */}
      <Path d="M79.6 71 L75 81.4" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" opacity={0.5} />
      <Bubbles x={84} y={52} color={BREW_TEAL_LIGHT} testID="pip-scientist-flask-bubbles" />
      <Rect x={78.2} y={59.5} width={12.4} height={11} rx={5} fill={HAND_FILL} stroke={HAND_LINE} strokeWidth={2} />
      <G stroke={HAND_LINE} strokeWidth={1.3} strokeLinecap="round" opacity={0.75}>
        <Line x1={81.6} y1={63.2} x2={87.2} y2={63.2} />
        <Line x1={81.6} y1={66.8} x2={87.2} y2={66.8} />
      </G>
    </G>
  );
}

/**
 * The test tube in Pip's left hand (`scientist`), raised and tilted toward his face.
 *
 * Tilted *inward* by 12°: upright it reads as a specimen on display, and leaning it toward the
 * squint aims the whole pose at one point. The angle is also as far as it can go — the tube's rim
 * corner reaches x≈12 at 12°, and any more swings it out of the 100-unit box and gets clipped.
 *
 * Drawn open-topped (a U, not a rounded rect) because a capsule with two round ends is a pill; the
 * flat rim with a lip above it is the only thing that says the tube can be poured out.
 */
function TestTube() {
  return (
    <G testID="pip-scientist-tube" rotation={12} originX={14} originY={52}>
      <Rect x={6.4} y={26.4} width={15.2} height={3.8} rx={1.7} fill={GLASS} stroke={GLASS_EDGE} strokeWidth={1.3} />
      <Path
        d="M8.6 29.4 L8.6 51 A 5.4 5.4 0 0 0 19.4 51 L19.4 29.4 Z"
        fill={GLASS}
        stroke={GLASS_EDGE}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {/* Inset 1.4 from the tube's inner wall, bottom arc included, for the same reason the flask's
          brew is inset: the glass has to keep an edge the liquid never touches. */}
      <Path d="M10 41.4 Q14 39.8 18 41.4 L18 51 A 4 4 0 0 1 10 51 Z" fill={BREW_VIOLET} />
      <G fill={BREW_VIOLET_LIGHT} opacity={0.85}>
        <Circle cx={12.4} cy={48} r={1.3} />
        <Circle cx={16.2} cy={51.4} r={1} />
      </G>
      <Path d="M11 32 L11 44" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
      <Bubbles x={14} y={26} color={BREW_VIOLET_LIGHT} testID="pip-scientist-tube-bubbles" />
      {/* Inside the rotated group so the grip tilts with what it is gripping, and pinching the top
          third rather than the middle: a fist at the tube's waist covers the violet, which is the
          only thing telling the two pieces of glassware apart at a glance. */}
      <Rect x={7.6} y={33.5} width={12.8} height={11} rx={5} fill={HAND_FILL} stroke={HAND_LINE} strokeWidth={2} />
      <G stroke={HAND_LINE} strokeWidth={1.3} strokeLinecap="round" opacity={0.75}>
        <Line x1={11} y1={37.1} x2={17} y2={37.1} />
        <Line x1={11} y1={40.7} x2={17} y2={40.7} />
      </G>
    </G>
  );
}

/**
 * The eating face: eyes shut in bliss over a mouth caught wide open around a mouthful.
 *
 * The arcs are swept higher and wider than `happy`'s — an eye squeezed shut is what separates
 * *enjoying it* from *pleased about it*, and at this size the sweep is the only thing carrying that
 * difference. The mouth is a filled shape rather than a stroked curve because it has to be open:
 * anything you can see a tongue inside of has to have an inside.
 */
function EatingFace({ INK }: { INK: string }) {
  return (
    <G testID="pip-eating-face" accessibilityLabel="Pip eating a bowl of noodles, eyes shut in delight">
      <G testID="pip-eating-eyes" fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round">
        <Path d="M32.5 55.5 Q39.5 47.5 46.5 55.5" />
        <Path d="M53.5 55.5 Q60.5 47.5 67.5 55.5" />
      </G>
      <G testID="pip-eating-mouth">
        {/* Bottom at y 79.5, inside the bevel's own edge at y≈82.6 — a mouth that reaches the rim
            stops reading as a mouth and starts reading as a bite taken out of the coin. */}
        <Path d="M39.5 64.5 Q50 61.5 60.5 64.5 Q59.5 79.5 50 79.5 Q40.5 79.5 39.5 64.5 Z" fill={INK} />
        <Ellipse cx={50} cy={75.4} rx={5.6} ry={3.4} fill={TONGUE} />
      </G>
    </G>
  );
}

/**
 * The bowl of noodles in Pip's left hand (`eating`), held up against the coin's lower-left.
 *
 * Built back-to-front, and the order is the whole illusion: the heap of noodles goes down first,
 * then the bowl over its base, then the near rim over the bowl. Drawn the other way round the
 * noodles sit on top of the bowl like a hat, and no amount of shading fixes it afterwards.
 *
 * The rim is the front half of an ellipse rather than a whole one — a full ellipse across the top
 * covers the food and turns the bowl into a lidded pot.
 */
function NoodleBowl() {
  return (
    <G testID="pip-eating-bowl">
      <Path
        d="M5.5 72 Q9 62 19 61.5 Q29 62 32.5 72 Z"
        fill={NOODLE}
        stroke={NOODLE_LINE}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {/* Three loose strands over the mound. Curves, not straight hatching: straight lines on a
          dome read as stitching. */}
      <G fill="none" stroke={NOODLE_LINE} strokeWidth={1} strokeLinecap="round" opacity={0.7}>
        <Path d="M9 70 Q13 64.5 18 66" />
        <Path d="M20.5 65.5 Q25.5 64.5 29 69.5" />
        <Path d="M12 71.5 Q19 68 27 71.5" />
      </G>
      {/* Toppings, both sitting proud of the mound's top edge so the heap has a silhouette rather
          than a smooth dome: a fishcake swirl and two scallion slices. */}
      <Circle cx={12.5} cy={66.2} r={3.4} fill="#FFF8EC" stroke={NARUTO_PINK} strokeWidth={1.2} />
      <Path d="M12.5 63.9 Q15 66.2 12.5 68.5 Q11.1 66.2 12.5 63.9 Z" fill={NARUTO_PINK} />
      <Ellipse cx={24} cy={64.8} rx={2.6} ry={1.6} fill={SCALLION} rotation={-18} originX={24} originY={64.8} />
      <Ellipse cx={18.5} cy={68.6} rx={2.2} ry={1.4} fill={SCALLION} rotation={14} originX={18.5} originY={68.6} />

      <Path
        d="M3.5 71 L34.5 71 Q32.5 88 19 88 Q5.5 88 3.5 71 Z"
        fill={BOWL}
        stroke={BOWL_DARK}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* Near rim: the lower half of an ellipse, so the noodles behind it are cut off at the bowl's
          mouth exactly where a real rim would cut them. */}
      <Path d="M3.5 71 A 15.5 3.8 0 0 0 34.5 71 Z" fill={BOWL_LIGHT} stroke={BOWL_DARK} strokeWidth={1.4} />
      <Path
        d="M6.5 79 Q12.5 81.6 19 80 Q25.5 78.4 31.4 81"
        fill="none"
        stroke={BOWL_LIGHT}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.85}
      />
      <Path d="M13.5 87.4 L24.5 87.4 L22.6 91.4 L15.4 91.4 Z" fill={BOWL_DARK} />
      {/* Cupped under the bowl's lower-left, overlapping the wall. Centred beneath the foot instead
          it touches nothing and reads as a loose button below the bowl; on the rim it would cover
          the food, which is the only reason the bowl is in the pose at all. */}
      <Rect x={2.6} y={77.5} width={12.8} height={11} rx={5} fill={HAND_FILL} stroke={HAND_LINE} strokeWidth={2} />
      <G stroke={HAND_LINE} strokeWidth={1.3} strokeLinecap="round" opacity={0.75}>
        <Line x1={6} y1={81.1} x2={12} y2={81.1} />
        <Line x1={6} y1={84.7} x2={12} y2={84.7} />
      </G>
    </G>
  );
}

/**
 * Chopsticks in Pip's right hand with a strand of noodle on the way to his mouth (`eating`).
 *
 * Each stick is two stacked round-capped lines — a dark one at outline width, a wood one over it —
 * the same capsule trick the thumbs-up glove uses, and the only way to get an outlined stick this
 * thin without tracing a four-point path.
 *
 * The tips stop at the corner of the mouth rather than inside it. A stick drawn crossing the lips
 * reads as skewering Pip; a strand of noodle bridging the last few units does the work instead, and
 * it's the strand — not the sticks — that says a mouthful is in progress.
 */
function Chopsticks() {
  return (
    <G testID="pip-eating-chopsticks">
      {[
        { x1: 98, y1: 85.5, x2: 60.5, y2: 66 },
        { x1: 94, y1: 92, x2: 60.5, y2: 69.5 },
      ].map((s, i) => (
        <G key={i}>
          <Line {...s} stroke={CHOPSTICK_LINE} strokeWidth={4.6} strokeLinecap="round" />
          <Line {...s} stroke={CHOPSTICK} strokeWidth={2.8} strokeLinecap="round" />
        </G>
      ))}
      <Rect x={73.6} y={73.5} width={12.8} height={11} rx={5} fill={HAND_FILL} stroke={HAND_LINE} strokeWidth={2} />
      <G stroke={HAND_LINE} strokeWidth={1.3} strokeLinecap="round" opacity={0.75}>
        <Line x1={77} y1={77.1} x2={83} y2={77.1} />
        <Line x1={77} y1={80.7} x2={83} y2={80.7} />
      </G>
      {/* Outlined like the sticks so the strands stay legible over both the gold cheek and the dark
          inside of the mouth they run into. */}
      <G testID="pip-eating-noodle-strands" fill="none" strokeLinecap="round">
        <G stroke={NOODLE_LINE} strokeWidth={3.4}>
          <Path d="M60.8 66.6 Q56 73.5 51.5 67.8" />
          <Path d="M59.6 69.6 Q56.6 76 59.8 79.4" />
        </G>
        <G stroke={NOODLE} strokeWidth={2}>
          <Path d="M60.8 66.6 Q56 73.5 51.5 67.8" />
          <Path d="M59.6 69.6 Q56.6 76 59.8 79.4" />
        </G>
      </G>
    </G>
  );
}

/**
 * Two curls of steam off the bowl (`eating`).
 *
 * Deliberately drawn *over the coin* rather than up the open left margin: white on a page that is
 * near-white in light mode is invisible, and the gold body is the only reliably dark-enough
 * backdrop in both themes. They stop short of x 32 so they never cross an eye.
 */
function Steam() {
  return (
    <G testID="pip-eating-steam" fill="none" stroke="#FFF8EC" strokeWidth={2.2} strokeLinecap="round" opacity={0.5}>
      <Path d="M21.5 62 C17.5 57.5 24 54.5 20.5 50 C18 46.5 21.5 44.5 21.5 42.5" />
      <Path d="M29.5 63 C26.5 58.5 32 55.5 29 51.5 C27 48.5 30 46.5 30 44.5" />
    </G>
  );
}

function Mouth({ expr, INK }: { expr: PipExpr; INK: string }) {
  if (expr === 'happy') return <Path d="M39 63 Q50 78 61 63 Q50 71 39 63 Z" fill={INK} />;
  if (expr === 'proud') return <Path d="M37 62 Q50 80 63 62 Q50 72 37 62 Z" fill={INK} />;
  if (expr === 'think') return <Path d="M44 66 L56 66" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />;
  if (expr === 'curious')
    return <Path d="M45 66 Q50 71 55 66" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />;
  if (expr === 'sheepish')
    return (
      <Path d="M43 68 Q46.5 70.5 50 68 Q53.5 65.5 57 68" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
    );
  if (expr === 'sleepy') return <Ellipse cx={50} cy={69} rx={3.4} ry={2.6} fill={INK} opacity={0.85} />;
  return <Path d="M43 64 Q50 71 57 64" fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />; // idle
}

/**
 * The "he just had an idea" light bulb that sits above Pip's head (docs/ui-engagement-plan.md
 * Step 3). Drawn in its own small Svg stacked above the character rather than inside Pip's
 * 100x100 canvas: the sprout already owns the top of that viewBox and there is no room above
 * y=0 to put a bulb, so extending the canvas would have shrunk Pip himself at every call site.
 *
 * Two beats, both skipped under reduced motion (which mounts the bulb already lit and still):
 * a delayed overshoot pop, so it lands *after* the head has settled and reads as a thought
 * arriving, and a slow glow pulse behind the glass.
 */
function IdeaBulb({ size }: { size: number }) {
  const reducedMotion = useReducedMotion();
  const pop = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    const a = Animated.timing(pop, {
      toValue: 1,
      duration: motionDuration.celebrate,
      delay: 280,
      easing: Easing.out(Easing.back(2.4)),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [pop, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      glow.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow, reducedMotion]);

  // The glass sits at (20, 18.5) in the 40-unit viewBox below, so the halo is centred on that
  // point rather than on the box, which also carries the rays and the screw base.
  const halo = size * 0.72;
  const haloLeft = size * 0.5 - halo / 2;
  const haloTop = size * (18.5 / 40) - halo / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        // Tucks the screw base down against the sprout: the bottom ~15% of the viewBox is
        // deliberately empty so the bulb can overlap that gap instead of floating away.
        marginBottom: -size * 0.14,
        opacity: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
        transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }],
      }}
    >
      <Animated.View
        style={[
          styles.halo,
          {
            left: haloLeft,
            top: haloTop,
            width: halo,
            height: halo,
            borderRadius: halo / 2,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.6] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.14] }) }],
          },
        ]}
      />
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <G stroke={BULB_RAY} strokeWidth={2.1} strokeLinecap="round">
          <Line x1={20} y1={5.3} x2={20} y2={1.5} />
          <Line x1={10.7} y1={9.2} x2={8} y2={6.5} />
          <Line x1={29.3} y1={9.2} x2={32} y2={6.5} />
          <Line x1={7.3} y1={15.1} x2={3.6} y2={14.1} />
          <Line x1={32.7} y1={15.1} x2={36.4} y2={14.1} />
        </G>
        <Circle cx={20} cy={18.5} r={10.5} fill={BULB_GLASS} stroke={BULB_RIM} strokeWidth={1.6} />
        <Ellipse cx={15.5} cy={14} rx={3.2} ry={2} fill="#fff" opacity={0.6} rotation={-35} originX={15.5} originY={14} />
        {/* Filament */}
        <Path
          d="M16.6 19.8 Q18.3 16.6 20 19.8 Q21.7 23 23.4 19.8"
          stroke={BULB_RIM}
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
        />
        <Rect x={14.4} y={27} width={11.2} height={3.4} rx={1.5} fill={BULB_COLLAR} />
        <Rect x={15.4} y={30.8} width={9.2} height={3.2} rx={1.5} fill={BULB_SCREW} />
      </Svg>
    </Animated.View>
  );
}

const HatContext = createContext(false);

/**
 * Puts the straw hat on every <Pip> rendered inside, including the ones nested in <PipSays> on
 * child screens. Scoped this way because the add-a-transaction flow spans eight screens and
 * <PipSays> is shared with screens outside it (Commitments, Owed, the balance scan) — threading a
 * prop would mean touching ~30 call sites and would still put the hat on the wrong ones.
 *
 * An explicit `hat` on a Pip still wins, so a call site inside the flow can opt out.
 */
export function PipWearsHat({ children }: { children: React.ReactNode }) {
  return <HatContext.Provider value={true}>{children}</HatContext.Provider>;
}

export function Pip({
  size = 96,
  expr = 'idle',
  color,
  float = false,
  celebrate = false,
  idea = false,
  glasses = false,
  nerdy = false,
  sassy = false,
  swordsman = false,
  scientist = false,
  eating = false,
  hat,
  propellerHat = false,
  partyHat = false,
}: {
  size?: number;
  expr?: PipExpr;
  color?: string;
  float?: boolean;
  /** One-shot sparkle burst for a reward moment (docs/ui-engagement-plan.md Step 3: the Saved
   *  screen's reveal). Fires whenever this flips to true; does nothing on `false` or while it
   *  stays true. Skipped entirely under reduced motion. */
  celebrate?: boolean;
  /** Draws a lit bulb above Pip's head. Pairs with `expr="think"`, and adds roughly 38% of
   *  `size` to the rendered height, so a caller that swaps it on and off mid-screen should
   *  reserve the taller box (see NotificationsStep) rather than let the layout jump. */
  idea?: boolean;
  /** The "cool" pose (the widget step's hero): shades, brows, a toothy grin, and a floating
   *  thumbs-up either side. It replaces the whole face, so `expr` is ignored while it's on.
   *  Stays inside the same 100x100 box — the hands fill margin the coin never used — so turning
   *  it on doesn't change the rendered size. */
  glasses?: boolean;
  /** The "nerd" pose (the empty-state hero): big eyes, a simple smile, cheek freckles, and a
   *  held rainbow lollipop. Also replaces the whole face, so `expr` is ignored while it's on. */
  nerdy?: boolean;
  /** Appearance-screen beauty pose with closed lashes and glossy lips.
   *  Like the glasses/nerdy poses it owns the full face, so `expr` is ignored while it is on. */
  sassy?: boolean;
  /** The swordsman pose (the demo step's opening hero): a green bandana, three earrings, a scarred
   *  shut eye, two sheathed katana crossed behind the coin and a third held in his teeth. Owns the
   *  face like the other poses, so `expr` is ignored, and the head too — the bandana takes the slot
   *  `hat`/`propellerHat` would use. Stays inside the same 100x100 box: the swords run out to the
   *  corners the coin never fills, so turning it on doesn't change the rendered size. */
  swordsman?: boolean;
  /** The scientist pose: lab goggles pushed up on the forehead, a squint and a tongue-tip out, a
   *  bubbling conical flask in one fist and a tilted test tube in the other. Owns the face like the
   *  other poses, so `expr` is ignored, and the head too — the goggles take the slot
   *  `hat`/`propellerHat` would use. Stays inside the same 100x100 box: the glassware fills the
   *  side margins the coin never reaches, so turning it on doesn't change the rendered size. The
   *  bubbles are the one animated part, and they hold still under reduced motion. */
  scientist?: boolean;
  /** The eating pose: eyes shut in bliss, mouth open around a mouthful, a bowl of noodles held in
   *  one fist and chopsticks lifting a strand in the other. Owns the face, so `expr` is ignored,
   *  but not the head — this one still wears a hat, because a Pip eating lunch in a straw hat is a
   *  better joke than one that quietly takes it off. Stays inside the same 100x100 box. */
  eating?: boolean;
  /** Straw hat. Leave undefined to inherit from <PipWearsHat> (which is how the whole
   *  add-a-transaction flow gets it); pass `false` to opt a single Pip out inside that flow. */
  hat?: boolean;
  /** A color-blocked party cap. Takes over the head slot from `hat`/`PipWearsHat` entirely while
   *  on — a coin only wears one hat at a time. */
  propellerHat?: boolean;
  /** A 🥳 cone: blue with white dots and a gold brim. Takes the head slot like `propellerHat`,
   *  and hides the sprout so the cone can sit on the coin. Does not own the face — pair it with
   *  `expr` (the Pro welcome uses `proud`). */
  partyHat?: boolean;
}) {
  // The body is the coin, not the accent: Pip is one fixed character everywhere rather than a
  // shape that recolours per preset. `fill` is the bevel (COIN_FACE), because that disc is what
  // the face sits on and what BlinkCover paints over the eyes mid-blink.
  const fill = color ?? COIN_FACE;
  // Eyes and mouth must always contrast against the body; the structural ink flips to near-white
  // in dark mode (unusable on gold), so use the coin's own brown, or derive one when a caller
  // overrides the body colour.
  const INK = color ? shade(color, 0.38) : COIN_INK;
  const ty = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  // Read unconditionally — `hat ?? useContext(...)` would short-circuit the hook away whenever the
  // prop is passed, changing hook order between renders.
  const hatFromFlow = useContext(HatContext);
  const wearsHat = hat ?? hatFromFlow;

  useEffect(() => {
    if (!shouldUsePipJsFloat(Platform.OS, float, reducedMotion)) {
      ty.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ty, {
          toValue: -4,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(ty, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float, reducedMotion, ty]);

  // Micro-idle: a blink every 4-7s, randomised so two Pips on screen never sync up. The single
  // cheapest cue that reads as "alive" (docs/ui-engagement-plan.md §2.1).
  useEffect(() => {
    if (reducedMotion || glasses || nerdy || sassy || swordsman || scientist || eating || !BLINKABLE.includes(expr)) {
      blink.setValue(0);
      return;
    }
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      timeout = setTimeout(() => {
        if (cancelled) return;
        Animated.sequence([
          Animated.timing(blink, { toValue: 1, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: false }),
          Animated.timing(blink, { toValue: 0, duration: 90, easing: Easing.in(Easing.quad), useNativeDriver: false }),
        ]).start(({ finished }) => {
          if (finished && !cancelled) scheduleBlink();
        });
      }, 4000 + Math.random() * 3000);
    };
    scheduleBlink();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      blink.setValue(0);
    };
  }, [expr, reducedMotion, glasses, nerdy, sassy, swordsman, scientist, eating, blink]);

  useEffect(() => {
    if (!celebrate || reducedMotion) {
      burst.setValue(0);
      return;
    }
    burst.setValue(0);
    Animated.timing(burst, {
      toValue: 1,
      duration: motionDuration.celebrate,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [celebrate, reducedMotion, burst]);

  return (
    <Animated.View
      renderToHardwareTextureAndroid={float}
      shouldRasterizeIOS={float}
      style={[
        { alignItems: 'center' },
        Platform.OS === 'web' && float && !reducedMotion
          ? (PIP_WEB_FLOAT_STYLE as never)
          : { transform: [{ translateY: ty }] },
      ]}
    >
      {idea && <IdeaBulb size={size * 0.44} />}
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* shadow */}
        <Ellipse cx={50} cy={92} rx={22} ry={4.5} fill="rgba(16,40,28,0.12)" />

        {/* Behind everything, including the sprout. */}
        {sassy && <SassyGlow />}

        {/* sprout — green regardless of body colour, same two-tone leaves as the coin.
            Hidden under `partyHat` so the cone can sit on the head instead of hovering
            above the plant. */}
        {partyHat ? null : (
          <G testID="pip-sprout">
            <Path d="M50 26 C50 18 50 14 50 12" stroke={LEAF_STEM} strokeWidth={3.2} fill="none" strokeLinecap="round" />
            <Ellipse cx={42} cy={15} rx={7.5} ry={4.2} fill={LEAF_LEFT} rotation={-32} originX={42} originY={15} />
            <Ellipse cx={58} cy={13} rx={8.5} ry={4.6} fill={LEAF_RIGHT} rotation={28} originX={58} originY={13} />
          </G>
        )}

        {/* Before the body: the crossed swords are worn on the back, so the coin has to hide their
            middles. After the sprout, so the leaves stay in front of the hilts rather than being
            sliced by them. */}
        {swordsman && <BackSwords />}

        {/* body — coin rim, then the bevel disc the face sits on (coin geometry scaled by
            33/15.5 from the 56 viewBox the artwork was originally drawn in) */}
        <Circle cx={50} cy={56} r={33} fill={color ? shade(fill, 0.93) : COIN_RIM} />
        <Circle cx={50} cy={56} r={26.6} fill={fill} />
        <Circle cx={50} cy={56} r={26.6} fill="none" stroke={color ? shade(fill, 0.8) : COIN_BEVEL} strokeWidth={2.6} />
        {/* top highlight */}
        <Ellipse cx={35} cy={42} rx={8.5} ry={4.9} fill="rgba(255,255,255,0.23)" rotation={-26} originX={35} originY={42} />
        {/* blush */}
        <Ellipse cx={32} cy={60.3} rx={5.3} ry={3.4} fill={BLUSH} opacity={0.3} />
        <Ellipse cx={68} cy={60.3} rx={5.3} ry={3.4} fill={BLUSH} opacity={0.3} />

        {/* After the body so the brim sits over the head, but before the face, which it never
            reaches — the sprout above it is drawn earlier and stays clear of the crown.
            `propellerHat` / `partyHat` take the head slot outright — a coin only wears one hat. */}
        {swordsman ? (
          <Bandana />
        ) : scientist ? (
          <LabGoggles />
        ) : partyHat ? (
          <PartyHat />
        ) : propellerHat ? (
          <PropellerCap />
        ) : (
          wearsHat && <StrawHat />
        )}

        {/* Each special pose owns the whole face, so `expr` and everything keyed off it (the
            sheepish sweat drop, sleepy Zs, and blinking) stays inside the plain branch rather
            than leaking a second mood on top of the pose. */}
        {swordsman ? (
          <>
            <SwordsmanFace INK={INK} />
            {/* The same block of teeth the cool pose grins with — here it is what the blade is
                bitten between, so the katana below has to be drawn after it. */}
            <Grin INK={INK} />
            <Earrings />
          </>
        ) : scientist ? (
          <ScientistFace INK={INK} />
        ) : eating ? (
          <EatingFace INK={INK} />
        ) : sassy ? (
          <SassyFace />
        ) : glasses ? (
          <>
            <Brows INK={INK} />
            <Sunglasses />
            <Grin INK={INK} />
          </>
        ) : nerdy ? (
          <>
            <NerdEyes INK={INK} />
            <Path d="M41 65 Q50 73 59 65" fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />
            {/* Cheek freckles, drawn over the ambient blush so they read as raised spots rather
                than smudges. */}
            <Circle cx={30.5} cy={68} r={1.3} fill={PIMPLE} opacity={0.85} />
            <Circle cx={69.5} cy={68} r={1.3} fill={PIMPLE} opacity={0.85} />
          </>
        ) : (
          <>
            {expr === 'sheepish' && <Ellipse cx={70} cy={40} rx={2.1} ry={3} fill="rgba(140,195,255,0.85)" />}
            <Eyes expr={expr} INK={INK} />
            <BlinkCover expr={expr} fill={fill} blink={blink} />
            <Mouth expr={expr} INK={INK} />
            {expr === 'sleepy' && (
              <>
                <Path
                  d="M74 26 L81 26 L74 32 L81 32"
                  stroke={INK}
                  strokeWidth={1.6}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.7}
                />
                <Path
                  d="M79 18 L85.5 18 L79 23.5 L85.5 23.5"
                  stroke={INK}
                  strokeWidth={1.3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.55}
                />
                <Path
                  d="M84 11.5 L89 11.5 L84 16 L89 16"
                  stroke={INK}
                  strokeWidth={1}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.4}
                />
              </>
            )}
          </>
        )}

        {/* After the body, so each fist overlaps the rim it sits against instead of butting into
            it. Before the sparkles, which should read over everything. */}
        {glasses && <Hands />}
        {nerdy && <Lollipop />}
        {swordsman && <MouthKatana />}
        {scientist && (
          <>
            <TestTube />
            <ConicalFlask />
          </>
        )}
        {eating && (
          <>
            {/* Chopsticks before the bowl only because the right hand is the busier shape; the
                steam goes last, over everything, since it is the one thing in front of the face. */}
            <Chopsticks />
            <NoodleBowl />
            <Steam />
          </>
        )}

        {SPARKLES.map((s, i) => {
          const cx = burst.interpolate({ inputRange: [0, 1], outputRange: [s.x0, s.x1] });
          const cy = burst.interpolate({ inputRange: [0, 1], outputRange: [s.y0, s.y1] });
          const r = burst.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 2.6, 0] });
          const opacity = burst.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 1, 0] });
          // Warm white, not gold: the burst starts at the body's edge, and gold-on-gold would
          // swallow the first frames of the payoff now that the body is a coin.
          return <AnimatedCircle key={i} cx={cx} cy={cy} r={r} opacity={opacity} fill="#FFFBEA" />;
        })}

      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  halo: { position: 'absolute', backgroundColor: 'rgba(255, 205, 90, 0.5)' },
});
