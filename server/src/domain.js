/**
 * 诊断领域逻辑（Phase 2 后端版）。
 *
 * 从前端 src/domain/*.ts 移植（纯函数），与 Phase 1 mock 行为一致：
 *   - 预置门店 → fixture 权威值（分数/风险/问题/方案/对话全文一字不差）；
 *   - 陌生照片 → 公式兜底（保证不白屏、不报错）。
 */

/* ═══════════════ 常量（对应 constants.ts） ═══════════════ */

/** 六维度权重（PRD 7.1，顺序 D1–D6） */
export const DIMENSIONS = [
  { key: 'D1', name: '排面达标', weight: 0.30 },
  { key: 'D2', name: '缺货控制', weight: 0.25 },
  { key: 'D3', name: '价签合规', weight: 0.15 },
  { key: 'D4', name: '竞争位势', weight: 0.15 },
  { key: 'D5', name: '陈列执行', weight: 0.10 },
  { key: 'D6', name: '期效新鲜', weight: 0.05 },
]

/** 健康分四档（PRD 3.2） */
export const HEALTH_LEVELS = [
  { key: 'excellent', min: 85, max: 100, label: '优秀', color: '#009639' },
  { key: 'good', min: 70, max: 84, label: '良好', color: '#8BC34A' },
  { key: 'warning', min: 60, max: 69, label: '预警', color: '#FF9800' },
  { key: 'risk', min: 0, max: 59, label: '风险', color: '#E02020' },
]

/** 流失折算天数（周=7 天，月=4.3 周；与 PRD 7.3 一致） */
const RISK_DAYS = { WEEK: 7, MONTH: 4.3 }

export function levelOf(score) {
  const hit = HEALTH_LEVELS.find((l) => score >= l.min && score <= l.max)
  return hit ? hit.key : 'risk'
}

export function colorOf(level) {
  const hit = HEALTH_LEVELS.find((l) => l.key === level)
  return hit ? hit.color : '#9CA3AF'
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

/** 预期提升分（演示口径：下限 89、上限 96） */
export function estimateAfterFix(score) {
  return clamp(Math.round(score + (100 - score) * 0.6), 89, 96)
}

/* ═══════════════ 健康分（对应 healthScore.ts resolveHealth） ═══════════════ */

/**
 * 双轨入口：预置门店走 fixture 权威值，否则走公式。
 */
/**
 * 计算健康分与六维。
 *
 * @param {object} fixture 门店 fixture（含 dimensions / expectedScore / prevScore）
 * @param {number[] | null} [visionDims] 视觉投射的六维（阶段 B）；传入且非 null 时优先采用，
 *                                        source 标 'vision'；未传/为 null 则沿用 fixture
 * @returns {{health: object, dimensions: object[]}}
 */
export function resolveHealth(fixture, visionDims = null) {
  // ★ 阶段 B：视觉分与 fixture 分**同权重表、同算式**，只换维度分来源，
  //   保证 health.score === 六维加权和（口径自洽，不出现第二个矛盾）。
  const dims =
    Array.isArray(visionDims) && visionDims.length === 6 ? visionDims : (fixture?.dimensions ?? null)

  if (dims && Array.isArray(dims) && dims.length === 6) {
    const weighted = dims.reduce((s, v, k) => s + v * DIMENSIONS[k].weight, 0)
    // ⚠ 视觉路径**不套用 scoreOverride**（那是 fixture 人工定稿值，与视觉实读无关）
    const score = Math.round(weighted)
    const level = levelOf(score)
    return {
      health: {
        score,
        level,
        color: colorOf(level),
        delta: fixture?.prevScore != null ? score - fixture.prevScore : 0,
        expectedScore: fixture?.expectedScore ?? estimateAfterFix(score),
        source: Array.isArray(visionDims) ? 'vision' : 'fixture',
      },
      dimensions: DIMENSIONS.map((d, k) => ({
        key: d.key,
        name: d.name,
        weight: d.weight,
        score: Math.round(dims[k]),
        level: levelOf(Math.round(dims[k])),
      })),
    }
  }
  // 兜底路径：通用陈列规则给 72 分（良好下限）
  // ⚠ 六维必须与总分自洽（架构师复查）：原实现总分 72 却让六维全显示 80，
  //   页面会自曝矛盾。权重之和为 1，故六维同为 72 时加权结果恰好 = 72。
  const score = 72
  const level = levelOf(score)
  return {
    health: { score, level, color: colorOf(level), delta: 0, expectedScore: estimateAfterFix(score), source: 'computed' },
    dimensions: DIMENSIONS.map((d) => ({ key: d.key, name: d.name, weight: d.weight, score, level: levelOf(score) })),
  }
}

/* ═══════════════ 视觉计数 → 六维投射（阶段 B） ═══════════════ */

/**
 * 把视觉模型实读的 4 个计数投射成六维分数。
 *
 * ⚠ **权重表 DIMENSIONS 完全不动**（PRD 7.1 已定稿），这里只改「维度分从哪来」：
 *   原来只读 fixture.dimensions，现在由真视觉计数折损得到。
 *
 * 映射规则（三档，阈值取自陈列标准库的容忍区间）：
 *   - 空位率  = emptyCount / (skuCount + emptyCount)     → ≤3% 记 0、≤8% 扣 6、>8% 扣 12  → D2 缺货控制
 *   - 竞品占比 = competitorCount / max(1, skuCount)      → ≤5% 记 0、≤15% 扣 8、>15% 扣 14 → D4 竞争位势
 *   - 价签缺失率 = priceTagMissing / max(1, skuCount)    → ≤3% 记 0、≤10% 扣 7、>10% 扣 12 → D3 价签合规
 *
 * 命中的维度从基线扣减（保底 0）；未命中的维度沿用基线。
 *
 * @param {null | {skuCount:number, emptyCount:number, competitorCount:number, priceTagMissing:number}} vision 视觉计数
 * @param {number[]} [baseDims] fixture 六维基线（长度 6）
 * @returns {number[] | null} 六维分数；视觉不可用（全 0）时返回 null，让调用方回退 fixture
 */
export function visionToDimensions(vision, baseDims) {
  if (!vision) return null
  const sku = Number(vision.skuCount) || 0
  const empty = Number(vision.emptyCount) || 0
  const comp = Number(vision.competitorCount) || 0
  const tag = Number(vision.priceTagMissing) || 0
  // ⚠ 四项全为 0 = 模型没给出有效计数（不是「这家店啥都没有」），此时回退 fixture
  if (sku + empty + comp + tag === 0) return null

  // 基线：未提供时用 80 作为中性起点（与 fixture 兜底口径一致）
  const base = Array.isArray(baseDims) && baseDims.length === 6 ? baseDims.map(Number) : [80, 80, 80, 80, 80, 80]
  const dims = base.slice()

  /** 按三档阈值取折损分 */
  const penalty = (ratio, [ok, warn, bad]) => (ratio <= ok ? 0 : ratio <= warn ? warn : bad)

  // D2 缺货控制 ← 空位率
  const emptyRatio = empty / Math.max(1, sku + empty)
  dims[1] = Math.max(0, base[1] - penalty(emptyRatio, [0.03, 0.08, 12]))

  // D4 竞争位势 ← 竞品占比
  const compRatio = comp / Math.max(1, sku)
  dims[3] = Math.max(0, base[3] - penalty(compRatio, [0.05, 0.15, 14]))

  // D3 价签合规 ← 价签缺失率
  const tagRatio = tag / Math.max(1, sku)
  dims[2] = Math.max(0, base[2] - penalty(tagRatio, [0.03, 0.1, 12]))

  // D1 排面达标：视觉同时看到缺货与竞品时，排面被双重挤占，额外折损（上限 6）
  if (penalty(emptyRatio, [0.03, 0.08, 12]) > 0 && penalty(compRatio, [0.05, 0.15, 14]) > 0) {
    dims[0] = Math.max(0, base[0] - 6)
  }

  // D5 陈列执行 / D6 期效新鲜：视觉计数无法判定，沿用基线
  return dims.map((v) => Math.max(0, Math.min(100, Math.round(v))))
}

/* ═══════════════ 行动方案（对应 planBuilder.ts resolvePlan） ═══════════════ */

export function resolvePlan(fixture, fallbackLabel) {
  const restock = fixture?.restock ?? []
  const placement = fixture?.placement ?? []
  const totalBottles = fixture?.totalBottles ?? restock.reduce((s, i) => s + i.bottles, 0)
  const totalAmount = fixture?.totalAmount ?? restock.reduce((s, i) => s + i.amount, 0)
  return {
    storeTypeLabel: fixture?.storeTypeLabel || fallbackLabel,
    restock,
    placement,
    totalBottles,
    totalAmount,
    coverDays: fixture?.coverDays ?? 3,
  }
}

/* ═══════════════ 风险预判（对应 riskForecast.ts resolveRisk） ═══════════════ */

/**
 * 风险预判（周/月度流失）。
 *
 * ★ 阶段 C-补：weekly 口径与「备货量」彻底分开。
 *
 * 【为什么这样拆】原先 weeklyBottles = 日均综合损失 × 7，而日均综合损失里乘了
 * **缺货严重度系数**（0.7 / 0.95 / 1.4）。但这个系数描述的是「缺货时有多少需求
 * 被同类商品或竞品承接」—— 它决定的是**要补多少货才能补齐**（备货侧），
 * 而不是**会少卖多少**（损失侧）。两个用途混用，就导致 S1/S3 的
 * 「备货 27 瓶」与「流失 27 瓶」恰好相等，评委一看就追问「为什么要补一样多」。
 *
 * 现在两侧各归其位：
 *   - 流失（weekly）：**毛缺口损失** = 缺口列数 × 单列日均，再加陈列/竞品等其他损失，
 *     不做严重度折减 —— 这是货架物理缺口决定的硬损失。
 *   - 备货（plan）：在 forecast.js 里做，含严重度折减与安全库存、铺货天数覆盖。
 *
 * @param {object} fixture 门店风险基线（含 items / derivation）
 * @param {object} [health] 本次健康分（保留入参：供未来按分数微调，当前口径不依赖它）
 */
export function resolveRisk(fixture, health = null) {
  const items = fixture?.items ?? []

  // ① 毛缺口损失：Σ(缺口列数 × 单列日均)
  const gapLines = items.map((it) => {
    const stdCols = Math.max(1, Number(it.stdFacings) || 1)
    const colDaily = (Number(it.dailyAvgSales) || 0) / stdCols
    const gapCols = Math.max(0, stdCols - (Number(it.actualFacings) || 0))
    return { it, stdCols, colDaily, gapCols, loss: gapCols * colDaily }
  })
  const grossGapDaily = gapLines.reduce((s, g) => s + g.loss, 0)

  // ② 其他陈列/竞品损失：从 derivation 的 ③ 步骤解析（fixture 里是人工写定的文案）
  const otherMatch = String(fixture?.derivation ?? '').match(/③[^→]*→\s*\+([\d.]+)\s*瓶\/天/)
  const otherDaily = otherMatch ? Number(otherMatch[1]) || 0 : 0

  // ③ 周/月度流失（毛额口径，不乘严重度系数）
  // 单价：取 risk.items 的 unitPrice（缺则回退「基线金额 ÷ 基线瓶数」）
  const unitPrices = items.map((i) => Number(i.unitPrice)).filter((n) => n > 0)
  const fallbackUnit =
    Number(fixture?.weeklyAmount) > 0 && Number(fixture?.weeklyBottles) > 0
      ? Number(fixture.weeklyAmount) / Number(fixture.weeklyBottles)
      : 0
  const unitPrice = unitPrices.length
    ? unitPrices.reduce((s, n) => s + n, 0) / unitPrices.length
    : fallbackUnit
  const totalDaily = grossGapDaily + otherDaily
  const weeklyBottles = Math.max(0, Math.round(totalDaily * RISK_DAYS.WEEK))
  const weeklyAmount = Math.round(weeklyBottles * unitPrice)
  const monthlyBottles = Math.round(weeklyBottles * RISK_DAYS.MONTH)
  const monthlyAmount = Math.round(monthlyBottles * unitPrice)

  // ④ 真实算式串（每一步都能被追问）
  const gapDetail = gapLines
    .filter((g) => g.gapCols > 0)
    .map((g) => `${g.it.skuName} 缺口 ${round1(g.gapCols)} 列 × ${round1(g.colDaily)} 瓶/天·列 = ${round1(g.loss)} 瓶/天`)
    .join('；')
  const derivation = [
    `① 毛缺口损失：${gapDetail || '无缺口'}　合计 ${round1(grossGapDaily)} 瓶/天`,
    `② 其他陈列/竞品损失：+${round1(otherDaily)} 瓶/天`,
    `③ 日均总损失 = ${round1(grossGapDaily)} + ${round1(otherDaily)} = ${round1(totalDaily)} 瓶/天`,
    `④ 本周预计流失 = ${round1(totalDaily)} × ${RISK_DAYS.WEEK} ≈ ${weeklyBottles} 瓶（毛缺口口径，不含严重度折减）`,
    `⑤ 月度预计流失 = ${weeklyBottles} × ${RISK_DAYS.MONTH} ≈ ${monthlyBottles} 瓶`,
    '口径说明：本周流失是「不补货会少卖多少」（毛缺口）；行动方案的「建议备货」是「要补多少货」',
    '（含严重度折减、安全库存与铺货天数），两者含义不同、数值不应相等。',
  ].join('\n')

  return {
    weeklyBottles,
    weeklyAmount,
    monthlyBottles,
    monthlyAmount,
    items,
    derivation,
    /** 口径标注，供页面/AI 文案引用 */
    basis: '毛缺口损失 × 7 天（不含严重度折减）',
    /** 日均总损失（供页面展示与追问） */
    dailyLossBottles: round1(totalDaily),
    healthScore: health?.score ?? null,
  }
}

/** 保留一位小数的工具（避免到处写 toFixed） */
function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

/* ═══════════════ 问题排序（对应 issueBuilder.ts） ═══════════════ */

const SEVERITY_ORDER = { severe: 0, medium: 1, low: 2 }

export function sortIssues(issues) {
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/* ═══════════════ 5 步加载文案（对应 handlers.ts buildSteps） ═══════════════ */

export function buildSteps(summary, typeLabel) {
  return [
    { text: '正在上传货架照片…', delayMs: 480 },
    {
      text: `已识别 ${summary.total} 个目标：SKU ${summary.skuCount} / 空位 ${summary.emptyCount} / 竞品 ${summary.competitorCount} / 价签 ${summary.priceTagCount}`,
      delayMs: 480,
    },
    { text: `正在比对「${typeLabel}陈列标准」…`, delayMs: 480 },
    { text: '正在结合近 4 周动销数据推理…', delayMs: 480 },
    { text: '诊断完成', delayMs: 480 },
  ]
}

/* ═══════════════ 对话引擎（对应 chatEngine.ts reply，关键词打分） ═══════════════ */

function normalize(input) {
  return (input ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '').trim()
}

function scoreOf(normed, item) {
  let score = 0
  ;(item.keywords || []).forEach((kw) => {
    const k = normalize(kw)
    if (!k) return
    if (normed.includes(k)) score += 1 + Math.min(1, k.length / 6)
  })
  if (normalize(item.question) === normed) score += 3
  return score
}

/** 多轮追问主入口（LLM 默认关闭，未命中走兜底话术） */
export function chatReply(message, options) {
  const normed = normalize(message)
  if (!normed) {
    return { reply: options.fallback.empty, suggestions: options.fallback.recommend }
  }
  let best = null
  let bestScore = 0
  options.items.forEach((item) => {
    const s = scoreOf(normed, item)
    if (s > bestScore) {
      bestScore = s
      best = item
    }
  })
  if (best && bestScore >= 2) {
    return {
      answerId: best.id,
      reply: best.reply,
      highlightSection: best.highlightSection ?? undefined,
      suggestions: options.suggestions.slice(0, 3),
    }
  }
  return { reply: options.fallback.miss, suggestions: options.fallback.recommend }
}
