/**
 * MCP 客户端：把蒙牛进销存 MCP Server 当子进程拉起，走 stdio JSON-RPC 调用工具。
 *
 * 设计要点：
 *  1. 懒启动 + 单例复用（避免每次请求都 spawn）；
 *  2. 调用结果带 TTL 缓存（批次/价格变化慢，没必要反复问）；
 *  3. 任何异常（server 起不来 / 超时 / 协议错）都返回 null，调用方降级到 fixture，
 *     绝不因 MCP 拖垮 AI 主流程。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = join(__dirname, '../mcp/inventory-server.mjs')
const CALL_TIMEOUT_MS = 4000
const CACHE_TTL_MS = 5 * 60 * 1000

let child = null
let seq = 0
const pending = new Map()
const resultCache = new Map()
let initialized = false

function ensureServer() {
  if (child) return child
  child = spawn(process.execPath, [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...process.env, NO_PROXY: '*', no_proxy: '*' },
  })
  let buf = ''
  child.stdout.on('data', (chunk) => {
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
      const waiter = pending.get(msg.id)
      if (waiter) {
        pending.delete(msg.id)
        msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result)
      }
    }
  })
  child.on('exit', () => {
    child = null
    initialized = false
    pending.forEach((w) => w.reject(new Error('MCP server exited')))
    pending.clear()
  })
  child.on('error', () => {
    child = null
    initialized = false
  })
  return child
}

function rpc(method, params, timeoutMs = CALL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const srv = ensureServer()
    const id = ++seq
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`MCP timeout: ${method}`))
    }, timeoutMs)
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      reject: (e) => {
        clearTimeout(timer)
        reject(e)
      },
    })
    try {
      srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    } catch (e) {
      clearTimeout(timer)
      pending.delete(id)
      reject(e)
    }
  })
}

async function ensureInit() {
  if (initialized) return
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'store-c-server', version: '1.0.0' },
  })
  initialized = true
}

/**
 * 调用一个 MCP 工具，带 TTL 缓存与全链路降级。
 * @returns {Promise<object|null>} structuredContent，失败返回 null
 */
export async function callMcpTool(name, args) {
  const key = `${name}:${JSON.stringify(args)}`
  const hit = resultCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  try {
    await ensureInit()
    const res = await rpc('tools/call', { name, arguments: args })
    const value = res?.structuredContent ?? (res?.content?.[0]?.text ? { text: res.content[0].text } : null)
    if (value) resultCache.set(key, { at: Date.now(), value })
    return value
  } catch {
    return null
  }
}

/** MCP Server 健康状态（健康检查端点用） */
export async function mcpHealth() {
  try {
    await ensureInit()
    const res = await rpc('tools/list', {}, 3000)
    return { up: true, tools: (res?.tools ?? []).map((t) => t.name) }
  } catch (e) {
    return { up: false, error: e.message }
  }
}

/** 供 AI prompt 使用：一次性拉齐「进销存事实卡」 */
export async function fetchInventoryFacts(storeId, skuIds = []) {
  const facts = []
  for (const skuId of skuIds) {
    const [expiry, price, stock] = await Promise.all([
      callMcpTool('get_batch_expiry', { skuId }),
      callMcpTool('get_price_book', { skuId }),
      callMcpTool('get_store_inventory', { storeId, skuId }),
    ])
    if (expiry?.summary) {
      facts.push({
        skuId,
        nearExpiry: expiry.summary.nearExpiry,
        expired: expiry.summary.expired,
        fresh: expiry.summary.fresh,
        earliestExpire: expiry.rows?.[0]?.expireDate ?? null,
        daysToExpiry: expiry.rows?.[0]?.daysToExpiry ?? null,
      })
    }
    if (price) facts.push({ skuId, priceMismatch: !!price.mismatch, guidePrice: price.guidePrice, execPrice: price.execPrice })
    if (stock) facts.push({ skuId, onHand: stock.rows?.[0]?.onHand ?? null })
  }
  return facts
}

/** 关闭（测试用） */
export function closeMcp() {
  try {
    child?.kill()
  } catch {
    /* ignore */
  }
  child = null
  initialized = false
  pending.clear()
}
