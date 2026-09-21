// src/components/GlossaryVisualGuide.tsx
// Exact 1:1 UI/UX interactive previews matching Pip's real components (ReceiptScanScreen, SplitSheet, QuickAddField, AccountLinkField, CashflowStructure).
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { numFont, radius, shadowCard, shadowToggle, spacing, uiFont } from '../theme';
import { Icon } from './Icon';
import type { SplitMethod } from '../lib/types';
import { fmtMoney } from '../lib/format';

interface VisualProps {
  visualKey?: string;
}

export function GlossaryVisualGuide({ visualKey }: VisualProps) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();

  // Interactive state for Receipt Itemized Split guide
  const [receiptLines, setReceiptLines] = useState([
    { id: '1', label: '2× Latte Macchiato', amount: 9.0, assignedTo: ['nugget', 'you'] },
    { id: '2', label: 'Schweinschnitzel', amount: 22.0, assignedTo: ['nugget'] },
    { id: '3', label: 'Chässpätzli', amount: 18.5, assignedTo: ['you'] },
  ]);

  const toggleReceiptAssign = (lineId: string, personId: string) => {
    setReceiptLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const exists = line.assignedTo.includes(personId);
        const next = exists ? line.assignedTo.filter((p) => p !== personId) : [...line.assignedTo, personId];
        return { ...line, assignedTo: next };
      })
    );
  };

  const toggleReceiptShareAll = (lineId: string) => {
    setReceiptLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const allAssigned = line.assignedTo.length === 2;
        return { ...line, assignedTo: allAssigned ? ['you'] : ['nugget', 'you'] };
      })
    );
  };

  // Interactive state for Manual Split Bill guide
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('shares');
  const [includeSelf, setIncludeSelf] = useState(true);
  const [alexShares, setAlexShares] = useState(2);
  const [sarahShares, setSarahShares] = useState(1);
  const [selfShares, setSelfShares] = useState(1);

  // Interactive state for Owed Settled preview
  const [settledState, setSettledState] = useState<'pending' | 'settled' | 'written_off'>('pending');

  // Interactive state for Card Direction preview
  const [cardEffect, setCardEffect] = useState<'add' | 'subtract'>('add');

  if (!visualKey) return null;

  const grossBill = 120;
  const totalShares = (includeSelf ? selfShares : 0) + alexShares + sarahShares;
  const perShare = grossBill / (totalShares || 1);
  const ownExpense = includeSelf ? (splitMethod === 'equal' ? grossBill / 3 : perShare * selfShares) : 0;
  const alexOwed = splitMethod === 'equal' ? grossBill / 3 : perShare * alexShares;
  const sarahOwed = splitMethod === 'equal' ? grossBill / 3 : perShare * sarahShares;
  const totalOwed = alexOwed + sarahOwed;

  switch (visualKey) {
    case 'split_receipt_step': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {/* Header */}
          <View style={styles.sheetHeaderRow}>
            <View>
              <Text style={[styles.sheetTitle, { color: colorTheme.ink }]}>Berghotel Grosse Scheidegg</Text>
              <Text style={[styles.sheetSubtitle, { color: colorTheme.ink2 }]}>
                {isZh ? '小票逐项分账预览' : 'Itemized Receipt Split Preview'}
              </Text>
            </View>
            <View style={[styles.liveBadge, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Text style={[styles.liveBadgeText, { color: theme.accentInk }]}>{isZh ? '真实 UI 预览' : 'Live UI'}</Text>
            </View>
          </View>

          {/* Table Members Section */}
          <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>
            {isZh ? '同行人员（选填）' : 'Who was at the table (optional)'}
          </Text>
          <View style={styles.tableRow}>
            <View style={[styles.tableChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <Text style={[styles.tableChipText, { color: colorTheme.ink }]}>nugget</Text>
              <Icon name="x" size={11} color={colorTheme.ink3} />
            </View>
            <View style={[styles.tableChip, styles.tableChipSelf, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Text style={[styles.tableChipText, { color: theme.accentInk, fontFamily: uiFont(700) }]}>
                {isZh ? '你 (You)' : 'You'}
              </Text>
            </View>
            <View style={[styles.chip, styles.addChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, paddingVertical: 4, paddingHorizontal: 8 }]}>
              <Icon name="plus" size={11} color={colorTheme.ink2} stroke={2.4} />
              <Text style={[styles.chipText, { color: colorTheme.ink2, fontSize: 11 }]}>{isZh ? '添加好友' : '+ fyy'}</Text>
            </View>
          </View>

          {/* Items Section */}
          <View style={[styles.sectionHeaderRow, { marginTop: 10 }]}>
            <Text style={[styles.fieldLabel, { color: colorTheme.ink2, marginBottom: 0 }]}>
              {isZh ? '点单明细（点击头像分配）' : 'What they ordered (Tap to assign)'}
            </Text>
          </View>

          <View style={[styles.receiptCard, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
            {receiptLines.map((line, idx) => {
              const hasNugget = line.assignedTo.includes('nugget');
              const hasYou = line.assignedTo.includes('you');
              const isShared = hasNugget && hasYou;

              return (
                <View key={line.id} style={[styles.receiptItemRow, idx > 0 && [styles.receiptDivider, { borderTopColor: colorTheme.line }]]}>
                  <View style={styles.receiptItemHead}>
                    <Text style={[styles.receiptItemName, { color: colorTheme.ink }]} numberOfLines={1}>
                      {line.label}
                    </Text>
                    <Text style={[styles.receiptItemAmount, { color: colorTheme.ink }]}>
                      CHF {line.amount.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.avatarRow}>
                    {/* Nugget Avatar */}
                    <Pressable
                      onPress={() => toggleReceiptAssign(line.id, 'nugget')}
                      style={[
                        styles.itemAvatar,
                        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
                        hasNugget && { backgroundColor: theme.accent, borderColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.itemAvatarText,
                          { color: colorTheme.ink2 },
                          hasNugget && { color: '#ffffff', fontFamily: uiFont(700) },
                        ]}
                      >
                        N
                      </Text>
                    </Pressable>

                    {/* You Avatar */}
                    <Pressable
                      onPress={() => toggleReceiptAssign(line.id, 'you')}
                      style={[
                        styles.itemAvatar,
                        styles.itemAvatarYou,
                        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
                        hasYou && { backgroundColor: theme.accent, borderColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.itemAvatarText,
                          { color: colorTheme.ink2 },
                          hasYou && { color: '#ffffff', fontFamily: uiFont(700) },
                        ]}
                      >
                        YOU
                      </Text>
                    </Pressable>

                    {/* Shared Toggle */}
                    <Pressable onPress={() => toggleReceiptShareAll(line.id)} style={styles.sharedBtn}>
                      <Text
                        style={[
                          styles.sharedBtnText,
                          { color: isShared ? theme.accent : colorTheme.ink3 },
                          isShared && { fontFamily: uiFont(700) },
                        ]}
                      >
                        {isShared ? (isZh ? '均摊 ✓' : 'Shared ✓') : (isZh ? '平摊' : 'Share')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Exact Bottom Primary Button */}
          <View style={[styles.mockPrimaryBtn, { backgroundColor: theme.accentInk, marginTop: 12 }]}>
            <Icon name="check" size={16} color="#ffffff" stroke={2.4} />
            <Text style={styles.mockPrimaryBtnText}>{isZh ? '使用此分账结果' : 'Use this split'}</Text>
          </View>
        </View>
      );
    }

    case 'split_step_1': {
      const METHODS: { key: SplitMethod; label: string; labelZh: string; hint: string; hintZh: string }[] = [
        { key: 'equal', label: 'Equal', labelZh: '均摊', hint: 'Everyone pays the same', hintZh: '所有人平摊费用' },
        { key: 'shares', label: 'Shares', labelZh: '份数', hint: 'Someone ate double', hintZh: '按人头份数分摊' },
        { key: 'exact', label: 'Exact', labelZh: '指定金额', hint: 'Type what each person owes', hintZh: '输入每人应付具体金额' },
      ];
      const activeMethodObj = METHODS.find((m) => m.key === splitMethod) ?? METHODS[0];

      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {/* Header */}
          <View style={styles.sheetHeaderRow}>
            <View>
              <Text style={[styles.sheetTitle, { color: colorTheme.ink }]}>
                {isZh ? '分摊 RM120.00' : 'Split RM120.00'}
              </Text>
              <Text style={[styles.sheetSubtitle, { color: colorTheme.ink2 }]}>Din Tai Fung</Text>
            </View>
            <View style={[styles.liveBadge, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Text style={[styles.liveBadgeText, { color: theme.accentInk }]}>{isZh ? '手动模式' : 'Manual Mode'}</Text>
            </View>
          </View>

          {/* Exact Segmented Toggle from SplitSheet.tsx */}
          <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
            {METHODS.map((m) => {
              const on = splitMethod === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setSplitMethod(m.key)}
                  style={[styles.toggleBtn, on && styles.toggleBtnOn, on && { backgroundColor: colorTheme.surface }]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      { color: colorTheme.ink2 },
                      on && styles.toggleTextOn,
                      on && { color: colorTheme.ink },
                    ]}
                  >
                    {isZh ? m.labelZh : m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colorTheme.ink3 }]}>
            {isZh ? activeMethodObj.hintZh : activeMethodObj.hint}
          </Text>

          {/* Who else was there label & chips */}
          <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '同行人员' : 'Who else was there'}</Text>
          <View style={styles.chipWrap}>
            <View style={[styles.chip, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Icon name="check" size={13} color={theme.accent} stroke={2.4} />
              <Text style={[styles.chipText, { color: theme.onTint }]}>Alex</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Icon name="check" size={13} color={theme.accent} stroke={2.4} />
              <Text style={[styles.chipText, { color: theme.onTint }]}>Sarah</Text>
            </View>
            <View style={[styles.chip, styles.addChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <Icon name="plus" size={13} color={colorTheme.ink2} stroke={2.4} />
              <Text style={[styles.chipText, { color: colorTheme.ink2 }]}>{isZh ? '添加人员' : 'Add a name'}</Text>
            </View>
          </View>
        </View>
      );
    }

    case 'split_step_2': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {/* Exact Participant Rows from SplitSheet.tsx */}
          <View style={styles.list}>
            {/* Alex Row */}
            <View style={[styles.personRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
              <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.avatarText, { color: theme.onTint }]}>A</Text>
              </View>
              <Text style={[styles.personName, { color: colorTheme.ink }]} numberOfLines={1}>
                Alex
              </Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setAlexShares((v) => Math.max(1, v - 1))}
                  style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  hitSlop={4}
                >
                  <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>−</Text>
                </Pressable>
                <Text style={[styles.stepValue, { color: colorTheme.ink }]}>{alexShares}</Text>
                <Pressable
                  onPress={() => setAlexShares((v) => v + 1)}
                  style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  hitSlop={4}
                >
                  <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>+</Text>
                </Pressable>
              </View>
              <Text style={[styles.owed, { color: colorTheme.ink }]}>{fmtMoney(alexOwed, 'MYR')}</Text>
            </View>

            {/* Sarah Row */}
            <View style={[styles.personRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
              <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.avatarText, { color: theme.onTint }]}>S</Text>
              </View>
              <Text style={[styles.personName, { color: colorTheme.ink }]} numberOfLines={1}>
                Sarah
              </Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setSarahShares((v) => Math.max(1, v - 1))}
                  style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  hitSlop={4}
                >
                  <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>−</Text>
                </Pressable>
                <Text style={[styles.stepValue, { color: colorTheme.ink }]}>{sarahShares}</Text>
                <Pressable
                  onPress={() => setSarahShares((v) => v + 1)}
                  style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  hitSlop={4}
                >
                  <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>+</Text>
                </Pressable>
              </View>
              <Text style={[styles.owed, { color: colorTheme.ink }]}>{fmtMoney(sarahOwed, 'MYR')}</Text>
            </View>
          </View>

          {/* Exact I was on this bill too Checkbox from SplitSheet.tsx */}
          <Pressable onPress={() => setIncludeSelf((v) => !v)} style={styles.selfRow}>
            <View
              style={[
                styles.check,
                { borderColor: colorTheme.line, backgroundColor: colorTheme.surface },
                includeSelf && styles.checkOn,
                includeSelf && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
            >
              {includeSelf && <Icon name="check" size={13} color={theme.onAccent} stroke={2.6} />}
            </View>
            <Text style={[styles.selfText, { color: colorTheme.ink }]}>
              {isZh ? '我也参与了这笔账单' : 'I was on this bill too'}
            </Text>
            {includeSelf && (
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setSelfShares((w) => Math.max(1, w - 1))}
                  style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  hitSlop={4}
                >
                  <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>−</Text>
                </Pressable>
                <Text style={[styles.stepValue, { color: colorTheme.ink }]}>{selfShares}</Text>
                <Pressable
                  onPress={() => setSelfShares((w) => w + 1)}
                  style={[styles.stepBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                  hitSlop={4}
                >
                  <Text style={[styles.stepText, { color: colorTheme.ink2 }]}>+</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </View>
      );
    }

    case 'split_step_3': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {/* Exact Summary Box from SplitSheet.tsx */}
          <View style={[styles.summary, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colorTheme.ink }]}>{isZh ? '个人支出' : 'Your expense'}</Text>
              <Text style={[styles.summaryValue, { color: colorTheme.ink }]}>{fmtMoney(ownExpense, 'MYR')}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabelSoft, { color: colorTheme.ink2 }]}>{isZh ? '待收借款' : 'Owed to you'}</Text>
              <Text style={[styles.summaryValueSoft, { color: theme.accent }]}>{fmtMoney(totalOwed, 'MYR')}</Text>
            </View>
            <Text style={[styles.summaryNote, { color: colorTheme.ink3 }]}>
              {isZh
                ? '仅将您个人承担的份额记为支出。其余部分将作为待收借款，待对方还款后结清。'
                : 'Only your share is recorded as spending. The rest becomes money owed to you, and clears when they pay you back.'}
            </Text>
          </View>

          {/* Exact Primary Button from SplitSheet.tsx */}
          <View style={[styles.mockPrimaryBtn, { backgroundColor: theme.accentInk }]}>
            <Icon name="check" size={17} color="#ffffff" stroke={2.4} />
            <Text style={styles.mockPrimaryBtnText}>{isZh ? '保存分账' : 'Save split'}</Text>
          </View>
        </View>
      );
    }

    case 'owed_step_1': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {/* Exact Receivable Item Card from Net Worth */}
          <View style={[styles.receivableCard, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
            <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.avatarText, { color: theme.onTint }]}>A</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.receivableName, { color: colorTheme.ink }]}>Alex</Text>
              <Text style={[styles.receivableSub, { color: colorTheme.ink3 }]}>
                {isZh ? '聚餐分摊 • 待还款' : 'Dinner split • Unsettled'}
              </Text>
            </View>
            <View style={styles.receivableRight}>
              <Text style={[styles.receivableAmount, { color: theme.accent }]}>+RM60.00</Text>
              <View style={[styles.assetBadge, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
                <Text style={[styles.assetBadgeText, { color: theme.accentInk }]}>{isZh ? '净资产' : 'Net Worth'}</Text>
              </View>
            </View>
          </View>
          <Text style={[styles.flowExplainer, { color: colorTheme.ink2 }]}>
            {isZh
              ? '💡 代付的 RM60.00 不会虚增为个人支出，而是作为应收资产在净资产中安全跟踪。'
              : '💡 The RM60.00 is tracked as an asset under Net Worth rather than an inflated personal expense.'}
          </Text>
        </View>
      );
    }

    case 'owed_step_2': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <View style={[styles.receivableCard, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
            <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.avatarText, { color: theme.onTint }]}>A</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.receivableName, { color: colorTheme.ink }]}>Alex</Text>
              <Text style={[styles.receivableSub, { color: colorTheme.ink3 }]}>RM60.00</Text>
            </View>
          </View>

          {/* Interactive Settle / Write Off Buttons */}
          <View style={styles.actionButtonsRow}>
            <Pressable
              onPress={() => setSettledState('settled')}
              style={[
                styles.actionBtn,
                { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
                settledState === 'settled' && { backgroundColor: theme.accentInk },
              ]}
            >
              <Icon name="check" size={14} color={settledState === 'settled' ? '#ffffff' : theme.accent} stroke={2.4} />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: settledState === 'settled' ? '#ffffff' : theme.accentInk },
                ]}
              >
                {isZh ? '结清 (Settle)' : 'Settle'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSettledState('written_off')}
              style={[
                styles.actionBtn,
                { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
                settledState === 'written_off' && { backgroundColor: colorTheme.red },
              ]}
            >
              <Icon name="trash" size={14} color={settledState === 'written_off' ? '#ffffff' : colorTheme.red} />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: settledState === 'written_off' ? '#ffffff' : colorTheme.ink2 },
                ]}
              >
                {isZh ? '核销 (Write off)' : 'Write off'}
              </Text>
            </Pressable>
          </View>

          {settledState === 'settled' ? (
            <View style={[styles.statusFeedback, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Text style={[styles.statusFeedbackText, { color: theme.accentInk }]}>
                {isZh
                  ? '✅ 结清成功：现金增加 RM60.00，应收款冲销，不产生虚假重复收入。'
                  : '✅ Settled: RM60.00 cash deposited, debt cleared, zero duplicate income recorded.'}
              </Text>
            </View>
          ) : settledState === 'written_off' ? (
            <View style={[styles.statusFeedback, { backgroundColor: colorTheme.redTint, borderColor: colorTheme.redSoft }]}>
              <Text style={[styles.statusFeedbackText, { color: colorTheme.red }]}>
                {isZh
                  ? '⚠️ 核销成功：无法收回的金额已转为当月个人支出。'
                  : '⚠️ Written off: Uncollectible amount converted to personal expense.'}
              </Text>
            </View>
          ) : (
            <Text style={[styles.flowExplainer, { color: colorTheme.ink3 }]}>
              {isZh ? '点击上方按钮体验“结清”或“核销”的处理效果' : 'Tap above to preview Settle or Write-off actions'}
            </Text>
          )}
        </View>
      );
    }

    case 'quick_add_step_1':
    case 'quick_add_step_2': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {/* Exact QuickAddField input UI */}
          <View style={styles.quickAddRow}>
            <View style={[styles.inputContainer, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <Text style={[styles.inputSampleText, { color: colorTheme.ink }]}>lunch 12, grab 18</Text>
            </View>
            <View style={[styles.quickAddSubmit, { backgroundColor: theme.accent }]}>
              <Icon name="check" size={16} color="#ffffff" stroke={2.4} />
            </View>
          </View>

          {/* Exact Transaction Result Rows matching Pip's ledger */}
          <View style={styles.quickParsedList}>
            <View style={[styles.quickParsedItem, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <View style={[styles.catIconCircle, { backgroundColor: '#ffe9e0' }]}>
                <Icon name="utensils" size={14} color="#d35400" stroke={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.quickItemTitle, { color: colorTheme.ink }]}>{isZh ? '午餐' : 'Lunch'}</Text>
                <Text style={[styles.quickItemSub, { color: colorTheme.ink3 }]}>{isZh ? '餐饮 • 今天' : 'Food & Dining • Today'}</Text>
              </View>
              <Text style={[styles.quickItemAmount, { color: colorTheme.ink }]}>-RM12.00</Text>
            </View>

            <View style={[styles.quickParsedItem, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <View style={[styles.catIconCircle, { backgroundColor: '#e2f4ea' }]}>
                <Icon name="car" size={14} color="#1c7a4e" stroke={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.quickItemTitle, { color: colorTheme.ink }]}>Grab</Text>
                <Text style={[styles.quickItemSub, { color: colorTheme.ink3 }]}>{isZh ? '交通 • 今天' : 'Transport • Today'}</Text>
              </View>
              <Text style={[styles.quickItemAmount, { color: colorTheme.ink }]}>-RM18.00</Text>
            </View>
          </View>
        </View>
      );
    }

    case 'safe_income_visual': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {/* Income Floor Chart matching CashflowStructure.tsx */}
          <View style={styles.floorCardHead}>
            <View style={[styles.shieldIconWrap, { backgroundColor: theme.accentSoft }]}>
              <Icon name="shield" size={14} color={theme.accent} stroke={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.floorHeadTitle, { color: colorTheme.ink }]}>
                {isZh ? '安全底线月收入' : 'Safe Monthly Income'}
              </Text>
              <Text style={[styles.floorHeadAmount, { color: theme.accentInk }]}>RM3,800</Text>
            </View>
          </View>

          <View style={styles.chartBarsWrap}>
            <View style={styles.barCol}>
              <View style={[styles.bar, { height: 46, backgroundColor: theme.accentSoft }]} />
              <Text style={[styles.barLabel, { color: colorTheme.ink3 }]}>M1</Text>
            </View>
            <View style={styles.barCol}>
              <View style={[styles.bar, { height: 64, backgroundColor: theme.accentSoft }]} />
              <Text style={[styles.barLabel, { color: colorTheme.ink3 }]}>M2</Text>
            </View>
            <View style={styles.barCol}>
              <View style={[styles.bar, { height: 32, backgroundColor: theme.accent }]} />
              <Text style={[styles.barLabel, { color: theme.accentInk, fontFamily: uiFont(700) }]}>M3</Text>
            </View>
            <View style={styles.barCol}>
              <View style={[styles.bar, { height: 54, backgroundColor: theme.accentSoft }]} />
              <Text style={[styles.barLabel, { color: colorTheme.ink3 }]}>M4</Text>
            </View>
          </View>

          <View style={[styles.floorCallout, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
            <Text style={[styles.floorCalloutText, { color: theme.accentInk }]}>
              {isZh
                ? '以最低月份 RM3,800 制定支出计划，丰收月份自然转化为储蓄。'
                : 'Plan your expenses against the RM3,800 floor; higher months automatically turn into savings.'}
            </Text>
          </View>
        </View>
      );
    }

    case 'committed_spend_visual': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          {/* 3-Tier Spend Hierarchy matching CashflowStructure.tsx */}
          <View style={[styles.tierRowItem, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
            <View style={[styles.tierColorBar, { backgroundColor: colorTheme.ink }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.tierHead}>
                <Text style={[styles.tierName, { color: colorTheme.ink }]}>
                  {isZh ? '固定支出 (Committed)' : 'Committed (Fixed)'}
                </Text>
                <Text style={[styles.tierAmount, { color: colorTheme.ink }]}>35%</Text>
              </View>
              <Text style={[styles.tierDesc, { color: colorTheme.ink3 }]}>
                {isZh ? '房租、贷款分期（锁死不可调减）' : 'Rent, loan instalments (Fixed)'}
              </Text>
            </View>
          </View>

          <View style={[styles.tierRowItem, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
            <View style={[styles.tierColorBar, { backgroundColor: theme.accent }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.tierHead}>
                <Text style={[styles.tierName, { color: colorTheme.ink }]}>
                  {isZh ? '刚性支出 (Essential)' : 'Essential (Elastic)'}
                </Text>
                <Text style={[styles.tierAmount, { color: theme.accentInk }]}>40%</Text>
              </View>
              <Text style={[styles.tierDesc, { color: colorTheme.ink3 }]}>
                {isZh ? '基本伙食、日常交通（可压缩不可省）' : 'Food, groceries (Compressible)'}
              </Text>
            </View>
          </View>

          <View style={[styles.tierRowItem, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
            <View style={[styles.tierColorBar, { backgroundColor: '#3ab07a' }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.tierHead}>
                <Text style={[styles.tierName, { color: colorTheme.ink }]}>
                  {isZh ? '灵活支出 (Flexible)' : 'Flexible (Discretionary)'}
                </Text>
                <Text style={[styles.tierAmount, { color: '#1c7a4e' }]}>25%</Text>
              </View>
              <Text style={[styles.tierDesc, { color: colorTheme.ink3 }]}>
                {isZh ? '聚餐娱乐、休闲购物（紧缩月可随时砍掉）' : 'Dining out, leisure (Redirectable)'}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    case 'card_direction_visual': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <Text style={[styles.cardAccountName, { color: colorTheme.ink }]}>Maybank Visa Platinum (Credit Card)</Text>

          {/* Exact Direction Toggle from AccountLinkField.tsx */}
          <View style={[styles.effectRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
            <Pressable
              onPress={() => setCardEffect('add')}
              style={[styles.effectBtn, cardEffect === 'add' && { backgroundColor: theme.accentInk }]}
            >
              <Text
                style={[
                  styles.effectText,
                  { color: colorTheme.ink2 },
                  cardEffect === 'add' && { color: theme.onAccent, fontFamily: uiFont(700) },
                ]}
              >
                {isZh ? '计入 Maybank Visa' : 'Adds to Maybank Visa'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCardEffect('subtract')}
              style={[styles.effectBtn, cardEffect === 'subtract' && { backgroundColor: theme.accentInk }]}
            >
              <Text
                style={[
                  styles.effectText,
                  { color: colorTheme.ink2 },
                  cardEffect === 'subtract' && { color: theme.onAccent, fontFamily: uiFont(700) },
                ]}
              >
                {isZh ? '偿还 Maybank Visa' : 'Pays down Maybank Visa'}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.statusFeedback, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
            <Text style={[styles.statusFeedbackText, { color: theme.accentInk }]}>
              {cardEffect === 'add'
                ? isZh
                  ? '💳 刷卡消费：信用卡欠款（负债）增加。'
                  : '💳 Card Purchase: Increases what you owe on the card.'
                : isZh
                ? '💵 还款转账：信用卡欠款降低，冲销负债。'
                : '💵 Card Payment: Lowers your card balance & pays down debt.'}
            </Text>
          </View>
        </View>
      );
    }

    case 'net_worth_visual': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <View style={styles.eqBox}>
            <View style={[styles.eqPill, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Text style={[styles.eqTitle, { color: theme.accentInk }]}>{isZh ? '总资产' : 'Assets'}</Text>
              <Text style={[styles.eqValue, { color: theme.accentInk }]}>RM52,000</Text>
            </View>
            <Text style={[styles.eqOp, { color: colorTheme.ink3 }]}>−</Text>
            <View style={[styles.eqPill, { backgroundColor: colorTheme.redTint, borderColor: colorTheme.redSoft }]}>
              <Text style={[styles.eqTitle, { color: colorTheme.red }]}>{isZh ? '总负债' : 'Liabilities'}</Text>
              <Text style={[styles.eqValue, { color: colorTheme.red }]}>RM14,000</Text>
            </View>
            <Text style={[styles.eqOp, { color: colorTheme.ink3 }]}>=</Text>
            <View style={[styles.eqPill, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <Text style={[styles.eqTitle, { color: colorTheme.ink }]}>{isZh ? '总净资产' : 'Net Worth'}</Text>
              <Text style={[styles.eqValue, { color: colorTheme.ink }]}>RM38,000</Text>
            </View>
          </View>
        </View>
      );
    }

    case 'net_cash_flow_visual': {
      return (
        <View style={[styles.appContainer, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <View style={styles.eqBox}>
            <View style={[styles.eqPill, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Text style={[styles.eqTitle, { color: theme.accentInk }]}>{isZh ? '月收入' : 'Income'}</Text>
              <Text style={[styles.eqValue, { color: theme.accentInk }]}>+RM5,500</Text>
            </View>
            <Text style={[styles.eqOp, { color: colorTheme.ink3 }]}>−</Text>
            <View style={[styles.eqPill, { backgroundColor: colorTheme.amberTint, borderColor: colorTheme.amberSoft }]}>
              <Text style={[styles.eqTitle, { color: colorTheme.amber }]}>{isZh ? '总支出' : 'Expenses'}</Text>
              <Text style={[styles.eqValue, { color: colorTheme.amber }]}>-RM3,800</Text>
            </View>
            <Text style={[styles.eqOp, { color: colorTheme.ink3 }]}>=</Text>
            <View style={[styles.eqPill, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <Text style={[styles.eqTitle, { color: theme.accentInk }]}>{isZh ? '结余现金' : 'Net Flow'}</Text>
              <Text style={[styles.eqValue, { color: theme.accentInk }]}>+RM1,700</Text>
            </View>
          </View>
        </View>
      );
    }

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  appContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
    ...shadowCard,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: {
    fontFamily: uiFont(700),
    fontSize: 15,
  },
  sheetSubtitle: {
    fontFamily: uiFont(500),
    fontSize: 11.5,
    marginTop: 1,
  },
  liveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveBadgeText: {
    fontFamily: uiFont(700),
    fontSize: 9.5,
  },
  tableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  tableChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  tableChipSelf: {},
  tableChipText: {
    fontFamily: uiFont(600),
    fontSize: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  receiptCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  receiptItemRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  receiptDivider: {
    borderTopWidth: 1,
  },
  receiptItemHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  receiptItemName: {
    fontFamily: uiFont(600),
    fontSize: 12.5,
    flex: 1,
  },
  receiptItemAmount: {
    fontFamily: numFont(700),
    fontSize: 13,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemAvatarYou: {
    width: 34,
    borderRadius: 999,
    paddingHorizontal: 4,
  },
  itemAvatarText: {
    fontFamily: uiFont(600),
    fontSize: 10,
  },
  sharedBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  sharedBtnText: {
    fontFamily: uiFont(600),
    fontSize: 11,
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
  },
  toggleBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 999,
  },
  toggleBtnOn: {
    ...shadowToggle,
  },
  toggleText: {
    fontFamily: uiFont(600),
    fontSize: 12.5,
  },
  toggleTextOn: {
    fontFamily: uiFont(700),
  },
  hint: {
    fontFamily: uiFont(500),
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  fieldLabel: {
    fontFamily: uiFont(600),
    fontSize: 12,
    marginBottom: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: uiFont(600),
    fontSize: 12,
  },
  addChip: {
    borderStyle: 'dashed',
  },
  list: {
    gap: 8,
    marginBottom: 10,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: uiFont(700),
    fontSize: 12,
  },
  personName: {
    flex: 1,
    fontFamily: uiFont(600),
    fontSize: 13,
  },
  owed: {
    fontFamily: numFont(700),
    fontSize: 13.5,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stepBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontFamily: uiFont(700),
    fontSize: 13,
    lineHeight: 16,
  },
  stepValue: {
    fontFamily: numFont(700),
    fontSize: 13,
    minWidth: 12,
    textAlign: 'center',
  },
  selfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {},
  selfText: {
    flex: 1,
    fontFamily: uiFont(600),
    fontSize: 12.5,
  },
  summary: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 12,
    gap: 5,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontFamily: uiFont(700),
    fontSize: 13,
  },
  summaryValue: {
    fontFamily: numFont(700),
    fontSize: 15,
  },
  summaryLabelSoft: {
    fontFamily: uiFont(600),
    fontSize: 12,
  },
  summaryValueSoft: {
    fontFamily: numFont(600),
    fontSize: 13,
  },
  summaryNote: {
    fontFamily: uiFont(500),
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  mockPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 999,
  },
  mockPrimaryBtnText: {
    fontFamily: uiFont(700),
    fontSize: 14,
    color: '#ffffff',
  },
  receivableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  receivableName: {
    fontFamily: uiFont(700),
    fontSize: 13.5,
  },
  receivableSub: {
    fontFamily: uiFont(500),
    fontSize: 11,
    marginTop: 1,
  },
  receivableRight: {
    alignItems: 'flex-end',
  },
  receivableAmount: {
    fontFamily: numFont(700),
    fontSize: 14,
  },
  assetBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 2,
  },
  assetBadgeText: {
    fontFamily: uiFont(700),
    fontSize: 9.5,
  },
  flowExplainer: {
    fontFamily: uiFont(500),
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 6,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontFamily: uiFont(700),
    fontSize: 12,
  },
  statusFeedback: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  statusFeedbackText: {
    fontFamily: uiFont(600),
    fontSize: 11,
    lineHeight: 15,
  },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  inputContainer: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputSampleText: {
    fontFamily: uiFont(600),
    fontSize: 13.5,
  },
  quickAddSubmit: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickParsedList: {
    gap: 6,
  },
  quickParsedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 8,
  },
  catIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickItemTitle: {
    fontFamily: uiFont(700),
    fontSize: 12.5,
  },
  quickItemSub: {
    fontFamily: uiFont(500),
    fontSize: 10.5,
  },
  quickItemAmount: {
    fontFamily: numFont(700),
    fontSize: 13,
  },
  floorCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  shieldIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floorHeadTitle: {
    fontFamily: uiFont(700),
    fontSize: 12.5,
  },
  floorHeadAmount: {
    fontFamily: numFont(800),
    fontSize: 16,
  },
  chartBarsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 64,
    paddingBottom: 4,
    marginBottom: 6,
  },
  barCol: {
    alignItems: 'center',
    gap: 3,
  },
  bar: {
    width: 22,
    borderRadius: 4,
  },
  barLabel: {
    fontFamily: uiFont(500),
    fontSize: 10,
  },
  floorCallout: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  floorCalloutText: {
    fontFamily: uiFont(600),
    fontSize: 11,
    lineHeight: 15,
  },
  tierRowItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 6,
    paddingRight: 10,
    paddingVertical: 6,
  },
  tierColorBar: {
    width: 4,
    borderRadius: 2,
    marginRight: 8,
  },
  tierHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  tierName: {
    fontFamily: uiFont(700),
    fontSize: 12,
  },
  tierAmount: {
    fontFamily: numFont(700),
    fontSize: 12,
  },
  tierDesc: {
    fontFamily: uiFont(500),
    fontSize: 10.5,
  },
  cardAccountName: {
    fontFamily: uiFont(700),
    fontSize: 13,
    marginBottom: 8,
  },
  effectRow: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    marginBottom: 8,
  },
  effectBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: 'center',
  },
  effectText: {
    fontFamily: uiFont(600),
    fontSize: 11.5,
  },
  effectTextOn: {
    fontFamily: uiFont(700),
  },
  eqBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  eqPill: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  eqTitle: {
    fontFamily: uiFont(600),
    fontSize: 10,
  },
  eqValue: {
    fontFamily: numFont(700),
    fontSize: 12,
  },
  eqOp: {
    fontFamily: uiFont(700),
    fontSize: 14,
    paddingHorizontal: 1,
  },
});
