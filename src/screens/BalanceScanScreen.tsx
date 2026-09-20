// src/screens/BalanceScanScreen.tsx
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { InstitutionBadge } from '../components/InstitutionBadge';
import { TickerSearchModal } from '../components/TickerSearchModal';
import { B, BtnLabel, BubbleText, Card, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { getLLM, llmErrorMessage } from '../llm';
import { fmtMoney } from '../lib/format';
import { todayISO } from '../lib/duplicates';
import { findMatchingAccounts, matchInstitution, type Institution } from '../lib/institutions';
import { classesFor } from '../lib/networth';
import { BASE_CURRENCY } from '../lib/currency';
import { getEntryCurrency } from '../db/currencyRepo';
import { notify } from '../lib/platformAlert';
import { searchCrypto, resolveCryptoTickers } from '../prices';
import type { TickerResult, ScannedHolding } from '../lib/prices';
import type { Account, AccountKind } from '../lib/types';
import { getScanStage } from '../lib/scanningNarration';
import { ScanProgressBar } from '../components/ScanProgressBar';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { submitSnapshotScan } from '../billing/scanProxy';
import { ScanQuotaBadge } from '../components/ScanQuotaBadge';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { useAppData } from '../state/store';
import { colors, numFont, radius, uiFont } from '../theme';

type Phase = 'pick' | 'scanning' | 'balance' | 'holdings' | 'error' | 'needprovider' | 'done';

interface HoldingRow {
  key: number;
  ticker: string;
  qty: string;
  coin: TickerResult | null;
}

const parseAmount = (s: string): number => Math.max(0, parseFloat(s.replace(/[^0-9.]/g, '')) || 0);

export function BalanceScanScreen({
  onClose,
  embedded,
  initialAmount,
  initialHoldings,
}: {
  onClose: () => void;
  embedded?: boolean;
  initialAmount?: number | null;
  initialHoldings?: ScannedHolding[] | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh, t } = useLanguage();
  const { accounts, accountValues, addAccount, addHolding, setBalance } = useAppData();
  const {
    isPro,
    canScan,
    scansRemaining,
    scansLimit,
    dailyScansRemaining,
    dailyScansLimit,
    refreshAllowance,
  } = useEntitlement();
  const { openPaywall } = usePaywall();
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(
    initialHoldings ? 'scanning' : initialAmount !== undefined ? 'balance' : 'pick',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');
  const [readingSecs, setReadingSecs] = useState(0);

  useEffect(() => {
    if (phase !== 'scanning') return;
    setReadingSecs(0);
    const id = setInterval(() => setReadingSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ── holdings-review state (crypto wallet screenshots) ──────────────────────
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [searchKey, setSearchKey] = useState<number | null>(null);

  // ── balance-decision state (bank/e-wallet/loan screenshots) ────────────────
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [rawProvider, setRawProvider] = useState<string | null>(null);
  const [detectedKind, setDetectedKind] = useState<AccountKind>('asset');
  const [amountText, setAmountText] = useState(
    initialAmount != null ? String(initialAmount) : '',
  );
  const [matches, setMatches] = useState<Account[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [forceCreate, setForceCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCls, setNewCls] = useState('cash');
  // A scanned balance is native to whichever account it lands in, so every figure on this
  // screen is labelled with that account's own currency — the currency the user enters in
  // for a brand-new account, and the matched account's own for an existing one.
  const [entryCurrency, setEntryCurrency] = useState<string>(BASE_CURRENCY);

  useEffect(() => {
    void getEntryCurrency().then(setEntryCurrency);
  }, []);

  useEffect(() => {
    if (!initialHoldings) return;
    let alive = true;
    (async () => {
      try {
        const resolved = await resolveCryptoTickers(initialHoldings);
        if (!alive) return;
        setRows(resolved.map((r, i) => ({ key: i, ticker: r.ticker, qty: String(r.quantity), coin: r.coin })));
        setPhase('holdings');
      } catch (e) {
        if (!alive) return;
        setError(llmErrorMessage(e));
        setPhase('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialHoldings]);

  const handle = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.uri && !a.base64) { notify('Hmm', isZh ? '无法读取该图片。' : "That image couldn't be read."); return; }
    await run(a.uri, a.base64 || undefined, a.mimeType ?? 'image/jpeg');
  };

  const pickGallery = async () => {
    if (!canScan) {
      openPaywall('scan_quota', 'networth');
      return;
    }
    if (busy) return; setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { notify(isZh ? '需要权限' : 'Permission needed', isZh ? '请允许访问相册以选取截图。' : 'Allow photo access to pick a screenshot.'); return; }
      await handle(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }));
    } finally { setBusy(false); }
  };
  const takePhoto = async () => {
    if (!canScan) {
      openPaywall('scan_quota', 'networth');
      return;
    }
    if (busy) return; setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { notify(isZh ? '需要权限' : 'Permission needed', isZh ? '请允许访问相机以拍摄截图。' : 'Allow camera access to snap a screenshot.'); return; }
      await handle(await ImagePicker.launchCameraAsync({ quality: 0.85 }));
    } finally { setBusy(false); }
  };

  const resetBalanceState = () => {
    setInstitution(null); setRawProvider(null); setDetectedKind('asset'); setAmountText('');
    setMatches([]); setSelectedMatchId(null); setForceCreate(false); setNewName(''); setNewCls('cash');
  };

  const run = async (uri: string, base64?: string, mime: string = 'image/jpeg') => {
    if (!canScan) {
      openPaywall('scan_quota', 'networth');
      return;
    }
    setPhase('scanning');
    setError('');
    resetBalanceState();
    try {
      const res = await submitSnapshotScan(
        { uri, imageBase64: base64, mimeType: mime },
        isPro ? 'pro' : 'free'
      );
      if (res.quotaBlocked) {
        openPaywall('scan_quota', 'networth');
        setError(res.error || 'Scan limit reached');
        setPhase('error');
        return;
      }
      if (!res.ok || !res.snapshot) {
        setError(res.error || (isZh ? '无法识别该截图内容。' : "I couldn't read that screenshot."));
        setPhase('error');
        return;
      }
      const snap = res.snapshot;
      void refreshAllowance();

      if (snap.kind === 'unknown') {
        setError(
          isZh
            ? '无法识别该截图内容。请尝试截取更清晰的银行/电子钱包余额、贷款账单或加密钱包截图。'
            : "I couldn't tell what this screenshot shows. Try a clearer screenshot of a bank/e-wallet balance, a loan statement, or a crypto wallet."
        );
        setPhase('error');
        return;
      }

      if (snap.kind === 'holdings') {
        if (!isPro) {
          openPaywall('live_holdings', 'networth');
          setError(isZh ? '实时持仓属于 Pro。' : 'Live holdings are a Pro feature.');
          setPhase('error');
          return;
        }
        if (snap.holdings.length === 0) {
          setError(isZh ? '在该截图中未能找到任何持仓币种。' : "I couldn't find any coin holdings in that screenshot.");
          setPhase('error');
          return;
        }
        const resolved = await resolveCryptoTickers(snap.holdings);
        setRows(resolved.map((r, i) => ({ key: i, ticker: r.ticker, qty: String(r.quantity), coin: r.coin })));
        setPhase('holdings');
        return;
      }

      // kind === 'balance'
      const inst = matchInstitution(snap.provider);
      const ak: AccountKind = snap.accountKind ?? 'asset';
      const found = findMatchingAccounts(accounts, inst, snap.provider);
      setInstitution(inst);
      setRawProvider(snap.provider);
      setDetectedKind(ak);
      setAmountText(snap.amount != null ? String(snap.amount) : '');
      setMatches(found);
      setSelectedMatchId(found.length === 1 ? found[0].id : null);
      setNewName(inst?.name ?? snap.provider ?? '');
      setNewCls(ak === 'liability' ? classesFor('liability')[0].id : 'cash');
      setPhase('balance');
    } catch (e) {
      setError(llmErrorMessage(e));
      setPhase('error');
    }
  };

  // ── holdings-review actions ─────────────────────────────────────────────
  const patch = (key: number, p: Partial<HoldingRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const remove = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key));
  const importable = rows.filter((r) => r.coin && parseFloat(r.qty.replace(/[^0-9.]/g, '')) > 0);
  const confirmHoldings = async () => {
    if (!isPro) {
      openPaywall('live_holdings', 'networth');
      return;
    }
    let n = 0;
    for (const r of importable) {
      const q = Math.round(parseFloat(r.qty.replace(/[^0-9.]/g, '')) * 1e8) / 1e8;
      await addHolding(r.coin!.name, 'crypto', r.coin!.id, r.coin!.ticker, q, null);
      n++;
    }
    setDoneMsg(
      isZh
        ? `已添加 ${n} 项持仓。在净资产界面下拉即可刷新最新实时行情。`
        : `Added ${n} holding${n === 1 ? '' : 's'}. Pull to refresh on the Net Worth screen for live prices.`
    );
    setPhase('done');
  };

  // ── balance-decision actions ────────────────────────────────────────────
  const selectedAccount = selectedMatchId ? accounts.find((a) => a.id === selectedMatchId) ?? null : null;
  const amount = parseAmount(amountText);
  const currentVal = selectedAccount ? (accountValues[selectedAccount.id] ?? 0) : 0;

  const selectedCurrency = selectedAccount?.currency ?? entryCurrency;

  const doReplace = async () => {
    if (!selectedAccount || amount <= 0) return;
    await setBalance(selectedAccount.id, Math.round(amount * 100) / 100, todayISO());
    setDoneMsg(
      isZh
        ? `已将 ${selectedAccount.name} 的余额更新为 ${fmtMoney(amount, selectedCurrency)}。`
        : `Updated ${selectedAccount.name}'s balance to ${fmtMoney(amount, selectedCurrency)}.`
    );
    setPhase('done');
  };
  const doAddInto = async () => {
    if (!selectedAccount || amount <= 0) return;
    const next = Math.round((currentVal + amount) * 100) / 100;
    await setBalance(selectedAccount.id, next, todayISO());
    setDoneMsg(
      isZh
        ? `已向 ${selectedAccount.name} 添加 ${fmtMoney(amount, selectedCurrency)}。最新余额为 ${fmtMoney(next, selectedCurrency)}。`
        : `Added ${fmtMoney(amount, selectedCurrency)} to ${selectedAccount.name}. New balance ${fmtMoney(next, selectedCurrency)}.`
    );
    setPhase('done');
  };
  const doCreate = async () => {
    if (!newName.trim() || amount <= 0) return;
    await addAccount(newName.trim(), detectedKind, newCls, Math.round(amount * 100) / 100, todayISO(), null, entryCurrency);
    setDoneMsg(
      isZh
        ? `已添加账户 ${newName.trim()}，初始余额为 ${fmtMoney(amount, entryCurrency)}。`
        : `Added ${newName.trim()} with an opening balance of ${fmtMoney(amount, entryCurrency)}.`
    );
    setPhase('done');
  };

  const showingExisting = !forceCreate && !!selectedAccount;
  const showingCreate = forceCreate || matches.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={isZh ? '扫描余额' : 'Scan Balance'} onBack={onClose} />
        </View>
      )}
      {!embedded && !isPro && (
        <View style={{ paddingHorizontal: 18, paddingTop: 4 }}>
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 110 }} keyboardShouldPersistTaps="handled">
        {phase === 'pick' && (
          <>
            <PipSays expr="curious">
              <BubbleText>
                {isZh ? (
                  <>拍摄或选取<B>银行账户、电子钱包、贷款账单或加密钱包</B>的截图。我会自动识别并为您处理。</>
                ) : (
                  <>Snap or pick a screenshot of a <B>bank account, e-wallet, loan statement, or crypto wallet</B>. I'll read it and figure out what to do with it.</>
                )}
              </BubbleText>
            </PipSays>
            <View style={{ gap: 14, marginTop: 22 }}>
              <SourceButton icon="camera" title={isZh ? '拍照' : 'Take a photo'} sub={isZh ? '对准账户余额' : 'Point at your balance'} onPress={takePhoto} disabled={busy} />
              <SourceButton icon="gallery" title={isZh ? '从相册选取' : 'Choose from gallery'} sub={isZh ? '选取已有的截图' : 'Pick an existing screenshot'} onPress={pickGallery} disabled={busy} />
            </View>
          </>
        )}

        {phase === 'scanning' && (() => {
          const stage = getScanStage('balance', readingSecs, isZh);
          return (
            <>
              <PipSays expr={stage.expr} float={!reducedMotion} idea={stage.idea}>
                <BubbleText>{stage.text}</BubbleText>
              </PipSays>
              <ScanProgressBar
                progress={stage.progress}
                label={isZh ? '快照识别进度' : 'Snapshot scanning progress'}
                style={{ marginTop: 16 }}
              />
              <Card style={[styles.busy, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                <ActivityIndicator color={theme.accent} />
              </Card>
            </>
          );
        })()}

        {phase === 'needprovider' && (
          <>
            <PipSays expr="curious"><BubbleText>{isZh ? '当前扫描功能暂不可用，请稍后重试。' : "Scanning isn't available right now. Try again in a moment."}</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={onClose}><Icon name="chevronLeft" size={18} color="#fff" /><BtnLabel>{isZh ? '返回' : 'Go back'}</BtnLabel></PrimaryButton></View>
          </>
        )}

        {phase === 'error' && (
          <>
            <PipSays expr="curious"><BubbleText>{error}</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={() => setPhase('pick')}><Icon name="image" size={18} color="#fff" /><BtnLabel>{isZh ? '尝试其他截图' : 'Try another screenshot'}</BtnLabel></PrimaryButton></View>
          </>
        )}

        {phase === 'balance' && (
          <>
            <PipSays expr="happy"><BubbleText>{isZh ? '以下是识别到的内容。' : "Here's what I found."}</BubbleText></PipSays>

            <Card style={{ marginTop: 16, padding: 16 }}>
              <View style={styles.detectedRow}>
                <InstitutionBadge inst={institution} fallbackText={rawProvider} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.detectedName, { color: colorTheme.ink }]} numberOfLines={1}>
                    {institution?.name ?? rawProvider ?? (isZh ? '未识别的机构' : 'Unrecognized provider')}
                  </Text>
                  <Text style={[styles.detectedSub, { color: colorTheme.ink2 }]}>
                    {institution
                      ? (institution.kind === 'bank' ? (isZh ? '银行' : 'Bank') : (isZh ? '电子钱包' : 'E-Wallet'))
                      : (isZh ? '不在银行列表中，请在下方输入名称' : 'Not in our bank list. Type a name below')}
                  </Text>
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colorTheme.ink2, marginTop: 16 }]}>{isZh ? '金额' : 'Amount'}</Text>
              <View style={[styles.amountRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{entryCurrency === 'MYR' ? 'RM' : entryCurrency}</Text>
                <TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colorTheme.ink3} style={[styles.amountInput, { color: colorTheme.ink }]} autoFocus={amount === 0} />
              </View>
              {amount === 0 && <Text style={[styles.hint, { color: colorTheme.ink2 }]}>{isZh ? '未能清晰识别出金额，请输入以继续。' : "I couldn't read a clear amount. Enter it to continue."}</Text>}
            </Card>

            {!forceCreate && matches.length > 1 && !selectedMatchId && (
              <Card style={{ marginTop: 14, overflow: 'hidden' }}>
                <Text style={[styles.sectionLabel, { color: colorTheme.ink2 }]}>{isZh ? '选择对应账户' : 'Which account?'}</Text>
                {matches.map((m, i) => (
                  <Pressable key={m.id} onPress={() => setSelectedMatchId(m.id)} style={[styles.matchRow, i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }]]}>
                    <Text style={[styles.matchName, { color: colorTheme.ink }]} numberOfLines={1}>{m.name}</Text>
                    <Text style={[styles.matchVal, { color: colorTheme.ink2 }]}>{fmtMoney(accountValues[m.id] ?? 0, m.currency)}</Text>
                  </Pressable>
                ))}
              </Card>
            )}

            {showingExisting && selectedAccount && (
              <View style={{ marginTop: 18, gap: 10 }}>
                <PrimaryButton onPress={doReplace} disabled={amount <= 0}>
                  <Icon name="check" size={18} color="#fff" stroke={2.4} />
                  <BtnLabel>{isZh ? `替换 ${selectedAccount.name} 的余额` : `Replace ${selectedAccount.name}'s balance`}</BtnLabel>
                </PrimaryButton>
                <SecondaryButton onPress={doAddInto} disabled={amount <= 0} icon="plus">
                  {isZh
                    ? `累加到 ${selectedAccount.name} 的余额（${fmtMoney(currentVal, selectedCurrency)} + ${fmtMoney(amount, selectedCurrency)}）`
                    : `Add to ${selectedAccount.name}'s balance (${fmtMoney(currentVal, selectedCurrency)} + ${fmtMoney(amount, selectedCurrency)})`}
                </SecondaryButton>
                <Pressable onPress={() => setForceCreate(true)} hitSlop={6} style={styles.linkBtn}>
                  <Text style={[styles.linkText, { color: theme.accent }]}>{isZh ? '不是此账户？新建一个独立账户' : 'Not this account? Add as a new account instead'}</Text>
                </Pressable>
              </View>
            )}

            {showingCreate && (
              <Card style={{ marginTop: 14, padding: 16 }}>
                <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '账户名称' : 'Name'}</Text>
                <TextInput value={newName} onChangeText={setNewName} placeholder={isZh ? '账户名称' : 'Account name'} placeholderTextColor={colorTheme.ink3} style={[styles.textInput, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink }]} />

                {detectedKind === 'liability' && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colorTheme.ink2, marginTop: 16 }]}>{isZh ? '类别' : 'Type'}</Text>
                    <View style={styles.classGrid}>
                      {classesFor('liability').map((c) => {
                        const on = newCls === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => setNewCls(c.id)}
                            style={[styles.classChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, on && { borderColor: theme.accent, backgroundColor: theme.accentTint }]}
                          >
                            <Text style={[styles.classChipText, { color: colorTheme.ink2 }, on && { color: theme.onTint }]}>{c.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                <View style={{ marginTop: 18 }}>
                  <PrimaryButton onPress={doCreate} disabled={!newName.trim() || amount <= 0}>
                    <Icon name="plus" size={18} color="#fff" stroke={2.4} />
                    <BtnLabel>{isZh ? '添加账户' : 'Add account'}</BtnLabel>
                  </PrimaryButton>
                </View>
                {matches.length > 0 && (
                  <Pressable onPress={() => { setForceCreate(false); if (!selectedMatchId && matches.length === 1) setSelectedMatchId(matches[0].id); }} hitSlop={6} style={styles.linkBtn}>
                    <Text style={[styles.linkText, { color: theme.accent }]}>{isZh ? '改用现有账户' : 'Use an existing account instead'}</Text>
                  </Pressable>
                )}
              </Card>
            )}
          </>
        )}

        {phase === 'holdings' && (
          <>
            <PipSays expr="happy">
              <BubbleText>
                {isZh ? (
                  <>找到 <B>{rows.length}</B> 个币种。请核对匹配项与数量，然后添加。</>
                ) : (
                  <>Found <B>{rows.length}</B> coin{rows.length === 1 ? '' : 's'}. Check each match and amount, then add them.</>
                )}
              </BubbleText>
            </PipSays>
            <Card style={{ overflow: 'hidden', marginTop: 16 }}>
              {rows.map((r, i) => (
                <View key={r.key} style={[styles.row, i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }]]}>
                  <Pressable onPress={() => setSearchKey(r.key)} style={[styles.tickerBox, { backgroundColor: theme.accentTint }]}>
                    <Text style={[styles.tickerText, { color: theme.accent }]}>{(r.coin?.ticker ?? r.ticker).slice(0, 4)}</Text>
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Pressable onPress={() => setSearchKey(r.key)}>
                      <Text style={[styles.coinName, { color: colorTheme.ink }, !r.coin && { color: RED }]} numberOfLines={1}>
                        {r.coin ? r.coin.name : (isZh ? `未匹配到 ${r.ticker} · 点击搜索` : `No match for ${r.ticker} · tap to search`)}
                      </Text>
                    </Pressable>
                    <View style={styles.qtyRow}>
                      <TextInput value={r.qty} onChangeText={(v) => patch(r.key, { qty: v })} keyboardType="decimal-pad" style={[styles.qtyInput, { color: colorTheme.ink, backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]} />
                      <Text style={[styles.qtyUnit, { color: colorTheme.ink2 }]}>{r.coin?.ticker ?? r.ticker}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => remove(r.key)} hitSlop={8} style={[styles.removeBtn, { backgroundColor: colorTheme.surface2 }]}><Icon name="x" size={15} color={colorTheme.ink3} /></Pressable>
                </View>
              ))}
            </Card>
            <Text style={[styles.hint, { color: colorTheme.ink2 }]}>
              {isZh ? '点击币种可修改匹配代码。添加后行情将实时更新。' : 'Tap a coin to change the matched ticker. Values update live once added.'}
            </Text>
          </>
        )}

        {phase === 'done' && (
          <>
            <PipSays expr="happy"><BubbleText>{doneMsg}</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={onClose}><Icon name="check" size={18} color="#fff" stroke={2.4} /><BtnLabel>{isZh ? '完成' : 'Done'}</BtnLabel></PrimaryButton></View>
          </>
        )}
      </ScrollView>

      {phase === 'holdings' && (
        <View style={[styles.footer, { backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2, paddingBottom: insets.bottom + 16 }]}>
          <PrimaryButton onPress={confirmHoldings} disabled={importable.length === 0}>
            <Icon name="check" size={19} color="#fff" stroke={2.4} />
            <BtnLabel>{isZh ? `添加 ${importable.length} 项持仓` : `Add ${importable.length} holding${importable.length === 1 ? '' : 's'}`}</BtnLabel>
          </PrimaryButton>
        </View>
      )}
      </KeyboardAvoidingView>

      <TickerSearchModal
        visible={searchKey != null}
        title={isZh ? '匹配币种' : 'Match coin'}
        placeholder="BTC, ETH, SOL…"
        search={searchCrypto}
        onPick={(coin) => { if (searchKey != null) patch(searchKey, { coin, ticker: coin.ticker }); setSearchKey(null); }}
        onClose={() => setSearchKey(null)}
      />
    </View>
  );
}

function SecondaryButton({ onPress, disabled, icon, children }: { onPress: () => void; disabled?: boolean; icon: IconName; children: React.ReactNode }) {
  const theme = useAccent();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryBtn,
        { backgroundColor: theme.accentTint, borderColor: theme.accentSoft, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Icon name={icon} size={17} color={theme.accent} />
      <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>{children}</Text>
    </Pressable>
  );
}

function SourceButton({ icon, title, sub, onPress, disabled }: { icon: IconName; title: string; sub: string; onPress: () => void; disabled?: boolean }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.source, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, opacity: disabled ? 0.6 : pressed ? 0.9 : 1 }]}>
      <View style={[styles.sourceIcon, { backgroundColor: theme.accentTint }]}><Icon name={icon} size={24} color={theme.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sourceTitle, { color: colorTheme.ink }]}>{title}</Text>
        <Text style={[styles.sourceSub, { color: colorTheme.ink2 }]}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
    </Pressable>
  );
}

const RED = '#c5402f';
const styles = StyleSheet.create({
  root: { flex: 1 },
  busy: { marginTop: 22, padding: 24, alignItems: 'center' },
  source: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed' },
  sourceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sourceTitle: { fontFamily: uiFont(700), fontSize: 15.5 },
  sourceSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 1 },

  detectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detectedName: { fontFamily: uiFont(700), fontSize: 16 },
  detectedSub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 2 },

  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  textInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, fontFamily: uiFont(600), fontSize: 16 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14 },
  rm: { fontFamily: numFont(600), fontSize: 18 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, paddingVertical: 12 },
  hint: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 8 },

  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5 },
  classChipText: { fontFamily: uiFont(600), fontSize: 13 },

  sectionLabel: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.06, textTransform: 'uppercase', padding: 14, paddingBottom: 6 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  matchName: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5 },
  matchVal: { fontFamily: numFont(700), fontSize: 13.5 },

  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: radius.md, borderWidth: 1 },
  secondaryBtnText: { fontFamily: uiFont(700), fontSize: 13.5, textAlign: 'center' },
  linkBtn: { alignSelf: 'center', marginTop: 4, padding: 6 },
  linkText: { fontFamily: uiFont(600), fontSize: 12.5 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderTopWidth: 1 },
  tickerBox: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tickerText: { fontFamily: uiFont(700), fontSize: 12 },
  coinName: { fontFamily: uiFont(600), fontSize: 14.5 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  qtyInput: { fontFamily: numFont(700), fontSize: 15, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, minWidth: 90 },
  qtyUnit: { fontFamily: uiFont(600), fontSize: 12.5 },
  removeBtn: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
});
