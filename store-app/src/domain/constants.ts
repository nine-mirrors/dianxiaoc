/**
 * 领域层常量（ARCHITECTURE §5.1 / T03.1）。
 *
 * ⚠ 纯常量模块，不依赖 Vue、不依赖 api/fixtures，可被任意层引用。
 * 任何页面不得硬编码色值或分档区间，必须从这里取。
 */
import type {
  AnnotationLayer,
  Severity,
  TaskType,
  HealthLevelKey,
  ShootType,
  TrendKey,
} from '@/types'

/* ════════════════════════════════════════════════════════════════
 * 色值常量（TS / Canvas / 内联样式无法引用 CSS 变量时的唯一兜底出口）。
 * 每个常量都与 styles/tokens.css 的 Design System 1.2 令牌同值，
 * 注释标明对应令牌；这里改值必须同步 tokens.css，外观色一律以令牌为准。
 * 注意：这些常量取日间令牌值，供装饰填充 / 照片标注框等场景使用。
 * ════════════════════════════════════════════════════════════════ */
const COLOR_BRAND = '#00b451' // 对应 --brand
const COLOR_RED = '#e60012' // 对应 --red
const COLOR_AMBER = '#ff8a1e' // 对应 --amber
const COLOR_SKY = '#2fa7e0' // 对应 --sky
const COLOR_LEVEL_EXCELLENT = '#00a64d' // 对应 --level-excellent
const COLOR_LEVEL_GOOD = '#8bbf3a' // 对应 --level-good
const COLOR_LEVEL_WARNING = '#ef8a1e' // 对应 --level-warning
const COLOR_LEVEL_RISK = '#e03225' // 对应 --level-risk
const COLOR_NEUTRAL = '#81918a' // 对应 --text-3（中性灰）

/** 健康分四档（PRD 3.2，全产品统一；色值对齐 --level-* 令牌） */
export const HEALTH_LEVELS = [
  { key: 'excellent', min: 85, max: 100, label: '优秀', color: COLOR_LEVEL_EXCELLENT, icon: '✓', advice: '保持当前陈列水平' },
  { key: 'good', min: 70, max: 84, label: '良好', color: COLOR_LEVEL_GOOD, icon: '◐', advice: '有小问题，本周内处理' },
  { key: 'warning', min: 60, max: 69, label: '预警', color: COLOR_LEVEL_WARNING, icon: '△', advice: '需立即处理，否则影响销量' },
  { key: 'risk', min: 0, max: 59, label: '风险', color: COLOR_LEVEL_RISK, icon: '✖', advice: '红色告警，24 小时内整改' },
] as const

/** 六维度元数据（PRD 7.1，顺序固定 D1–D6） */
export const DIMENSIONS = [
  { key: 'D1', name: '排面达标', weight: 0.30 },
  { key: 'D2', name: '缺货控制', weight: 0.25 },
  { key: 'D3', name: '价签合规', weight: 0.15 },
  { key: 'D4', name: '竞争位势', weight: 0.15 },
  { key: 'D5', name: '陈列执行', weight: 0.10 },
  { key: 'D6', name: '期效新鲜', weight: 0.05 },
] as const

/** 风险预判系数（PRD 7.3） */
export const RISK = {
  /** 严重度调整系数 · 缺口 ≤20%：部分需求被同类承接 */
  SEVERITY_LOW: 0.7,
  /** 严重度调整系数 · 缺口 20%–50% */
  SEVERITY_MID: 0.95,
  /** 严重度调整系数 · 缺口 >50%：顾客流失外溢 */
  SEVERITY_HIGH: 1.4,
  /** 缺口系数 */
  GAP_FACTOR: 1.0,
  WEEK_DAYS: 7,
  MONTH_WEEKS: 4.3,
} as const

/** 依据缺口占比取严重度调整系数（≤20%→0.7 / 20%–50%→0.95 / >50%→1.4） */
export function severityOf(gapRatio: number): number {
  if (gapRatio <= 0.2) return RISK.SEVERITY_LOW
  if (gapRatio <= 0.5) return RISK.SEVERITY_MID
  return RISK.SEVERITY_HIGH
}

/* ═══════════════ A2 · AI 内容来源角标（全产品唯一定义处） ═══════════════ */

/**
 * AI 生成内容的来源标注。
 *
 * ⚠ 为什么要区分（答辩诚实性）：降级路径（无 LLM key / 上游失败）**同样会吐出文案**，
 *   若一律标「AI 生成」等于误导 —— 评委追问「这是大模型写的吗」时无法自圆其说。
 *   后端在 SSE 的 done 帧给出 source，前端据此选择措辞：
 *     - llm     → 真大模型生成 → 可以理直气壮标「AI」
 *     - fallback→ 本地规则/陈列标准库生成 → 标「基于陈列标准库生成」
 *     - null    → 网络失败（一般无内容可展示）
 *
 * 集中定义在此，避免三处页面各写一份文案后口径漂移。
 */
export const AI_SOURCE_BADGE = {
  /** 真实大模型生成 */
  llm: { text: 'AI 生成', tone: 'ai' as const },
  /** 本地兜底：关键词匹配 + 陈列标准库，非大模型 */
  fallback: { text: '基于陈列标准库生成', tone: 'standard' as const },
  /** 未拿到来源（网络失败等）—— 保守措辞，不宣称 AI */
  unknown: { text: '内容生成未完成', tone: 'muted' as const },
} as const

/** AI 内容来源 */
export type AiSource = keyof typeof AI_SOURCE_BADGE

/**
 * 按来源取角标文案。
 *
 * @param source 后端 SSE done 帧给出的来源
 * @returns 角标配置（source 为 null 时返回 unknown，**不谎称 AI**）
 */
export function aiBadgeOf(source: AiSource | null | undefined) {
  if (source === 'llm') return AI_SOURCE_BADGE.llm
  if (source === 'fallback') return AI_SOURCE_BADGE.fallback
  return AI_SOURCE_BADGE.unknown
}

/**
 * 标注框图层样式映射（PRD 3.1 + ARCHITECTURE §8.4）。
 * 仅描述「如何画」，坐标数据全部来自 fixture。
 */
export const ANNOTATION_STYLES: Record<
  AnnotationLayer,
  { color: string; dashed: boolean; label: string; tag: string; badge: boolean }
> = {
  mengniu: { color: COLOR_BRAND, dashed: false, label: '蒙牛正常', tag: '绿实线', badge: false },
  oos: { color: COLOR_AMBER, dashed: false, label: '缺货预警', tag: '橙实线', badge: false },
  empty: { color: COLOR_RED, dashed: true, label: '空位', tag: '红虚线', badge: false },
  competitor: { color: COLOR_SKY, dashed: true, label: '竞品', tag: '蓝虚线', badge: false },
  pricetag: { color: COLOR_AMBER, dashed: false, label: '价签问题', tag: '橙色角标', badge: true },
  stack: { color: COLOR_AMBER, dashed: true, label: '堆头未执行', tag: '橙虚线', badge: false },
}

/** 图层筛选 chips（P4 模块 C） */
export const LAYER_FILTERS: { key: 'all' | AnnotationLayer; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'empty', label: '缺货' },
  { key: 'pricetag', label: '价签' },
  { key: 'competitor', label: '竞品' },
]

/** 严重度元数据（PRD 4.4 D 模块；色值对齐 --red / --amber / --text-3 令牌） */
export const SEVERITY_META: Record<Severity, { label: string; color: string; weight: number }> = {
  severe: { label: '严重', color: COLOR_RED, weight: 3 },
  medium: { label: '中度', color: COLOR_AMBER, weight: 2 },
  low: { label: '轻度', color: COLOR_NEUTRAL, weight: 1 },
}

/** 拍摄部位元数据 */
export const SHOOT_TYPES: { key: ShootType; label: string }[] = [
  { key: 'cold', label: '冷藏柜' },
  { key: 'ambient', label: '常温架' },
  { key: 'stack', label: '堆头/端架' },
]

/** 任务类型元数据 */
export const TASK_TYPES: { key: TaskType; label: string }[] = [
  { key: 'OOS', label: '缺货补货' },
  { key: 'FACING', label: '排面调整' },
  { key: 'PRICETAG', label: '价签整改' },
  { key: 'STACK', label: '堆头执行' },
]

/** 趋势指标名称（P5 用） */
export const TREND_NAMES: Record<TrendKey, string> = {
  score: '平均健康分',
  oosRate: '缺货率',
  coverage: '铺货率',
}

/** 图片底部裁切比例：AI 生成图右下角有「AI生成」水印（y > 96%），统一裁掉底部 5% */
export const IMAGE_BOTTOM_CROP = 0.95

/** 数据基准日期（P2/P3/P4 口径：2026-10-02 周五 · 晴 22℃） */
export const DEMO_TODAY = '2026-10-02'
export const DEMO_WEEKDAY = '周五'
export const DEMO_WEATHER = '晴 22℃'

/**
 * 依据分数取分档 key。
 *
 * @param score 0–100 分
 */
export function levelOf(score: number): HealthLevelKey {
  const hit = HEALTH_LEVELS.find((l) => score >= l.min && score <= l.max)
  return (hit?.key ?? 'risk') as HealthLevelKey
}

/**
 * 依据分数取分档颜色（环色 / 条形色 / 状态色统一入口）。
 *
 * @param score 0–100 分
 */
export function colorOfScore(score: number): string {
  return colorOf(levelOf(score))
}

/**
 * 依据分档 key 取颜色（HardCode 色值唯一出处）。
 *
 * @param level 分档 key
 */
export function colorOf(level: HealthLevelKey): string {
  const hit = HEALTH_LEVELS.find((l) => l.key === level)
  /* 兜底中性色对齐 --text-3 令牌 */
  return hit ? hit.color : COLOR_NEUTRAL
}

/** 分档中文名 */
export function levelLabel(level: HealthLevelKey): string {
  const hit = HEALTH_LEVELS.find((l) => l.key === level)
  return hit ? hit.label : '未知'
}

/** 分档处置建议（PRD 3.2 文案调性） */
export function levelAdvice(level: HealthLevelKey): string {
  const hit = HEALTH_LEVELS.find((l) => l.key === level)
  return hit ? hit.advice : ''
}
