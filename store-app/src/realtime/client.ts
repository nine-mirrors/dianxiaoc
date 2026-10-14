/**
 * 跨角色实时推送客户端（WebSocket）。
 *
 * 目标：让「经理下派任务 → 业代待办」从 fixture 模拟刷新变成秒级真推送。
 *
 * ★ 优雅降级铁律：连不上就静默退避重试，**绝不抛错、绝不白屏**。
 *   页面照常走原有接口/fixture 逻辑；重连期间只是「暂时收不到推送」。
 */

/** 服务端事件名（与 server/src/realtime.js 对齐） */
export type RealtimeEvent =
  | 'hello'
  | 'ack'
  | 'task:new'
  | 'diagnosis:new'
  | 'ticket:new'
  | 'chat:reply'

export interface RealtimeFrame<T = any> {
  event: RealtimeEvent | string
  payload: T
  ts: number
}

/** 事件回调 */
export type RealtimeHandler<T = any> = (payload: T, frame: RealtimeFrame<T>) => void

interface HandlerEntry {
  fn: RealtimeHandler
  once: boolean
}

/** 订阅表：event → handlers[] */
const registry = new Map<string, HandlerEntry[]>()

let socket: WebSocket | null = null
/** 当前连接身份（重连时复用） */
let currentMeta: { role: string; name: string } | null = null
/** 重连尝试次数（指数退避） */
let retryCount = 0
/** 重连定时器 */
let retryTimer: number | null = null
/** 是否由业务显式关闭（关闭后不再自动重连） */
let manualClose = false

/** 退避基数（ms）：2s 起，指数增长，封顶 10s */
const BACKOFF_BASE = 2000
const BACKOFF_MAX = 10000

/**
 * 推导 WS 地址：优先 VITE_WS_BASE，否则把 VITE_API_BASE 的 http(s) 换成 ws(s)
 *
 * ★ A1：会附带 `?token=<signed>`。后端 `/ws` 现在做**握手鉴权**
 *   （身份一律取自 token，query 里的 role/name 已被忽略），
 *   所以这里必须带上会话 token，否则后端会以 1008「未授权」关闭连接。
 *   浏览器 WebSocket API 不能自定义请求头，只能走 query —— token 本身仍需 HMAC 验签。
 */
export function resolveWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_BASE
  const base = explicit
    ? String(explicit).replace(/\/$/, '')
    : (() => {
        const b = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
        if (b) return b.replace(/^http/, 'ws')
        // ★ 生产同域部署（VITE_API_BASE 为空）：从当前页面地址推导 wss/ws，
        //   绝不能回退到写死的 127.0.0.1（评委在公网域名上会连不上实时推送）。
        const origin = typeof window !== 'undefined' && window.location
          ? window.location.origin
          : 'http://127.0.0.1:3000'
        return origin.replace(/^http/, 'ws')
      })()
  const token = sessionToken()
  const qs = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${base}/ws${qs}`
}

/**
 * 读取会话 token（与 stores/session.ts 共用 localStorage 键）。
 * 这里直接读 localStorage 而不 import session store：store 依赖 @/api，
 * 反向 import 会形成循环依赖（与 api/client.ts 的 authToken 同一理由）。
 */
function sessionToken(): string {
  try {
    const raw = localStorage.getItem('store-app:session')
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { token?: string }
    return String(parsed?.token ?? '')
  } catch {
    // 隐私模式 / JSON 损坏时按未登录处理
    return ''
  }
}

/** 计算第 n 次重连的等待时长（2s → 4s → 8s → 10s 封顶） */
function backoffMs(n: number): number {
  return Math.min(BACKOFF_BASE * 2 ** Math.max(0, n - 1), BACKOFF_MAX)
}

/** 清理重连定时器 */
function clearRetry(): void {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer)
    retryTimer = null
  }
}

/** 实际建立连接 */
function open(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  // ★ A1：身份由 token 决定（后端忽略 role/name），这里不再往 URL 里塞自报身份。
  //   resolveWsUrl() 已把 session token 拼进 query。
  const url = resolveWsUrl()

  let ws: WebSocket
  try {
    ws = new WebSocket(url)
  } catch {
    scheduleRetry()
    return
  }
  socket = ws

  ws.onopen = () => {
    retryCount = 0
    clearRetry()
  }

  ws.onmessage = (ev) => {
    let frame: RealtimeFrame
    try {
      frame = JSON.parse(String(ev.data))
    } catch {
      return
    }
    if (!frame || typeof frame.event !== 'string') return
    dispatch(frame.event, frame)
  }

  ws.onerror = () => {
    // 交由 onclose 统一走重连；此处不抛错，避免打断演示
  }

  ws.onclose = () => {
    if (socket === ws) socket = null
    if (!manualClose) scheduleRetry()
  }
}

/** 安排下一次重连（指数退避，持续尝试不放弃） */
function scheduleRetry(): void {
  if (manualClose) return
  clearRetry()
  retryCount += 1
  const wait = backoffMs(retryCount)
  retryTimer = window.setTimeout(() => {
    retryTimer = null
    open()
  }, wait)
}

/**
 * 分发事件给所有订阅者（复制一份数组，允许回调内退订）。
 *
 * @param event 事件名
 * @param frame 完整帧
 */
function dispatch(event: string, frame: RealtimeFrame): void {
  const list = registry.get(event)
  if (!list || !list.length) return
  for (const entry of list.slice()) {
    try {
      entry.fn(frame.payload, frame)
    } catch {
      // 单个订阅者异常不影响其他订阅者（绝不因推送崩页面）
    }
    if (entry.once) offRealtime(event, entry.fn)
  }
}

/**
 * 连接实时推送（幂等；重复调用只会更新身份）。
 *
 * @param role 角色：rep / manager / owner
 * @param name 用户名（用于对端识别）
 */
export function connectRealtime(role: string, name: string): void {
  currentMeta = { role, name }
  manualClose = false
  retryCount = 0
  // mock 离线模式：明确不连，也不起重连
  // 已有可用连接则只更新身份（下次广播由服务端按连接标签投递）
  if (socket && socket.readyState === WebSocket.OPEN) return
  clearRetry()
  open()
}

/**
 * 订阅事件。
 *
 * @param event 事件名
 * @param handler 回调
 * @param once 是否只触发一次
 * @returns 退订函数
 */
export function onRealtime<T = any>(
  event: RealtimeEvent | string,
  handler: RealtimeHandler<T>,
  once = false,
): () => void {
  const key = String(event)
  const entry: HandlerEntry = { fn: handler as RealtimeHandler, once }
  if (!registry.has(key)) registry.set(key, [])
  registry.get(key)!.push(entry)
  return () => offRealtime(key, handler as RealtimeHandler)
}

/**
 * 退订事件。
 *
 * @param event 事件名
 * @param handler 之前传入的同一函数引用
 */
export function offRealtime(event: RealtimeEvent | string, handler: RealtimeHandler): void {
  const list = registry.get(String(event))
  if (!list) return
  const i = list.findIndex((e) => e.fn === handler)
  if (i >= 0) list.splice(i, 1)
  if (!list.length) registry.delete(String(event))
}

/**
 * 断开并停止自动重连（登出时调用）。
 *
 * 退订信息保留，便于下次 connectRealtime 立即复用既有订阅。
 */
export function disconnectRealtime(): void {
  manualClose = true
  clearRetry()
  retryCount = 0
  const ws = socket
  socket = null
  if (ws) {
    try {
      ws.onclose = null
      ws.close()
    } catch {
      /* 已关闭则忽略 */
    }
  }
}

/** 当前是否已连上（调试/演示指示灯用） */
export function isRealtimeConnected(): boolean {
  return !!socket && socket.readyState === WebSocket.OPEN
}

export default { connectRealtime, disconnectRealtime, onRealtime, offRealtime, isRealtimeConnected, resolveWsUrl }
