import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { useAccent } from '../state/accent';
import { useResolvedScheme, useThemeColors } from '../state/colorScheme';

/**
 * An on-brand, illustrative icon for the "Widget mascot" setting row.
 * Combines:
 * 1. A miniature home-screen widget card container with soft card bevel and vertical slot divider.
 * 2. Pip the coin mascot with botanical seedling sprout, golden face, and friendly smile.
 * 3. The signature quick-record action button with the upward arrow in the right slot.
 * 4. A crisp customization magic sparkle badge at the top-right corner.
 */
export function WidgetCustomizerBadge({
  size = 38,
  rad = 11,
}: {
  size?: number;
  rad?: number;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const isDark = useResolvedScheme() === 'dark';

  return (
    <Svg width={size} height={size} viewBox="0 0 38 38" fill="none">
      {/* 1. Base badge container with theme-reactive wash */}
      <Rect width="38" height="38" rx={rad} fill={theme.accentTint} />
      <Rect
        x="0.5"
        y="0.5"
        width="37"
        height="37"
        rx={rad - 0.5}
        stroke={theme.accentSoft}
        strokeWidth="1"
      />

      {/* 2. Miniature Widget Card Shell */}
      <Rect
        x="4"
        y="7"
        width="30"
        height="24"
        rx="6"
        fill={colorTheme.surface}
      />
      <Rect
        x="4.5"
        y="7.5"
        width="29"
        height="23"
        rx="5.5"
        stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,40,30,0.09)'}
        strokeWidth="1"
      />

      {/* 3. Subtle vertical divider in widget */}
      <Line
        x1="21"
        y1="10.5"
        x2="21"
        y2="27.5"
        stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,40,30,0.08)'}
        strokeWidth="0.9"
        strokeLinecap="round"
      />

      {/* 4. Pip the Mascot (Left Half) */}
      <G>
        {/* Soft ground shadow */}
        <Ellipse
          cx="12.5"
          cy="27"
          rx="6"
          ry="1.4"
          fill={isDark ? 'rgba(0,0,0,0.4)' : 'rgba(20,40,30,0.1)'}
        />

        {/* Botanical Seedling Sprout */}
        <Path
          d="M12.5 15.5 C12.5 13.8 12.5 12.5 12.5 11.5"
          stroke="#185E3E"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <Ellipse
          cx="10.8"
          cy="12.2"
          rx="2.2"
          ry="1.3"
          fill="#1C7A4E"
          transform="rotate(-30 10.8 12.2)"
        />
        <Ellipse
          cx="14.2"
          cy="11.8"
          rx="2.5"
          ry="1.4"
          fill="#2AAB68"
          transform="rotate(25 14.2 11.8)"
        />
        <Circle cx="13.2" cy="11.5" r="0.45" fill="#FFFFFF" opacity="0.9" />

        {/* Golden Coin Base */}
        <Circle cx="12.5" cy="20" r="6.8" fill="#F5B42A" />
        <Circle cx="12.5" cy="20" r="5.5" fill="#FAC438" />
        <Circle
          cx="12.5"
          cy="20"
          r="5.5"
          stroke="#D99E18"
          strokeWidth="0.7"
          fill="none"
        />

        {/* Highlight sheen */}
        <Ellipse
          cx="10"
          cy="17.2"
          rx="1.8"
          ry="1"
          fill="#FFFFFF"
          opacity="0.45"
          transform="rotate(-28 10 17.2)"
        />

        {/* Rosy blush cheeks */}
        <Ellipse cx="8.8" cy="20.8" rx="1.1" ry="0.7" fill="#F07828" opacity="0.45" />
        <Ellipse cx="16.2" cy="20.8" rx="1.1" ry="0.7" fill="#F07828" opacity="0.45" />

        {/* Cheerful Eyes with catchlights */}
        <Circle cx="10.8" cy="19" r="0.8" fill="#7A4800" />
        <Circle cx="14.2" cy="19" r="0.8" fill="#7A4800" />
        <Circle cx="11.1" cy="18.7" r="0.25" fill="#FFFFFF" />
        <Circle cx="14.5" cy="18.7" r="0.25" fill="#FFFFFF" />

        {/* Warm friendly smile */}
        <Path
          d="M11.4 21.2 C12.1 22 12.9 22 13.6 21.2"
          stroke="#7A4800"
          strokeWidth="0.75"
          strokeLinecap="round"
          fill="none"
        />
      </G>

      {/* 5. Quick-Record Action Button (Right Half) */}
      <G>
        <Circle
          cx="27"
          cy="19"
          r="4.4"
          fill={theme.accentSoft}
          stroke={theme.accent}
          strokeWidth="0.7"
        />
        <Path
          d="M27 16.5 L25.2 18.5 M27 16.5 L28.8 18.5 M27 16.5 L27 21.5"
          stroke={theme.accentInk}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>

      {/* 6. Customization Magic Sparkle Badge (Floating at Top-Right Corner) */}
      <G transform="translate(30.5, 5)">
        <Circle cx="0" cy="0" r="3.6" fill={theme.accentInk} />
        <Path
          d="M0 -2.3 C0 -0.6 0.5 0 2.3 0 C0.5 0 0 0.6 0 2.3 C0 0.6 -0.5 0 -2.3 0 C-0.5 0 0 -0.6 0 -2.3 Z"
          fill="#FFFFFF"
        />
      </G>
    </Svg>
  );
}
