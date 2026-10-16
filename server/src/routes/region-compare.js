/**
 * W3 经理端 · 区域对比（region-compare.js）
 *
 * 挂载：默认导出 { base: '/region-compare', router } → GET /api/v1/region-compare
 * 守卫：manager / admin（登录闸门之外的二级角色限制，同 performance.js）。
 *
 * ★ 口径同源（硬约束）：本文件**不自己另算 KPI**，每个区域的关键指标都直接取自
 *   dashboard.js 的 buildDashboardOverview(regionId) —— 与「区域经营看板」页
 *   用的是同一个函数、同一份门店过滤逻辑。因此对比页与看板页对同一区域给出的
 *   平均健康分、红灯门店、整改闭环、任务完成率完全一致，不会出现「两个数」。
 *
 * 真实数据边界（能追溯到真实记录）：
 *  - 区域名 / 门店数：dashboard.regionIds + stores.json 的 regionId（与 REGION_STORE_IDS 同源）。
 *  - 平均健康分 avgScore：buildDashboardOverview().kpis 里 avgScore 卡（按该区域门店明细重算）。
 *  - 周环比 weekDelta：该区域门店明细 storeRows[].weekDelta 的算术平均 —— 门店级真实字段，
 *    **刻意不复用** KPI 卡 avgScore.delta（后者是「本期相对 fixture 上期起点 62.1」，三区共用
 *    同一基准，不适合做区域横向对比；二者名称不同、各说各话，避免同一指标出现两个数）。
 *  - 巡店完成数 visitCount：allVisits() 中属于该区域门店的真实巡店记录条数（fixture + SQLite 增量）。
 *  - 整改闭环率 rectificationRate：已完成整改回执 done ÷ (done + 待复查 open)，无回执时为 null。
 *  - 任务完成率 taskRate：buildDashboardOverview().taskSummary.completionRate（与看板同源）。
 *
 * 未做（后端确无真实数据，如实不做，绝不伪造）：
 *  - 「同比」：库中无去年同期记录，无法计算，故不提供任何同比字段。
 *  - 区域时间趋势：复用看板 8 周 trend（fixture 真实多周曲线，终点按区域 KPI 校准），
 *    不另造第二套周序列。
 */
import { newRouter, wrap, requireRole } from './_kit.js'
import { dashboard, stores, allVisits } from '../db.js'
import { buildDashboardOverview } from '../dashboard.js'

const router = newRouter()
const guard = requireRole('manager', 'admin')

/** 区域清单（顺序沿用 dashboard.regionIds） */
const REGIONS = (dashboard.regionIds || []).map((r) => ({ id: r.id, name: r.name }))

/** 区域 → 该区域门店 id（由 stores.json 的 regionId 决定，与 dashboard.js 一致） */
const REGION_STORE_IDS = (() => {
  const map = {}
  for (const s of stores) {
    const rid = s.regionId || 'R_EAST'
    if (!map[rid]) map[rid] = []
    map[rid].push(s.id)
  }
  return map
})()

/** 保留 1 位小数（消除浮点尾差） */
function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

/**
 * 单个区域的关键指标行（全部来自 buildDashboardOverview，口径与看板页同源）。
 *
 * @param regionId 区域 id（如 R_EAST）
 * @returns RegionCompareRow
 */
function buildRegionRow(regionId) {
  const ov = buildDashboardOverview(regionId)
  const avgKpi = (ov.kpis || []).find((k) => k.key === 'avgScore')
  const avgScore = Number.parseFloat(String(avgKpi?.value ?? ''))
  const rows = ov.storeRows || []

  // 周环比 = 该区域门店 weekDelta 均值（门店级真实字段）
  const weekDelta = rows.length
    ? round1(rows.reduce((s, r) => s + (Number(r.weekDelta) || 0), 0) / rows.length)
    : 0

  // 巡店完成数 = 该区域门店的真实巡店记录条数
  const ids = new Set(REGION_STORE_IDS[ov.regionId] || [])
  const visitCount = allVisits().filter((v) => ids.has(v.storeId)).length

  // 整改闭环率 = 已完成 ÷ (已完成 + 待复查)
  const done = ov.rectification?.done ?? 0
  const open = ov.rectification?.open ?? 0
  const rectificationRate = done + open > 0 ? Math.round((done / (done + open)) * 100) : null

  const ts = ov.taskSummary || {}

  return {
    regionId: ov.regionId,
    regionName: ov.regionName,
    storeCount: ov.regionStoreTotal ?? rows.length,
    avgScore: Number.isFinite(avgScore) ? avgScore : 0,
    weekDelta,
    visitCount,
    rectificationDone: done,
    rectificationOpen: open,
    rectificationRate,
    taskTotal: ts.total ?? 0,
    taskDone: ts.done ?? 0,
    taskOpen: ts.open ?? 0,
    taskOverdue: ts.overdue ?? 0,
    taskRate: ts.completionRate ?? null,
  }
}

/**
 * 聚焦区域详情：门店排行（按健康分降序，含环比）+ 该区域 8 周趋势。
 *
 * @param regionId 区域 id
 * @returns { regionId, regionName, storeTotal, stores, trend }
 */
function buildFocus(regionId) {
  const ov = buildDashboardOverview(regionId)
  const storesRanked = (ov.storeRows || [])
    .slice()
    .sort((a, b) => (b.score - a.score) || ((Number(b.weekDelta) || 0) - (Number(a.weekDelta) || 0)))
    .map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      score: r.score,
      level: r.level,
      weekDelta: Number(r.weekDelta) || 0,
      mainIssue: r.mainIssue || '',
    }))
  return {
    regionId: ov.regionId,
    regionName: ov.regionName,
    storeTotal: ov.regionStoreTotal ?? storesRanked.length,
    stores: storesRanked,
    // 8 周趋势（fixture 真实多周曲线，终点已按该区域 KPI 校准，与看板页同源）
    trend: ov.trend || [],
  }
}

/**
 * GET /api/v1/region-compare?region=R_EAST
 *
 * @param req.query.region 聚焦区域 id（缺省取第一个区域）
 * @returns { regions: RegionCompareRow[], focus, method, demoToday }
 */
router.get('/', guard, wrap(async (req) => {
  const regions = REGIONS.map((r) => buildRegionRow(r.id))
  const requested = String(req.query.region || '')
  const focusRegionId = regions.find((r) => r.regionId === requested)?.regionId ?? regions[0]?.regionId
  return {
    regions,
    focus: focusRegionId ? buildFocus(focusRegionId) : null,
    // 演示基准日（与 dashboard.js DEMO_TODAY 同源），供前端标注口径
    demoToday: '2026-10-02',
    method: '平均健康分 / 整改闭环口径与「区域经营看板」同源（buildDashboardOverview）；周环比 = 该区域门店 weekDelta 均值；'
      + '巡店完成数 = 区域门店真实巡店记录条数；整改闭环率 = 已完成整改 ÷（已完成 + 待复查）；任务完成率 = 已完成 ÷ 任务总数。'
      + '后端无去年同期数据，故不提供同比字段。',
  }
}))

export default { base: '/region-compare', router }
