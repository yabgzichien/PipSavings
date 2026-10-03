import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { Pip } from './Pip';
import { Card, Eyebrow } from './ui';
import { shareExportFile, type ExportFormat } from '../lib/financialExport';
import { tap, commit } from '../lib/haptics';
import { notify } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { numFont, platformShadow, uiFont } from '../theme';

export interface ExportSuccessModalProps {
  visible: boolean;
  onClose: () => void;
  fileName: string;
  format: ExportFormat | 'zip';
  fileUri?: string;
  fileSize?: number;
  mimeType?: string;
  rawContent?: string;
  onPreview?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFormatMeta(format: ExportFormat | 'zip', isZh: boolean): { label: string; icon: IconName; color: string } {
  switch (format) {
    case 'pdf':
      return { label: isZh ? 'PDF 财务对账单' : 'PDF Financial Statement', icon: 'receipt', color: '#b3261e' };
    case 'xlsx':
      return { label: isZh ? 'Excel 工作簿 (.xlsx)' : 'Excel Workbook (.xlsx)', icon: 'table', color: '#15803d' };
    case 'html':
      return { label: isZh ? '交互式 HTML 报表' : 'Interactive HTML Report', icon: 'trending', color: '#2563eb' };
    case 'csv':
      return { label: isZh ? 'CSV 表格数据' : 'CSV Data Sheet', icon: 'file', color: '#d97706' };
    case 'json':
      return { label: isZh ? '高级导入 JSON' : 'Advanced JSON Export', icon: 'code', color: '#7c3aed' };
    case 'receipts':
    case 'zip':
      return { label: isZh ? '小票证据归档 (.zip)' : 'Receipts & Evidence ZIP Archive', icon: 'camera', color: '#0891b2' };
    case 'ewallet':
      return { label: isZh ? '电子钱包交易流水 (.csv)' : 'E-Wallet Transaction History (.csv)', icon: 'scan', color: '#0284c7' };
    default:
      return { label: isZh ? '财务导出文件' : 'Financial Export File', icon: 'file', color: '#52525b' };
  }
}

export function ExportSuccessModal({
  visible,
  onClose,
  fileName,
  format,
  fileUri,
  fileSize,
  mimeType,
  rawContent,
  onPreview,
}: ExportSuccessModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const themeColors = useThemeColors();
  const { isZh } = useLanguage();
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const meta = getFormatMeta(format, isZh);

  const handleShare = async () => {
    tap();
    if (!fileUri && Platform.OS !== 'web') {
      notify(
        isZh ? '无法分享' : 'Cannot Share',
        isZh ? '未找到文件存储路径。' : 'File path is not available.'
      );
      return;
    }
    setSharing(true);
    try {
      if (fileUri) {
        await shareExportFile(fileUri, mimeType, isZh ? '保存或分享财务文件' : 'Save or Share Financial File');
      }
    } catch (err: any) {
      notify(isZh ? '分享错误' : 'Share Error', err?.message || (isZh ? '无法打开系统分享菜单。' : 'Unable to open system share sheet.'));
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = async () => {
    tap();
    if (!rawContent) return;
    try {
      await Clipboard.setStringAsync(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      notify(isZh ? '已复制' : 'Copied', isZh ? '文件内容已复制至剪贴板。' : 'Content copied to clipboard.');
    } catch {
      notify(isZh ? '复制失败' : 'Copy Failed', isZh ? '无法复制内容至剪贴板。' : 'Could not copy content.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: themeColors.bg }]}>
        {/* TOP BAR / DISMISS */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8, borderBottomColor: themeColors.line2 }]}>
          <Text style={[styles.topBarTitle, { color: themeColors.ink }]}>
            {isZh ? '导出成功' : 'Export Complete'}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [styles.closeBtn, { backgroundColor: themeColors.surface2, opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="x" size={16} color={themeColors.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          {/* HEADER WITH PIP MASCOT */}
          <View style={styles.headerSection}>
            <View style={[styles.mascotWrap, { backgroundColor: theme.accentTint }]}>
              <Pip expr="happy" celebrate={true} size={56} />
            </View>
            <Text style={[styles.headline, { color: themeColors.ink }]}>
              {isZh ? '财务文件已生成' : 'Statement Generated!'}
            </Text>
            <Text style={[styles.subheadline, { color: themeColors.ink2 }]}>
              {isZh
                ? '您的报表已准备就绪，可通过下方操作保存至手机文件或直接查看。'
                : 'Your report is ready. You can save it to your phone files, share, or preview it.'}
            </Text>
          </View>

          {/* FILE DETAILS CARD */}
          <Eyebrow style={{ marginTop: 22, marginBottom: 8 }}>{isZh ? '文件信息' : 'File Details'}</Eyebrow>
          <Card style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={[styles.fileIconWrap, { backgroundColor: meta.color + '15' }]}>
                <Icon name={meta.icon} size={26} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileName, { color: themeColors.ink }]} numberOfLines={1}>
                  {fileName}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <View style={[styles.formatTag, { backgroundColor: themeColors.surface2, borderColor: themeColors.line2 }]}>
                    <Text style={[styles.formatTagText, { color: themeColors.ink2 }]}>{meta.label}</Text>
                  </View>
                  {fileSize ? (
                    <Text style={[styles.fileSizeText, { color: themeColors.ink3 }]}>
                      {formatBytes(fileSize)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </Card>

          {/* WHERE TO FIND YOUR FILE (STEP-BY-STEP PLATFORM GUIDANCE) */}
          <Eyebrow style={{ marginTop: 22, marginBottom: 8 }}>{isZh ? '如何在手机中找到此文件？' : 'Where is your file saved?'}</Eyebrow>
          <Card style={{ padding: 16 }}>
            <View style={{ gap: 14 }}>
              {Platform.OS === 'ios' ? (
                <>
                  <View style={styles.guideStep}>
                    <View style={[styles.stepNumberWrap, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.stepNumberText, { color: theme.onAccent }]}>1</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.guideStepTitle, { color: themeColors.ink }]}>
                        {isZh ? '点击下方「保存到手机 / 分享」' : 'Tap "Save to Phone / Share" below'}
                      </Text>
                      <Text style={[styles.guideStepSub, { color: themeColors.ink2 }]}>
                        {isZh ? '打开系统分享面板。' : 'This opens the native iOS share sheet.'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.guideStep}>
                    <View style={[styles.stepNumberWrap, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.stepNumberText, { color: theme.onAccent }]}>2</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.guideStepTitle, { color: themeColors.ink }]}>
                        {isZh ? '选择「存储到“文件”」' : 'Select "Save to Files"'}
                      </Text>
                      <Text style={[styles.guideStepSub, { color: themeColors.ink2 }]}>
                        {isZh ? '选择「我的 iPhone」或「iCloud 云盘」中的文件夹并存储。' : 'Choose "On My iPhone" or "iCloud Drive" and tap Save.'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.guideStep}>
                    <View style={[styles.stepNumberWrap, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.stepNumberText, { color: theme.onAccent }]}>3</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.guideStepTitle, { color: themeColors.ink }]}>
                        {isZh ? '在主屏幕打开「文件」App' : 'Open the "Files" app on your iPhone'}
                      </Text>
                      <Text style={[styles.guideStepSub, { color: themeColors.ink2 }]}>
                        {isZh ? '在“下载”或选择的文件夹中即可随时查看此财务对账单。' : 'Your financial statement will be ready in Downloads or your chosen folder.'}
                      </Text>
                    </View>
                  </View>
                </>
              ) : Platform.OS === 'android' ? (
                <>
                  <View style={styles.guideStep}>
                    <View style={[styles.stepNumberWrap, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.stepNumberText, { color: theme.onAccent }]}>1</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.guideStepTitle, { color: themeColors.ink }]}>
                        {isZh ? '点击下方「保存到手机 / 分享」' : 'Tap "Save to Phone / Share" below'}
                      </Text>
                      <Text style={[styles.guideStepSub, { color: themeColors.ink2 }]}>
                        {isZh ? '弹出 Android 系统的分享与存储菜单。' : 'This opens Android’s system share & save menu.'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.guideStep}>
                    <View style={[styles.stepNumberWrap, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.stepNumberText, { color: theme.onAccent }]}>2</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.guideStepTitle, { color: themeColors.ink }]}>
                        {isZh ? '选择「另存为」或「保存到云端/下载」' : 'Select "Save to Device / Downloads"'}
                      </Text>
                      <Text style={[styles.guideStepSub, { color: themeColors.ink2 }]}>
                        {isZh ? '选择保存到手机存储的 Downloads 目录或 Google 云端硬盘。' : 'Save to your device storage (Downloads) or Google Drive.'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.guideStep}>
                    <View style={[styles.stepNumberWrap, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.stepNumberText, { color: theme.onAccent }]}>3</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.guideStepTitle, { color: themeColors.ink }]}>
                        {isZh ? '打开「文件」或「我的文件」App' : 'Open your phone’s "Files" or "My Files" app'}
                      </Text>
                      <Text style={[styles.guideStepSub, { color: themeColors.ink2 }]}>
                        {isZh ? '进入「下载 (Downloads)」分类即可找到此文件。' : 'Check the "Downloads" folder to open or transfer your file.'}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="download" size={20} color={theme.accent} />
                  <Text style={[styles.guideStepTitle, { color: themeColors.ink, flex: 1 }]}>
                    {isZh ? '文件已自动下载至浏览器的「下载」文件夹中。' : 'The file has been saved into your browser’s Downloads folder.'}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          {/* ACTION BUTTONS */}
          <View style={{ marginTop: 24, gap: 10 }}>
            {Platform.OS !== 'web' && fileUri && (
              <Pressable
                onPress={handleShare}
                disabled={sharing}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: theme.accentInk, opacity: sharing ? 0.6 : pressed ? 0.9 : 1 },
                  platformShadow(theme.accent, 0.35, 10, { width: 0, height: 5 }, 3),
                ]}
              >
                <Icon name="share" size={18} color={theme.onAccent} />
                <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
                  {isZh ? '保存到手机文件 / 分享' : 'Save to Phone / Share'}
                </Text>
              </Pressable>
            )}

            {onPreview && (
              <Pressable
                onPress={() => {
                  onClose();
                  onPreview();
                }}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.line2, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Icon name="sparkles" size={16} color={theme.accent} />
                <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>
                  {isZh ? '查看 / 预览文件内容' : 'View / Preview Document'}
                </Text>
              </Pressable>
            )}

            {rawContent && (
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.line2, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? '#15803d' : themeColors.ink} />
                <Text style={[styles.secondaryBtnText, { color: copied ? '#15803d' : themeColors.ink }]}>
                  {copied ? (isZh ? '已复制至剪贴板' : 'Copied to Clipboard!') : (isZh ? '复制文件内容' : 'Copy File Content')}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.doneBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.doneBtnText, { color: themeColors.ink2 }]}>
                {isZh ? '完成' : 'Done'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  topBarTitle: {
    fontFamily: uiFont(700),
    fontSize: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSection: {
    alignItems: 'center',
    textAlign: 'center',
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  mascotWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  headline: {
    fontFamily: uiFont(700),
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 6,
  },
  subheadline: {
    fontFamily: uiFont(400),
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
  },
  fileIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    fontFamily: uiFont(700),
    fontSize: 14.5,
  },
  formatTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  formatTagText: {
    fontFamily: uiFont(600),
    fontSize: 11,
  },
  fileSizeText: {
    fontFamily: numFont(500),
    fontSize: 12,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumberWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: {
    fontFamily: uiFont(700),
    fontSize: 11,
  },
  guideStepTitle: {
    fontFamily: uiFont(600),
    fontSize: 13.5,
    lineHeight: 18,
  },
  guideStepSub: {
    fontFamily: uiFont(400),
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontFamily: uiFont(700),
    fontSize: 15,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: uiFont(600),
    fontSize: 14,
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  doneBtnText: {
    fontFamily: uiFont(600),
    fontSize: 14,
  },
});
