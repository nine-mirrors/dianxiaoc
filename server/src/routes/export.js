/**
 * W2 业务路由 · CSV 导出（export.js）：门店明细 + 业代绩效榜
 *
 * 挂载前缀：/export（/api/v1/export/stores.csv 等）。
 * 守卫：manager / admin。
 *
 * 安全要点（硬约束）：
 *  1. CSV 公式注入防御：单元格首字符为 = + - @ Tab CR 时，前置单引号；
 *  2. 通用 CSV 转义：含逗号/引号/换行的单元格整体用双引号包裹，内部引号双写；
 *  3. 响应体首字符为 BOM（﻿），Excel 打开中文不乱码；
 *  4. 显式下发 Content-Type: text/csv; charset=utf-8 与附件文件名；
 *  5. 这两个接口直接 res.send（不经 wrap 信封），成功时就是裸 CSV。
 *
 * 取数：stores + dashboard 概览 + 与 performance.js 同口径的排行榜（在本文件内重算，
 * 不跨文件 import，避免路由文件相互耦合）。
 */
import { newRouter, requireRole } from './_kit.js'
import {
  users,
  stores,
  dashboard,
  allVisits,
  listRectifications,
  listTickets,
} from '../db.js'

const router = newRouter()
const guard = requireRole('manager', 'admin')

/* ───────────────────────── CSV 安全工具 ───────────────────────── */

/**
 * 单元格转义：① 防公式注入；② 标准 CSV 引号包裹。
 */
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value)
  // ① 首字符命中公式注入字符集（含 Tab/回车）→ 前置单引号，Excel 会按文本处理
  if (s.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(s[0])) {
    s = `'${s}`
  }
  // ② 含引号/逗号/换行 → 双引号包裹，内部 " 双写
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')]
  for (const r of rows) lines.push(r.map(csvCell).join(','))
  // BOM 必须在最前（用显式转义，避免编辑器把字面量误当文件编码处理）；CRLF 是 Excel 最稳的行分隔
  return '\uFEFF' + lines.join('\r\n')
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(csv)
}

/* ───────────────────────── 门店明细取数 ───────────────────────── */

const dash = dashboard
const LEVEL_LABEL = Object.fromEntries((dash.distribution || []).map((d) => [d.level, d.label]))
const REGION_NAME = Object.fromEntries((dash.regionIds || []).map((r) => [r.id, r.name]))

/** 与 dashboard.js KPI 同公式：按门店健康分派生缺货率/铺货率（派生口径，非 fixture 原始字段） */
function oosRateOf(score) {
  return Number(Math.max(2.4, 12 - score * 0.06).toFixed(1))
}
function coverageOf(score) {
  return Number(Math.min(99, Math.max(60, 45 + score * 0.48)).toFixed(1))
}

router.get('/stores.csv', guard, (req, res) => {
  try {
    const rows = (dash.storeRows || []).map((r) => {
      const store = stores.find((s) => s.id === r.storeId)
      const rid = store?.regionId || 'R_EAST'
      const score = Number(r.score) || 0
      return [
        r.storeId,
        r.storeName ?? store?.name ?? '',
        REGION_NAME[rid] ?? rid,
        score,
        LEVEL_LABEL[r.level] ?? r.level ?? '',
        `${oosRateOf(score)}%`,
        `${coverageOf(score)}%`,
        store?.alert ? '告警' : '正常',
      ]
    })
    const csv = toCsv(['门店ID', '门店名', '区域', '健康分', '档位', '本周缺货率', '铺货率', '状态'], rows)
    sendCsv(res, 'stores.csv', csv)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[export] stores.csv 导出失败：', e)
    res.status(500).json({ code: 500, message: '导出失败，请稍后重试' })
  }
})

/* ───────────────────────── 绩效榜取数（与 performance.js 同口径，本文件内重算） ───────────────────────── */

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

function buildLeaderboardRows() {
  const reps = users.filter((u) => u.role === 'rep')
  const rows = reps.map((rep) => {
    const rid = rep.regionId || 'R_EAST'
    const regionIds = new Set(stores.filter((s) => (s.regionId || 'R_EAST') === rid).map((s) => s.id))

    const repVisits = allVisits().filter((v) => v.repId === rep.id)
    const visits = repVisits.length
    const scored = repVisits.map((v) => Number(v.score)).filter((s) => Number.isFinite(s))
    const avgScore = scored.length ? round1(scored.reduce((a, b) => a + b, 0) / scored.length) : 0

    const rectifications = listRectifications().filter(
      (r) => r.operatorId === rep.id && r.status === 'done',
    ).length
    const repOrders = listTickets({ kind: 'order' }).filter((t) => regionIds.has(t.storeId))
    const orderAmount = repOrders.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0)

    // 红灯转化（先 <60 后 ≥70 的门店数）
    const byStore = new Map()
    for (const v of repVisits) {
      if (!Number.isFinite(Number(v.score))) continue
      if (!byStore.has(v.storeId)) byStore.set(v.storeId, [])
      byStore.get(v.storeId).push(v)
    }
    let redConversions = 0
    for (const list of byStore.values()) {
      const seq = list.slice().sort((a, b) => String(a.visitedAt ?? '').localeCompare(String(b.visitedAt ?? '')))
      let sawRed = false
      for (const v of seq) {
        const s = Number(v.score)
        if (s < 60) sawRed = true
        else if (sawRed && s >= 70) { redConversions += 1; break }
      }
    }

    const score = round1(
      Math.min(1, visits / 10) * 35 +
      (avgScore / 100) * 35 +
      Math.min(1, rectifications / 5) * 20 +
      Math.min(1, redConversions / 2) * 10,
    )

    return {
      name: rep.name,
      visits,
      avgScore,
      rectifications,
      orderAmount,
      score,
    }
  })
  rows.sort((a, b) => b.score - a.score || b.visits - a.visits)
  return rows
}

router.get('/leaderboard.csv', guard, (req, res) => {
  try {
    const rows = buildLeaderboardRows().map((r) => [
      r.name,
      r.visits,
      r.avgScore,
      r.rectifications,
      r.orderAmount,
      r.score,
    ])
    const csv = toCsv(['业代', '巡店数', '平均分', '整改数', '订货额', '综合分'], rows)
    sendCsv(res, 'leaderboard.csv', csv)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[export] leaderboard.csv 导出失败：', e)
    res.status(500).json({ code: 500, message: '导出失败，请稍后重试' })
  }
})

export default { base: '/export', router }
