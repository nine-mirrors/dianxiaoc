/**
 * W2 业务路由 · 单店深度画像（store-insights.js）
 *
 * 挂载约定：默认导出 { base: '', router } —— base 为空串，
 * 由 routes/index.js 挂在 /api/v1 根下，因此本文件内直接写完整路径
 * '/stores/:id/profile'，与既有 GET /api/v1/stores、/stores/:id 平级且不冲突
 * （段数不同，Express 精确匹配）。
 *
 * 数据诚实原则：
 *  - 只用 fixtures / SQLite 里**真实存在**的字段；fixture 没有的（如多周 weeks[]、
 *    issues.type）一律走"真实数据派生"（巡店记录、标题归类），绝不编造数字；
 *  - 每家店的真实诊断只有 diagnoses.json 中 S1–S5（S2 含整改前一条）共 6 条，
 *    其余 123 家门店没有诊断 → 六维雷达返回 []、问题标签返回 []，不补假分；
 *  - 健康分与 domain.resolveHealth 同口径（六维加权），与页面分数一致。
 */
import { newRouter, wrap, ApiError, requireRole } from './_kit.js'
import {
  findStore,
  diagnosesRaw,
  allVisits,
  listTasks,
  listTickets,
} from '../db.js'
import { DIMENSIONS, resolveHealth, levelOf } from '../domain.js'
import { buildForecast } from '../forecast.js'
import { extDb, rowToCamel, nowIso } from '../ext.js'

const router = newRouter()

/* ───────────────────────── 纯取数/派生助手 ───────────────────────── */

/** 该店全部诊断（按 visitNo、createdAt 倒序），最新一条在前 */
function diagnosesOfStore(storeId) {
  return diagnosesRaw
    .filter((d) => d.storeId === storeId)
    .slice()
    .sort((a, b) => {
      const no = (b.visitNo ?? 0) - (a.visitNo ?? 0)
      if (no !== 0) return no
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
    })
}

/**
 * 健康分历史（最多 8 个点）。
 * ① 诊断里真实带 weeks[] → 直接取（当前 fixture 无此结构，预留兼容）；
 * ② 否则用该店真实巡店记录（fixture 预置 + SQLite 增量）按时间升序派生；
 * ③ 一次巡店都没有 → 用 stores.json 真实存在的 prevScore/lastScore 两个点。
 * 返回 [{week, score}]；什么真实数据都没有时返回 []。
 */
function buildHealthTrend(store) {
  const weekly = diagnosesRaw.find(
    (d) => d.storeId === store.id && Array.isArray(d.weeks) && d.weeks.length > 0,
  )
  if (weekly) {
    return weekly.weeks
      .slice(-8)
      .map((w) => ({ week: String(w.week ?? w.label ?? ''), score: Number(w.score) }))
      .filter((p) => Number.isFinite(p.score))
  }

  const visits = allVisits()
    .filter((v) => v.storeId === store.id && Number.isFinite(Number(v.score)))
    .slice()
    .sort((a, b) => String(a.visitedAt ?? '').localeCompare(String(b.visitedAt ?? '')))
  if (visits.length) {
    return visits.slice(-8).map((v) => ({
      week: String(v.visitedAt ?? '').slice(0, 10),
      score: Number(v.score),
    }))
  }

  const pts = []
  if (Number.isFinite(Number(store.prevScore))) pts.push({ week: '上期', score: Number(store.prevScore) })
  if (Number.isFinite(Number(store.lastScore))) pts.push({ week: '本期', score: Number(store.lastScore) })
  return pts.filter((p, i, arr) => i === 0 || p.score !== arr[i - 1].score || p.week !== arr[i - 1].week)
}

/** 六维雷达：取最新诊断的 dimensions（fixture 中为长度 6 的数字数组），配 D1–D6 标准标签 */
function buildDimensions(raw) {
  const dims = raw?.dimensions
  if (!Array.isArray(dims) || dims.length !== 6) return []
  return DIMENSIONS.map((d, i) => {
    const score = Math.round(Number(dims[i]) || 0)
    return { key: d.key, label: d.name, score, level: levelOf(score) }
  })
}

/**
 * 问题 Top 标签。fixture issue 无 type 字段（只有 title/severity/impact…），
 * type 由**标题关键词**做确定性归类（归类规则即"口径"，可在报告中解释），
 * severity 取该类型下最高严重度，并附各严重度计数便于核验。
 */
const SEV_RANK = { severe: 3, medium: 2, low: 1 }
function issueTypeOf(title) {
  const t = String(title ?? '')
  if (/缺货|空位|断货|空柜/.test(t)) return '缺货'
  if (/竞品|挤占|占.{0,2}位/.test(t)) return '竞品占位'
  if (/价签/.test(t)) return '价签'
  if (/堆头|端架/.test(t)) return '堆头/端架'
  if (/排面|陈列|凌乱/.test(t)) return '排面陈列'
  if (/期效|临期|效期/.test(t)) return '临期'
  return '其他'
}
function buildIssueTypes(raw) {
  const issues = Array.isArray(raw?.issues) ? raw.issues : []
  const map = new Map()
  for (const is of issues) {
    const type = issueTypeOf(is.title)
    const sev = SEV_RANK[is.severity] ? is.severity : 'low'
    if (!map.has(type)) map.set(type, { type, count: 0, severity: 'low', severityCount: { severe: 0, medium: 0, low: 0 } })
    const agg = map.get(type)
    agg.count += 1
    agg.severityCount[sev] += 1
    if ((SEV_RANK[sev] ?? 1) > (SEV_RANK[agg.severity] ?? 1)) agg.severity = sev
  }
  return [...map.values()].sort((a, b) => b.count - a.count || (SEV_RANK[b.severity] ?? 1) - (SEV_RANK[a.severity] ?? 1))
}

/** 近 N 次巡店（倒序），只回传真实字段 */
function buildVisits(storeId, limit = 10) {
  return allVisits()
    .filter((v) => v.storeId === storeId)
    .slice()
    .sort((a, b) => String(b.visitedAt ?? '').localeCompare(String(a.visitedAt ?? '')))
    .slice(0, limit)
    .map((v) => ({
      id: v.id,
      visitNo: v.visitNo ?? null,
      visitedAt: v.visitedAt ?? '',
      score: Number.isFinite(Number(v.score)) ? Number(v.score) : null,
      status: v.status ?? '',
      repId: v.repId ?? null,
      photoIds: Array.isArray(v.photoIds) ? v.photoIds : [],
    }))
}

/** 该店最新一次 ext_inventory 盘点快照（没有则 null；本接口不调 MCP） */
function latestInventory(storeId) {
  const row = extDb
    .prepare('SELECT MAX(created_at) AS m FROM ext_inventory WHERE store_id = ?')
    .get(storeId)
  if (!row?.m) return null
  const rows = extDb
    .prepare('SELECT * FROM ext_inventory WHERE store_id = ? AND created_at = ? ORDER BY id')
    .all(storeId, row.m)
  return {
    createdAt: row.m,
    count: rows.length,
    items: rows.map((r) => rowToCamel(r)),
  }
}

/* ───────────────────────── 路由 ───────────────────────── */

/**
 * GET /api/v1/stores/:id/profile —— 单店深度画像（登录即可）
 * 经理 / 业代 / 管理员 / 店主均可见（主入口 /api/v1 闸门已保证登录）。
 */
router.get('/stores/:id/profile', wrap(async (req) => {
  const store = findStore(req.params.id)
  if (!store) throw new ApiError(404, '门店不存在')

  const diagnoses = diagnosesOfStore(store.id)
  const raw = diagnoses[0] ?? null

  // 健康分：有诊断走与页面同口径的六维加权；无诊断用 stores.json 的 lastScore 兜底
  const health = raw
    ? resolveHealth(raw).health
    : {
        score: Number.isFinite(Number(store.lastScore)) ? Number(store.lastScore) : null,
        level: Number.isFinite(Number(store.lastScore)) ? levelOf(Number(store.lastScore)) : null,
        delta:
          Number.isFinite(Number(store.lastScore)) && Number.isFinite(Number(store.prevScore))
            ? Number(store.lastScore) - Number(store.prevScore)
            : 0,
        source: 'store-fixture',
      }

  // 关联任务
  const tasks = listTasks().filter((t) => t.storeId === store.id)
  const openTasks = tasks.filter((t) => t.status === 'open').length
  const doneTasks = tasks.filter((t) => t.status === 'done').length

  // 关联单据：订货总额只统计 kind='order' 的订货单
  const tickets = listTickets({ storeId: store.id })
  const orders = tickets.filter((t) => t.kind === 'order')
  const ticketsSummary = {
    count: orders.length,
    totalAmount: orders.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0),
    acceptedCount: orders.filter((t) => t.status === 'accepted').length,
    rectificationTicketCount: tickets.filter((t) => t.kind === 'rectification').length,
  }

  return {
    store,
    health,
    healthTrend: buildHealthTrend(store),
    dimensions: buildDimensions(raw),
    visits: buildVisits(store.id),
    tasksSummary: { total: tasks.length, open: openTasks, done: doneTasks },
    openTasks,
    ticketsSummary,
    issueTypes: buildIssueTypes(raw),
    hasDiagnosis: !!raw,
    dataHonest: true,
  }
}))

/**
 * GET /api/v1/stores/:id/profile/attribution —— AI 归因结构化底稿（经理/管理员）
 * 纯数据 JSON（不调任何模型），供前端调 /ai-insights 或直接展示：
 * 健康分拐点、主要扣分问题（可解析的影响量）、库存/缺货事实、最近盘点。
 */
router.get('/stores/:id/profile/attribution', requireRole('manager', 'admin'), wrap(async (req) => {
  const store = findStore(req.params.id)
  if (!store) throw new ApiError(404, '门店不存在')

  const raw = diagnosesOfStore(store.id)[0] ?? null
  const trend = buildHealthTrend(store)

  // 拐点：相邻两次分数差，按 |delta| 取前 3
  const turningPoints = []
  for (let i = 1; i < trend.length; i += 1) {
    const delta = trend[i].score - trend[i - 1].score
    turningPoints.push({
      fromWeek: trend[i - 1].week,
      toWeek: trend[i].week,
      delta,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    })
  }
  turningPoints.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  // 主要扣分问题：优先解析 impact 文本里的"日均 X 瓶流失"，解析不到再用严重度权重兜底
  const sevWeight = { severe: 6, medium: 4, low: 2 }
  const topIssues = (Array.isArray(raw?.issues) ? raw.issues : [])
    .map((is) => {
      const m = String(is.impact ?? '').match(/([\d]+(?:\.\d+)?)\s*瓶/)
      const bottles = m ? Number(m[1]) : null
      return {
        id: is.id,
        title: is.title,
        severity: is.severity ?? 'low',
        location: is.location ?? '',
        impact: is.impact ?? '',
        actions: Array.isArray(is.actions) ? is.actions : [],
        impactBottlesPerDay: bottles,
        impactWeight: bottles != null ? bottles : (sevWeight[is.severity] ?? sevWeight.low),
        weightSource: bottles != null ? 'impact文本中的日均流失瓶数' : '严重度权重(severe6/medium4/low2)',
      }
    })
    .sort((a, b) => b.impactWeight - a.impactWeight)

  // 库存/缺货事实：fixture risk + plan + forecast 算法复核（无 MCP 调用）
  let stockFacts = null
  if (raw) {
    const risk = raw.risk ?? {}
    const plan = raw.plan ?? {}
    let forecastLines = []
    try {
      const fc = buildForecast({ ...raw, allDiagnoses: diagnosesRaw })
      forecastLines = (fc.lines ?? []).map((l) => ({
        skuId: l.skuId,
        skuName: l.skuName,
        dailyForecast: l.dailyForecast,
        safetyStock: l.safetyStock,
        suggestBottles: l.suggestBottles,
        fillRate: l.fillRate,
      }))
    } catch {
      forecastLines = [] // 算法复核失败不影响底稿出数
    }
    stockFacts = {
      weeklyBottles: risk.weeklyBottles ?? 0,
      weeklyAmount: risk.weeklyAmount ?? 0,
      monthlyBottles: risk.monthlyBottles ?? 0,
      monthlyAmount: risk.monthlyAmount ?? 0,
      riskItems: Array.isArray(risk.items) ? risk.items : [],
      restockPlan: {
        coverDays: plan.coverDays ?? null,
        totalBottles: plan.totalBottles ?? 0,
        totalAmount: plan.totalAmount ?? 0,
        items: Array.isArray(plan.restock) ? plan.restock : [],
      },
      forecastLines,
      latestInventory: latestInventory(store.id),
    }
  }

  return {
    storeId: store.id,
    storeName: store.name,
    generatedAt: nowIso(),
    diagnosisKey: raw?.key ?? null,
    healthTrend: trend,
    turningPoints: turningPoints.slice(0, 3),
    topIssues,
    stockFacts,
    dataHonest: true,
  }
}))

export default { base: '', router }
