// src/i18n/glossary.ts
import type { GlossaryEntry } from '../lib/glossary';
import type { SupportedLanguage } from './types';
import { GLOSSARY as EN_GLOSSARY } from '../lib/glossary';

export const ZH_GLOSSARY: Record<string, GlossaryEntry> = {
  safe_income: {
    term: '安全月收入',
    short: '当收入在各月之间波动时，用于制定预算的保守底线收入。',
    body: '取自近期各月收入的较低值而非平均值。因为如果按平均值制定预算，在收入低于平均值的月份预算就会失效。以安全底线为基准进行规划，可以在丰收月转化为结余储蓄，而不是在低收月出现资金缺口。',
    visualKey: 'safe_income_visual',
    steps: [
      {
        badge: '收入底线',
        title: '以稳健底线为预算基准',
        desc: '取历史月收入的保守低值而非平均值，确保在收入偏低的月份预算依然稳健不超支。',
        visualKey: 'safe_income_visual',
      },
    ],
  },
  net_cash_flow: {
    term: '净现金流',
    short: '在特定时期内，总收入减去总支出后的剩余金额。',
    body: '正数表示收入大于支出。观察净现金流的长期趋势比任何单一月份的数据都更有参考价值。',
    visualKey: 'net_cash_flow_visual',
    steps: [
      {
        badge: '现金流',
        title: '总收入减去总支出',
        desc: '持续的正向现金流能够随时间累积储蓄缓冲垫，真实反映财务健康度的提升。',
        visualKey: 'net_cash_flow_visual',
      },
    ],
  },
  where_it_goes: {
    term: '支出分布',
    short: '支出在各个分类中的分配情况。',
    body: '将账单按分类（如餐饮、交通、账单等）归集，有助于及时发现预算超支的环节，并为预算页面的分类明细提供支持。',
  },
  net_worth: {
    term: '总净资产',
    short: '拥有的所有资产减去所有负债后的净值。',
    body: '资产（现金、储蓄、投资）减去负债（贷款、信用卡欠款）。观察净资产随着时间稳步增长，是衡量财务健康状况最清晰的指标。',
    visualKey: 'net_worth_visual',
    steps: [
      {
        badge: '总净资产',
        title: '总资产减去总负债',
        desc: '银行账户、投资及应收款项的总和，扣除所有信用卡与贷款负债后的净价值。',
        visualKey: 'net_worth_visual',
      },
    ],
  },
  unallocated: {
    term: '未分配预算',
    short: '尚未分配给任何分类的预计收入。',
    body: '停留在未分配中的资金不会受到任何支出额度的限制。将其合理分配到各个分类（包括储蓄），才能让预算真实反映你的消费计划。',
  },
  holdings: {
    term: '持有资产',
    short: '构成你净资产的各个具体账户、投资或实物资产。',
    body: '净资产等于你拥有的总资产减去总负债。单独追踪各项资产有助于你了解是哪些项目在带动整体资产增长。',
  },
  income_floor: {
    term: '收入底线',
    short: '具有确定性的每月稳健收入，而非平均数所掩盖的虚高数字。',
    body: '对历史月收入进行排序并取稳健的低位水平作为底线，确保在大多数月份都能实现。平均值容易被极个别异常高的月份拉高，而底线收入才是你可以安心依赖的保障。',
    visualKey: 'safe_income_visual',
    steps: [
      {
        badge: '底线 vs 均值',
        title: '稳定可靠的收入底线',
        desc: '排序后的月收入能反映在淡季月份也能实际达到的可靠水平，避免预算落空。',
        visualKey: 'safe_income_visual',
      },
    ],
  },
  committed_spend: {
    term: '固定、刚性与灵活支出',
    short: '根据支出的必要性与可调控程度划分的三层消费结构。',
    body:
      '固定支出（Committed）：金额固定且按期发生的支出，如房租、贷款分期等，当月无法削减。\n\n' +
      '刚性支出（Essential）：必要但金额有波动的支出，如基本伙食、日常交通等，可压缩但不可缺少。\n\n' +
      '灵活支出（Flexible）：其余所有非刚性消费。如果当月收入偏紧，这部分可以随时调减。',
    visualKey: 'committed_spend_visual',
    steps: [
      {
        badge: '三层结构',
        title: '三层消费调控结构',
        desc: '固定支出（房租贷款不可削减）、刚性支出（伙食交通弹性压缩）、灵活支出（随时调减）。',
        visualKey: 'committed_spend_visual',
      },
    ],
  },
  learned_merchants: {
    term: '智能学习商家',
    short: 'Pip 会记住你为商家设置的分类，在后续扫描中自动预填。',
    body: '每当你为一笔交易选择分类时，Pip 都会记录该商家的对应分类。下次在扫描或导入中遇到相同商家时，系统会自动填入该分类，无需手动再次选择。重置学习将清除所有记忆。',
  },
  card_direction: {
    term: '还款 / 消费',
    short: '该笔交易是降低还是增加了你在该信用卡或贷款账户上的负债。',
    body: '向信用卡或贷款账户还款会降低欠款（资产负债表负债减少），而在信用卡上刷卡消费则会增加欠款。',
    visualKey: 'card_direction_visual',
    steps: [
      {
        badge: '账户流向',
        title: '消费增加欠款 vs 还款降低负债',
        desc: '日常刷卡选择“消费”（负债增加），向卡内还款选择“还款”（降低欠款）。',
        visualKey: 'card_direction_visual',
      },
    ],
  },
  split_bill: {
    term: '分摊账单',
    short: '分摊多人账单，仅将属于自己的份额计入支出。',
    body:
      '小票扫描逐项分账（Itemized）：\n' +
      '• 添加同行好友，在每道菜品下方点击好友头像分配归属，或点击“均摊”平摊该菜品。税费和服务费会自动按比例分摊。\n\n' +
      '手动分摊模式（Manual）：\n' +
      '• 选择“均分”、“按份额”或“指定金额”，并可使用 +/- 调整各人权重。\n\n' +
      '资产与支出影响：\n' +
      '• 仅属于您自己的份额会计入个人支出，其余代付金额将在“待收应收款”中追踪直至结清。',
    visualKey: 'split_receipt_step',
    steps: [
      {
        badge: '小票逐项分账',
        title: '点单明细逐项分配',
        desc: '添加同行好友后，在每道菜品下点击好友头像进行分配，或点击“均摊”平摊该项。',
        visualKey: 'split_receipt_step',
      },
      {
        badge: '手动分账模式',
        title: '选择分摊模式与同行人员',
        desc: '选择均分、按份额或指定金额模式，并点击或添加参与分摊的好友姓名。',
        visualKey: 'split_step_1',
      },
      {
        badge: '份额与自身参与',
        title: '调整份额与参与状态',
        desc: '使用 +/- 调整各人份额。保持勾选“我也参与了此账单”（除非全额为他人代付）。',
        visualKey: 'split_step_2',
      },
      {
        badge: '个人支出与应收',
        title: '个人支出与待收应收款',
        desc: '仅您自己的份额会记录为个人支出，好友份额自动计入总净资产的“待收应收款”中，直至结清。',
        visualKey: 'split_step_3',
      },
    ],
  },
  owed_to_you: {
    term: '待收应收款',
    short: '分摊账单中他人欠您的款项，作为资产而非支出进行追踪。',
    body:
      '当您为多人账单付款时，只有属于您自己的份额会计入个人支出。其余金额将作为应收款项计入您的总净资产中，避免虚增支出。\n\n' +
      '当对方还款时，结清操作会冲销这笔待收款并增加您的现金账户余额，不会重复记录为收入。如果某笔款项确实无法收回，核销操作会将其转化为当天的个人支出。',
    visualKey: 'owed_step_1',
    steps: [
      {
        badge: '步骤 1 / 2',
        title: '应收款项计入资产',
        desc: '分摊账单时代付的金额会作为资产计入您的净资产，避免虚增单月个人支出。',
        visualKey: 'owed_step_1',
      },
      {
        badge: '步骤 2 / 2',
        title: '结清与核销',
        desc: '好友还款时点击“结清”，资金入账且不产生重复收入；确实无法收回时点击“核销”转为支出。',
        visualKey: 'owed_step_2',
      },
    ],
  },
  quick_add: {
    term: '直接输入',
    short: '使用日常文字直接记录交易，无需逐项手动填写。',
    body:
      '直接输入金额和用途文字，Pip 会自动识别金额、备注、分类及日期。\n\n' +
      '示例：\n' +
      '• 午餐 9.2（记录 RM9.20 餐饮支出）\n' +
      '• 昨天咖啡 15（按昨天日期记录支出）\n' +
      '• 工资 5000（自动识别为收入）\n' +
      '• 午餐 12，打车 18（一次输入多笔交易）',
    visualKey: 'quick_add_step_1',
    steps: [
      {
        badge: '步骤 1 / 2',
        title: '自然语言快速输入',
        desc: '直接输入金额与用途（如“午餐 9.2”或“昨天咖啡 15”），Pip 自动解析分类与日期。',
        visualKey: 'quick_add_step_1',
      },
      {
        badge: '步骤 2 / 2',
        title: '逗号批量记录',
        desc: '使用逗号一次输入多笔（如“午餐 12，打车 18”），一键快速生成多笔记账。',
        visualKey: 'quick_add_step_2',
      },
    ],
  },
  reduce_liability: {
    term: '抵扣负债账户',
    short: '将分期还款关联至负债账户，按期支付时同步减少净资产中的剩余欠款。',
    body:
      '适用于按月支付的各类分期贷款项目（例如汽车分期车贷、房产分期房贷或个人贷款等）。设置关联后，每次确认支付分期时：\n\n' +
      '• 扣款账户：支出的银行或现金账户资金减少。\n' +
      '• 负债账户：对应的车贷、房贷或贷款剩余欠款同步抵扣减少（资产负债表中负债下降）。\n\n' +
      '普通无负债的周期性订阅账单（如流媒体、话费套餐）保持为“无”即可。',
    steps: [
      {
        badge: '分期还款',
        title: '车贷与房贷分期自动减债',
        desc: '关联车贷或房产贷款账户，每月支付分期时自动扣减负债余额，真实反映净资产变化。',
      },
    ],
  },
  tax_relief: {
    term: '税务减免',
    short: '马来西亚个人所得税减免（LHDN / BE 表格）的记录工具。不构成税务建议，Pip 也不会代你报税。',
    body:
      '本页仅用于马来西亚个人所得税减免。其他国家的税务减免不在范围内。\n\n' +
      'Pip 会把令吉支出对照你所选课税年度的减免项目与上限。收据与标签都保存在这台设备上。\n\n' +
      'LHDN 才是最终依据。减免上限与资格可能调整，报税前请到 hasil.gov.my 核对。你需要自行把总额填进 MyTax，申报内容由你负责。',
    steps: [
      {
        badge: '自动标记',
        title: '照常记账即可',
        desc: '扫描小票或支付已关联的定期账单。符合条件的令吉支出会自动标到对应减免项目。',
      },
      {
        badge: '核对',
        title: '选择课税年度并检查项目',
        desc: '用 YA 标签切换年份。点开标签即可修正分类或金额。',
      },
      {
        badge: '添加',
        title: '关联账单或手动添加',
        desc: '关联一笔定期项目后，每次付款都会自动标记；也可以搜索交易后自行添加。',
      },
      {
        badge: '凭证',
        title: '在月底前附上证明',
        desc: '如果缺少收据或电子发票，请补上。可索取电子发票的项目会在当月结束时截止。',
      },
      {
        badge: '申报',
        title: '导出后自行填入 MyTax',
        desc: '报税时导出 PDF 汇总和小票压缩包。Pip 不会向 LHDN 提交任何资料。',
      },
    ],
  },
};

export function getGlossaryEntry(entryKey: string, lang: SupportedLanguage = 'en'): GlossaryEntry | undefined {
  if (lang === 'zh') {
    return ZH_GLOSSARY[entryKey] ?? EN_GLOSSARY[entryKey];
  }
  return EN_GLOSSARY[entryKey];
}
