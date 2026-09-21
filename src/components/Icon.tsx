import React, { useContext } from 'react';
import Svg, { Circle, Line, Path, Rect, G } from 'react-native-svg';
import { colors } from '../theme';
import { OnAccentFillCtx } from '../state/onAccentFill';
import { useThemeColors } from '../state/colorScheme';

/**
 * Monoline icon set ported from the design (icons.jsx). Stroked glyphs on a
 * 24x24 grid; a few use solid fills (play, dots, sparkles, wallet dot).
 */
export type IconName =
  | 'fuel' | 'cart' | 'utensils' | 'car' | 'coffee' | 'bag' | 'heart' | 'receipt' | 'play' | 'dots'
  | 'camera' | 'image' | 'plus' | 'check' | 'sparkles' | 'x' | 'chevronRight' | 'chevronLeft'
  | 'chevronDown' | 'chevronUp' | 'scan' | 'trending' | 'clock' | 'arrowRight' | 'search' | 'gallery' | 'wallet'
  | 'trash' | 'sliders' | 'gear' | 'alert' | 'pencil' | 'gift' | 'return' | 'percent'
  | 'home' | 'scale' | 'signal' | 'book' | 'shield' | 'store' | 'download' | 'file' | 'table'
  | 'copy' | 'upload' | 'code' | 'pin' | 'chart' | 'filter' | 'share' | 'folder'
  | 'burger' | 'food' | 'phone' | 'cash' | 'banknote' | 'swap' | 'calendar'
  | 'gym' | 'plane' | 'pet' | 'gamepad' | 'users' | 'pill';

type RenderFn = (stroke: string, sw: number) => React.ReactNode;

const ICONS: Record<IconName, RenderFn> = {
  fuel: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={4} y={3} width={9} height={18} rx={1.6} />
      <Line x1={3} y1={21} x2={14} y2={21} />
      <Rect x={6.2} y={6} width={4.6} height={3.6} rx={1} />
      <Path d="M13 8h2.6a1.6 1.6 0 011.6 1.6V16a1.5 1.5 0 003 0V9.3L17.6 6.6" />
    </G>
  ),
  cart: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={9} cy={20} r={1.4} />
      <Circle cx={17} cy={20} r={1.4} />
      <Path d="M2.5 4H5l2.1 10.7a1.5 1.5 0 001.5 1.2h7.6a1.5 1.5 0 001.5-1.1L20.5 7.5H6" />
    </G>
  ),
  utensils: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M6 3v4a2 2 0 002 2 2 2 0 002-2V3" />
      <Path d="M8 9v12" />
      <Path d="M17 3c-1.6 1.6-1.6 6.4 0 8v10" />
    </G>
  ),
  car: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 11l1.8-4a2 2 0 011.9-1.2h6.6A2 2 0 0117.2 7L19 11" />
      <Rect x={3} y={11} width={18} height={6} rx={2} />
      <Circle cx={7.5} cy={17.5} r={1.5} />
      <Circle cx={16.5} cy={17.5} r={1.5} />
    </G>
  ),
  coffee: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 9h11v5.5a4 4 0 01-4 4H9a4 4 0 01-4-4V9z" />
      <Path d="M16 10.5h1.8a2.4 2.4 0 010 4.8H16" />
      <Path d="M8.5 3v2.2M11.5 3v2.2" />
    </G>
  ),
  bag: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M6.2 8h11.6l-1 11a2 2 0 01-2 1.8H9.2A2 2 0 017.2 19L6.2 8z" />
      <Path d="M9 8V6.2a3 3 0 016 0V8" />
    </G>
  ),
  heart: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 20.5S4 15 4 9.2A3.8 3.8 0 0112 7a3.8 3.8 0 018 2.2C20 15 12 20.5 12 20.5z" />
      <Path d="M7.5 11.5h2l1.3-2.4 1.8 4 1.2-1.6h2.7" />
    </G>
  ),
  receipt: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5.5 3h13v18l-2.4-1.4-2.3 1.4-2.3-1.4-2.3 1.4L5.5 21V3z" />
      <Path d="M9 8h6M9 12h6" />
    </G>
  ),
  play: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M10 8.3l5.4 3.7L10 15.7V8.3z" fill={s} stroke="none" />
    </G>
  ),
  dots: (s) => (
    <G fill={s} stroke="none">
      <Circle cx={6} cy={12} r={1.7} />
      <Circle cx={12} cy={12} r={1.7} />
      <Circle cx={18} cy={12} r={1.7} />
    </G>
  ),
  camera: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M3 8.5A2 2 0 015 6.5h2L8.3 4.3a1 1 0 01.85-.5h5.7a1 1 0 01.85.5L17 6.5h2a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2V8.5z" />
      <Circle cx={12} cy={12.5} r={3.5} />
    </G>
  ),
  image: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={3} y={4} width={18} height={16} rx={2.6} />
      <Circle cx={8.5} cy={9.5} r={1.7} />
      <Path d="M4 18.5l5-4.6 3.4 2.7 3-2.7 4.6 4.2" />
    </G>
  ),
  plus: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 5v14M5 12h14" />
    </G>
  ),
  check: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 12.5l4.4 4.4L19 7" />
    </G>
  ),
  sparkles: (s) => (
    <G fill={s} stroke="none">
      <Path d="M12 3.6c.6 4.2 1 4.7 5.4 5.4-4.4.7-4.8 1.2-5.4 5.4-.6-4.2-1-4.7-5.4-5.4 4.4-.7 4.8-1.2 5.4-5.4z" />
      <Path d="M18 14.5c.3 1.8.5 2 2.3 2.3-1.8.3-2 .5-2.3 2.3-.3-1.8-.5-2-2.3-2.3 1.8-.3 2-.5 2.3-2.3z" />
    </G>
  ),
  x: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M6 6l12 12M18 6L6 18" />
    </G>
  ),
  chevronRight: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M9 5l7 7-7 7" />
    </G>
  ),
  chevronLeft: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M15 5l-7 7 7 7" />
    </G>
  ),
  chevronDown: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 9l7 7 7-7" />
    </G>
  ),
  chevronUp: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 15l7-7 7 7" />
    </G>
  ),
  scan: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 8.5V6a2 2 0 012-2h2.5M15.5 4H18a2 2 0 012 2v2.5M20 15.5V18a2 2 0 01-2 2h-2.5M8.5 20H6a2 2 0 01-2-2v-2.5" />
      <Path d="M4 12h16" />
    </G>
  ),
  trending: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M3 17l6-6 4 4 7-7" />
      <Path d="M16.5 8H21v4.5" />
    </G>
  ),
  clock: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={12} cy={12} r={8.2} />
      <Path d="M12 7.5v5l3.2 2" />
    </G>
  ),
  arrowRight: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 12h13M12.5 6l6 6-6 6" />
    </G>
  ),
  search: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={11} cy={11} r={6} />
      <Path d="M19.5 19.5L16 16" />
    </G>
  ),
  gallery: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={3} y={3} width={18} height={18} rx={3} />
      <Circle cx={9} cy={9} r={2} />
      <Path d="M4 17l4.5-4 4 3.2 3-2.7L20 17" />
    </G>
  ),
  wallet: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={3} y={6} width={18} height={13} rx={3} />
      <Path d="M3 10.5h18" />
      <Circle cx={16.5} cy={14.8} r={1.2} fill={s} stroke="none" />
    </G>
  ),
  trash: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 7h16" />
      <Path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
      <Path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" />
      <Path d="M10 11v6M14 11v6" />
    </G>
  ),
  sliders: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 7h9M17 7h3" />
      <Circle cx={14.5} cy={7} r={2} />
      <Path d="M4 17h3M11 17h9" />
      <Circle cx={8.5} cy={17} r={2} />
    </G>
  ),
  filter: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M3 4.5h18l-7 8.2V19l-4 2v-8.3L3 4.5z" />
    </G>
  ),
  gear: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </G>
  ),
  alert: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 4L21.5 19.5H2.5L12 4z" />
      <Path d="M12 10v4.2" />
      <Path d="M12 17.4v.01" />
    </G>
  ),
  pencil: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 20h4L18.5 9.5a2 2 0 000-2.8l-1.2-1.2a2 2 0 00-2.8 0L4 16v4z" />
      <Path d="M13.5 6.5l4 4" />
    </G>
  ),
  gift: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={4} y={10} width={16} height={10} rx={1.5} />
      <Rect x={3} y={7} width={18} height={3.5} rx={1} />
      <Path d="M12 7v13" />
      <Path d="M12 7S10.5 3.5 8.5 4.2 8 7 12 7z" />
      <Path d="M12 7s1.5-3.5 3.5-2.8S16 7 12 7z" />
    </G>
  ),
  return: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M9 7L5 11l4 4" />
      <Path d="M5 11h9a5 5 0 015 5v2" />
    </G>
  ),
  percent: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M19 5L5 19" />
      <Circle cx={7.5} cy={7.5} r={2.5} />
      <Circle cx={16.5} cy={16.5} r={2.5} />
    </G>
  ),
  home: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 11l8-6 8 6" />
      <Path d="M6 10v9h12v-9" />
      <Path d="M10 19v-5h4v5" />
    </G>
  ),
  scale: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 4v16" />
      <Path d="M6 7h12" />
      <Path d="M6 7l-3 6a3 3 0 006 0z" />
      <Path d="M18 7l-3 6a3 3 0 006 0z" />
      <Path d="M8 20h8" />
    </G>
  ),
  signal: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5.5 15.5a9 9 0 0113 0" />
      <Path d="M8.5 18.5a5 5 0 017 0" />
      <Path d="M2.5 12.5a13 13 0 0119 0" />
      <Circle cx={12} cy={20.5} r={0.9} fill={s} stroke="none" />
    </G>
  ),
  book: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 4.5h6a2.5 2.5 0 012.5 2.5v12A2 2 0 0010.5 17.5H4V4.5z" />
      <Path d="M20 4.5h-6A2.5 2.5 0 0011.5 7v12a2 2 0 012-1.5H20V4.5z" />
    </G>
  ),
  shield: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 3l7 2.8v5.6c0 4.3-2.9 7.6-7 9.1-4.1-1.5-7-4.8-7-9.1V5.8L12 3z" />
      <Path d="M9 12l2.2 2.2L15.5 10" />
    </G>
  ),
  store: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 4.5h16l1.2 4.2a3 3 0 01-5.8 1.1 3 3 0 01-5.8 0 3 3 0 01-5.8-1.1L4 4.5z" />
      <Path d="M5 10.5V20h14v-9.5" />
      <Path d="M9.5 20v-5h5v5" />
    </G>
  ),
  download: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <Path d="M7 10l5 5 5-5" />
      <Line x1={12} y1={15} x2={12} y2={3} />
    </G>
  ),
  file: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <Path d="M14 2v6h6" />
      <Line x1={16} y1={13} x2={8} y2={13} />
      <Line x1={16} y1={17} x2={8} y2={17} />
    </G>
  ),
  table: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={3} y={3} width={18} height={18} rx={2} />
      <Line x1={3} y1={9} x2={21} y2={9} />
      <Line x1={3} y1={15} x2={21} y2={15} />
      <Line x1={9} y1={3} x2={9} y2={21} />
      <Line x1={15} y1={3} x2={15} y2={21} />
    </G>
  ),
  copy: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={8} y={8} width={13} height={13} rx={2} />
      <Path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3" />
    </G>
  ),
  upload: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <Path d="M17 8l-5-5-5 5" />
      <Line x1={12} y1={3} x2={12} y2={15} />
    </G>
  ),
  code: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M8 6L3 12l5 6" />
      <Path d="M16 6l5 6-5 6" />
    </G>
  ),
  pin: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 2a5 5 0 00-5 5c0 3.2 3.4 6.7 4.3 7.6a1 1 0 001.4 0C13.6 13.7 17 10.2 17 7a5 5 0 00-5-5z" />
      <Circle cx={12} cy={7} r={2} />
      <Line x1={12} y1={14.6} x2={12} y2={22} />
    </G>
  ),
  chart: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M18 20V10" />
      <Path d="M12 20V4" />
      <Path d="M6 20V14" />
    </G>
  ),
  share: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.6} y1={13.5} x2={15.4} y2={17.5} />
      <Line x1={15.4} y1={6.5} x2={8.6} y2={10.5} />
    </G>
  ),
  folder: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </G>
  ),
  burger: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 12a2 2 0 01-2-2 9 7 0 0118 0 2 2 0 01-2 2l-3.5 4.1c-.8 1-2.4 1.1-3.4.3L7 12" />
      <Path d="M11.7 16H4a2 2 0 010-4h16a2 2 0 010 4h-4.3" />
      <Path d="M5 16a2 2 0 00-2 2c0 1.7 1.3 3 3 3h12c1.7 0 3-1.3 3-3a2 2 0 00-2-2" />
    </G>
  ),
  food: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 12a2 2 0 01-2-2 9 7 0 0118 0 2 2 0 01-2 2l-3.5 4.1c-.8 1-2.4 1.1-3.4.3L7 12" />
      <Path d="M11.7 16H4a2 2 0 010-4h16a2 2 0 010 4h-4.3" />
      <Path d="M5 16a2 2 0 00-2 2c0 1.7 1.3 3 3 3h12c1.7 0 3-1.3 3-3a2 2 0 00-2-2" />
    </G>
  ),
  phone: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </G>
  ),
  cash: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M6 15H3.8A1.8 1.8 0 012 13.2V6.8A1.8 1.8 0 013.8 5h12.4A1.8 1.8 0 0118 6.8V9" />
      <Rect x={6} y={9} width={16} height={10} rx={1.8} />
      <Circle cx={14} cy={14} r={2.2} />
    </G>
  ),
  banknote: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={2} y={6} width={20} height={12} rx={2.2} />
      <Circle cx={12} cy={12} r={2.5} />
      <Line x1={6} y1={12} x2={6.01} y2={12} strokeWidth={w + 0.4} />
      <Line x1={18} y1={12} x2={18.01} y2={12} strokeWidth={w + 0.4} />
    </G>
  ),
  swap: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 8h14.5M15 4.5L18.5 8 15 11.5" />
      <Path d="M20 16H5.5M9 12.5L5.5 16 9 19.5" />
    </G>
  ),
  calendar: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={3} y={5} width={18} height={16} rx={2.5} />
      <Line x1={3} y1={10} x2={21} y2={10} />
      <Line x1={8} y1={3} x2={8} y2={7} />
      <Line x1={16} y1={3} x2={16} y2={7} />
    </G>
  ),
  gym: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M7.5 9.5v5M16.5 9.5v5" />
      <Path d="M5 8.2v7.6M19 8.2v7.6" />
      <Path d="M7.5 12h9" />
      <Path d="M3.5 10.2v3.6M20.5 10.2v3.6" />
    </G>
  ),
  plane: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </G>
  ),
  pet: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={7} cy={8} r={1.7} />
      <Circle cx={17} cy={8} r={1.7} />
      <Circle cx={5.2} cy={12.2} r={1.5} />
      <Circle cx={18.8} cy={12.2} r={1.5} />
      <Path d="M9.2 14.2c0-1.7 1.2-2.8 2.8-2.8s2.8 1.1 2.8 2.8c0 1.6-1.1 2.6-1.9 3.5-.4.4-1.4.4-1.8 0-.8-.9-1.9-1.9-1.9-3.5z" />
    </G>
  ),
  gamepad: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M7.5 8h9a4.5 4.5 0 014.3 5.8l-.8 2.8A2.6 2.6 0 0117.5 18.5h-1.2a2 2 0 01-1.7-1l-.5-.8a1.6 1.6 0 00-1.4-.8h-1.4a1.6 1.6 0 00-1.4.8l-.5.8a2 2 0 01-1.7 1H6.5a2.6 2.6 0 01-2.5-1.9l-.8-2.8A4.5 4.5 0 017.5 8z" />
      <Path d="M8.2 12.2h3.2M9.8 10.6v3.2" />
      <Circle cx={14.8} cy={11.4} r={0.9} fill={s} stroke="none" />
      <Circle cx={16.8} cy={13.4} r={0.9} fill={s} stroke="none" />
    </G>
  ),
  users: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={9} cy={8} r={3} />
      <Path d="M3.5 19.5c.4-3.4 2.6-5 5.5-5s5.1 1.6 5.5 5" />
      <Circle cx={16.5} cy={9} r={2.4} />
      <Path d="M14.2 14.4c1.7-.7 3.5-.5 4.8.6.9.8 1.5 2 1.7 3.5" />
    </G>
  ),
  pill: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M8.4 4.8a4.2 4.2 0 015.9 0l4.9 4.9a4.2 4.2 0 11-5.9 5.9L8.4 10.7a4.2 4.2 0 010-5.9z" />
      <Path d="M10.2 12.5l5.3-5.3" />
    </G>
  ),
};

export function Icon({
  name,
  size = 22,
  stroke = 1.8,
  color,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const colorTheme = useThemeColors();
  const onAccentFill = useContext(OnAccentFillCtx);
  const passed = color ?? colorTheme.ink;
  const lowered = passed.toLowerCase();
  const isHardcodedWhite = lowered === '#fff' || lowered === '#ffffff' || lowered === colors.onAccent.toLowerCase();
  const render = ICONS[name] ?? ICONS.dots;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {render(onAccentFill && isHardcodedWhite ? onAccentFill : passed, stroke)}
    </Svg>
  );
}
