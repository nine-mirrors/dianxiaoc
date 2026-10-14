/**
 * W2 业务路由 · 业代绩效排行榜 + AI 价值看板（performance.js）
 *
 * 守卫：manager / admin（登录闸门之外的二级角色限制）。
 *
 * 数据诚实原则：
 *  - 只对 users 中 role='rep' 的真实业代计算（当前 fixture 仅 U_REP 李强一人），
 *    没有数据的分量一律为 0，不编造虚拟业代；
 *  - 每个派生数字都在 method / scoreBreakdown 里写清口径；
 *  - 业代↔门店的归属用 users.regionId ↔ stores.regionId（fixture 真实字段），
 *    不臆造"负责门店"关系。
 */
import { newRouter, wrap, requireRole } from './_kit.js'
import {
  users,
  stores,
  allVisits,
  listRectifications,
  listTickets,
  diagnosesRaw,
} from '../db.js'
import { extDb } from '../ext.js'

const router = newRouter()
const guard = requireRole('manager', 'admin')

/* ───────────────────────── 排行榜取数 ───────────────────────── */

/** 业代所属区域内的门店 id 集合（无 regionId 时按 R_EAST 兜底，与 dashboard.js 一致） */
function regionStoreIds(rep) {
  const rid = rep.regionId || 'R_EAST'
  return new Set(stores.filter((s) => (s.regionId || 'R_EAST') === rid).map((s) => s.id))

}

/**
 * 红灯转化：该业代的巡店序列里，门店**先出现过 <60 的红灯分、之后又出现 ≥70 分**，
 * 计为 1 家转化门店（按门店去重）。完全基于真实 visits 的时间序，算不出就是 0。
 */
function redConversionsByRep(repId) {
  const byStore = new Map()
  for (const v of allVisits()) {
    if (v.repId !== repId || !Number.isFinite(Number(v.score))) continue
    if (!byStore.has(v.storeId)) byStore.set(v.storeId, [])
    byStore.get(v.storeId).push(v)
  }
  const converted = []
  for (const [storeId, list] of byStore) {
    const seq = list.slice().sort((a, b) => String(a.visitedAt ?? '').localeCompare(String(b.visitedAt ?? '')))
    let sawRed = false
    for (const v of seq) {
      const s = Number(v.score)
      if (s < 60) sawRed = true
      else if (sawRed && s >= 70) {
        converted.push(storeId)
        break
      }
    }
  }
  return converted
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

/**
 * 计算排行榜明细（导出本文件与 export.js 各自重算，避免跨文件耦合）。
 *
 * 综合分（0–100，固定档位、可解释）：
 *   巡店量 35 分：min(巡店数/10, 1) × 35（周巡店 10 次为满量参照）
 *   巡店质量 35 分：平均分/100 × 35
 *   整改执行 20 分：min(已完成整改回执/5, 1) × 20
 *   红灯转化 10 分：min(转化门店数/2, 1) × 10
 */
export function buildLeaderboard() {
  const reps = users.filter((u) => u.role === 'rep')
  const rows = reps.map((rep) => {
    const storeIds = regionStoreIds(rep)

    const repVisits = allVisits().filter((v) => v.repId === rep.id)
    const visits = repVisits.length
    const scored = repVisits.map((v) => Number(v.score)).filter((s) => Number.isFinite(s))
    const avgScore = scored.length ? round1(scored.reduce((a, b) => a + b, 0) / scored.length) : 0

    const rectifications = listRectifications().filter(
      (r) => r.operatorId === rep.id && r.status === 'done',
    ).length

    const repOrders = listTickets({ kind: 'order' }).filter((t) => storeIds.has(t.storeId))
    const orders = repOrders.length
    const orderAmount = repOrders.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0)

    const convertedStores = redConversionsByRep(rep.id)
    const redLightConversions = convertedStores.length

    const scoreBreakdown = {
      visitLoad: round1(Math.min(1, visits / 10) * 35),
      visitQuality: round1((avgScore / 100) * 35),
      rectification: round1(Math.min(1, rectifications / 5) * 20),
      redConversion: round1(Math.min(1, redLightConversions / 2) * 10),
    }
    const score = round1(
      scoreBreakdown.visitLoad +
      scoreBreakdown.visitQuality +
      scoreBreakdown.rectification +
      scoreBreakdown.redConversion,
    )

    return {
      repId: rep.id,
      name: rep.name,
      regionId: rep.regionId || null,
      visits,
      avgScore,
      rectifications,
      orders,
      orderAmount,
      redLightConversions,
      convertedStores,
      score,
      scoreBreakdown,
    }
  })

  rows.sort((a, b) => b.score - a.score || b.visits - a.visits)
  rows.forEach((r, i) => {
    r.rank = i + 1
  })
  return rows
}

router.get('/leaderboard', guard, wrap(async () => {
  return {
    list: buildLeaderboard(),
    method: '综合分=巡店量35+巡店质量35+整改执行20+红灯转化10；巡店/整改来自真实 visits/rectifications，订货按业代所属区域门店的 order 单汇总，无数据的分量为 0。',
  }
}))

/* ───────────────────────── AI 价值看板取数 ───────────────────────── */

/** 门店最新诊断（fixture 真实值），无诊断返回 null */
function latestDiagnosisOf(storeId) {
  const list = diagnosesRaw
    .filter((d) => d.storeId === storeId)
    .slice()
    .sort((a, b) => (b.visitNo ?? 0) - (a.visitNo ?? 0))
  return list[0] ?? null
}

router.get('/ai-value', guard, wrap(async () => {
  const doneRects = listRectifications().filter((r) => r.status === 'done')
  const allOrders = listTickets({ kind: 'order' })
  const acceptedOrders = allOrders.filter((t) => t.status === 'accepted')

  // 已跟进门店 = 有已完成整改回执 或 有已接单订货单（按门店去重）
  const followedStores = new Set([
    ...doneRects.map((r) => r.storeId),
    ...acceptedOrders.map((t) => t.storeId),
  ])
  const recoveredSales = [...followedStores].reduce((sum, sid) => {
    const d = latestDiagnosisOf(sid)
    return sum + (Number(d?.risk?.monthlyAmount) || 0)
  }, 0)

  const avoidedOosBottles = acceptedOrders.reduce((s, t) => s + (Number(t.totalBottles) || 0), 0)
  const avoidedOosAmount = acceptedOrders.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0)

  const avgHealthLift = doneRects.length
    ? round1(doneRects.reduce((s, r) => s + ((Number(r.afterScore) || 0) - (Number(r.beforeScore) || 0)), 0) / doneRects.length)
    : 0

  // AI 调用数：ext_audit 中 action 以 'ai' 开头的审计条目（LIKE 参数化；当前可能为 0）
  const aiCalls = extDb.prepare("SELECT COUNT(*) AS c FROM ext_audit WHERE action LIKE ?").get('ai%').c

  // AI 采纳率：已接单订货单 / 全部订货单（订货单即 AI 建议落地的单据）；无单据给 null
  const aiAdoption = allOrders.length
    ? Math.round((acceptedOrders.length / allOrders.length) * 1000) / 1000
    : null

  return {
    recoveredSales: {
      value: recoveredSales,
      unit: '元/月',
      method: `对已产生"已完成整改回执"或"已接单订货单"的 ${followedStores.size} 家门店，取其最新诊断 risk.monthlyAmount（月度预计销量损失，fixture 真实值）求和；无诊断门店计 0。`,
    },
    avoidedOosBottles: {
      value: avoidedOosBottles,
      unit: '瓶',
      method: `已接单（accepted）订货单 total_bottles 求和，覆盖 ${acceptedOrders.length} 张真实单据。`,
    },
    avoidedOosAmount: {
      value: avoidedOosAmount,
      unit: '元',
      method: '已接单（accepted）订货单 total_amount 求和（真实库 tickets 表）。',
    },
    avgHealthLift: {
      value: avgHealthLift,
      unit: '分',
      method: doneRects.length
        ? `已完成整改回执 after_score − before_score 的算术平均（${doneRects.length} 条，computeAfterScore 落表结果）。`
        : '暂无 status=done 的整改回执，按 0 计。',
    },
    aiCalls: {
      value: aiCalls,
      unit: '次',
      method: "ext_audit 表中 action 以 'ai' 开头的审计条目计数；无 AI 审计埋点时为 0。",
    },
    aiAdoption: {
      value: aiAdoption,
      unit: 'ratio',
      method: allOrders.length
        ? `采纳率 = 已接单订货单 ${acceptedOrders.length} / 全部订货单 ${allOrders.length}（0–1 之间）。`
        : '尚无订货单作为分母，返回 null（不伪造采纳率）。',
    },
  }
}))

export default { base: '/performance', router }
