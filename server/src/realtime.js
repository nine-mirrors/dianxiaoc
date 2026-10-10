/**
 * 跨角色实时推送（WebSocket）。
 *
 * 把 WebSocketServer 挂在已有 HTTP server 上（路径 /ws），让「经理下派任务 → 业代待办」
 * 从 fixture 模拟刷新变成真正的秒级推送。
 *
 * 设计要点：
 * - 优雅降级：任何客户端异常/断开都不影响 HTTP 主流程，broadcast 永不抛错；
 * - 心跳：30s 一次 ping，pong 超时（下一轮仍是 false）则 terminate，避免僵尸连接；
 * - 定向投递：payload.toRole 指定时只发给该角色的连接，缺省则广播给所有连接。
 */
import { WebSocketServer } from 'ws'
// A1：身份改由 token 裁定。auth.js 只 import db.js，这里再引 db.js 不会成环。
import { accountFromToken } from './auth.js'
import { findUserByRole } from './db.js'

/** 心跳间隔（ms） */
const HEARTBEAT_MS = 30000

/** @type {Set<import('ws').WebSocket>} */
const clients = new Set()
/** @type {import('ws').WebSocketServer | null} */
let wss = null
/** @type {NodeJS.Timeout | null} */
let heartbeatTimer = null

/**
 * 从连接 URL 的 query 里解析客户端身份。
 *
 * ⚠ A1 安全整改：`/ws` 不在 `/api/v1` 鉴权闸门下，原实现直接读 query 里
 *   **自报**的 `role`/`name` —— 任何人 `new WebSocket('ws://host/ws?role=manager')`
 *   就能连上并收全部 `task:new` / `diagnosis:new` / `ticket:new` / `rectification:new` 广播。
 *
 * 现在改为：**身份一律来自 token**（复用 auth.js 的 `accountFromToken`，
 * 它做 HMAC 验签 + 过期校验），query 里的 role/name **完全忽略**（防冒充）。
 * 浏览器 WebSocket API 不能自定义请求头，所以 token 只能走 query ——
 * 这与 SSE / `<img src>` 是同一套浏览器限制，不是鉴权绕过（token 本身仍需验签）。
 *
 * @param {string | undefined} url 形如 `/ws?token=<signed>&role=rep&name=李强`
 * @returns {{role: string, name: string, authorized: boolean}} authorized=false 表示应拒绝握手
 */
function parseMeta(url) {
  const raw = String(url ?? '')
  const qIndex = raw.indexOf('?')
  const qs = qIndex >= 0 ? new URLSearchParams(raw.slice(qIndex + 1)) : new URLSearchParams()
  // 复用 auth 的验签逻辑（token 无效/过期/被篡改 → null）
  const account = accountFromToken(qs.get('token'))
  if (!account) {
    // 未授权：role 用不可冒充的哨兵值，authorized=false 让调用方直接关连接
    return { role: 'guest', name: '', authorized: false }
  }
  const user = findUserByRole(account.role)
  return {
    role: String(account.role),
    // 姓名同样取自账号绑定的 user，而不是 query 自报
    name: user?.name ?? String(account.username),
    authorized: true,
  }
}

/**
 * 注册一个已连接的客户端（打身份标签 + 挂心跳标记）。
 *
 * @param {import('ws').WebSocket} ws  连接实例
 * @param {{role?: string, name?: string}} [meta] 身份（一般由 parseMeta 得到）
 */
export function registerClient(ws, meta = {}) {
  // 兜底：即使调用方漏判 authorized，也不让未授权连接进广播池
  if (meta.authorized === false) {
    try { ws.close(1008, '未授权') } catch { /* 已断开 */ }
    return
  }
  ws.meta = { role: meta.role || 'guest', name: meta.name || '' }
  ws.isAlive = true
  clients.add(ws)

  ws.on('pong', () => {
    ws.isAlive = true
  })
  ws.on('close', () => {
    clients.delete(ws)
  })
  ws.on('error', () => {
    // 单个连接出错只移除，不断进程
    clients.delete(ws)
  })
  ws.on('message', (buf) => {
    // 演示态：仅回一个轻量 ack（心跳），不解析业务指令
    const text = String(buf ?? '').slice(0, 200)
    try {
      ws.send(JSON.stringify({ event: 'ack', payload: { echo: text }, ts: Date.now() }))
    } catch {
      /* 写失败则等下一次心跳清理 */
    }
  })

  // 连上先打个招呼（前端据此确认「已连上」）
  try {
    ws.send(JSON.stringify({ event: 'hello', payload: ws.meta, ts: Date.now() }))
  } catch {
    /* 忽略 */
  }
}

/**
 * 广播一个事件给所有（可选定向）客户端。
 *
 * @param {string} event 事件名：task:new / diagnosis:new / ticket:new / chat:reply
 * @param {object} [payload] 事件体；带 toRole 时只投递给该角色
 */
export function broadcast(event, payload = {}) {
  if (!clients.size) return
  const { toRole, ...rest } = payload && typeof payload === 'object' ? payload : {}
  const frame = JSON.stringify({ event, payload: rest, ts: Date.now() })
  for (const ws of Array.from(clients)) {
    if (toRole && ws.meta?.role && ws.meta.role !== toRole) continue
    try {
      if (ws.readyState === 1) ws.send(frame)
    } catch {
      clients.delete(ws)
    }
  }
}

/** 心跳一轮：ping 全部；上一轮未回 pong 的判定为僵尸并断开 */
function sweep() {
  for (const ws of Array.from(clients)) {
    if (ws.isAlive === false) {
      clients.delete(ws)
      try {
        ws.terminate()
      } catch {
        /* 忽略 */
      }
      continue
    }
    ws.isAlive = false
    try {
      ws.ping()
    } catch {
      clients.delete(ws)
    }
  }
}

/**
 * 把实时推送挂到 HTTP server 上。
 *
 * @param {import('node:http').Server} server Express 底层 http server
 * @param {string} [path] WS 路径
 * @returns {import('ws').WebSocketServer}
 */
export function attachRealtime(server, path = '/ws') {
  if (wss) return wss
  wss = new WebSocketServer({ server, path })

  wss.on('connection', (ws, req) => {
    const meta = parseMeta(req?.url)
    if (!meta.authorized) {
      // 1008 = Policy Violation（策略违规）：未带有效 token，直接握手后立刻关闭
      try { ws.close(1008, '未授权') } catch { /* 已断开 */ }
      return
    }
    registerClient(ws, meta)
  })
  wss.on('error', (e) => {
    console.warn('[realtime] wss error:', e?.message ?? e)
  })

  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(sweep, HEARTBEAT_MS)
    // 不阻塞进程退出
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref()
  }
  return wss
}

/** 当前在线连接数（/health 或调试用） */
export function clientCount() {
  return clients.size
}

export default { attachRealtime, registerClient, broadcast, clientCount }
