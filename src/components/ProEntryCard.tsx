import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAccent } from '../state/accent';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';

const FREE_ART = require('../../assets/pro/free-starseed.png');
const PRO_ART = require('../../assets/pro/active-bloom-medal.png');

/** How far the face sits above its base. Pressing closes the gap, so the card reads as a key
 *  being pushed down rather than just dimming. */
const DEPTH = 5;

/**
 * The Settings entry into Pip Pro, drawn as a raised, lit tile: a diagonal accent gradient for
 * the body, a soft radial specular in the top-left, a glossy band across the upper half and a
 * shaded lower edge, all sitting on a darker base that shows as a ledge underneath.
 */
export function ProEntryCard({
  isPro,
  title,
  subtitle,
  cta,
  onPress,
}: {
  isPro: boolean;
  title: string;
  subtitle: string;
  cta?: string;
  onPress: () => void;
}) {
  const accent = useAccent();
  return (
    <Pressable
      testID="settings-pro"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={styles.wrap}
    >
      {({ pressed }) => (
        <View style={[styles.base, { backgroundColor: accent.accentInk, shadowColor: accent.accentInk }, pressed && styles.basePressed]}>
          <View style={[StyleSheet.absoluteFill, styles.baseShade]} />
          <View style={[styles.face, { transform: [{ translateY: pressed ? 0 : -DEPTH }] }]}>
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="proBody" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={accent.accent} />
                  <Stop offset="1" stopColor={accent.accentInk} />
                </LinearGradient>
                <RadialGradient id="proSpec" cx="0.18" cy="0.05" rx="0.6" ry="1.1" fx="0.18" fy="0.05">
                  <Stop offset="0" stopColor="#ffffff" stopOpacity={0.45} />
                  <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
                </RadialGradient>
                <LinearGradient id="proGloss" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#ffffff" stopOpacity={0.28} />
                  <Stop offset="1" stopColor="#ffffff" stopOpacity={0.02} />
                </LinearGradient>
                <LinearGradient id="proEdge" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0.6" stopColor="#000000" stopOpacity={0} />
                  <Stop offset="1" stopColor="#000000" stopOpacity={0.22} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#proBody)" />
              <Rect width="100%" height="100%" fill="url(#proSpec)" />
              <Path d="M0 0 H1000 V38 Q500 58 0 44 Z" fill="url(#proGloss)" />
              <Ellipse cx="88%" cy="120%" rx="40%" ry="70%" fill="#ffffff" fillOpacity={0.07} />
              <Rect width="100%" height="100%" fill="url(#proEdge)" />
            </Svg>
            <View style={[StyleSheet.absoluteFill, styles.rim]} pointerEvents="none" />

            <View style={styles.artWell}>
              <Image source={isPro ? PRO_ART : FREE_ART} style={styles.art} resizeMode="contain" accessible={false} fadeDuration={0} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: accent.onAccent }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: accent.onAccent }]} numberOfLines={2}>{subtitle}</Text>
            </View>
            {cta ? (
              <View style={styles.cta}>
                <Text style={[styles.ctaText, { color: accent.accentInk }]}>{cta}</Text>
              </View>
            ) : (
              <Icon name="chevronRight" size={18} color={accent.onAccent} />
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 + DEPTH },
  base: {
    borderRadius: radius.md + 2,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  basePressed: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 2 },
  baseShade: { backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: radius.md + 2 },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.md + 2,
    overflow: 'hidden',
  },
  rim: { borderRadius: radius.md + 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  artWell: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  art: { width: 46, height: 46 },
  title: { fontFamily: uiFont(700), fontSize: 18, letterSpacing: 0.2 },
  subtitle: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 2, opacity: 0.9 },
  cta: { backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  ctaText: { fontFamily: uiFont(700), fontSize: 13 },
});
