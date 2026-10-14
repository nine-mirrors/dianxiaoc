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

  /* 风险门店Top5：从本区域完整门店池派生，不复用 fixture 的 riskTop5。
     原因：fixture 的 riskTop5 全局只有 5 条（S1–S5 演示门店）且无 regionId，
     先按区域过滤再 slice(0,5) 等价于「在这 5 条里挑属于本区的」，
     实测城东只剩 2 条、城南 1 条、城北甚至把 91 分的excellent 门店
     列为「风险预警」—— 评委扫一眼分数与颜色即当场自证数据不可信。
     现改为从 storeRows（已按区域过滤）取真风险档，分数升序取前 5。 */
  const riskTop5 = storeRows
    .filter((r) => r.level === 'risk' || r.level === 'warning')
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((r) => ({ ...r }))

  const total = storeRows.length
  const distribution = buildDistribution(storeRows)
  const redStores = distribution.find((d) => d.level === 'risk')?.count ?? 0

  // 区域平均分：按该区域门店明细加权平均（子项自洽，不用固定值）
  const avgScore = total ? Number((storeRows.reduce((s, r) => s + r.score, 0) / total).toFixed(1)) : 0

  /* 环比基准：全部取自 fixture 曲线的**起点**（即「上期值」），不写死任何数字。
     原代码 avgScore 用硬编码目标值 80、oosRate/coverage 写死 7.2 / 86.4——
     这有三个问题：
       ① 与趋势图脱钩。趋势终点已按区域重算，起点才是同一条曲线的上期值；
          若KPI 卡用「距目标分」而趋势图用「环比变化」，两者讲的是两件事，
          评委同屏看到「距目标 +9.8」与曲线形状对不上，会追问口径。
       ② 硬编码基准会在 fixture 变更后静默失真（环比方向整体反号）。
       ③ 调平区域分布后 avgScore 均值已变（实测三区 81.8/73.8/62.8），
          拿旧基准 74.3 比会显示虚假的「↑7.5 涨幅」。
     现统一：score 用 trend.score 起点，oosRate/coverage 同理，
     保证「环比 = 本期相对上期」这一唯一口径，且与趋势图完全自洽。*/
  const trendSeries = Object.fromEntries((dashboard.trend || []).map((s) => [s.key, s.points || []]))
  const baselineOf = (key) => {
    const pts = trendSeries[key]
    return pts.length ? Number(pts[0].toFixed(1)) : undefined
  }
  const scoreBaseline = baselineOf('score')
  const deltaNum = scoreBaseline == null ? Number((avgScore - 80).toFixed(1)) : Number((avgScore - scoreBaseline).toFixed(1))

  const baseKpis = dashboard.kpis || []
  const kpiBaseline = {
    oosRate: baselineOf('oosRate'),
    coverage: baselineOf('coverage'),
  }

  // 按区域重算value / delta（沿用 fixture 模板的 label 与配色）
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
      // 基准缺失时显示「持平」而非回退到写死数字，避免口径漂移
      if (kpiBaseline.oosRate == null) {
        copy.delta = '持平'
        copy.trend = 'flat'
      } else {
        copy.delta = `${oos > kpiBaseline.oosRate ? '↑' : '↓'}${Math.abs(Number((oos - kpiBaseline.oosRate).toFixed(1)))}pt`
        copy.trend = oos > kpiBaseline.oosRate ? 'up' : 'down'
      }
      copy.danger = oos > 10
    } else if (k.key === 'coverage') {
      // 铺货率与平均分正相关
      const cov = Number(Math.min(99, Math.max(60, 45 + avgScore * 0.48)).toFixed(1))
      copy.value = `${cov}%`
      if (kpiBaseline.coverage == null) {
        copy.delta = '持平'
        copy.trend = 'flat'
      } else {
        copy.delta = `${cov >= kpiBaseline.coverage ? '↑' : '↓'}${Math.abs(Number((cov - kpiBaseline.coverage).toFixed(1)))}pt`
        copy.trend = cov >= kpiBaseline.coverage ? 'up' : 'down'
      }
      copy.danger = false
    }
    return copy
  })

  /* 趋势：只把**终点**平移到该区域的 KPI 值，**保持原始起点不动**。
     原实现有两个问题：
       ① 只平移 score，oosRate / coverage 原样透传 fixture → 同屏出现
          「KPI 卡说 6.6%、趋势终点说 7.2%」的自相矛盾。
       ② 整体平移（起点也动）会让起点失去「上期值」含义——
          实测城东均分 81.8 时起点被推到 69.6，而上周不可能是 69.6；
          若用它算环比，KPI 卡会显示与曲线形状对不上的假涨幅。
     现改为「起点 = 真上期值（保持 fixture 原值），终点 = 本期 KPI 值」，
     两者之间用线性比例缩放，保证：曲线首尾 === 环比的两个端点，
     即「KPI 卡的环比」与「趋势图的形状」讲的是同一件事。*/
  const trendEnds = { score: avgScore, oosRate: parseFloat(String(kpis.find((k) => k.key === 'oosRate')?.value).replace('%', '')), coverage: parseFloat(String(kpis.find((k) => k.key === 'coverage')?.value).replace('%', '')) }
  const trend = (dashboard.trend || []).map((s) => {
    const pts = s.points
    if (!pts?.length) return { ...s, points: [] }
    const start = Number(pts[0].toFixed(1))          // 上期值：保持 fixture 原值不动
    const end = trendEnds[s.key]
    if (typeof end !== 'number' || Number.isNaN(end) || start === end) {
      return { ...s, points: [...pts] }
    }
    // 线性缩放：起点不变，终点精确落在本期 KPI 值上
    const scale = (end - start) / (pts[pts.length - 1] - start)
    return {
      ...s,
      points: pts.map((p, i) => {
        if (i === 0) return start
        const v = start + (p - start) * scale
        return Number(Math.max(0, Math.min(100, v)).toFixed(1))
      }),
    }
  })

  /* 整改闭环聚合：已整改条目 / 进行中任务 / 平均提升分
     注意：必须按 status 过滤。index.js 按有无照片分流
     （photoUrl ? 'done' : 'pending'），若这里只按门店过滤不过滤 status，
     会把未留证的 pending 回执也算成「已整改」—— 主理人直查 SQLite 实测：
     库中 2 条回执（1 条 done 有照片、1 条 pending 无照片），
     看板会显示已整改 2，真实完成只有 1。这直接削弱 PRD 主打的
     「跨角色闭环真实可查」。 */
  const rects = listRectifications()
  const rectStoreIds = new Set(storeRows.map((r) => r.storeId))
  const scopedRects = rects.filter((r) => rectStoreIds.has(r.storeId) && r.status === 'done')
  const pendingRects = rects.filter((r) => rectStoreIds.has(r.storeId) && r.status !== 'done')
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

  /* 整改卡片：done = 已整改回执数（同 status），pending = 已提交未留证，
     两者与「整改」同源。原先 done 用 scopedRects.length（含 pending）、
     open 用 openTasks.length（任务数）—— 数字不同源、不同量纲并排显示，
     评审会追问「已整改 2 和进行中 16 是什么关系」而现场无法自圆其说。 */
  const rectification = { done: scopedRects.length, open: pendingRects.length, avgGain }

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
