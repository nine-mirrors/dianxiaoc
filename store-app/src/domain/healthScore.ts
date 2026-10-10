/**
 * 健康分计算模块（PRD 7.1 / ARCHITECTURE §5.2–5.4 / T03.2）。
 *
 * ★ 双轨设计（架构铁律 3）：
 *   - `resolveHealth()`：预置门店走 fixture 权威值（保证 P2/P4/P5/PDF 数字一字不差）；
 *   - `computeHealth()`：陌生照片兜底路径才启用公式。
 * 纯函数，无 Vue / api / fixtures 依赖。
 */
import { DIMENSIONS, HEALTH_LEVELS, colorOf, levelOf } from './constants'
import type { DimensionScore, HealthScore, ShelfStandard, HealthSource } from '@/types'

/** 万能 clamp */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** 打分入参（PRD 7.1 六维度所需原始观测值） */
export interface ScoreInput {
  standard: ShelfStandard
  /** 实际蒙牛有效排面列数 */
  coldFacings: number
  ambientFacings: number
  stackFacings: number
  /** 断货 / 空位 SKU 数 */
  oosSkuCount: number
  /** 缺货预警 SKU 数（低于安全库存 50%） */
  lowStockSkuCount: number
  priceTagMissing: number
  priceMismatch: number
  competitorFacings: number
  mengniuFacings: number
  /** 黄金层被竞品占用列数 */
  goldenCompetitorCols: number
  materialsDone: number
  materialsRequired: number
  nearExpiryCount: number
  expiredCount: number
}

/** 兜底路径的缺省入参（全量合格） */
export function createEmptyScoreInput(standard: ShelfStandard): ScoreInput {
  return {
    standard,
    coldFacings: standard.coldCols,
    ambientFacings: standard.ambientCols,
    stackFacings: standard.stacks,
    oosSkuCount: 0,
    lowStockSkuCount: 0,
    priceTagMissing: 0,
    priceMismatch: 0,
    competitorFacings: 0,
    mengniuFacings: standard.coldCols + standard.ambientCols,
    goldenCompetitorCols: 0,
    materialsDone: 0,
    materialsRequired: 0,
    nearExpiryCount: 0,
    expiredCount: 0,
  }
}

/** D1 排面达标：区域加权 冷柜 0.5 + 常温 0.3 + 堆头 0.2 */
export function scoreD1(i: ScoreInput): number {
  const rCold = i.coldFacings / Math.max(1, i.standard.coldCols)
  const rAmb = i.ambientFacings / Math.max(1, i.standard.ambientCols)
  const rStk = i.standard.stacks > 0 ? i.stackFacings / i.standard.stacks : 1
  return clamp(Math.round((rCold * 0.5 + rAmb * 0.3 + rStk * 0.2) * 100), 0, 100)
}

/** D2 缺货控制：100 − 缺货SKU×12 − 预警SKU×5 */
export function scoreD2(i: ScoreInput): number {
  return clamp(100 - i.oosSkuCount * 12 - i.lowStockSkuCount * 5, 0, 100)
}

/** D3 价签合规：100 − 缺失×8 − 不符×5 */
export function scoreD3(i: ScoreInput): number {
  return clamp(100 - i.priceTagMissing * 8 - i.priceMismatch * 5, 0, 100)
}

/** D4 竞争位势：份额×100 − 黄金层被占 15/列 */
export function scoreD4(i: ScoreInput): number {
  const share = i.mengniuFacings / Math.max(1, i.mengniuFacings + i.competitorFacings)
  return clamp(Math.round(share * 100) - i.goldenCompetitorCols * 15, 0, 100)
}

/** D5 陈列执行：已执行 / 应执行 ×100，本月无活动按满分 */
export function scoreD5(i: ScoreInput): number {
  if (i.materialsRequired === 0) return 100
  return clamp(Math.round((i.materialsDone / i.materialsRequired) * 100), 0, 100)
}

/** D6 期效新鲜：100 − 临期×20 − 过期×50，无数据默认 85 */
export function scoreD6(i: ScoreInput): number {
  if (i.nearExpiryCount === 0 && i.expiredCount === 0) return 85
  return clamp(100 - i.nearExpiryCount * 20 - i.expiredCount * 50, 0, 100)
}

/** 六维度打分函数集合，顺序固定 D1–D6 */
export const SCORERS = [scoreD1, scoreD2, scoreD3, scoreD4, scoreD5, scoreD6] as const

/**
 * 预期提升分：执行全部建议后的分数。
 *
 * 演示口径：下限 89、上限 96（与 PRD S3「预计可提升至 89 分」一致）。
 * 含义＝修复当前全部严重 + 中度问题带来的加权回升。
 *
 * @param score 当前分
 */
export function estimateAfterFix(score: number): number {
  return clamp(Math.round(score + (100 - score) * 0.6), 89, 96)
}

/** 纯公式路径：用于陌生照片 / 新增门店 */
export function computeHealth(input: ScoreInput): HealthScore {
  const raw = SCORERS.map((fn) => fn(input))
  const score = Math.round(raw.reduce((s, v, k) => s + v * DIMENSIONS[k].weight, 0))
  const level = levelOf(score)
  return {
    score,
    level,
    color: colorOf(level),
    delta: 0,
    expectedScore: estimateAfterFix(score),
    source: 'computed',
  }
}

/** fixture 权威值入参 */
export interface FixtureHealthSeed {
  /** 六维度原始分，顺序固定 D1–D6 */
  dimensions: number[]
  expectedScore?: number
  prevScore?: number
  /** 权威总分（与公式不符时以此为准，如 S2 整改前 48） */
  scoreOverride?: number | null
}

/**
 * ★ 双轨入口：预置门店走 fixture 权威值，否则走公式。
 *
 * @param input 公式兜底所需的观测值
 * @param fixture fixture 权威值（有则优先）
 * @returns 健康分 + 六维度明细
 */
export function resolveHealth(
  input: ScoreInput,
  fixture?: FixtureHealthSeed | null,
): { health: HealthScore; dimensions: DimensionScore[] } {
  if (fixture && Array.isArray(fixture.dimensions) && fixture.dimensions.length === 6) {
    const dims = fixture.dimensions
    const weighted = dims.reduce((s, v, k) => s + v * DIMENSIONS[k].weight, 0)
    const score = fixture.scoreOverride != null ? Math.round(fixture.scoreOverride) : Math.round(weighted)
    const level = levelOf(score)
    return {
      health: {
        score,
        level,
        color: colorOf(level),
        delta: fixture.prevScore != null ? score - fixture.prevScore : 0,
        expectedScore: fixture.expectedScore ?? estimateAfterFix(score),
        source: 'fixture' as HealthSource,
      },
      dimensions: DIMENSIONS.map((d, k) => ({
        key: d.key,
        name: d.name,
        weight: d.weight,
        score: Math.round(dims[k]),
        level: levelOf(Math.round(dims[k])),
      })) as DimensionScore[],
    }
  }

  const health = computeHealth(input)
  return {
    health,
    dimensions: DIMENSIONS.map((d, k) => ({
      key: d.key,
      name: d.name,
      weight: d.weight,
      score: SCORERS[k](input),
      level: levelOf(SCORERS[k](input)),
    })) as DimensionScore[],
  }
}

/**
 * 依据「识别统计」构造 ScoreInput（陌生照片兜底路径专用）。
 *
 * 演示口径：不做真实像素理解，仅用识别到的框数量反推观测值，
 * 保证任何陌生图片都能算出 0–100 的合法分数，绝不白屏。
 *
 * @param standard 门店陈列标准
 * @param stat 识别统计
 */
export function buildScoreInputFromStat(
  standard: ShelfStandard,
  stat: { emptyCount: number; oosCount: number; priceTagMissing: number; priceMismatch: number; competitorCount: number; skuCount: number },
): ScoreInput {
  const effective = Math.max(1, stat.skuCount)
  return {
    standard,
    coldFacings: Math.max(0, standard.coldCols - stat.emptyCount - stat.competitorCount),
    ambientFacings: Math.round(standard.ambientCols * 0.8),
    stackFacings: 0,
    oosSkuCount: stat.emptyCount,
    lowStockSkuCount: stat.oosCount,
    priceTagMissing: stat.priceTagMissing,
    priceMismatch: stat.priceMismatch,
    competitorFacings: stat.competitorCount,
    mengniuFacings: effective,
    goldenCompetitorCols: Math.min(2, stat.competitorCount),
    materialsDone: 0,
    materialsRequired: stat.competitorCount > 2 ? 1 : 0,
    nearExpiryCount: 0,
    expiredCount: 0,
  }
}

/** 导出分档表便于外部直接渲染图例 */
export { HEALTH_LEVELS }
