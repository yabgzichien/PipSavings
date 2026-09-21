// src/components/ScanQuotaBadge.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../state/colorScheme';
import { en } from '../i18n/translations/en';
import type { Translations } from '../i18n/types';

export type BadgeQuota = {
  monthRemaining: number;
  monthTotal: number;
  dayRemaining: number;
  dayTotal: number;
};

export function scanBadgeLabel(
  q: BadgeQuota,
  t?: Translations | ((key: string, params?: Record<string, string | number>) => string)
): string {
  if (typeof t === 'function') {
    if (q.monthRemaining <= 0) return t('scansNone');
    if (q.dayRemaining <= 0) return t('scansDailyNone');
    if (q.dayRemaining < q.monthRemaining) {
      const res = t('scansDailyLeft', { n: q.dayRemaining });
      if (res && res !== 'scansDailyLeft') return res;
      return en.scansDailyLeft.replace('{n}', String(q.dayRemaining));
    }
    const res = t('scansLeft', { n: q.monthRemaining, total: q.monthTotal });
    if (res && res !== 'scansLeft') return res;
    return en.scansLeft.replace('{n}', String(q.monthRemaining)).replace('{total}', String(q.monthTotal));
  }

  const scansNone = t?.scansNone ?? en.scansNone;
  const scansDailyNone = t?.scansDailyNone ?? en.scansDailyNone;
  const scansDailyLeft = t?.scansDailyLeft ?? en.scansDailyLeft;
  const scansLeft = t?.scansLeft ?? en.scansLeft;

  if (q.monthRemaining <= 0) return scansNone;
  if (q.dayRemaining <= 0) return scansDailyNone;
  if (q.dayRemaining < q.monthRemaining) {
    return scansDailyLeft.replace('{n}', String(q.dayRemaining));
  }
  return scansLeft
    .replace('{n}', String(q.monthRemaining))
    .replace('{total}', String(q.monthTotal));
}

export function ScanQuotaBadge({
  quota,
  t,
}: {
  quota: BadgeQuota;
  t?: Translations | ((key: string, params?: Record<string, string | number>) => string);
}) {
  const theme = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { color: theme.ink2 }]}>{scanBadgeLabel(quota, t)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  text: { fontSize: 12 },
});
