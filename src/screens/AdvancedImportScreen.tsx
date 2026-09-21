// src/screens/AdvancedImportScreen.tsx
//
// Advanced import: user copies a prompt, attaches files to any LLM (Claude,
// ChatGPT, Gemini …), then pastes the JSON reply here.
//
// The JSON schema covers THREE data types:
//   transactions  → ExtractedTxn[]  → ImportReviewScreen → commitCategorized
//   accounts      → balance snapshots (savings, investments, loans, credit cards)
//                   → addAccount + addBalanceEntry on the Net Worth side
//
// JSON conventions:
//   transactions.amount: NEGATIVE = expense/debit, POSITIVE = income/credit
//   accounts.balance: always POSITIVE (outstanding amount for liabilities too)

import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import {
  B,
  BtnLabel,
  BubbleText,
  Card,
  Eyebrow,
  PipSays,
  PrimaryButton,
  TopBar,
} from '../components/ui';
import { addAccount, listAccounts, updateAccount, updateHoldingCost, updateHoldingQuantity, upsertDailyBalanceEntry } from '../db/accountsRepo';
import { addCategory, listCategories } from '../db/categoriesRepo';
import { setExpectedIncome, setAllocations, upsertSnapshot, setAdvice } from '../db/budgetRepo';
import { addReliefTag, upsertReliefMemory } from '../db/reliefRepo';
import { findOrCreatePerson, importParsedSplit, listPeople } from '../db/splitRepo';
import { upsertMemory } from '../db/memoryRepo';
import { addTransactions } from '../db/txnRepo';
import { listFxRates } from '../db/fxRepo';
import { addActiveCurrencies, ensureFxRate, getActiveCurrencies, getEntryCurrency } from '../db/currencyRepo';
import { pickCurrenciesToActivate } from '../billing/currencyEntitlements';
import { DROP, type Account, type ExtractedTxn } from '../lib/types';
import { BASE_CURRENCY, deriveNative, round2 } from '../lib/currency';
import { fmtMoney } from '../lib/format';
import { todayISO } from '../lib/duplicates';
import { rateFor, ratesFromCache } from '../lib/fx';
import { merchantKey } from '../lib/normalize';
import { defaultLinkEffect } from '../lib/networth';
import { addTrip as dbAddTrip, listTrips, setTransactionsTrip as dbSetTransactionsTrip } from '../db/tripsRepo';
import { searchInvestments } from '../prices';
import { quotesMYR } from '../prices/yahoo';
import { subFromType, type TickerResult } from '../lib/prices';
import {
  buildPrompt,
  isInvestmentCandidate,
  parseJSON,
  type ParsedAccount,
  type ParsedAppPreferences,
  type ParsedBudget,
  type ParsedCategory,
  type ParsedCommitment,
  type ParsedPerson,
  type ParsedSplit,
  type ParsedTaxRelief,
  type ParsedTransfer,
  type ParsedTrip,
  type ParseResult,
} from '../lib/advancedImport';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useBackHandler } from '../state/useBackHandler';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { radius, uiFont } from '../theme';
import { ImportReviewScreen } from './ImportReviewScreen';

export type { ParsedAccount, ParseResult };

// ─────────────────────────────────────────────────────────────────────────────
// LLM link chips
// ─────────────────────────────────────────────────────────────────────────────

const LLM_LINKS = [
  { label: 'Claude', url: 'https://claude.ai', emoji: '✦' },
  { label: 'ChatGPT', url: 'https://chatgpt.com', emoji: '✿' },
  { label: 'Gemini', url: 'https://gemini.google.com', emoji: '✧' },
];

async function prepareImportedCurrencies(foreignCodes: Set<string>, isPro: boolean): Promise<void> {
  const codes = Array.from(foreignCodes);
  if (codes.length === 0) return;
  await Promise.all(codes.map((code) => ensureFxRate(code)));
  const active = await getActiveCurrencies();
  await addActiveCurrencies(pickCurrenciesToActivate(active, codes, isPro));
}

function LLMChip({ label, url, emoji }: { label: string; url: string; emoji: string }) {
  const colorTheme = useThemeColors();
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [
        styles.llmChip,
        { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
        { opacity: pressed ? 0.82 : 1 },
      ]}
      accessibilityRole="link"
      accessibilityLabel={t('advImportOpenApp', { label })}
    >
      <Text style={styles.llmEmoji}>{emoji}</Text>
      <Text style={[styles.llmLabel, { color: colorTheme.ink }]}>{label}</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account review list (shown between parse and commit)
// ─────────────────────────────────────────────────────────────────────────────

function AccountReviewList({
  accounts,
  onChange,
}: {
  accounts: ParsedAccount[];
  onChange: (updated: ParsedAccount[]) => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const toggle = (i: number) => {
    const next = accounts.map((a, j) => (j === i ? { ...a, include: !a.include } : a));
    onChange(next);
  };

  if (accounts.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {accounts.map((acc, i) => {
        const isAsset = acc.kind === 'asset';
        const dot = isAsset ? theme.accent : colorTheme.amber;
        return (
          <Pressable
            key={i}
            onPress={() => toggle(i)}
            style={[
              styles.accRow,
              { borderBottomColor: colorTheme.line },
              !acc.include && { opacity: 0.45 },
            ]}
          >
            {/* Tick box */}
            <View
              style={[
                styles.tick,
                { borderColor: colorTheme.line },
                acc.include && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
            >
              {acc.include && (
                <Text style={{ color: '#fff', fontSize: 11, fontFamily: uiFont(800), lineHeight: 14 }}>✓</Text>
              )}
            </View>

            {/* Dot + name */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.kindDot, { backgroundColor: dot }]} />
                <Text style={[styles.accName, { color: colorTheme.ink }]} numberOfLines={1}>{acc.name}</Text>
              </View>
              <Text style={[styles.accMeta, { color: colorTheme.ink3 }]}>
                {acc.clsLabel}
                {acc.notes ? ` · ${acc.notes}` : ''}
                {' · '}{acc.asOf}
              </Text>
            </View>

            {/* Balance */}
            <Text style={[styles.accBalance, { color: isAsset ? theme.accent : colorTheme.amber }]}>
              {isAsset ? '+' : '−'}{fmtMoney(acc.balance, acc.currency)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live tracking review
// ─────────────────────────────────────────────────────────────────────────────

interface HoldingSetupState {
  enabled: boolean;
  symbol: string;
  ticker: string;
  sub: 'crypto' | 'stock' | 'commodity';
  quantity: string;
  priceMYR: number | null;
  searching: boolean;
  searchResults: TickerResult[];
  showSearch: boolean;
  searchQuery: string;
}

function LiveTrackingReview({
  accounts,
  onConfirm,
  onSkip,
  onBack,
}: {
  accounts: ParsedAccount[];
  onConfirm: (updated: ParsedAccount[]) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();

  const candidateIndices = useMemo<number[]>(() => {
    return accounts
      .map((a, i) => (isInvestmentCandidate(a) ? i : -1))
      .filter((i) => i >= 0);
  }, [accounts]);

  const [holdingStates, setHoldingStates] = useState<Record<number, HoldingSetupState>>(() => {
    const init: Record<number, HoldingSetupState> = {};
    for (const idx of candidateIndices) {
      const a = accounts[idx];
      init[idx] = {
        enabled: isPro,
        symbol: a.symbol ?? a.ticker ?? '',
        ticker: a.ticker ?? a.symbol ?? '',
        sub: (a.sub as any) ?? 'stock',
        quantity: a.quantity != null && a.quantity > 0 ? String(a.quantity) : '',
        priceMYR: null,
        searching: false,
        searchResults: [],
        showSearch: false,
        searchQuery: a.ticker ?? a.name ?? '',
      };
    }
    return init;
  });

  React.useEffect(() => {
    let active = true;
    const loadMatches = async () => {
      for (const idx of candidateIndices) {
        const a = accounts[idx];
        const st = holdingStates[idx];
        const query = st?.symbol || a.ticker || a.name;
        if (!query) continue;

        try {
          const results = await searchInvestments(query);
          if (!active) return;
          if (results.length > 0) {
            const best = results[0];
            const sym = best.id;
            const sub = subFromType(best.type);
            const quotes = await quotesMYR([sym]);
            if (!active) return;
            const q = quotes[sym];
            const price = q?.priceMYR ?? null;

            setHoldingStates((prev) => {
              const current = prev[idx];
              if (!current) return prev;
              let qty = current.quantity;
              if (!qty && price && price > 0) {
                const est = sub === 'crypto'
                  ? Math.round((a.balance / price) * 10000) / 10000
                  : Math.round((a.balance / price) * 100) / 100;
                qty = String(est);
              }
              return {
                ...prev,
                [idx]: {
                  ...current,
                  symbol: sym,
                  ticker: best.ticker,
                  sub,
                  priceMYR: price,
                  quantity: qty,
                },
              };
            });
          }
        } catch {}
      }
    };
    void loadMatches();
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async (idx: number, text: string) => {
    setHoldingStates((prev) => {
      const curr = prev[idx];
      return {
        ...prev,
        [idx]: curr
          ? { ...curr, searchQuery: text, searching: true }
          : {
              enabled: isPro,
              symbol: '',
              ticker: text,
              sub: 'stock',
              quantity: '',
              priceMYR: null,
              searching: true,
              searchResults: [],
              showSearch: true,
              searchQuery: text,
            },
      };
    });
    try {
      const results = await searchInvestments(text);
      setHoldingStates((prev) => {
        const curr = prev[idx];
        if (!curr) return prev;
        return {
          ...prev,
          [idx]: { ...curr, searchResults: results, searching: false },
        };
      });
    } catch {
      setHoldingStates((prev) => {
        const curr = prev[idx];
        if (!curr) return prev;
        return {
          ...prev,
          [idx]: { ...curr, searchResults: [], searching: false },
        };
      });
    }
  };

  const selectTicker = async (idx: number, res: TickerResult) => {
    const a = accounts[idx];
    const sym = res.id;
    const sub = subFromType(res.type);
    let price: number | null = null;
    try {
      const q = await quotesMYR([sym]);
      price = q[sym]?.priceMYR ?? null;
    } catch {}

    setHoldingStates((prev) => {
      const current = prev[idx];
      let qty = current?.quantity ?? '';
      if (price && price > 0 && (!qty || parseFloat(qty) <= 0)) {
        const est = sub === 'crypto'
          ? Math.round((a.balance / price) * 10000) / 10000
          : Math.round((a.balance / price) * 100) / 100;
        qty = String(est);
      }
      return {
        ...prev,
        [idx]: {
          ...(current ?? {
            enabled: isPro,
            symbol: sym,
            ticker: res.ticker,
            sub,
            priceMYR: price,
            quantity: qty,
            searching: false,
            searchResults: [],
            showSearch: false,
            searchQuery: res.ticker,
          }),
          symbol: sym,
          ticker: res.ticker,
          sub,
          priceMYR: price,
          quantity: qty,
          showSearch: false,
        },
      };
    });
  };

  const handleApply = () => {
    const updated = accounts.map((a, i) => {
      const st = holdingStates[i];
      if (!st || !st.enabled || !st.symbol || !isPro) return a;
      const numQty = parseFloat(st.quantity);
      if (!Number.isFinite(numQty) || numQty <= 0) return a;
      return {
        ...a,
        cls: 'investments',
        symbol: st.symbol,
        ticker: st.ticker,
        sub: st.sub,
        quantity: numQty,
        cost: a.cost ?? a.balance,
      };
    });
    onConfirm(updated);
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ marginBottom: 4 }}>
        <Text style={[styles.stepTitle, { color: colorTheme.ink, fontSize: 18 }]}>
          {isZh ? '设置实时投资行情追踪' : 'Set Up Live Investment Tracking'}
        </Text>
        <Text style={[styles.copyHint, { color: colorTheme.ink2, textAlign: 'left', marginTop: 4 }]}>
          {isZh
            ? '发现以下可追踪行情的投资/加密资产。关联行情代码后，净值将自动根据实时市价更新。'
            : 'We detected investment or crypto holdings. Link market tickers below to automatically track live portfolio value.'}
        </Text>
      </View>

      {candidateIndices.map((idx) => {
        const a = accounts[idx];
        if (!a) return null;
        const st = holdingStates[idx] ?? {
          enabled: isPro,
          symbol: a.symbol ?? a.ticker ?? '',
          ticker: a.ticker ?? a.symbol ?? '',
          sub: (a.sub as any) ?? 'stock',
          quantity: a.quantity != null && a.quantity > 0 ? String(a.quantity) : '',
          priceMYR: null,
          searching: false,
          searchResults: [],
          showSearch: false,
          searchQuery: a.ticker ?? a.name ?? '',
        };

        return (
          <Card key={idx} style={{ padding: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.accName, { color: colorTheme.ink, fontSize: 15 }]}>{a.name}</Text>
                <Text style={[styles.accMeta, { color: colorTheme.ink3 }]}>
                  {a.clsLabel} · {fmtMoney(a.balance, a.currency)}
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  if (!st.enabled && !isPro) {
                    openPaywall('live_holdings', 'advancedImport');
                    return;
                  }
                  setHoldingStates((prev) => {
                    const curr = prev[idx] ?? st;
                    return {
                      ...prev,
                      [idx]: { ...curr, enabled: !curr.enabled },
                    };
                  });
                }}
                style={[
                  styles.toggleChip,
                  { backgroundColor: st.enabled ? theme.accentTint : colorTheme.surface2, borderColor: st.enabled ? theme.accent : colorTheme.line },
                ]}
              >
                <Text style={{ fontFamily: uiFont(700), fontSize: 12, color: st.enabled ? theme.accent : colorTheme.ink3 }}>
                  {st.enabled ? (isZh ? '实时追踪 开启' : 'Live Tracking ON') : (isZh ? '保存为普通账户' : 'Manual Value')}
                </Text>
              </Pressable>
            </View>

            {st.enabled && (
              <View style={{ gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: colorTheme.line2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: uiFont(600), fontSize: 11, color: colorTheme.ink3, textTransform: 'uppercase' }}>
                      {isZh ? '关联标的 / 代码' : 'Market Symbol'}
                    </Text>
                    <Text style={{ fontFamily: uiFont(700), fontSize: 14, color: colorTheme.ink, marginTop: 2 }}>
                      {st.symbol ? `${st.ticker} (${st.symbol})` : (isZh ? '未关联标的' : 'No symbol linked')}
                    </Text>
                    {st.priceMYR != null && (
                      <Text style={{ fontFamily: uiFont(500), fontSize: 12, color: theme.accent, marginTop: 2 }}>
                        {isZh ? '实时单价: ' : 'Live Price: '}{fmtMoney(st.priceMYR, 'MYR')}
                      </Text>
                    )}
                  </View>

                  <Pressable
                    onPress={() => {
                      const nextShow = !st.showSearch;
                      setHoldingStates((prev) => {
                        const curr = prev[idx] ?? st;
                        return {
                          ...prev,
                          [idx]: { ...curr, showSearch: nextShow },
                        };
                      });
                      if (nextShow && (!st.searchResults || st.searchResults.length === 0)) {
                        void handleSearch(idx, st.searchQuery);
                      }
                    }}
                    style={[styles.smallBtn, { borderColor: colorTheme.line, backgroundColor: colorTheme.surface2 }]}
                  >
                    <Text style={{ fontFamily: uiFont(600), fontSize: 12, color: colorTheme.ink }}>
                      {st.showSearch ? (isZh ? '收起' : 'Done') : (isZh ? '更改标的' : 'Change')}
                    </Text>
                  </Pressable>
                </View>

                {st.showSearch && (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    <TextInput
                      value={st.searchQuery}
                      onChangeText={(t) => void handleSearch(idx, t)}
                      placeholder={isZh ? '搜索股票代码、币种或基金...' : 'Search ticker, e.g. AAPL, BTC, 1155.KL'}
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.smallInput, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink }]}
                    />
                    {st.searching && <ActivityIndicator size="small" color={theme.accent} />}
                    <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
                      {st.searchResults.map((r) => (
                        <Pressable
                          key={r.id}
                          onPress={() => void selectTicker(idx, r)}
                          style={[styles.searchResultRow, { borderBottomColor: colorTheme.line2 }]}
                        >
                          <Text style={{ fontFamily: uiFont(700), fontSize: 12.5, color: colorTheme.ink }}>{r.ticker} · {r.id}</Text>
                          <Text style={{ fontFamily: uiFont(400), fontSize: 11.5, color: colorTheme.ink3 }} numberOfLines={1}>{r.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: uiFont(600), fontSize: 11, color: colorTheme.ink3, textTransform: 'uppercase' }}>
                    {isZh ? '持有数量 / 份额 (Units)' : 'Units / Shares Held'}
                  </Text>
                  <TextInput
                    keyboardType="numeric"
                    value={st.quantity}
                    onChangeText={(txt) => setHoldingStates((prev) => {
                      const curr = prev[idx] ?? st;
                      return {
                        ...prev,
                        [idx]: { ...curr, quantity: txt },
                      };
                    })}
                    placeholder="0.00"
                    placeholderTextColor={colorTheme.ink3}
                    style={[styles.smallInput, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink }]}
                  />
                  <Text style={{ fontFamily: uiFont(400), fontSize: 11, color: colorTheme.ink3 }}>
                    {isZh
                      ? '已根据账单金额与当前市价预估数量。如有出入请手动修改。'
                      : 'Estimated from balance & market price. Edit if your actual units differ.'}
                  </Text>
                </View>
              </View>
            )}
          </Card>
        );
      })}

      <View style={{ marginTop: 8, gap: 10 }}>
        <PrimaryButton onPress={handleApply}>
          <Icon name="check" size={18} color="#fff" stroke={2.4} />
          <BtnLabel>{isZh ? '保存行情并继续' : 'Confirm & Continue'}</BtnLabel>
        </PrimaryButton>

        <Pressable onPress={onSkip} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colorTheme.ink3 }]}>
            {isZh ? '跳过 (按普通账户导入)' : 'Skip (Keep as Manual Accounts)'}
          </Text>
        </Pressable>

        <Pressable onPress={onBack} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colorTheme.ink3 }]}>
            {isZh ? '返回账户列表' : 'Back to Accounts'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

type Phase =
  | 'guide'
  | 'pasting'
  | 'accountReview'   // reviewing parsed accounts before the txn review
  | 'liveTrackingReview' // setup live investment tracking
  | 'txnReview'       // ImportReviewScreen takeover
  | 'saving'
  | 'done'
  | 'error';


export function AdvancedImportScreen({
  onClose,
  onSuccess,
  isWizard = false,
  embedded,
}: {
  onClose: () => void;
  onSuccess?: () => void;
  isWizard?: boolean;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const { isPro } = useEntitlement();
  const { commitCategorized, recordBalanceLink, refreshAll, setHoldingCost, updateHoldingQuantity, importParsedCommitments } = useAppData();

  const [phase, setPhase] = useState<Phase>('guide');
  const [jsonText, setJsonText] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<string>(BASE_CURRENCY);
  const [parsedTrips, setParsedTrips] = useState<ParsedTrip[]>([]);
  const [parsedTxns, setParsedTxns] = useState<ExtractedTxn[]>([]);
  const [parsedAccounts, setParsedAccounts] = useState<ParsedAccount[]>([]);
  const [parsedTransfers, setParsedTransfers] = useState<ParsedTransfer[]>([]);
  const [parsedCommitments, setParsedCommitments] = useState<ParsedCommitment[]>([]);
  const [parsedCategories, setParsedCategories] = useState<ParsedCategory[]>([]);
  const [parsedDeletedCats, setParsedDeletedCats] = useState<string[]>([]);
  const [parsedPeople, setParsedPeople] = useState<ParsedPerson[]>([]);
  const [parsedSplits, setParsedSplits] = useState<ParsedSplit[]>([]);
  const [parsedBudget, setParsedBudget] = useState<ParsedBudget | null>(null);
  const [parsedTaxRelief, setParsedTaxRelief] = useState<ParsedTaxRelief | null>(null);
  const [parsedMerchantMemory, setParsedMerchantMemory] = useState<Record<string, string>>({});
  const [parsedPreferences, setParsedPreferences] = useState<ParsedAppPreferences | null>(null);
  const [updateAccountBalances, setUpdateAccountBalances] = useState(false);
  const [error, setError] = useState('');
  const [txnCount, setTxnCount] = useState(0);
  const [txnSkipped, setTxnSkipped] = useState(0);
  const [accCount, setAccCount] = useState(0);
  const [tripCount, setTripCount] = useState(0);
  const [transferCount, setTransferCount] = useState(0);
  const [commitmentCount, setCommitmentCount] = useState(0);
  const [splitCount, setSplitCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBack = (): boolean => {
    if (phase === 'txnReview') {
      const prevPhase: Phase =
        parsedAccounts.length > 0
          ? parsedAccounts.some(isInvestmentCandidate)
            ? 'liveTrackingReview'
            : 'accountReview'
          : 'pasting';
      setPhase(prevPhase);
      return true;
    }
    if (phase === 'liveTrackingReview') {
      setPhase(parsedAccounts.length > 0 ? 'accountReview' : 'pasting');
      return true;
    }
    if (phase === 'accountReview') {
      setPhase('pasting');
      return true;
    }
    if (phase === 'error') {
      setPhase('pasting');
      return true;
    }
    if (phase === 'saving') {
      return true;
    }
    if (phase === 'done') {
      (onSuccess ?? onClose)();
      return true;
    }
    onClose();
    return true;
  };

  useBackHandler(handleBack);

  React.useEffect(() => {
    getEntryCurrency().then(setDefaultCurrency);
  }, []);

  const prompt = buildPrompt(defaultCurrency);

  // ── Copy prompt ──────────────────────────────────────────────────────────
  const copyPrompt = async () => {
    try {
      if (Platform.OS === 'web') {
        await (navigator as Navigator & { clipboard: Clipboard }).clipboard.writeText(prompt);
      } else {
        await Share.share({ message: prompt });
      }
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Non-fatal: Share/clipboard can fail on some devices; user can try again.
    }
  };

  // ── Upload a JSON file from the device instead of pasting ────────────────
  const [pickingFile, setPickingFile] = useState(false);
  const pickJsonFile = async () => {
    setPickingFile(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'text/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const text = await new File(asset.uri).text();
      setJsonText(text);
      setPhase('pasting');
      handlePasteImport(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('advImportErrCouldNotReadFile'));
      setPhase('error');
    } finally {
      setPickingFile(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      setJsonText(text);
      setPhase('pasting');
      handlePasteImport(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('advImportErrPasteFirst'));
      setPhase('error');
    }
  };

  // ── Parse pasted (or uploaded) JSON ───────────────────────────────────────
  const handlePasteImport = (text?: string) => {
    const trimmed = (text ?? jsonText).trim();
    if (!trimmed) {
      setError(t('advImportErrPasteFirst'));
      setPhase('error');
      return;
    }
    try {
      const {
        trips: pTrips,
        transactions,
        accounts,
        transfers,
        commitments,
        categories: pCats,
        deletedDefaultCategories: pDelCats,
        people: pPeople,
        splits: pSplits,
        budget: pBudget,
        taxRelief: pRelief,
        merchantMemory: pMemory,
        preferences: pPrefs,
      } = parseJSON(trimmed, defaultCurrency);

      if (
        transactions.length === 0 &&
        accounts.length === 0 &&
        transfers.length === 0 &&
        commitments.length === 0 &&
        (!pTrips || pTrips.length === 0) &&
        (!pCats || pCats.length === 0) &&
        (!pSplits || pSplits.length === 0) &&
        !pBudget &&
        !pRelief
      ) {
        setError(t('advImportErrEmptyJson'));
        setPhase('error');
        return;
      }
      setParsedTrips(pTrips ?? []);
      setParsedTxns(transactions);
      setParsedAccounts(accounts);
      setParsedTransfers(transfers);
      setParsedCommitments(commitments);
      setParsedCategories(pCats ?? []);
      setParsedDeletedCats(pDelCats ?? []);
      setParsedPeople(pPeople ?? []);
      setParsedSplits(pSplits ?? []);
      setParsedBudget(pBudget ?? null);
      setParsedTaxRelief(pRelief ?? null);
      setParsedMerchantMemory(pMemory ?? {});
      setParsedPreferences(pPrefs ?? null);

      // Cache FX for every imported currency; only fill remaining picker slots on Free.
      const foreignCodes = new Set<string>();
      for (const a of accounts) if (a.currency !== BASE_CURRENCY) foreignCodes.add(a.currency);
      for (const t of transactions) if (t.currency && t.currency !== BASE_CURRENCY) foreignCodes.add(t.currency);
      for (const tr of transfers) if (tr.currency && tr.currency !== BASE_CURRENCY) foreignCodes.add(tr.currency);
      for (const c of commitments) if (c.currency && c.currency !== BASE_CURRENCY) foreignCodes.add(c.currency);
      if (pPrefs?.activeCurrencies) {
        for (const code of pPrefs.activeCurrencies) if (code !== BASE_CURRENCY) foreignCodes.add(code);
      }
      void prepareImportedCurrencies(foreignCodes, isPro);

      // If there are accounts to review, show that step first.
      if (accounts.length > 0) {
        setPhase('accountReview');
      } else {
        setPhase('txnReview');
      }
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? t('advImportErrInvalidJson')
          : String(e),
      );
      setPhase('error');
    }
  };

  // ── Commit accounts + transactions ────────────────────────────────────────
  const commitAll = async (txns: ExtractedTxn[], assignments: (string | null)[]) => {
    setPhase('saving');
    let savedAcc = 0;
    try {
      // Ensure all foreign currencies are activated and rates cached before committing
      const toSave = parsedAccounts.filter((a) => a.include);
      const foreignCodes = new Set<string>();
      for (const a of toSave) if (a.currency !== BASE_CURRENCY) foreignCodes.add(a.currency);
      for (const t of txns) if (t.currency && t.currency !== BASE_CURRENCY) foreignCodes.add(t.currency);
      for (const tr of parsedTransfers) if (tr.currency && tr.currency !== BASE_CURRENCY) foreignCodes.add(tr.currency);
      for (const c of parsedCommitments) if (c.currency && c.currency !== BASE_CURRENCY) foreignCodes.add(c.currency);
      if (parsedPreferences?.activeCurrencies) {
        for (const code of parsedPreferences.activeCurrencies) if (code !== BASE_CURRENCY) foreignCodes.add(code);
      }
      if (foreignCodes.size > 0) {
        await prepareImportedCurrencies(foreignCodes, isPro);
      }

      // 0. Commit custom categories if any
      if (parsedCategories.length > 0) {
        const existingCats = await listCategories();
        const existingCatIds = new Set(existingCats.map((c) => c.id));
        for (const cat of parsedCategories) {
          if (!existingCatIds.has(cat.id)) {
            try {
              await addCategory(cat.label, cat.icon, cat.hue, cat.kind);
            } catch {}
          }
        }
      }

      // 1. Commit the chosen accounts to the Net Worth DB with their denominated currency and balance history.
      const existingAccountsOnBoot = await listAccounts();
      const existingAccByName = new Map(existingAccountsOnBoot.map((a) => [a.name.trim().toLowerCase(), a]));
      const newlyCreatedAccounts: Account[] = [];

      for (const acc of toSave) {
        const searchName = acc.name.trim().toLowerCase();
        let targetAcc = existingAccByName.get(searchName);

        if (!targetAcc) {
          targetAcc = await addAccount(acc.name, acc.kind, acc.cls, acc.balance, acc.asOf, acc.icon, acc.currency, acc.interestRate);
          newlyCreatedAccounts.push(targetAcc);
          savedAcc++;
        } else {
          await updateAccount(targetAcc.id, {
            name: acc.name,
            cls: acc.cls,
            icon: acc.icon,
            interestRate: acc.interestRate,
            sub: acc.sub,
            symbol: acc.symbol,
            ticker: acc.ticker,
            quantity: acc.quantity,
            cost: acc.cost,
          });
        }

        if (acc.cost != null) await setHoldingCost(targetAcc.id, acc.cost);
        if (acc.quantity != null) await updateHoldingQuantity(targetAcc.id, acc.quantity);

        // If history is present, import all balance entries for this account
        if (acc.history && acc.history.length > 0) {
          for (const h of acc.history) {
            await upsertDailyBalanceEntry(targetAcc.id, h.value, h.asOf);
          }
        }
      }

      // 2. Commit transactions via the store.
      const { created } = await commitCategorized(txns, assignments, 'imported');
      setTxnCount(created.length);
      setTxnSkipped(assignments.filter((a) => a === DROP).length);
      setAccCount(savedAcc);

      // 2b. Commit & link Trips
      if (parsedTrips.length > 0 || txns.some((t) => Boolean(t.tripName))) {
        const existingTrips = await listTrips();
        const tripMetaByName = new Map<string, { id: string; startDate: string; endDate: string }>();

        for (const et of existingTrips) {
          if (et.startDate && et.endDate) {
            tripMetaByName.set(et.name.trim().toLowerCase(), { id: et.id, startDate: et.startDate, endDate: et.endDate });
          }
        }

        for (const pt of parsedTrips) {
          const key = pt.name.trim().toLowerCase();
          const existing = tripMetaByName.get(key);
          if (existing) continue;
          try {
            const added = await dbAddTrip(pt.name, pt.startDate, pt.endDate);
            tripMetaByName.set(key, { id: added.id, startDate: added.startDate!, endDate: added.endDate! });
          } catch {}
        }

        const txnsByTripId = new Map<string, string[]>();
        let createdIdx = 0;
        for (let i = 0; i < txns.length; i++) {
          if (assignments[i] === DROP) continue;
          const original = txns[i];
          const createdTxn = created[createdIdx++];
          if (!createdTxn) continue;

          if (original.tripName && original.date) {
            const tripMeta = tripMetaByName.get(original.tripName.trim().toLowerCase());
            // STRICT DATE CHECK: Only link if transaction date is within the trip's start & end dates
            if (tripMeta && original.date >= tripMeta.startDate && original.date <= tripMeta.endDate) {
              if (!txnsByTripId.has(tripMeta.id)) txnsByTripId.set(tripMeta.id, []);
              txnsByTripId.get(tripMeta.id)!.push(createdTxn.id);
            }
          }
        }

        for (const [tId, tTxnIds] of txnsByTripId.entries()) {
          if (tTxnIds.length > 0) {
            await dbSetTransactionsTrip(tTxnIds, tId);
          }
        }
        setTripCount(txnsByTripId.size);
      }

      // 3. Update account balances with imported transactions if option enabled.
      if (updateAccountBalances) {
        const rates = ratesFromCache(await listFxRates());
        const existingAccounts = await listAccounts();
        const allAccounts = [
          ...newlyCreatedAccounts,
          ...existingAccounts.filter((e) => !newlyCreatedAccounts.some((n) => n.id === e.id)),
        ];

        const today = todayISO();
        for (let i = 0; i < txns.length; i++) {
          if (assignments[i] === DROP) continue;
          const txn = txns[i];

          let targetAccount: Account | null = null;
          if (txn.account) {
            const searchName = txn.account.trim().toLowerCase();
            targetAccount = allAccounts.find((a) => a.name.trim().toLowerCase() === searchName) || null;
          }
          if (!targetAccount && allAccounts.length === 1) {
            targetAccount = allAccounts[0];
          }

          if (targetAccount) {
            const effect = defaultLinkEffect(targetAccount.kind, txn.type);
            let linkAmount: number;
            if (targetAccount.currency === txn.currency) {
              linkAmount = txn.amount;
            } else {
              const txnRate = rateFor(rates, txn.currency);
              const myrAmount = txn.currency === BASE_CURRENCY ? txn.amount : round2(txn.amount * (txnRate ?? 1));
              linkAmount = deriveNative(myrAmount, targetAccount.currency, rateFor(rates, targetAccount.currency));
            }
            await recordBalanceLink(targetAccount.id, linkAmount, effect, txn.date ?? today);
          }
        }

        // 3b. A transfer moves money too.
        if (parsedTransfers.length > 0) {
          const existingAccounts2 = await listAccounts();
          const allAccounts2 = [
            ...newlyCreatedAccounts,
            ...existingAccounts2.filter((e) => !newlyCreatedAccounts.some((n) => n.id === e.id)),
          ];
          for (const t of parsedTransfers) {
            if (!t.account) continue;
            const searchName = t.account.trim().toLowerCase();
            const targetAccount = allAccounts2.find((a) => a.name.trim().toLowerCase() === searchName);
            if (targetAccount) {
              let linkAmount: number;
              if (targetAccount.currency === t.currency) {
                linkAmount = t.amount;
              } else {
                const tRate = rateFor(rates, t.currency);
                const myrAmount = t.currency === BASE_CURRENCY ? t.amount : round2(t.amount * (tRate ?? 1));
                linkAmount = deriveNative(myrAmount, targetAccount.currency, rateFor(rates, targetAccount.currency));
              }
              await recordBalanceLink(targetAccount.id, linkAmount, 'subtract', t.date ?? today);
            }
          }
        }
      }

      // 4. Log transfers to the ledger.
      if (parsedTransfers.length > 0) {
        const rates = ratesFromCache(await listFxRates());
        await addTransactions(
          parsedTransfers.map((t) => ({
            merchantRaw: t.description || 'Transfer',
            merchantKey: merchantKey(t.description || 'transfer'),
            amount: t.amount,
            type: 'transfer' as const,
            date: t.date,
            categoryId: null,
            source: 'imported' as const,
            currency: t.currency ?? BASE_CURRENCY,
            fxRate: t.currency && t.currency !== BASE_CURRENCY ? rateFor(rates, t.currency) : null,
          }))
        );
      }
      setTransferCount(parsedTransfers.length);

      // 5. Recurring commitments.
      if (parsedCommitments.length > 0) {
        await importParsedCommitments(parsedCommitments);
      }
      setCommitmentCount(parsedCommitments.length);

      // 6. People & Splits
      if (parsedPeople.length > 0) {
        for (const p of parsedPeople) {
          await findOrCreatePerson(p.name);
        }
      }
      if (parsedSplits.length > 0) {
        const currentPeople = await listPeople();
        const personByName = new Map(currentPeople.map((p) => [p.name.trim().toLowerCase(), p.id]));
        const personById = new Map(currentPeople.map((p) => [p.id, p.id]));

        let sCount = 0;
        for (const s of parsedSplits) {
          let targetTxnId: string | null = null;
          if (s.txnId) {
            const match = created.find((t) => t.id === s.txnId);
            if (match) targetTxnId = match.id;
          }
          if (!targetTxnId && created.length > 0) {
            const match = created.find((t) => Math.abs(t.amount - s.ownShare) < 0.01 && t.currency === s.currency);
            if (match) targetTxnId = match.id;
          }
          if (targetTxnId) {
            const mappedShares = s.shares.map((sh) => {
              let pId = sh.personId ? personById.get(sh.personId) : null;
              if (!pId && sh.personName) {
                pId = personByName.get(sh.personName.trim().toLowerCase()) ?? null;
              }
              return {
                personId: pId ?? (currentPeople[0]?.id ?? 'unknown'),
                owed: sh.owed,
                paid: sh.paid,
                status: sh.status,
                writtenOffTxnId: sh.writtenOffTxnId ?? null,
                payments: sh.payments,
              };
            });
            await importParsedSplit(targetTxnId, s.gross, s.ownShare, s.method, s.currency, s.fxRate ?? null, mappedShares);
            sCount++;
          }
        }
        setSplitCount(sCount);
      }

      // 7. Budget, Allocations, Snapshots, Advice
      if (parsedBudget) {
        if (parsedBudget.expectedIncome > 0) {
          await setExpectedIncome(parsedBudget.expectedIncome);
        }
        if (Object.keys(parsedBudget.allocations).length > 0) {
          await setAllocations(parsedBudget.allocations);
        }
        if (parsedBudget.snapshots) {
          for (const [m, snap] of Object.entries(parsedBudget.snapshots)) {
            await upsertSnapshot(m, snap.income, snap.allocations);
          }
        }
        if (parsedBudget.advice) {
          await setAdvice(parsedBudget.advice.hash, parsedBudget.advice.text);
        }
      }

      // 8. Tax Relief Tags & Memory
      if (parsedTaxRelief) {
        if (parsedTaxRelief.memory) {
          for (const [k, v] of Object.entries(parsedTaxRelief.memory)) {
            await upsertReliefMemory(k, v);
          }
        }
        if (parsedTaxRelief.tags && parsedTaxRelief.tags.length > 0) {
          for (const tag of parsedTaxRelief.tags) {
            let targetTxnId: string | null = null;
            if (tag.txnId) {
              const match = created.find((t) => t.id === tag.txnId);
              if (match) targetTxnId = match.id;
            }
            if (!targetTxnId && created.length > 0) {
              const match = created.find((t) => Math.abs(t.amount - tag.amount) < 0.01);
              if (match) targetTxnId = match.id;
            }
            if (targetTxnId) {
              try {
                await addReliefTag({
                  txnId: targetTxnId,
                  code: tag.code,
                  ya: tag.ya,
                  amount: tag.amount,
                  origin: tag.origin,
                });
              } catch {}
            }
          }
        }
      }

      // 9. Merchant Memory
      if (parsedMerchantMemory && Object.keys(parsedMerchantMemory).length > 0) {
        for (const [k, v] of Object.entries(parsedMerchantMemory)) {
          await upsertMemory(k, v);
        }
      }

      // Refresh so Net Worth screen picks up new accounts and balance entries.
      await refreshAll();

      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  // ── txnReview is a full-screen takeover ──────────────────────────────────
  if (phase === 'txnReview') {
    if (parsedTxns.length === 0) {
      // No transactions: skip review and commit accounts only (empty assignments).
      void commitAll([], []);
      return (
        <View style={[styles.root, { backgroundColor: colorTheme.bg, alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={theme.accent} />
        </View>
      );
    }
    return (
      <ImportReviewScreen
        items={parsedTxns}
        onCancel={() => setPhase(parsedAccounts.length > 0 ? (parsedAccounts.some(isInvestmentCandidate) ? 'liveTrackingReview' : 'accountReview') : 'pasting')}
        onConfirm={commitAll}
        updateAccountBalances={updateAccountBalances}
        onToggleUpdateAccountBalances={setUpdateAccountBalances}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={t('importAdvancedTitle')} onBack={handleBack} />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* ── Pip intro / done message ── */}
        {/* Pip works the file in goggles with a flask in each hand, and drops back to a plain grin
            once it has landed — the lab pose says "still running it", which stops being true at
            'done'. The size bump is the pose's own: its glassware fills the margins the plain coin
            leaves empty, so at PipSays' default the coin itself would come out smaller. */}
        <PipSays
          expr={phase === 'done' ? 'happy' : 'idle'}
          scientist={phase !== 'done'}
          size={phase === 'done' ? 60 : 78}
        >
          <BubbleText>
            {phase === 'done' ? (
              <>
                {t('advImportDoneGreeting')}
                {txnCount > 0 && (
                  <>
                    {' '}
                    <B>{t('advImportTxnClause', { count: txnCount })}</B>
                    {txnSkipped > 0 ? <> <B>{t('advImportSkippedClause', { count: txnSkipped })}</B></> : ''}.
                  </>
                )}
                {accCount > 0 && <> <B>{t('advImportAccClause', { count: accCount })}</B>.</>}
                {transferCount > 0 && <> <B>{t('advImportTransferClause', { count: transferCount })}</B>.</>}
                {commitmentCount > 0 && <> <B>{t('advImportCommitmentClause', { count: commitmentCount })}</B>.</>}
                {tripCount > 0 && <> <B>{isZh ? `已关联 ${tripCount} 个旅行` : `Linked ${tripCount} trip${tripCount === 1 ? '' : 's'}`}</B>.</>}
                {splitCount > 0 && <> <B>{t('advImportSplitClause', { count: splitCount })}</B>.</>}
              </>
            ) : phase === 'accountReview' ? (
              <>
                {t('advImportFoundSummary', {
                  accPhrase: t('advImportFoundAccPhrase', { count: parsedAccounts.length }),
                  txnPhrase: t('advImportFoundTxnPhrase', { count: parsedTxns.length }),
                })}
              </>
            ) : phase === 'liveTrackingReview' ? (
              <>
                {isZh
                  ? '为你的投资与加密资产关联实时行情。'
                  : 'Link live market prices for your investment and crypto holdings.'}
              </>
            ) : (
              <>
                {t('advImportGuideIntro')}
              </>
            )}
          </BubbleText>
        </PipSays>

        {/* ── DONE ── */}
        {phase === 'done' && (
          <>
            <Card style={{ padding: 16, marginTop: 18, gap: 10 }}>
              {txnCount > 0 && (
                <Text style={[styles.doneText, { color: colorTheme.ink2 }]}>
                  {t('advImportTxnCategoriesNote')}
                </Text>
              )}
              {accCount > 0 && (
                <Text style={[styles.doneText, { color: colorTheme.ink2 }]}>
                  {t('advImportAccountsVisibleNote', { netWorth: t('netWorthTitle') })}
                </Text>
              )}
            </Card>
            <View style={{ marginTop: 22 }}>
              <PrimaryButton onPress={() => { (onSuccess ?? onClose)(); }}>
                <Icon name={isWizard ? 'arrowRight' : 'check'} size={18} color="#fff" stroke={2.4} />
                <BtnLabel>{isWizard ? t('advImportContinueSetup') : t('advImportDoneBtn')}</BtnLabel>
              </PrimaryButton>
            </View>
          </>
        )}

        {/* ── SAVING ── */}
        {phase === 'saving' && (
          <Card style={[styles.busyCard, { marginTop: 18 }]}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.busyText, { color: colorTheme.ink2 }]}>{t('advImportSavingData')}</Text>
          </Card>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <>
            <Card style={[styles.errorCard, { borderColor: `${colorTheme.red}44`, backgroundColor: `${colorTheme.red}08` }, { marginTop: 18 }]}>
              <View style={styles.errorRow}>
                <Icon name="alert" size={16} color={colorTheme.red} />
                <Text style={[styles.errorText, { color: colorTheme.red }]}>{error}</Text>
              </View>
            </Card>
            <View style={{ marginTop: 14 }}>
              <PrimaryButton onPress={() => setPhase('pasting')}>
                <Icon name="chevronLeft" size={18} color="#fff" />
                <BtnLabel>{t('advImportTryAgain')}</BtnLabel>
              </PrimaryButton>
            </View>
          </>
        )}

        {/* ── ACCOUNT REVIEW ── */}
        {phase === 'accountReview' && (
          <>
            <View style={{ marginTop: 20 }}>
              {parsedTxns.length > 0 && (
                <Card style={{ padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable
                    onPress={() => setUpdateAccountBalances((prev) => !prev)}
                    hitSlop={6}
                    style={{ padding: 2 }}
                  >
                    <View
                      style={[
                        styles.tick,
                        { borderColor: colorTheme.line },
                        updateAccountBalances && { backgroundColor: theme.accent, borderColor: theme.accent },
                      ]}
                    >
                      {updateAccountBalances && (
                        <Text style={{ color: '#fff', fontSize: 11, fontFamily: uiFont(800), lineHeight: 14 }}>✓</Text>
                      )}
                    </View>
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => setUpdateAccountBalances((prev) => !prev)}>
                    <Text style={[styles.accName, { color: colorTheme.ink }]}>
                      {t('advImportUpdateBalancesTitle')}
                    </Text>
                    <Text style={[styles.accMeta, { color: colorTheme.ink3, marginTop: 2 }]}>
                      {t('advImportUpdateBalancesDesc')}
                    </Text>
                  </Pressable>
                </Card>
              )}

              <Eyebrow style={{ marginBottom: 12 }}>
                {t('advImportAccSelectedCount', {
                  selected: parsedAccounts.filter((a) => a.include).length,
                  total: parsedAccounts.length,
                })}
              </Eyebrow>

              {/* Legend */}
              <View style={styles.legendRow}>
                <View style={[styles.kindDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.legendText, { color: colorTheme.ink2 }]}>{t('advImportAssetLegend')}</Text>
                <View style={[styles.kindDot, { backgroundColor: colorTheme.amber, marginLeft: 12 }]} />
                <Text style={[styles.legendText, { color: colorTheme.ink2 }]}>{t('advImportLiabilityLegend')}</Text>
              </View>

              <Card style={{ padding: 14, marginTop: 10 }}>
                <AccountReviewList
                  accounts={parsedAccounts}
                  onChange={setParsedAccounts}
                />
              </Card>
            </View>

            <View style={{ marginTop: 18, gap: 10 }}>
              {parsedTxns.length > 0 ? (
                <PrimaryButton onPress={() => {
                  if (parsedAccounts.some(isInvestmentCandidate)) {
                    setPhase('liveTrackingReview');
                  } else {
                    setPhase('txnReview');
                  }
                }}>
                  <Icon name="chevronRight" size={18} color="#fff" />
                  <BtnLabel>{t('advImportContinueReviewTxns', { count: parsedTxns.length })}</BtnLabel>
                </PrimaryButton>
              ) : (
                <PrimaryButton onPress={() => {
                  if (parsedAccounts.some(isInvestmentCandidate)) {
                    setPhase('liveTrackingReview');
                  } else {
                    void commitAll([], []);
                  }
                }}>
                  <Icon name="check" size={18} color="#fff" stroke={2.4} />
                  <BtnLabel>{t('advImportImportAccounts', { count: parsedAccounts.filter((a) => a.include).length })}</BtnLabel>
                </PrimaryButton>
              )}
              <Pressable onPress={() => setPhase('pasting')} style={styles.backLink}>
                <Text style={[styles.backLinkText, { color: colorTheme.ink3 }]}>{t('advImportBackToPaste')}</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── LIVE TRACKING REVIEW ── */}
        {phase === 'liveTrackingReview' && (
          <LiveTrackingReview
            accounts={parsedAccounts}
            onConfirm={(updated) => {
              setParsedAccounts(updated);
              if (parsedTxns.length > 0) {
                setPhase('txnReview');
              } else {
                void commitAll([], []);
              }
            }}
            onSkip={() => {
              if (parsedTxns.length > 0) {
                setPhase('txnReview');
              } else {
                void commitAll([], []);
              }
            }}
            onBack={() => setPhase('accountReview')}
          />
        )}

        {/* ── GUIDE + PASTING ── */}
        {(phase === 'guide' || phase === 'pasting') && (
          <>
            {/* Step 1 */}
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, { backgroundColor: theme.accent }]}><Text style={styles.stepNum}>1</Text></View>
              <Text style={[styles.stepTitle, { color: colorTheme.ink }]}>{t('advImportStep1Title')}</Text>
            </View>

            <Card style={{ padding: 18, gap: 14 }}>
              <Pressable
                onPress={copyPrompt}
                style={({ pressed }) => [
                  styles.copyBtn,
                  { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
                  pressed && { opacity: 0.88 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('advImportCopyPromptA11y')}
              >
                <Icon name="receipt" size={18} color={theme.accent} />
                <Text style={[styles.copyBtnText, { color: theme.accent }]}>
                  {copied ? t('advImportPromptCopied') : t('advImportCopyPromptBtn')}
                </Text>
              </Pressable>

              <Text style={[styles.copyHint, { color: colorTheme.ink2 }]}>
                {t('advImportPasteHint')}
              </Text>

              <View>
                <Text style={[styles.openInLabel, { color: colorTheme.ink3 }]}>{t('advImportOpenInLabel')}</Text>
                <View style={styles.llmRow}>
                  {LLM_LINKS.map((l) => <LLMChip key={l.label} {...l} />)}
                </View>
              </View>

              <View style={[styles.tipRow, { backgroundColor: `${colorTheme.amber}12` }]}>
                <Icon name="sparkles" size={13} color={colorTheme.amber} />
                <Text style={[styles.tipText, { color: colorTheme.ink2 }]}>
                  {t('advImportThinkingModeTip', { thinkingMode: t('advImportThinkingModeBold') })}
                </Text>
              </View>
            </Card>

            {/* Arrow */}
            <View style={styles.arrowRow}>
              <View style={[styles.arrowLine, { backgroundColor: colorTheme.line }]} />
              <Text style={[styles.arrowIcon, { color: colorTheme.ink3 }]}>↓</Text>
              <View style={[styles.arrowLine, { backgroundColor: colorTheme.line }]} />
            </View>

            {/* Step 2 */}
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, { backgroundColor: theme.accent }]}><Text style={styles.stepNum}>2</Text></View>
              <Text style={[styles.stepTitle, { color: colorTheme.ink }]}>{t('advImportStep2Title')}</Text>
            </View>

            <Card style={{ padding: 18, gap: 14 }}>
              <Text style={[styles.copyHint, { color: colorTheme.ink2 }]}>
                {t('advImportPasteResultHint')}
              </Text>

              <Pressable
                testID="adv-import-upload"
                onPress={pickJsonFile}
                disabled={pickingFile}
                style={({ pressed }) => [
                  styles.copyBtn,
                  { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
                  (pressed || pickingFile) && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('advImportUploadA11y')}
              >
                {pickingFile ? (
                  <ActivityIndicator color={theme.accent} size="small" />
                ) : (
                  <Icon name="upload" size={17} color={colorTheme.ink} />
                )}
                <Text style={[styles.copyBtnText, { color: colorTheme.ink }]}>
                  {pickingFile ? t('advImportReadingFile') : t('advImportUploadBtn')}
                </Text>
              </Pressable>

              <View style={styles.arrowRow}>
                <View style={[styles.arrowLine, { backgroundColor: colorTheme.line }]} />
                <Text style={[styles.orText, { color: colorTheme.ink3 }]}>{t('advImportOrPasteBelow')}</Text>
                <View style={[styles.arrowLine, { backgroundColor: colorTheme.line }]} />
              </View>

              <Pressable
                testID="adv-import-paste-clipboard"
                onPress={() => void pasteFromClipboard()}
                style={({ pressed }) => [
                  styles.copyBtn,
                  { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
                  pressed && { opacity: 0.88 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('advImportPasteClipboardBtn')}
              >
                <Icon name="copy" size={17} color={theme.accent} />
                <Text style={[styles.copyBtnText, { color: theme.accent }]}>
                  {t('advImportPasteClipboardBtn')}
                </Text>
              </Pressable>
            </Card>
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 10 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: uiFont(800), fontSize: 13, color: '#fff' },
  stepTitle: { fontFamily: uiFont(700), fontSize: 16 },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  copyBtnText: { fontFamily: uiFont(700), fontSize: 15 },

  copyHint: { fontFamily: uiFont(500), fontSize: 13, lineHeight: 19, textAlign: 'center' },

  openInLabel: { fontFamily: uiFont(600), fontSize: 12, textAlign: 'center', marginBottom: 8 },
  llmRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  llmChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1 },
  llmEmoji: { fontSize: 15 },
  llmLabel: { fontFamily: uiFont(600), fontSize: 13 },

  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: radius.sm, padding: 11 },
  tipText: { fontFamily: uiFont(500), fontSize: 12.5, flex: 1, lineHeight: 18 },

  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, paddingHorizontal: 24 },
  arrowLine: { flex: 1, height: 1 },
  arrowIcon: { fontFamily: uiFont(400), fontSize: 18 },
  orText: { fontFamily: uiFont(600), fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 },

  // Account review
  accRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tick: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  kindDot: { width: 7, height: 7, borderRadius: 4 },
  accName: { fontFamily: uiFont(700), fontSize: 13.5, flex: 1 },
  accMeta: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 1 },
  accBalance: { fontFamily: uiFont(700), fontSize: 13, flexShrink: 0 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: uiFont(500), fontSize: 12 },

  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkText: { fontFamily: uiFont(600), fontSize: 13 },

  // Done / saving / error
  busyCard: { padding: 22, alignItems: 'center', gap: 12 },
  busyText: { fontFamily: uiFont(500), fontSize: 13, textAlign: 'center' },
  doneText: { fontFamily: uiFont(500), fontSize: 13.5, lineHeight: 20 },
  errorCard: { borderWidth: 1.5, borderRadius: radius.md, padding: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { fontFamily: uiFont(500), fontSize: 13.5, flex: 1, lineHeight: 19 },

  // Live holding review
  toggleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1 },
  smallInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontFamily: uiFont(500), fontSize: 13 },
  searchResultRow: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
});
