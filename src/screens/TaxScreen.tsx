import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { ProBadge } from '../components/ProUi';
import { MapCommitmentSheet } from '../components/MapCommitmentSheet';
import { ReliefTagEditSheet } from '../components/ReliefTagEditSheet';
import { ExportSuccessModal } from '../components/ExportSuccessModal';
import { InfoButton } from '../components/InfoButton';
import { Body, Caption, Card, Eyebrow, ProgressTrack, TopBar } from '../components/ui';
import { computeUsage, evidenceState, isRequestable, reliefEligibility, yaForDate, type ReliefUsage } from '../lib/relief';
import { RELIEF_SCHEDULES, scheduleForYA, type ReliefLine } from '../lib/reliefSchedule';
import { addReliefTag, listReliefTags } from '../db/reliefRepo';
import { saveOrDownloadExport } from '../lib/financialExport';
import { notify } from '../lib/platformAlert';
import { buildAuditPackPdf, buildEvidenceZip } from '../lib/taxExport';
import type { ReliefTag, Transaction } from '../lib/types';
import { fmt, fmtMoney } from '../lib/format';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { colors, radius, uiFont } from '../theme';

// The current calendar year is always offered even when no schedule is registered for it yet:
// `scheduleForYA` falls forward to the latest known figures, so the year is usable, and hiding
// it would leave this year's tags with no chip to view them under.
const AVAILABLE_YAS = Array.from(
  new Set([...Object.keys(RELIEF_SCHEDULES).map(Number), new Date().getFullYear()])
).sort((a, b) => b - a);

/** Days left in the transaction's own month. Everything here is local time, matching how
 *  `todayKey()` writes `txn.date`: mixing in a UTC month would misreport the window for the
 *  first hours of a new local month in any timezone ahead of UTC. */
function daysUntilMonthEnd(txnDate: string): number {
  const [y, m] = txnDate.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const today = new Date();
  return Math.max(0, lastDay - today.getDate());
}

export function TaxScreen({ onBack, embedded }: { onBack: () => void; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { transactions, commitments, updateCommitmentEntry } = useAppData();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [ya, setYa] = useState(AVAILABLE_YAS[0]);
  const [tags, setTags] = useState<ReliefTag[] | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [mappingCommitments, setMappingCommitments] = useState(false);
  const [addingManually, setAddingManually] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [taxExportResult, setTaxExportResult] = useState<{
    fileName: string;
    format: 'pdf' | 'zip';
    fileUri?: string;
    fileSize?: number;
    mimeType?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTags(null);
    listReliefTags(ya).then((t) => {
      if (!cancelled) setTags(t);
    });
    return () => {
      cancelled = true;
    };
  }, [ya]);

  const schedule = scheduleForYA(ya);
  const usage: ReliefUsage[] = useMemo(
    () => (schedule && tags ? computeUsage(tags, schedule) : []),
    [schedule, tags]
  );
  const usageByCode = useMemo(() => Object.fromEntries(usage.map((u) => [u.code, u])), [usage]);
  // Sum `capUsed` over top-level lines only: a parent's `capUsed` already folds in its
  // children's contributions (see `computeUsage`), so this counts every child claim exactly
  // once, and reports what actually counts toward the caps rather than a raw over-cap total.
  const totalClaimed = usage.filter((u) => !schedule?.lines.find((l) => l.code === u.code)?.parent)
    .reduce((s, u) => s + u.capUsed, 0);

  const requestable = useMemo(() => {
    if (!schedule || !tags) return [];
    const today = new Date();
    const result: { tag: ReliefTag; txn: Transaction; line: ReliefLine }[] = [];
    for (const t of tags) {
      const line = schedule.lines.find((l) => l.code === t.code);
      const txn = transactions.find((x) => x.id === t.txnId);
      if (!line || !txn) continue;
      const evidence = evidenceState(t, txn, line);
      if (isRequestable(evidence, txn, today)) result.push({ tag: t, txn, line });
    }
    return result;
  }, [schedule, tags, transactions]);

  const editingTag = editingTagId ? (tags ?? []).find((t) => t.id === editingTagId) ?? null : null;

  const topLevelLines = schedule?.lines.filter((l) => !l.parent) ?? [];
  const childrenByParent = useMemo(() => {
    const map: Record<string, ReliefLine[]> = {};
    for (const line of schedule?.lines ?? []) {
      if (line.parent) (map[line.parent] ??= []).push(line);
    }
    return map;
  }, [schedule]);

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg, paddingTop: embedded ? 0 : insets.top }]}>
      {!embedded && <TopBar title={isZh ? '个人所得税减免' : 'Tax relief'} onBack={onBack} />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.yaRow}>
          {AVAILABLE_YAS.map((y) => (
            <Pressable
              key={y}
              onPress={() => setYa(y)}
              style={[
                styles.yaChip,
                { borderColor: colorTheme.line2 },
                y === ya && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
            >
              <Text style={[styles.yaChipText, { color: y === ya ? colors.onAccent : colorTheme.ink }]}>YA {y}</Text>
            </Pressable>
          ))}
        </View>

        <Caption color={colorTheme.ink2} style={{ marginTop: 10 }}>
          {isZh ? `课税年度 YA ${ya} 目前已申报减免 RM ${fmt(totalClaimed)}` : `RM ${fmt(totalClaimed)} claimed so far for YA ${ya}`}
        </Caption>

        <View style={styles.disclaimerRow}>
          <Caption color={colorTheme.ink2} style={{ flex: 1 }}>
            {isZh
              ? '仅适用于马来西亚个人所得税减免。Pip 只帮你记录可申报项目，不会代你向 LHDN 报税，内容亦不构成税务建议。'
              : 'Malaysian personal tax relief only. Pip tracks claims for your records. It does not file with LHDN, and this is not tax advice.'}
          </Caption>
          <InfoButton entry="tax_relief" />
        </View>

        <View style={styles.topActionsRow}>
          <Pressable onPress={() => setMappingCommitments(true)} style={[styles.actionRow, { borderColor: colorTheme.line2, marginTop: 0 }]}>
            <Icon name="clock" size={16} color={theme.accent} />
            <Text style={{ color: theme.accent, fontFamily: uiFont(700), fontSize: 13.5 }}>
              {isZh ? '关联定期项目' : 'Map a commitment'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setAddingManually(true)} style={[styles.actionRow, { borderColor: colorTheme.line2, marginTop: 0 }]}>
            <Icon name="search" size={16} color={theme.accent} />
            <Text style={{ color: theme.accent, fontFamily: uiFont(700), fontSize: 13.5 }}>
              {isZh ? '手动添加减免' : 'Add manually'}
            </Text>
          </Pressable>
          <Pressable
            disabled={exportingPdf || !schedule || !tags || tags.length === 0}
            onPress={async () => {
              if (!schedule || !tags) return;
              if (!isPro) {
                openPaywall('tax_export', 'tax');
                return;
              }
              setExportingPdf(true);
              try {
                try {
                  const fileName = `tax-relief-statement-${ya}.pdf`;
                  const bytes = await buildAuditPackPdf(ya, schedule, tags, transactions);
                  const result = await saveOrDownloadExport(fileName, bytes, 'application/pdf', { autoShare: true });
                  if (result.success) {
                    setTaxExportResult({
                      fileName,
                      format: 'pdf',
                      fileUri: result.uri,
                      fileSize: result.fileSize,
                      mimeType: 'application/pdf',
                    });
                    setSuccessModalVisible(true);
                  } else {
                    notify(isZh ? '导出失败' : 'Export failed', result.error ?? (isZh ? '无法生成报税表。' : 'Could not build the tax relief statement.'));
                  }
                } catch {
                  notify(isZh ? '导出失败' : 'Export failed', isZh ? '生成报税表时出现问题。' : 'Something went wrong building the tax relief statement.');
                }
              } finally {
                setExportingPdf(false);
              }
            }}
            style={[styles.actionRow, { borderColor: colorTheme.line2, marginTop: 0, opacity: exportingPdf || !tags?.length ? 0.5 : 1 }]}
          >
            <Icon name="download" size={16} color={theme.accent} />
            <Text style={{ color: theme.accent, fontFamily: uiFont(700), fontSize: 13.5 }}>
              {exportingPdf ? (isZh ? '正在生成...' : 'Building PDF...') : (isZh ? '导出报税表 (PDF)' : 'Export tax PDF')}
            </Text>
            {!isPro ? <ProBadge locked /> : null}
          </Pressable>
          <Pressable
            disabled={exportingZip || !schedule || !tags || tags.length === 0}
            onPress={async () => {
              if (!schedule || !tags) return;
              if (!isPro) {
                openPaywall('tax_export', 'tax');
                return;
              }
              setExportingZip(true);
              try {
                try {
                  const fileName = `tax-relief-evidence-${ya}.zip`;
                  const bytes = await buildEvidenceZip(ya, schedule, tags, transactions);
                  const result = await saveOrDownloadExport(fileName, bytes, 'application/zip', { autoShare: true });
                  if (result.success) {
                    setTaxExportResult({
                      fileName,
                      format: 'zip',
                      fileUri: result.uri,
                      fileSize: result.fileSize,
                      mimeType: 'application/zip',
                    });
                    setSuccessModalVisible(true);
                  } else {
                    notify(isZh ? '导出失败' : 'Export failed', result.error ?? (isZh ? '无法生成小票证据包。' : 'Could not package receipt evidence.'));
                  }
                } catch {
                  notify(isZh ? '导出失败' : 'Export failed', isZh ? '打包小票证据时出现问题。' : 'Something went wrong packaging receipt evidence.');
                }
              } finally {
                setExportingZip(false);
              }
            }}
            style={[styles.actionRow, { borderColor: colorTheme.line2, marginTop: 0, opacity: exportingZip || !tags?.length ? 0.5 : 1 }]}
          >
            <Icon name="download" size={16} color={theme.accent} />
            <Text style={{ color: theme.accent, fontFamily: uiFont(700), fontSize: 13.5 }}>
              {exportingZip ? (isZh ? '正在打包...' : 'Zipping...') : (isZh ? '导出小票包 (.zip)' : 'Export receipts (.zip)')}
            </Text>
            {!isPro ? <ProBadge locked /> : null}
          </Pressable>
        </View>

        {addingManually && (
          <Card style={{ padding: 14, marginTop: 14 }}>
            <View style={[styles.searchRow, { borderColor: colorTheme.line2 }]}>
              <Icon name="search" size={15} color={colorTheme.ink3} />
              <TextInput
                value={manualSearch}
                onChangeText={setManualSearch}
                placeholder={isZh ? '搜索交易记录' : 'Search transactions'}
                placeholderTextColor={colorTheme.ink3}
                style={[styles.searchInput, { color: colorTheme.ink }]}
              />
              <Pressable onPress={() => setAddingManually(false)} hitSlop={8}>
                <Icon name="x" size={16} color={colorTheme.ink3} />
              </Pressable>
            </View>
            {manualSearch.trim().length > 0 &&
              transactions
                .filter((t) => !!t.date && t.merchantRaw.toLowerCase().includes(manualSearch.trim().toLowerCase()))
                .slice(0, 15)
                .map((t) => {
                  const eligibility = reliefEligibility(t);
                  if (!eligibility.eligible) {
                    return (
                      <View key={t.id} style={styles.manualRow}>
                        <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <Text style={{ color: colorTheme.ink3, fontFamily: uiFont(600), fontSize: 13.5 }} numberOfLines={1}>
                            {t.merchantRaw}
                          </Text>
                          <Caption color={colorTheme.ink3}>{eligibility.reason}</Caption>
                        </View>
                        <Caption color={colorTheme.ink3}>{fmtMoney(t.nativeAmount ?? t.amount, t.currency)}</Caption>
                      </View>
                    );
                  }
                  return (
                    <Pressable
                      key={t.id}
                      onPress={async () => {
                        if (!schedule || !t.date) return;
                        const txnYa = yaForDate(t.date);
                        const created = await addReliefTag({ txnId: t.id, code: schedule.lines[0].code, ya: txnYa, amount: t.amount, origin: 'manual' });
                        if (txnYa === ya) {
                          setTags((prev) => [...(prev ?? []), created]);
                          setEditingTagId(created.id);
                        } else {
                          notify(
                            isZh ? `已归入 YA ${txnYa}` : `Tagged under YA ${txnYa}`,
                            isZh
                              ? `该交易日期属于 ${txnYa} 年，因此已自动归入。请切换至 YA ${txnYa} 进行编辑。`
                              : `This transaction is dated in ${txnYa}, so it was filed there. Switch to YA ${txnYa} to edit it.`
                          );
                        }
                        setAddingManually(false);
                        setManualSearch('');
                      }}
                      style={styles.manualRow}
                    >
                      <Text style={{ color: colorTheme.ink, fontFamily: uiFont(600), fontSize: 13.5 }} numberOfLines={1}>
                        {t.merchantRaw}
                      </Text>
                      <Caption color={colorTheme.ink2}>RM {fmt(t.amount)}</Caption>
                    </Pressable>
                  );
                })}
          </Card>
        )}

        {tags === null && (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        )}

        {tags !== null && tags.length === 0 && (
          <View style={{ paddingTop: 50, alignItems: 'center', paddingHorizontal: 20 }}>
            <Body weight={700} color={colorTheme.ink} style={{ textAlign: 'center' }}>
              {isZh ? '暂无减免标签' : 'Nothing tagged yet'}
            </Body>
            <Caption color={colorTheme.ink2} style={{ textAlign: 'center', marginTop: 6 }}>
              {isZh
                ? '扫描小票或关联定期账单即可开始。Pip 会在记账时自动为您标记符合税收减免的项目。'
                : 'Scan a receipt or map a bill to get started. Pip tags relief-eligible spending automatically as you go.'}
            </Caption>
          </View>
        )}

        {requestable.length > 0 && (
          <View style={{ marginTop: tags && tags.length > 0 ? 16 : 0 }}>
            <Eyebrow style={{ marginBottom: 8 }}>{isZh ? '本月可索取发票' : 'Requestable this month'}</Eyebrow>
            {requestable.map(({ tag, txn, line }) => {
              const daysLeft = daysUntilMonthEnd(txn.date!);
              return (
                <Pressable key={tag.id} onPress={() => setEditingTagId(tag.id)} style={[styles.requestableRow, { borderColor: colorTheme.line2 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colorTheme.ink, fontFamily: uiFont(600), fontSize: 13.5 }} numberOfLines={1}>
                      {txn.merchantRaw || line.label}
                    </Text>
                    <Caption color={colorTheme.ink2}>{line.label}</Caption>
                  </View>
                  <Caption color={theme.accent}>
                    {isZh ? `剩余 ${daysLeft} 天` : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                  </Caption>
                </Pressable>
              );
            })}
          </View>
        )}

        {tags !== null && topLevelLines.map((line) => {
          const u = usageByCode[line.code];
          if (!u) return null;
          const children = childrenByParent[line.code] ?? [];
          const pct = u.cap > 0 ? Math.min(100, (u.capUsed / u.cap) * 100) : 0;
          return (
            <Card key={line.code} style={{ padding: 16, marginTop: 12 }}>
              <View style={styles.lineHead}>
                <Body weight={700} color={colorTheme.ink}>{line.label}</Body>
                <Caption color={colorTheme.ink2}>{line.formField}</Caption>
              </View>
              <Caption color={colorTheme.ink2} style={{ marginTop: 2 }}>
                RM {fmt(u.capUsed)} / RM {fmt(u.cap)}
              </Caption>
              <ProgressTrack pct={pct} />
              {!!line.note && (
                <Caption color={colorTheme.ink3} style={{ marginTop: 6, fontSize: 11.5 }}>
                  {line.note}
                </Caption>
              )}
              {children.length === 0 &&
                (tags ?? []).filter((t) => t.code === line.code).map((t) => {
                  const txn = transactions.find((x) => x.id === t.txnId);
                  if (!txn) return null;
                  return (
                    <Pressable key={t.id} onPress={() => setEditingTagId(t.id)} style={styles.tagRow}>
                      <Caption color={colorTheme.ink}>{txn.merchantRaw || 'Transaction'}</Caption>
                      <Caption color={colorTheme.ink2}>RM {fmt(t.amount)}</Caption>
                    </Pressable>
                  );
                })}
              {children.map((child) => {
                const cu = usageByCode[child.code];
                if (!cu) return null;
                const childTags = (tags ?? []).filter((t) => t.code === child.code);
                return (
                  <View key={child.code} style={styles.childBlock}>
                    <View style={styles.childRow}>
                      <Caption color={colorTheme.ink2}>{child.label}</Caption>
                      <Caption color={colorTheme.ink2}>RM {fmt(cu.capUsed)} / RM {fmt(cu.cap)}</Caption>
                    </View>
                    {!!child.note && (
                      <Caption color={colorTheme.ink3} style={{ paddingLeft: 12, fontSize: 11, marginTop: 2 }}>
                        {child.note}
                      </Caption>
                    )}
                    {childTags.map((t) => {
                      const txn = transactions.find((x) => x.id === t.txnId);
                      if (!txn) return null;
                      return (
                        <Pressable key={t.id} onPress={() => setEditingTagId(t.id)} style={styles.tagRow}>
                          <Caption color={colorTheme.ink}>{txn.merchantRaw || 'Transaction'}</Caption>
                          <Caption color={colorTheme.ink2}>RM {fmt(t.amount)}</Caption>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </Card>
          );
        })}

      </ScrollView>
      </KeyboardAvoidingView>

      {schedule && (
        <ReliefTagEditSheet
          tag={editingTag}
          txn={editingTag ? transactions.find((t) => t.id === editingTag.txnId) ?? null : null}
          schedule={schedule}
          onClose={() => setEditingTagId(null)}
          onChanged={() => listReliefTags(ya).then(setTags)}
        />
      )}

      {schedule && (
        <MapCommitmentSheet
          visible={mappingCommitments}
          commitments={commitments}
          schedule={schedule}
          onPick={(id, code) => updateCommitmentEntry(id, { reliefCode: code })}
          onClose={() => setMappingCommitments(false)}
        />
      )}

      {taxExportResult && (
        <ExportSuccessModal
          visible={successModalVisible}
          onClose={() => setSuccessModalVisible(false)}
          fileName={taxExportResult.fileName}
          format={taxExportResult.format}
          fileUri={taxExportResult.fileUri}
          fileSize={taxExportResult.fileSize}
          mimeType={taxExportResult.mimeType}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  yaRow: { flexDirection: 'row', gap: 8 },
  yaChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  yaChipText: { fontFamily: uiFont(700), fontSize: 13 },
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  childRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 12, marginTop: 8 },
  childBlock: { marginTop: 8 },
  tagRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 12, paddingVertical: 4 },
  topActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, alignSelf: 'flex-start' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontFamily: uiFont(600), fontSize: 13.5, paddingVertical: 2 },
  manualRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'transparent' },
  requestableRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm, padding: 12, marginTop: 8, gap: 10 },
});
