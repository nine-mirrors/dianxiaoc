/**
 * 视觉识别小样本评测（P0-3）——用与线上诊断完全相同的视觉函数跑自测集，
 * 产出可写进 PDF 的准确率 / 耗时 / 降级率数据，避免"只声称、不验证"。
 *
 * 用法（在 server/ 目录，保证读到 server/.env 的视觉模型 key）：
 *   node ../eval/vision-benchmark.mjs
 *
 * 真值：eval/labels.json（人工逐张标注；verified=false 的条目会计入结果但会被明确
 *   标注为"待人工复核"，PDF 只能引用全部 verified=true 的结果）。
 * 输出：eval/results.json（机读）+ eval/results.md（人读表格）。
 *
 * 指标口径（全部对"计数"这一视觉模型真正负责的输出）：
 *  - exact：四项计数全对的图片占比
 *  - ±1：每项计数误差不超过 1 即算该项通过，按"指标项"平均
 *  - MAE：各指标平均绝对误差（瓶/个）
 *  - adoptedRate：视觉框被采信的比例（1 - 降级层数占比），由产品 patch 阶段给出
 *  - latency：单次端到端平均耗时
 *  - fallback：视觉不可用/计数越界被判不可信的图片占比（诚实暴露）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { analyzeShelfWithBoxes } from '../server/src/vision.js'
import { loadEnv } from '../server/src/env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv() // 确保读到 server/.env 里的 LLM_VL_* 配置

const labels = JSON.parse(readFileSync(join(__dirname, 'labels.json'), 'utf8')).labels ?? []
const METRICS = /** @type {const} */ (['skuCount', 'emptyCount', 'competitorCount', 'priceTagMissing'])
const METRIC_CN = { skuCount: '蒙牛SKU', emptyCount: '空位', competitorCount: '竞品', priceTagMissing: '价签问题' }

const rows = []
for (const item of labels) {
  const t0 = Date.now()
  let v = null
  let err = ''
  try {
    v = await analyzeShelfWithBoxes(item.image, item.storeName)
  } catch (e) {
    err = String(e?.message || e)
  }
  const ms = Date.now() - t0

  if (!v) {
    rows.push({ ...item, ms, status: 'unavailable', pred: {}, err: err || '视觉模型无返回' })
    continue
  }
  if (v.countsUnreliable) {
    rows.push({ ...item, ms, status: 'fallback', pred: {}, unreliableReason: v.unreliableReason || '计数越界' })
    continue
  }
  const errors = Object.fromEntries(METRICS.map((m) => [m, Math.abs((v[m] ?? 0) - item.expected[m])]))
  const exact = METRICS.every((m) => errors[m] === 0)
  rows.push({ ...item, ms, status: 'ok', pred: Object.fromEntries(METRICS.map((m) => [m, v[m] ?? 0])), errors, exact })
}

/* ═══════════════ 汇总（分别给出 verified-only 与全部两个口径） ═══════════════ */
function summarize(list) {
  const okRows = list.filter((r) => r.status === 'ok')
  const n = list.length
  const exactRate = n ? okRows.filter((r) => r.exact).length / n : 0
  const withinOne = {}
  const mae = {}
  for (const m of METRICS) {
    const vals = okRows.map((r) => r.errors[m])
    withinOne[m] = vals.length ? vals.filter((e) => e <= 1).length / vals.length : null
    mae[m] = vals.length ? vals.reduce((s, e) => s + e, 0) / vals.length : null
  }
  const latencies = list.map((r) => r.ms)
  return {
    n,
    ok: okRows.length,
    fallback: list.filter((r) => r.status === 'fallback').length,
    unavailable: list.filter((r) => r.status === 'unavailable').length,
    exactRate: Number(exactRate.toFixed(3)),
    withinOne: Object.fromEntries(Object.entries(withinOne).map(([k, v]) => [k, v == null ? null : Number(v.toFixed(3))])),
    mae: Object.fromEntries(Object.entries(mae).map(([k, v]) => [k, v == null ? null : Number(v.toFixed(2))])),
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((s, x) => s + x, 0) / latencies.length) : 0,
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  model: process.env.LLM_VL_MODEL || '(未配置)',
  verifiedOnly: summarize(rows.filter((r) => r.verified)),
  all: summarize(rows),
  rows,
}
writeFileSync(join(__dirname, 'results.json'), JSON.stringify(result, null, 2), 'utf8')

/* ═══════════════ Markdown 报告 ═══════════════ */
const fmtPct = (x) => (x == null ? '—' : `${(x * 100).toFixed(0)}%`)
const md = []
md.push(`# 视觉识别小样本自测结果`, ``)
md.push(`- 生成时间：${result.generatedAt}`)
md.push(`- 视觉模型：\`${result.model}\``)
md.push(`- 样本：${result.all.n} 张（其中已人工复核 ${result.verifiedOnly.n} 张）`)
md.push(`- 评测函数：与线上诊断同一个 \`analyzeShelfWithBoxes\`，非单独实现`, ``)
md.push(`> ⚠ PDF 只能引用"已人工复核(verified=true)"口径；全部口径含陈列基线预填值，仅供调试。`, ``)
md.push(`## 汇总（已人工复核 n=${result.verifiedOnly.n}）`, ``)
md.push(`| 指标 | 值 |`, `| --- | --- |`)
md.push(`| 四项计数全对率 | ${fmtPct(result.verifiedOnly.exactRate)} |`)
md.push(`| 平均端到端耗时 | ${result.verifiedOnly.avgLatencyMs || '—'} ms |`)
md.push(`| 计数越界降级率 | ${result.verifiedOnly.n ? fmtPct(result.verifiedOnly.fallback / result.verifiedOnly.n) : '—'} |`)
md.push(`| 模型不可用率 | ${result.verifiedOnly.n ? fmtPct(result.verifiedOnly.unavailable / result.verifiedOnly.n) : '—'} |`, ``)
md.push(`## 逐图明细`, ``)
md.push(`| 图片 | 门店 | 复核 | 状态 | 耗时ms | SKU 真值/预测(误差) | 空位 | 竞品 | 价签 |`)
md.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`)
for (const r of rows) {
  const cell = (m) => r.status === 'ok' ? `${r.expected[m]}/${r.pred[m]}(${r.errors[m]})` : `${r.expected[m]}/—`
  md.push(`| ${r.image.split('/').slice(-2).join('/')} | ${r.storeName} | ${r.verified ? '✓' : '待核'} | ${r.status} | ${r.ms} | ${cell('skuCount')} | ${cell('emptyCount')} | ${cell('competitorCount')} | ${cell('priceTagMissing')} |`)
}
writeFileSync(join(__dirname, 'results.md'), md.join('\n') + '\n', 'utf8')

console.log(md.join('\n'))
console.log('\n已写出 eval/results.json 与 eval/results.md')
