// src/screens/ScanKindScreen.tsx
// One scan button on the add hub means the app no longer knows what it just captured, so it
// asks. Two scan rows on the hub forced that same decision *before* the camera opened, which
// is the harder question: you always know how you got the image, but "is this a receipt or a
// statement" is our vocabulary, not the user's. Asking after capture is a plain local choice —
// no classifier, no model call, nothing to get wrong.
import React from 'react';
import { Image as RNImage, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { Body, BubbleText, Label, PipSays, TopBar } from '../components/ui';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { ScanQuotaBadge } from '../components/ScanQuotaBadge';
import { radius, spacing } from '../theme';
import type { PickedImage } from './AttachScreen';

const PREVIEW_H = 180;

export function ScanKindScreen({
  image,
  onBack,
  onReceipt,
  onHistory,
}: {
  image: PickedImage;
  onBack: () => void;
  /** One purchase, itemised, optionally split with other people. */
  onReceipt: () => void;
  /** A list of transactions from an e-wallet or bank app. */
  onHistory: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colorTheme = useThemeColors();
  const { isZh, t } = useLanguage();
  const {
    isPro,
    canScan,
    scansRemaining,
    scansLimit,
    dailyScansRemaining,
    dailyScansLimit,
  } = useEntitlement();
  const { openPaywall } = usePaywall();

  const handleReceipt = () => {
    if (!canScan) {
      openPaywall('scan_quota', 'add');
      return;
    }
    onReceipt();
  };

  const handleHistory = () => {
    if (!canScan) {
      openPaywall('scan_quota', 'add');
      return;
    }
    onHistory();
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <TopBar title={isZh ? '您扫描了什么？' : 'What did you scan?'} onBack={onBack} />

        {!isPro && (
          <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.xs }}>
            <ScanQuotaBadge
              quota={{
                monthRemaining: scansRemaining,
                monthTotal: scansLimit,
                dayRemaining: dailyScansRemaining,
                dayTotal: dailyScansLimit,
              }}
              t={t}
            />
          </View>
        )}

        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.sm }}>
          <PipSays expr="curious">
            <BubbleText>{isZh ? '收到！这是哪种单据？两者的识别方式不同。' : 'Got it. Which one is this? I read the two differently.'}</BubbleText>
          </PipSays>
        </View>

        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.base }}>
          <RNImage
            source={{ uri: image.uri }}
            style={[styles.preview, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}
            resizeMode="cover"
          />
        </View>

        <View style={styles.group}>
          <KindButton
            icon="receipt"
            title={isZh ? '消费小票 / 收据' : 'A receipt'}
            sub={isZh ? '单笔消费。我会识别每一项明细，您也可以与朋友分摊。' : "One purchase. I'll read every line item, and you can split it with friends."}
            onPress={handleReceipt}
          />
        </View>

        <View style={styles.group}>
          <KindButton
            icon="scan"
            title={isZh ? '对账单 / 交易明细' : 'Transaction history'}
            sub={isZh ? '电子钱包或银行应用的交易记录列表。我会提取所有明细。' : "A list of transactions from an e-wallet or bank app. I'll pull them all out."}
            onPress={handleHistory}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function KindButton({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={({ pressed }) => [
        styles.kind,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
        pressed && { opacity: 0.9, borderColor: theme.accentSoft, backgroundColor: theme.accentTint },
      ]}
    >
      <View style={[styles.kindIcon, { backgroundColor: theme.accentTint }]}>
        <Icon name={icon} size={24} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Body weight={700}>{title}</Body>
        <Label weight={500} color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>{sub}</Label>
      </View>
      <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  group: { paddingHorizontal: spacing.base, paddingTop: spacing.md },
  preview: {
    width: '100%',
    height: PREVIEW_H,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  kindIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
