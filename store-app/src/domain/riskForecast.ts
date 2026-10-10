/**
 * 风险预判模块（PRD 7.3 / ARCHITECTURE §5.5 / T03.3）。
 *
 * 公式口径（2026-10-03 修正，全链路自洽）：
 *   ④ 日均综合损失 = ① 直接缺口损失（缺口列数 × 单列日均动销） × ② 严重度调整系数 + ③ 其他损失
 *   ⑤ 周 = 日均 × 7；⑥ 月 = 周 × 4.3
 *   严重度系数：缺口 ≤20% → 0.7 / 20%–50% → 0.95 / >50% → 1.4
 *
 * 预置门店：dailyLossBottles / derivation 均由 fixture 权威提供，本文件公式只在「陌生照片兜底路径」被调用。
 */
import { RISK, severityOf } from './constants'
import type { RiskItem, RiskPrediction } from '@/types'
import { round1 } from '@/utils/format'

/** 公式入参 */
export interface PredictInput {
  skuId: string
  skuName: string
  dailyAvgSales: number
  stdFacings: number
  actualFacings: number
  unitPrice: number
}

/** 平均单价（用于金额换算） */
function avgUnitPrice(list: { unitPrice: number }[]): number {
  if (!list.length) return 0
  return list.reduce((s, i) => s + i.unitPrice, 0) / list.length
}

/**
 * 「推导依据」多行文案生成（含算式与假设）。
 *
 * @param list 明细项
 * @param weeklyBottles 本周瓶数
 * @param weeklyAmount 本周金额
 * @param monthlyBottles 月度瓶数
 * @param monthlyAmount 月度金额
 */
export function buildDerivation(
  list: RiskItem[],
  weeklyBottles: number,
  weeklyAmount: number,
  monthlyBottles: number,
  monthlyAmount: number,
): string {
  const lines: string[] = ['通用陈列规则兜底识别：本店未匹配预置门店档案，按同类门店标准测算。']
  list.forEach((it, idx) => {
    const gapCols = round1(it.stdFacings - it.actualFacings, 2)
    const perCol = round1(it.dailyAvgSales / Math.max(1, it.stdFacings), 2)
    const direct = round1(gapCols * perCol, 2)
    lines.push(
      `① 直接缺口损失：${it.skuName} 标准排面 ${it.stdFacings} 列，实际有效 ${it.actualFacings} 列 → 缺口 ${gapCols} 列；单列日均动销 = ${it.dailyAvgSales} ÷ ${it.stdFacings} = ${perCol} 瓶/天 → 直接缺口损失 = ${gapCols} × ${perCol} = ${direct} 瓶/天`,
    )
    lines.push(`② 缺货严重度调整：缺口占比 ${(it.gapRatio * 100).toFixed(1)}%（区间）→ 调整系数 ${it.elasticity}`)
    lines.push(`③ 其他陈列/竞品损失：兜底路径无明细，暂计 0`)
    lines.push(`④ 日均综合损失 = ${direct} × ${it.elasticity} = ${it.dailyLossBottles} 瓶/天`)
    if (idx === list.length - 1) {
      lines.push(`⑤ 本周预计流失 = ${it.dailyLossBottles} × ${RISK.WEEK_DAYS} ≈ ${weeklyBottles} 瓶；按零售指导价 ¥${it.unitPrice}/瓶 → 约 ¥${weeklyAmount}`)
      lines.push(`⑥ 月度预计流失 = ${weeklyBottles} × ${RISK.MONTH_WEEKS} ≈ ${monthlyBottles} 瓶 → 约 ¥${monthlyAmount}`)
    }
  })
  lines.push('假设说明：默认客流与近 4 周持平、期间不补货且不调整陈列。')
  return lines.join('\n')
}

/**
 * 风险预判公式（兜底路径）。
 *
 * @param items SKU 明细
 * @returns 风险预判结果（含推导文案）
 */
export function predictRisk(items: PredictInput[]): RiskPrediction {
  const list: RiskItem[] = items.map((it) => {
    const gapRatio = round1((it.stdFacings - it.actualFacings) / Math.max(1, it.stdFacings), 3)
    const gapCols = it.stdFacings - it.actualFacings
    const perCol = it.dailyAvgSales / Math.max(1, it.stdFacings)
    const severity = severityOf(gapRatio)
    const direct = gapCols * perCol
    return {
      ...it,
      gapRatio,
      elasticity: severity,
      dailyLossBottles: round1(direct * severity),
    }
  })

  const price = avgUnitPrice(list)
  const weeklyBottles = Math.round(list.reduce((s, i) => s + i.dailyLossBottles, 0) * RISK.WEEK_DAYS)
  const weeklyAmount = Math.round(weeklyBottles * price)
  const monthlyBottles = Math.round(weeklyBottles * RISK.MONTH_WEEKS)
  const monthlyAmount = Math.round(monthlyBottles * price)

  return {
    weeklyBottles,
    weeklyAmount,
    monthlyBottles,
    monthlyAmount,
    items: list,
    derivation: buildDerivation(list, weeklyBottles, weeklyAmount, monthlyBottles, monthlyAmount),
  }
}

/**
 * 依据 fixture 权威值装配风险对象（预置门店路径）。
 *
 * 只做兜底换算：fixture 未给 weeklyAmount / monthly* 时按.weekly
 * 与月倍数补齐，保证四个数字永远合法。
 *
 * @param fixture fixture 中的 risk 原始值
 */
export function resolveRisk(fixture: {
  weeklyBottles: number
  weeklyAmount: number
  monthlyBottles: number
  monthlyAmount: number
  items: RiskItem[]
  derivation: string
}): RiskPrediction {
  const weeklyBottles = Math.round(fixture.weeklyBottles ?? 0)
  const weeklyAmount = Math.round(fixture.weeklyAmount ?? 0)
  const monthlyBottles = Math.round(fixture.monthlyBottles ?? weeklyBottles * RISK.MONTH_WEEKS)
  const monthlyAmount = Math.round(fixture.monthlyAmount ?? weeklyAmount * RISK.MONTH_WEEKS)
  return {
    weeklyBottles,
    weeklyAmount,
    monthlyBottles,
    monthlyAmount,
    items: fixture.items ?? [],
    derivation: fixture.derivation ?? '',
  }
}

export { RISK }
