/**
 * 区域看板聚合（任务 C：让「切换区域」真的切换数字）。
 *
 * 现状问题：regionId 之前只被原样回传，三个区域返回完全相同的数据。
 * 本模块按 regionId 过滤门店明细，并用**该区域自己的门店**重算所有 KPI，
 * 保证：
 *   1) 不同区域看到不同数字；
 *   2) 同一区域内口径自洽 —— distribution 各档 count 之和 === 该区域门店总数，
 *      且 kpi「红灯门店」=== distribution 里 risk 档的 count（不出现第二个口径矛盾）。
 *
 * 数据来源：dashboard.json 的门店明细（作为「区域内门店样本」）+ stores.json 的 regionId。
 */
import { dashboard, stores, listRectifications, listTasks, listTickets } from './db.js'

/**
 * 演示基准时间（与 index.js 的 DEMO_TODAY 同源）。
 * ⚠ 逾期判定必须用演示基准日，而不是真实当天 ——
 *   否则「本周五前完成」的任务会随日历漂移，演示现场出现「全部逾期」的尴尬。
 */
export const DEMO_TODAY = '2026-10-02'
export const DEMO_NOW = `${DEMO_TODAY} 23:59`

/** 区域 → 该区域的门店 id（由 stores.json 的 regionId 决定，与前端 storeRows 对齐） */
const REGION_STORE_IDS = (() => {
  const map = {}
  for (const s of stores) {
    const rid = s.regionId || 'R_EAST'
    if (!map[rid]) map[rid] = []
    map[rid].push(s.id)
  }
  return map
})()

/** 区域 key → 中文名（沿用 fixture 的 regionIds 顺序） */
const REGION_NAME = Object.fromEntries((dashboard.regionIds || []).map((r) => [r.id, r.name]))

/**
 * 按区域重算分布（各档 count 之和 === 区域门店数，ratio 同步自洽）。
 *
 * @param rows 该区域的门店明细
 * @returns LevelBucket[]
 */
function buildDistribution(rows) {
  const total = rows.length
  if (!total) return (dashboard.distribution || []).map((b) => ({ ...b, count: 0, ratio: 0 }))
  const order = dashboard.distribution || []
  return order.map((bucket) => {
    const count = rows.filter((r) => r.level === bucket.level).length
    return { ...bucket, count, ratio: Number((count / total).toFixed(3)) }
  })
}

/**
 * 构造某个区域的完整看板数据。
 *
 * @param regionId 区域 id（如 R_EAST）
 * @returns 含 regionId/regionIds/kpis/distribution/trend/riskTop5/storeRows/rectification/orderSummary/taskSummary 的对象
 */
export function buildDashboardOverview(regionId) {
  const regionIds = dashboard.regionIds || []
  const rid = regionIds.some((r) => r.id === regionId) ? regionId : regionIds[0]?.id ?? 'R_EAST'
  const ids = new Set(REGION_STORE_IDS[rid] || [])

  // 该区域的门店明细（样本来自 fixture 的 storeRows，按门店 id 过滤）
  const allRows = dashboard.storeRows || []
  const storeRows = allRows
    .filter((r) => ids.has(r.storeId))
    .map((r) => ({ ...r }))
    .sort((a, b) => a.score - b.score) // 分数低的排前面，和「风险优先」一致

  // 该区域的风险门店（分数升序，取前 5）
  const riskTop5 = (dashboard.riskTop5 || [])
    .filter((r) => ids.has(r.storeId))
    .map((r) => ({ ...r }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)

  const total = storeRows.length
  const distribution = buildDistribution(storeRows)
  const redStores = distribution.find((d) => d.level === 'risk')?.count ?? 0

  // 区域平均分：按该区域门店明细加权平均（子项自洽，不用固定值）
  const avgScore = total ? Number((storeRows.reduce((s, r) => s + r.score, 0) / total).toFixed(1)) : 0
  // 环比：平均分与目标分的差值，正数为高于目标
  const deltaNum = Number((avgScore - 80).toFixed(1))

  // 找出原 KPI 模板对应的 label，按区域重算 value / delta
  const baseKpis = dashboard.kpis || []
  const kpis = baseKpis.map((k) => {
    const copy = { ...k }
    if (k.key === 'avgScore') {
      copy.value = String(avgScore)
      copy.delta = `${deltaNum >= 0 ? '↑' : '↓'}${Math.abs(deltaNum)}`
      copy.trend = deltaNum >= 0 ? 'up' : 'down'
      copy.danger = avgScore < 60
    } else if (k.key === 'redStores') {
      // ★ 与 distribution 的 risk 档严格同源，避免两个口径矛盾
      copy.value = String(redStores)
      copy.danger = redStores > 0
    } else if (k.key === 'oosRate') {
      // 缺货率与平均分负相关：分数越低缺货越高（同一公式，区域间自洽）
      const oos = Number(Math.max(2.4, 12 - avgScore * 0.06).toFixed(1))
      copy.value = `${oos}%`
      copy.delta = `${oos > 7.2 ? '↑' : '↓'}${Math.abs(Number((oos - 7.2).toFixed(1)))}pt`
      copy.trend = oos > 7.2 ? 'up' : 'down'
      copy.danger = oos > 10
    } else if (k.key === 'coverage') {
      // 铺货率与平均分正相关
      const cov = Number(Math.min(99, Math.max(60, 45 + avgScore * 0.48)).toFixed(1))
      copy.value = `${cov}%`
      copy.delta = `${cov >= 86.4 ? '↑' : '↓'}${Math.abs(Number((cov - 86.4).toFixed(1)))}pt`
      copy.trend = cov >= 86.4 ? 'up' : 'down'
      copy.danger = false
    }
    return copy
  })

  // 趋势：把原曲线整体平移到该区域的平均分（保持形状一致，终点对齐 avgScore）
  const trend = (dashboard.trend || []).map((s) => {
    if (s.key !== 'score' || !s.points?.length) return { ...s, points: [...s.points] }
    const offset = Number((avgScore - s.points[s.points.length - 1]).toFixed(1))
    return { ...s, points: s.points.map((p) => Number(Math.max(0, Math.min(100, p + offset)).toFixed(1))) }
  })

  // 整改闭环聚合：已整改条目 / 进行中任务 / 平均提升分
  const rects = listRectifications()
  const rectStoreIds = new Set(storeRows.map((r) => r.storeId))
  const scopedRects = rects.filter((r) => rectStoreIds.has(r.storeId))
  const avgGain = scopedRects.length
    ? Number((scopedRects.reduce((s, r) => s + (r.afterScore - r.beforeScore), 0) / scopedRects.length).toFixed(1))
    : 0
  const tasks = listTasks()
  const scopedTasks = tasks.filter((t) => rectStoreIds.has(t.storeId))
  const openTasks = scopedTasks.filter((t) => t.status === 'open')
  const doneTasks = scopedTasks.filter((t) => t.status === 'done')
  const open = openTasks.length

  /* 任务完成率（闭环最后一环：派了 → 做了没有 → 做完了吗）
     完成率 = done / (done + open)，口径必须与下面的分子分母同源，避免出现第二个矛盾数字 */
  const totalTasks = scopedTasks.length
  const completionRate = totalTasks ? Math.round((doneTasks.length / totalTasks) * 100) : null

  /* 逾期：dueAt 已过且仍是 open */
  const now = DEMO_NOW
  const overdue = openTasks.filter((t) => t.dueAt && t.dueAt < now).length
  const taskSummary = {
    total: totalTasks,
    done: doneTasks.length,
    open: openTasks.length,
    overdue,
    completionRate,
  }

  const rectification = { done: scopedRects.length, open, avgGain }

  /* 订货汇总（订货闭环：店主下单 → 业代接单 → 经理看板一次请求拿全） */
  const orders = listTickets({ kind: 'order' })
  const scopedOrders = orders.filter((t) => rectStoreIds.has(t.storeId))
  const orderSummary = {
    count: scopedOrders.length,
    bottles: scopedOrders.reduce((s, t) => s + (t.totalBottles ?? 0), 0),
    amount: scopedOrders.reduce((s, t) => s + (t.totalAmount ?? 0), 0),
    // 已接单 / 待接单（status 由 PATCH /api/v1/tickets/:id 落库）
    accepted: scopedOrders.filter((t) => t.status === 'accepted').length,
    pending: scopedOrders.filter((t) => t.status !== 'accepted').length,
  }

  return {
    regionId: rid,
    regionIds,
    kpis,
    distribution,
    trend,
    riskTop5,
    storeRows,
    rectification,
    orderSummary,
    taskSummary,
    // 区域中文名，供前端标题直接展示
    regionName: REGION_NAME[rid] ?? rid,
    regionStoreTotal: total,
  }
}

export default buildDashboardOverview
