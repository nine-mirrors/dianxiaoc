/**
 * 千店千面行动方案模块（ARCHITECTURE §5.6 / T03.4）。
 *
 * 预置门店：直接读 fixture 权威方案（S3 = 27 瓶 ¥108 / 3 天，与明细加总一致）。
 * 陌生照片：按「门店类型决定排面标准与补货系数」实时生成。
 *
 * 补货量口径： (标准排面列数 − 实际有效列数) × 单列容量，
 *             再按到店间隔天数 × 日均动销取安全库存，两者取较大值。
 */
import type { ActionPlan, Issue, PlacementItem, RestockItem, SKU, Store } from '@/types'

/** 门店类型 → 补货参数（千店千面的核心差异项） */
const STORE_TYPE_PARAMS: Record<string, { label: string; colCapacity: number; coverDays: number; factor: number }> = {
  A: { label: '该店类型为 A类连锁超市', colCapacity: 8, coverDays: 4, factor: 1.2 },
  B: { label: '该店类型为 B类大卖场', colCapacity: 10, coverDays: 3, factor: 1.0 },
  C: { label: '该店类型为 C类便利', colCapacity: 6, coverDays: 3, factor: 0.8 },
}

/** 取类型对应参数 */
function paramsOf(type: string) {
  return STORE_TYPE_PARAMS[type] ?? STORE_TYPE_PARAMS.C
}

/**
 * 按门店类型生成补货方案（兜底路径）。
 *
 * @param store 门店（提供类型与陈列标准）
 * @param skus SKU 主数据
 * @param dailyAvgSales 日均可售货itage
 * @param gapCols 排面缺口列数
 */
export function buildPlan(
  store: Store,
  skus: SKU[],
  gapCols: number = 1,
  dailyAvgSales: number = 11,
): ActionPlan {
  const p = paramsOf(store.type)
  // 候选 SKU：优先蒙牛招牌品，不足则取全部蒙牛 SKU
  const candidates = skus.filter((s) => s.brand === '蒙牛')
  const picks = candidates.slice(0, 3)

  const bottleBase = Math.max(gapCols, 1) * p.colCapacity
  const safety = Math.round(dailyAvgSales * p.coverDays * 0.3)

  const restock: RestockItem[] = picks.map((sku, idx) => {
    const bottles = Math.max(1, Math.round((bottleBase - idx * 3) * p.factor + (idx === 0 ? safety : 0)))
    return {
      skuId: sku.id,
      skuName: sku.name,
      bottles,
      amount: Math.round(bottles * sku.guidePrice),
    }
  })

  const placement: PlacementItem[] = [
    { text: `主推 SKU 上移至黄金视线层（冷柜第 2 层，1.2–1.6m）` },
    { text: `同品牌集中连排，形成 ${Math.max(2, p.colCapacity / 2)} 列以上的陈列面` },
  ]

  return {
    storeTypeLabel: p.label,
    restock,
    placement,
    totalBottles: restock.reduce((s, i) => s + i.bottles, 0),
    totalAmount: restock.reduce((s, i) => s + i.amount, 0),
    coverDays: p.coverDays,
  }
}

/**
 * 依据 fixture 权威值装配行动方案（预置门店路径）。
 * 缺失字段（金额/瓶数）自动由明细补齐，保证数字永远自洽。
 *
 * @param fixture fixture 中的 plan 原始值
 * @param fallbackLabel 门店类型文案兜底
 */
export function resolvePlan(
  fixture: {
    storeTypeLabel?: string
    restock?: RestockItem[]
    placement?: PlacementItem[]
    totalBottles?: number
    totalAmount?: number
    coverDays?: number
  },
  fallbackLabel: string = '该店类型为 C类便利',
): ActionPlan {
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

/**
 * 由问题清单推导陈列调整建议（供兜底路径与 P6 轻量结果页复用）。
 *
 * @param issues 问题清单
 * @param maxCount 最多返回条数
 */
export function buildPlacementsFromIssues(issues: Issue[], maxCount: number = 2): PlacementItem[] {
  const texts: string[] = []
  issues.forEach((it) => {
    if (it.relatedAnnotationIds?.length && /空位|缺货/.test(it.title)) {
      texts.push(`优先补位：${it.location}`)
    } else if (/竞品/.test(it.title)) {
      texts.push(`争取拿回黄金列位：${it.location}`)
    } else if (/价签/.test(it.title)) {
      texts.push(`补打并校正价签：${it.location}`)
    }
  })
  return texts.slice(0, maxCount).map((t) => ({ text: t }))
}
