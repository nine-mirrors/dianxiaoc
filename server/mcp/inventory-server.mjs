#!/usr/bin/env node
/**
 * 蒙牛进销存 MCP Server（Model Context Protocol，stdio + JSON-RPC 2.0）。
 *
 * 为什么要有它：AI 诊断里「临期/过期」「价签对不对」这两类判断，
 * 光靠货架照片看不清（瓶身背标字太小），必须查蒙牛自己的进销存系统。
 * 本 Server 把批次效期、价格库、门店库存三个能力暴露为 MCP 工具，
 * 让大模型通过标准协议调用取数 —— 而不是靠模型编数字。
 *
 * 零依赖手写实现（只实现 tools/list、tools/call、initialize 三个方法），
 * 离线可跑、可演示：node server/mcp/inventory-server.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ═══════════════ 数据（演示口径：模拟蒙牛 ERP 导出） ═══════════════ */

const SKUS = JSON.parse(
  readFileSync(join(__dirname, '../../store-app/src/fixtures/skus.json'), 'utf8'),
).items

/** 批次库存与效期（生产环境来自 ERP 批次台账） */
const BATCHES = {
  SKU_001: [
    { batch: 'B24090A', prodDate: '2026-09-02', expireDate: '2026-10-16', qty: 8, price: 4.0 },
    { batch: 'B24088C', prodDate: '2026-08-21', expireDate: '2026-10-05', qty: 5, price: 4.0 },
    { batch: 'B24075D', prodDate: '2026-08-05', expireDate: '2026-09-28', qty: 4, price: 3.5 },
  ],
  SKU_002: [
    { batch: 'B24087B', prodDate: '2026-08-19', expireDate: '2026-11-19', qty: 12, price: 9.0 },
  ],
  SKU_006: [
    { batch: 'B24091A', prodDate: '2026-09-05', expireDate: '2026-10-20', qty: 6, price: 4.0 },
  ],
}

/** 价格库（含建议零售价与终端执行价） */
const PRICE_BOOK = Object.fromEntries(
  SKUS.map((s) => [s.id, { skuId: s.id, name: s.name, guidePrice: s.guidePrice, execPrice: s.guidePrice }]),
)
PRICE_BOOK.SKU_001.execPrice = 3.5 // 演示：该店把优益C 100ml 错标成 3.5（应为 4）

/** 门店库存（在库数） */
const STORE_STOCK = {
  S1: { SKU_001: 14, SKU_002: 10, SKU_006: 8 },
  S2: { SKU_001: 9, SKU_002: 11, SKU_006: 5 },
  S3: { SKU_001: 6, SKU_002: 8, SKU_006: 3 },
  S4: { SKU_001: 11, SKU_002: 6, SKU_006: 7 },
  S5: { SKU_001: 4, SKU_002: 5, SKU_006: 2 },
}

/* ═══════════════ 工具实现 ═══════════════ */

/** FEFO（先到期先出）取临期批次 */
function getBatchExpiry(skuId, today = '2026-10-09') {
  const list = BATCHES[skuId] ?? []
  const rows = list.map((b) => {
    const days = Math.round((new Date(b.expireDate) - new Date(today)) / 86400000)
    const status = days < 0 ? 'expired' : days <= 14 ? 'near_expiry' : 'fresh'
    return { ...b, daysToExpiry: days, status: status === 'near_expiry' ? '临期(≤14天)' : status === 'expired' ? '已过期' : '正常' }
  })
  const fefo = [...rows].sort((a, b) => a.expireDate.localeCompare(b.expireDate))
  const summary = {
    skuId,
    nearExpiry: rows.filter((r) => r.status === 'near_expiry').reduce((s, r) => s + r.qty, 0),
    expired: rows.filter((r) => r.status === 'expired').reduce((s, r) => s + r.qty, 0),
    fresh: rows.filter((r) => r.status === 'fresh').reduce((s, r) => s + r.qty, 0),
  }
  return {
    content: [
      { type: 'text', text: `【${skuId} 批次效期台账】共 ${rows.length} 个批次（FEFO 先到期先出）\n` + fefo.map((b) => `· 批次 ${b.batch}：生产 ${b.prodDate} → 效期 ${b.expireDate}（${b.daysToExpiry >= 0 ? `还剩 ${b.daysToExpiry} 天` : `已过期 ${-b.daysToExpiry} 天`}，${b.status}），库存 ${b.qty} 瓶`).join('\n') + `\n汇总：临期 ${summary.nearExpiry} 瓶 / 过期 ${summary.expired} 瓶 / 正常 ${summary.fresh} 瓶` },
    ],
    structuredContent: { skuId, rows, summary },
  }
}

function getPriceBook(skuId) {
  const p = PRICE_BOOK[skuId]
  if (!p) return { content: [{ type: 'text', text: `未找到 ${skuId} 的价格库记录` }], isError: true }
  const diff = p.execPrice !== p.guidePrice
  return {
    content: [
      {
        type: 'text',
        text:
          `【${skuId} ${p.name} 价格库】建议零售价 ¥${p.guidePrice}/瓶；该终端当前执行价 ¥${p.execPrice}/瓶。` +
          (diff ? ` ⚠ 价签不符：低标 ¥${round2(p.guidePrice - p.execPrice)} 元，需整改。` : ' ✓ 价签合规。'),
      },
    ],
    structuredContent: { ...p, mismatch: diff },
  }
}

function getStoreInventory(storeId, skuId) {
  const stock = STORE_STOCK[storeId]
  if (!stock) return { content: [{ type: 'text', text: `未找到门店 ${storeId} 的库存记录` }], isError: true }
  const rows = skuId
    ? (BATCHES[skuId] ?? []).reduce((s, b) => s + b.qty, 0) !== undefined && stock[skuId] != null
      ? [{ skuId, onHand: stock[skuId] }]
      : []
    : Object.entries(stock).map(([id, qty]) => ({ skuId: id, onHand: qty }))
  const total = rows.reduce((s, r) => s + r.onHand, 0)
  return {
    content: [{ type: 'text', text: `【${storeId} 在库】${rows.map((r) => `${r.skuId} ${r.onHand} 瓶`).join('、')}（合计 ${total} 瓶）` }],
    structuredContent: { storeId, rows, total },
  }
}

const TOOLS = [
  {
    name: 'get_batch_expiry',
    description: '查询某个蒙牛 SKU 的批次效期台账（生产日期/效期/临期过期判定）。判断货架临期风险必须查进销存，不能靠看照片。',
    inputSchema: {
      type: 'object',
      properties: { skuId: { type: 'string', description: 'SKU 编号，如 SKU_001' } },
      required: ['skuId'],
    },
  },
  {
    name: 'get_price_book',
    description: '查询某个 SKU 的建议零售价与该终端实际执行价，用于校验价签是否合规。',
    inputSchema: {
      type: 'object',
      properties: { skuId: { type: 'string' } },
      required: ['skuId'],
    },
  },
  {
    name: 'get_store_inventory',
    description: '查询某门店在库数量（可指定 SKU），用于动态安全库存与补货量测算。',
    inputSchema: {
      type: 'object',
      properties: { storeId: { type: 'string' }, skuId: { type: 'string', description: '可选' } },
      required: ['storeId'],
    },
  },
]

/* ═══════════════ MCP 协议循环 ═══════════════ */

function ok(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function handle(msg) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mengniu-inventory-mcp', version: '1.0.0' },
      })
    case 'tools/list':
      return ok(id, { tools: TOOLS })
    case 'tools/call': {
      const { name, arguments: args = {} } = params ?? {}
      try {
        if (name === 'get_batch_expiry') return ok(id, getBatchExpiry(args.skuId))
        if (name === 'get_price_book') return ok(id, getPriceBook(args.skuId))
        if (name === 'get_store_inventory') return ok(id, getStoreInventory(args.storeId, args.skuId))
        return ok(id, { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true })
      } catch (e) {
        return ok(id, { content: [{ type: 'text', text: `工具执行失败：${e.message}` }], isError: true })
      }
    }
    case 'notifications/initialized':
      return null
    default:
      return JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } })
  }
}

let buf = ''
process.stdin.on('data', (chunk) => {
  buf += chunk.toString()
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    const reply = handle(msg)
    if (reply) process.stdout.write(reply + '\n')
  }
})
process.stdin.on('end', () => process.exit(0))

function round2(n) {
  return Math.round(n * 100) / 100
}
