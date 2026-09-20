import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { SendMessageSheet, type SendMessageOption } from '../components/SendMessageSheet';
import { AddDebtModal } from '../components/AddDebtModal';
import { SettleSheet } from '../components/SettleSheet';
import { Amount, BtnLabel, BubbleText, Card, Eyebrow, IconButton, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { shortDate } from '../lib/dates';
import { todayISO } from '../lib/duplicates';
import { currencyPrefix, fmtMoney } from '../lib/format';
import { tap } from '../lib/haptics';
import { RECEIVABLE_CLS } from '../lib/networth';
import { confirmAction, notify } from '../lib/platformAlert';
import { sheetOpenFromModalState, useReportSheetOpen } from '../lib/askPip/sheetOpen';
import { AGING_DAYS, groupOpenSharesByPerson, type OpenShare, type PersonDebt } from '../lib/split';
import { generateDeterministicReceipt, generateReceiptCanvasHtml, formatWorkingsCalculation } from '../lib/receiptGenerator';
import { base64ToUint8Array, saveReceiptPng } from '../lib/receiptImage';
import { shareSplitMessage } from '../lib/shareText';
import { buildBillReminder, buildOwedReminder, type OwedBill, type OwedReminderInput } from '../lib/splitMessage';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { colors, numFont, radius, uiFont } from '../theme';

/**
 * What a bill is called, in one place: the merchant, else the user's own remark, else the
 * category, else a generic label. Shared by the expanded row and the reminder message so a bill
 * can never be listed under one name on screen and a different one in the message sent about it.
 */
function billLabel(share: OpenShare, catLabel: string | undefined, isZh: boolean): string {
  const hasRemark = !!share.remark && share.remark.trim().length > 0;
  const hasMerchant = !!share.merchant && share.merchant !== 'A shared bill' && share.merchant.trim().length > 0;
  if (hasMerchant) return share.merchant;
  if (hasRemark) return share.remark!.trim();
  return catLabel || (isZh ? '分摊账单' : 'Shared bill');
}

/**
 * Everyone who owes you, and the bills behind it.
 *
 * Nothing here writes an income row. Settling moves cash against the receivable, and a write-off
 * turns what never came back into the expense it always really was.
 */
export function OwedScreen({
  onBack,
  embedded,
  initialSettleShareId,
  onSheetOpenChange,
}: {
  onBack: () => void;
  embedded?: boolean;
  initialSettleShareId?: string;
  onSheetOpenChange?: (open: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh, tCat } = useLanguage();
  const { openShares, allOwedShares, accounts, catById, settleShare, unsettleShare, writeOffShare } = useAppData();
  const dc = useDisplayCurrency();
  const today = useMemo(() => todayISO(), []);

  const [search, setSearch] = useState('');
  const [addingDebt, setAddingDebt] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedInSearch, setCollapsedInSearch] = useState<Set<string>>(new Set());
  const [reminding, setReminding] = useState<PersonDebt | null>(null);
  const [settling, setSettling] = useState<OpenShare | null>(null);
  useReportSheetOpen(sheetOpenFromModalState(settling), onSheetOpenChange);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [sendingShareId, setSendingShareId] = useState<string | null>(null);
  const [directCanvasHtml, setDirectCanvasHtml] = useState<string | null>(null);
  const directSendResolvers = useRef<Record<string, (uri?: string) => void>>({});
  const directGeneratedUris = useRef<Record<string, string>>({});

  const displayShares = allOwedShares ?? openShares;
  const openedInitialSettle = useRef(false);

  useEffect(() => {
    if (!initialSettleShareId || openedInitialSettle.current) return;
    const share = displayShares.find((s) => s.shareId === initialSettleShareId);
    if (!share) return;
    openedInitialSettle.current = true;
    if (share.status !== 'settled') {
      setSettling(share);
    }
  }, [initialSettleShareId, displayShares]);

  const byPerson = useMemo<PersonDebt[]>(
    () => groupOpenSharesByPerson(displayShares, today),
    [displayShares, today]
  );

  const query = search.trim().toLowerCase();

  const filteredByPerson = useMemo(() => {
    if (!query) return byPerson;
    return byPerson
      .map((p) => {
        const nameMatches = p.name.toLowerCase().includes(query);
        const matchingShares = p.shares.filter((share) => {
          if (nameMatches) return true;
          const cat = share.categoryId ? catById[share.categoryId] : undefined;
          const catLabel = cat ? tCat(cat) : undefined;
          const primaryName = billLabel(share, catLabel, isZh);
          const hasRemark = !!share.remark && share.remark.trim().length > 0;
          const hasMerchant = !!share.merchant && share.merchant !== 'A shared bill' && share.merchant.trim().length > 0;
          const expenseDescription =
            hasRemark && hasMerchant && share.remark!.trim().toLowerCase() !== share.merchant.trim().toLowerCase()
              ? share.remark!.trim()
              : share.remark?.trim();

          if (primaryName.toLowerCase().includes(query)) return true;
          if (expenseDescription && expenseDescription.toLowerCase().includes(query)) return true;
          if (catLabel && catLabel.toLowerCase().includes(query)) return true;
          return false;
        });

        if (nameMatches || matchingShares.length > 0) {
          return {
            ...p,
            shares: nameMatches ? p.shares : matchingShares,
          };
        }
        return null;
      })
      .filter((p): p is PersonDebt => p !== null);
  }, [byPerson, query, catById, tCat, isZh]);

  const total = byPerson.reduce((s, p) => s + p.total, 0);
  const aging = byPerson.filter((p) => p.oldestDays >= AGING_DAYS);

  const handleShareToggle = (share: OpenShare) => {
    if (share.status === 'settled') {
      const cat = share.categoryId ? catById[share.categoryId] : undefined;
      const catLabel = cat ? tCat(cat) : undefined;
      const primaryName = billLabel(share, catLabel, isZh);
      confirmAction(
        t('undoSettleTitle'),
        t('undoSettleMsg'),
        t('reopen'),
        () => unsettleShare(share.shareId)
      );
    } else {
      setSettling(share);
    }
  };

  const confirmWriteOff = (share: OpenShare) => {
    const itemDesc = share.remark?.trim()
      ? (share.merchant && share.merchant !== 'A shared bill'
          ? `${share.merchant} (${share.remark.trim()})`
          : share.remark.trim())
      : share.merchant;

    confirmAction(
      isZh ? '核销坏账？' : 'Write this off?',
      isZh
        ? `确认核销 ${share.personName} 欠您的 “${itemDesc}” 款项 ${fmtMoney(share.outstanding, share.currency ?? 'MYR')}？这笔款项将转换为您今天的个人支出。`
        : `Give up on the ${fmtMoney(share.outstanding, share.currency ?? 'MYR')} ${share.personName} owes you for “${itemDesc}”? It becomes your own expense, dated today.`,
      isZh ? '核销' : 'Write off',
      () => writeOffShare(share.shareId)
    );
  };

  /**
   * The reminder options for whichever person is being chased: only includes open (unsettled) bills.
   */
  const reminderOptions = useMemo((): SendMessageOption[] => {
    if (!reminding) return [];
    const openSharesForPerson = reminding.shares.filter((s) => s.status !== 'settled');
    const input: OwedReminderInput = {
      personName: reminding.name,
      currency: dc.code,
      total: dc.convert(reminding.total),
      bills: openSharesForPerson.map((share) => {
        const catLabel = share.categoryId ? tCat(catById[share.categoryId]) : undefined;
        const merchant = billLabel(share, catLabel, isZh);
        const outstandingAmt = dc.convert(share.outstanding);
        const grossAmt = share.gross ? dc.convert(share.gross) : undefined;
        const owedAmt = share.owed ? dc.convert(share.owed) : undefined;
        const paidAmt = share.paid ? dc.convert(share.paid) : 0;
        const calc = grossAmt && grossAmt > outstandingAmt
          ? formatWorkingsCalculation({
              gross: grossAmt,
              owed: owedAmt ?? outstandingAmt,
              outstanding: outstandingAmt,
              paid: paidAmt,
              currency: dc.code,
              splitMethod: share.splitMethod,
              participantCount: share.participantCount,
              isZh,
            })
          : undefined;

        return {
          shareId: share.shareId,
          merchant,
          billDate: share.billDate,
          outstanding: outstandingAmt,
          paid: paidAmt,
          remark: share.remark,
          categoryId: share.categoryId,
          gross: grossAmt,
          owed: owedAmt,
          splitMethod: share.splitMethod,
          participantCount: share.participantCount,
          workingsCalculation: calc,
        };
      }),
      isZh,
    };

    const individualReceipts = input.bills.map((b) => {
      const catLabel = b.categoryId ? tCat(catById[b.categoryId]) : undefined;
      return generateDeterministicReceipt({
        merchant: b.merchant,
        total: b.outstanding,
        currency: input.currency,
        personName: input.personName,
        billDate: b.billDate,
        seedId: b.shareId,
        remark: b.remark,
        categoryId: b.categoryId,
        categoryName: catLabel,
        gross: b.gross,
        owed: b.owed,
        paid: b.paid,
        splitMethod: b.splitMethod,
        participantCount: b.participantCount,
        workingsCalculation: b.workingsCalculation,
        isZh,
      });
    });

    return [
      {
        key: 'all',
        label: t('owedRemindEverything'),
        sub: isZh
          ? `${input.bills.length} 笔账单 · ${fmtMoney(input.total, input.currency)}`
          : `${input.bills.length} ${input.bills.length === 1 ? 'bill' : 'bills'} · ${fmtMoney(input.total, input.currency)}`,
        icon: 'gift',
        build: () => buildOwedReminder(input),
        receiptData: individualReceipts,
      },
      ...openSharesForPerson.map((share, i): SendMessageOption => ({
        key: share.shareId,
        label: input.bills[i].merchant,
        sub: `${shortDate(share.billDate)}${share.billDate ? ' · ' : ''}${fmtMoney(input.bills[i].outstanding, input.currency)}`,
        build: () => buildBillReminder(input, share.shareId),
        receiptUri: share.receiptUri,
        receiptData: individualReceipts[i],
      })),
    ];
  }, [reminding, dc, catById, tCat, isZh, t]);

  const onDirectWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const { key, dataUrl } = JSON.parse(event.nativeEvent.data);
      if (!key || !dataUrl) return;
      const bytes = base64ToUint8Array(dataUrl);
      const fileUri = saveReceiptPng(bytes, key);
      if (fileUri) {
        directGeneratedUris.current[key] = fileUri;
        if (directSendResolvers.current[key]) {
          directSendResolvers.current[key](fileUri);
          delete directSendResolvers.current[key];
        }
      }
    } catch {}
  };

  const handleDirectSendBill = async (person: PersonDebt, share: OpenShare) => {
    if (share.status === 'settled' || sendingShareId) return;

    tap();
    setSendingShareId(share.shareId);

    try {
      const catLabel = share.categoryId ? tCat(catById[share.categoryId]) : undefined;
      const merchant = billLabel(share, catLabel, isZh);
      const curr = dc.code;
      const outstandingAmt = dc.convert(share.outstanding);
      const grossAmt = share.gross ? dc.convert(share.gross) : undefined;
      const owedAmt = share.owed ? dc.convert(share.owed) : undefined;
      const paidAmt = share.paid ? dc.convert(share.paid) : 0;

      const calc = grossAmt && grossAmt > outstandingAmt
        ? formatWorkingsCalculation({
            gross: grossAmt,
            owed: owedAmt ?? outstandingAmt,
            outstanding: outstandingAmt,
            paid: paidAmt,
            currency: curr,
            splitMethod: share.splitMethod,
            participantCount: share.participantCount,
            isZh,
          })
        : undefined;

      const receipt = generateDeterministicReceipt({
        merchant,
        total: outstandingAmt,
        currency: curr,
        personName: person.name,
        billDate: share.billDate,
        seedId: share.shareId,
        remark: share.remark,
        categoryId: share.categoryId,
        categoryName: catLabel,
        gross: grossAmt,
        owed: owedAmt,
        paid: paidAmt,
        splitMethod: share.splitMethod,
        participantCount: share.participantCount,
        workingsCalculation: calc,
        isZh,
      });

      const billObj: OwedBill = {
        shareId: share.shareId,
        merchant,
        billDate: share.billDate,
        outstanding: outstandingAmt,
        paid: paidAmt,
        remark: share.remark,
        categoryId: share.categoryId,
        gross: grossAmt,
        owed: owedAmt,
        splitMethod: share.splitMethod,
        participantCount: share.participantCount,
        workingsCalculation: calc,
      };

      const input: OwedReminderInput = {
        personName: person.name,
        currency: curr,
        total: outstandingAmt,
        bills: [billObj],
        isZh,
      };

      const message = buildBillReminder(input, share.shareId) ?? '';

      let imageUri: string | undefined = directGeneratedUris.current[share.shareId];

      if (!imageUri) {
        // Generate Split Receipt Image HTML
        const html = generateReceiptCanvasHtml({
          key: share.shareId,
          receipts: [receipt],
          currency: curr,
          personName: person.name,
          total: outstandingAmt,
          isZh,
        });

        setDirectCanvasHtml(html);

        imageUri = await new Promise<string | undefined>((resolve) => {
          directSendResolvers.current[share.shareId] = resolve;
          setTimeout(() => resolve(undefined), 1800);
        });
      }

      const effectiveImageUri = imageUri || share.receiptUri || undefined;
      const outcome = await shareSplitMessage(message, effectiveImageUri);

      if (outcome === 'copied') {
        notify(t('splitShareCopiedTitle'), t('splitShareCopiedBody'));
      } else if (outcome === 'failed') {
        notify(t('splitShareFailedTitle'), t('splitShareFailedBody'));
      }
    } catch {
      notify(t('splitShareFailedTitle'), t('splitShareFailedBody'));
    } finally {
      setSendingShareId(null);
      setDirectCanvasHtml(null);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: embedded ? 0 : insets.top + 4 }}>
        {!embedded && (
          <TopBar
            title={isZh ? '待收应收款' : 'Owed to you'}
            onBack={onBack}
            right={<IconButton name="plus" onPress={() => setAddingDebt(true)} accessibilityLabel={isZh ? '添加借款' : 'Add debt'} />}
          />
        )}
        {byPerson.length > 0 && (
          <View style={[styles.searchContainer, { borderBottomColor: colorTheme.line2 }]}>
            <View style={[styles.searchRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
              <Icon name="search" size={16} color={colorTheme.ink3} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('searchOwedPlaceholder')}
                placeholderTextColor={colorTheme.ink3}
                style={[styles.searchInput, { color: colorTheme.ink }]}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
                  <Icon name="x" size={16} color={colorTheme.ink3} />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        {byPerson.length === 0 ? (
          <>
            <PipSays expr="idle">
              <BubbleText>
                {isZh
                  ? '目前没人欠您钱。分摊账单后，我会在在此为您追踪款项。'
                  : 'Nobody owes you anything right now. Split a bill and I will keep track of it.'}
              </BubbleText>
            </PipSays>
            <Card style={{ padding: 26, alignItems: 'center', marginTop: 14 }}>
              <Text style={[styles.emptyTitle, { color: colorTheme.ink }]}>{isZh ? '账目已结清' : 'All square'}</Text>
              <Text style={[styles.emptySub, { color: colorTheme.ink2, textAlign: 'center', marginBottom: 16 }]}>
                {isZh
                  ? '当您为全桌买单时，分摊账单后只有您自己的那份会计入个人支出。或者直接在此添加借款人。'
                  : 'When you pay for the table, split the bill and only your share counts as spending. Or add who owes you directly.'}
              </Text>
              <PrimaryButton onPress={() => setAddingDebt(true)} height={44}>
                <Icon name="plus" size={16} color="#fff" stroke={2.4} />
                <BtnLabel>{isZh ? '添加借款人' : 'Add someone who owes you'}</BtnLabel>
              </PrimaryButton>
            </Card>
          </>
        ) : filteredByPerson.length === 0 ? (
          <Card style={{ padding: 26, alignItems: 'center', marginTop: 14 }}>
            <Icon name="search" size={32} color={colorTheme.ink3} />
            <Text style={[styles.emptyTitle, { color: colorTheme.ink, marginTop: 10 }]}>{t('noMatchingOwed')}</Text>
            <Text style={[styles.emptySub, { color: colorTheme.ink2 }]}>
              {isZh ? `未找到与 “${search}” 相关的借款人、账单或描述。` : `No people, bill titles, or descriptions matching "${search}".`}
            </Text>
          </Card>
        ) : (
          <>
            {aging.length > 0 && !query && (
              <PipSays expr="curious">
                <BubbleText>
                  {isZh
                    ? `${aging[0].name} 已欠您 ${fmtMoney(dc.convert(aging[0].total), dc.code)} 达 ${aging[0].oldestDays} 天${aging.length === 2 ? '，另有 1 人也已逾期' : aging.length > 2 ? `，另有 ${aging.length - 1} 人也已逾期` : ''}。`
                    : `${aging[0].name} has owed you ${fmtMoney(dc.convert(aging[0].total), dc.code)} for ${aging[0].oldestDays} days${aging.length === 2 ? ', and 1 other is overdue too' : aging.length > 2 ? `, and ${aging.length - 1} others are overdue too` : ''}.`}
                </BubbleText>
              </PipSays>
            )}

            <Card style={styles.totalCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Eyebrow>{isZh ? '待收回款项' : 'Still owed to you'}</Eyebrow>
                <InfoButton entry="owed_to_you" />
              </View>
              <Amount value={dc.convert(total)} currency={dc.code} size={30} weight={700} color={theme.accent} />
              <Text style={[styles.totalSub, { color: colorTheme.ink2 }]}>
                {isZh
                  ? '作为应收款资产计入净资产，而不是您未实际承担的支出。'
                  : 'Sitting in Net Worth as an asset, not as spending you never did.'}
              </Text>
            </Card>

            <Text style={[styles.countLine, { color: colorTheme.ink2 }]}>
              {query.length > 0
                ? (isZh ? `匹配 ${filteredByPerson.length} 位好友` : `${filteredByPerson.length} matching ${filteredByPerson.length === 1 ? 'person' : 'people'}`)
                : (isZh ? `${byPerson.length} 位好友 · 点击查看账单` : `${byPerson.length} ${byPerson.length === 1 ? 'person' : 'people'} · tap to see the bills`)}
            </Text>

            <Card style={{ overflow: 'hidden' }}>
              {filteredByPerson.map((p, i) => {
                const open = query.length > 0 ? !collapsedInSearch.has(p.personId) : expanded === p.personId;
                const isAllSettled = p.total === 0;

                return (
                  <View key={p.personId} style={i > 0 ? [styles.divider, { borderTopColor: colorTheme.line2 }] : undefined}>
                    <Pressable
                      onPress={() => {
                        if (query.length > 0) {
                          setCollapsedInSearch((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.personId)) next.delete(p.personId);
                            else next.add(p.personId);
                            return next;
                          });
                        } else {
                          setExpanded(open ? null : p.personId);
                        }
                      }}
                      style={({ pressed }) => [styles.personRow, pressed && { backgroundColor: colorTheme.surface2 }]}
                    >
                      <View style={[styles.avatar, { backgroundColor: isAllSettled ? colorTheme.surface2 : theme.accentSoft }]}>
                        <Text style={[styles.avatarText, { color: isAllSettled ? colorTheme.ink2 : theme.onTint }]}>
                          {p.name.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.personName, { color: colorTheme.ink }]} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={[styles.personSub, { color: colorTheme.ink2 }]}>
                          {isZh
                            ? `${p.shares.length} 笔账单${isAllSettled ? ' · 全部已结清' : p.oldestDays > 0 ? ` · 最长 ${p.oldestDays} 天` : ''}`
                            : `${p.shares.length} ${p.shares.length === 1 ? 'bill' : 'bills'}${isAllSettled ? ' · all settled' : p.oldestDays > 0 ? ` · oldest ${p.oldestDays}d` : ''}`}
                        </Text>
                      </View>
                      {p.oldestDays >= AGING_DAYS && !isAllSettled && (
                        <View style={[styles.agePill, { backgroundColor: colorTheme.amberSoft }]}>
                          <Text style={[styles.ageText, { color: colorTheme.amber }]}>{isZh ? '已逾期' : 'Overdue'}</Text>
                        </View>
                      )}
                      {isAllSettled ? (
                        <View style={[styles.settledPill, { backgroundColor: theme.accentSoft }]}>
                          <Icon name="check" size={11} color={theme.onTint} stroke={2.4} />
                          <Text style={[styles.settledPillText, { color: theme.onTint }]}>{t('allSettled')}</Text>
                        </View>
                      ) : (
                        <Amount value={dc.convert(p.total)} currency={dc.code} size={15} weight={700} color={theme.accent} />
                      )}
                      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                        <Icon name="chevronDown" size={16} color={colorTheme.ink3} />
                      </View>
                    </Pressable>

                    {open &&
                      p.shares.map((share) => {
                        const cat = share.categoryId ? catById[share.categoryId] : undefined;
                        const catLabel = cat ? tCat(cat) : undefined;
                        const hasRemark = !!share.remark && share.remark.trim().length > 0;
                        const hasMerchant = !!share.merchant && share.merchant !== 'A shared bill' && share.merchant.trim().length > 0;

                        // Merchant or primary title
                        const primaryName = billLabel(share, catLabel, isZh);

                        // Food / expense / item description (if remark exists and is not identical to the merchant name)
                        const expenseDescription = hasRemark && hasMerchant && share.remark!.trim().toLowerCase() !== share.merchant.trim().toLowerCase()
                          ? share.remark!.trim()
                          : undefined;

                        const curr = share.currency ?? 'MYR';
                        const isSettled = share.status === 'settled';
                        const isPartial = (share.paid ?? 0) > 0 && !isSettled;
                        const hasGross = (share.gross ?? 0) > share.outstanding;

                        return (
                          <View
                            key={share.shareId}
                            style={[
                              styles.shareRow,
                              { backgroundColor: colorTheme.surface2, borderTopColor: colorTheme.line2 },
                              isSettled && { opacity: 0.6 },
                            ]}
                          >
                            {!!share.receiptUri && (
                              <Pressable onPress={() => setViewingReceipt(share.receiptUri!)} hitSlop={4} accessibilityLabel={isZh ? '查看小票' : 'View receipt'}>
                                <Image source={{ uri: share.receiptUri }} style={[styles.receiptThumb, { borderColor: colorTheme.line2 }]} />
                              </Pressable>
                            )}
                            <Pressable
                              onPress={() => !isSettled && handleDirectSendBill(p, share)}
                              disabled={isSettled || sendingShareId === share.shareId}
                              style={styles.shareBodyPressable}
                              accessibilityRole="button"
                              accessibilityLabel={isZh ? `发送 ${primaryName} 催款小票` : `Send split receipt for ${primaryName}`}
                            >
                              <Text
                                style={[
                                  styles.shareMerchant,
                                  { color: colorTheme.ink },
                                  isSettled && styles.strikethrough,
                                ]}
                                numberOfLines={1}
                              >
                                {primaryName}
                              </Text>
                              {expenseDescription && (
                                <Text
                                  style={[
                                    styles.shareDescription,
                                    { color: colorTheme.ink2 },
                                    isSettled && styles.strikethrough,
                                  ]}
                                  numberOfLines={2}
                                >
                                  {expenseDescription}
                                </Text>
                              )}
                              <Text
                                style={[
                                  styles.shareSub,
                                  { color: colorTheme.ink3 },
                                  isSettled && styles.strikethrough,
                                ]}
                                numberOfLines={1}
                              >
                                {shortDate(share.billDate)}
                                {catLabel && catLabel !== primaryName && catLabel !== expenseDescription ? ` · ${catLabel}` : ''}
                                {isSettled
                                  ? ` · ${isZh ? '已结清' : 'Settled'} ${fmtMoney(share.owed ?? share.paid ?? share.gross ?? 0, curr)}`
                                  : ` · ${isZh ? '待还' : ''} ${fmtMoney(share.outstanding, curr)}${isZh ? '' : ' outstanding'}`}
                                {isPartial ? ` · ${isZh ? '已付' : 'paid'} ${fmtMoney(share.paid!, curr)}` : ''}
                                {hasGross && !isPartial && !isSettled ? ` · ${isZh ? '账单' : 'bill'} ${fmtMoney(share.gross!, curr)}` : ''}
                              </Text>
                            </Pressable>

                            {!isSettled && (
                              <Pressable
                                onPress={() => handleDirectSendBill(p, share)}
                                hitSlop={8}
                                disabled={sendingShareId === share.shareId}
                                accessibilityRole="button"
                                accessibilityLabel={isZh ? '直接发送小票' : 'Send split receipt'}
                                style={styles.directSendBtn}
                              >
                                {sendingShareId === share.shareId ? (
                                  <ActivityIndicator size="small" color={theme.accent} />
                                ) : (
                                  <Icon name="share" size={15} color={theme.accent} />
                                )}
                              </Pressable>
                            )}

                            {/* Checkbox: taps toggle settle/unsettle */}
                            <Pressable
                              onPress={() => handleShareToggle(share)}
                              hitSlop={10}
                              accessibilityLabel={isSettled ? t('reopen') : t('settleUp')}
                              style={[
                                styles.checkbox,
                                {
                                  borderColor: isSettled ? theme.accent : colorTheme.line,
                                  backgroundColor: isSettled ? theme.accent : 'transparent',
                                },
                              ]}
                            >
                              {isSettled && <Icon name="check" size={12} color={colors.onAccent} stroke={2.8} />}
                            </Pressable>

                            {!isSettled && (
                              <Pressable onPress={() => confirmWriteOff(share)} hitSlop={8} accessibilityLabel="Write off">
                                <Icon name="trash" size={16} color={colorTheme.ink3} />
                              </Pressable>
                            )}
                          </View>
                        );
                      })}

                    {/* Footer reminder button only shown if the person still owes an unsettled balance */}
                    {open && p.total > 0 && (
                      <Pressable
                        onPress={() => setReminding(p)}
                        accessibilityRole="button"
                        accessibilityLabel={t('owedRemindCta')}
                        style={({ pressed }) => [
                          styles.remindRow,
                          { backgroundColor: pressed ? theme.accentSoft : theme.accentTint, borderTopColor: colorTheme.line2 },
                        ]}
                      >
                        <Icon name="share" size={15} color={theme.onTint} />
                        <Text style={[styles.remindText, { color: theme.onTint }]}>{t('owedRemindCta')}</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </Card>

            <Text style={[styles.footnote, { color: colorTheme.ink3 }]}>
              {isZh
                ? '当对方通过银行转账还款给您时，正常扫码记账即可，Pip 会提示将其与应收账款匹配。在此处勾选结清通常用于现金还款。'
                : 'When they pay you back through your bank, scan it as usual and Pip will offer to match it against the right debt. Ticking the checkbox here is for cash.'}
            </Text>
          </>
        )}
      </ScrollView>

      <AddDebtModal
        visible={addingDebt}
        onClose={() => setAddingDebt(false)}
      />

      <SendMessageSheet
        visible={!!reminding}
        title={t('owedRemindTitle')}
        subtitle={t('owedRemindSub')}
        options={reminderOptions}
        onClose={() => setReminding(null)}
      />

      <SettleSheet
        share={settling}
        accounts={accounts}
        today={today}
        onClose={() => setSettling(null)}
        onSettle={async (amount, accountId) => {
          if (!settling) return;
          await settleShare(settling.shareId, amount, today, 'declared', null, accountId);
          setSettling(null);
        }}
      />

      <Modal visible={!!viewingReceipt} transparent animationType="fade" onRequestClose={() => setViewingReceipt(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewingReceipt(null)}>
          {!!viewingReceipt && <Image source={{ uri: viewingReceipt }} style={styles.viewerImage} resizeMode="contain" />}
          <Pressable onPress={() => setViewingReceipt(null)} style={[styles.viewerClose, { top: insets.top + 12 }]} hitSlop={10}>
            <Icon name="x" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      {directCanvasHtml && (
        <View style={styles.hiddenWebView}>
          <WebView
            originWhitelist={['*']}
            source={{ html: directCanvasHtml }}
            onMessage={onDirectWebViewMessage}
            javaScriptEnabled
          />
        </View>
      )}
    </View>
  );
}



const styles = StyleSheet.create({
  root: { flex: 1 },
  totalCard: { padding: 18, gap: 8, marginTop: 14 },
  totalSub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 2 },
  countLine: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 18, marginBottom: 10, marginLeft: 2 },
  divider: { borderTopWidth: 1 },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  remindText: { fontFamily: uiFont(700), fontSize: 13.5 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 13 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: uiFont(700), fontSize: 15 },
  personName: { fontFamily: uiFont(700), fontSize: 15 },
  personSub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 1 },
  agePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  ageText: { fontFamily: uiFont(700), fontSize: 10.5 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 64,
    paddingRight: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  shareMerchant: { fontFamily: uiFont(600), fontSize: 13.5 },
  shareDescription: { fontFamily: uiFont(500), fontSize: 12, lineHeight: 16, marginTop: 1 },
  shareSub: { fontFamily: uiFont(500), fontSize: 11, marginTop: 2 },
  searchContainer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    fontFamily: uiFont(600),
    fontSize: 14,
    paddingVertical: 10,
  },
  strikethrough: { textDecorationLine: 'line-through' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settledPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  settledPillText: { fontFamily: uiFont(700), fontSize: 11 },
  receiptThumb: { width: 34, height: 34, borderRadius: 8, borderWidth: 1 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(10,14,12,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', right: 18, padding: 8 },
  footnote: { fontFamily: uiFont(500), fontSize: 12, lineHeight: 17, marginTop: 16, textAlign: 'center' },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17 },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, marginTop: 6, textAlign: 'center', lineHeight: 19 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheetAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { fontFamily: uiFont(700), fontSize: 18 },
  sheetSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 2 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
  },
  rm: { fontFamily: numFont(600), fontSize: 18 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, paddingVertical: 12 },
  partialNote: { fontFamily: uiFont(600), fontSize: 12, marginTop: 8 },
  acctWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acctChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  acctText: { fontFamily: uiFont(600), fontSize: 13, maxWidth: 160 },
  acctNote: { fontFamily: uiFont(500), fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  hiddenWebView: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
  },
  shareBodyPressable: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  directSendBtn: {
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
