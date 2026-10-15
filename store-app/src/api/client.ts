/**
 * 契约客户端（ARCHITECTURE 铁律 1 / T02.3）。
 *
 * 职责：
 *  1. 统一响应信封 `{ code, message, data }`；
 *  2. code !== 0 → 抛统一业务错误（由 useApi 吞掉并 Toast 友好文案，绝不原生报错）；
 *  3. **唯一数据通路 = 真实后端**（2026-10-09 起移除 mock 与离线兜底）。
 *
 * ⚠ 页面组件只允许 import @/api，永不 import @/fixtures。
 */
import type { ApiEnvelope } from '@/types'
// ⚠ 必须「先 import 再 re-export」：只写 `export { ApiError } from './error'` 是再导出，
//   不会把 ApiError 带进本模块作用域，导致下方 httpRequest 里的 `new ApiError(...)` 报
//   TS2304（vite/esbuild 不做类型检查，所以此前一直没暴露）。
import { ApiError } from './error'
export { ApiError }

/** HTTP 方法（PUT 供管理员端账号/SKU 规则/知识库整条更新使用） */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** 请求选项 */
export interface RequestOptions {
  path: string
  method?: HttpMethod
  body?: unknown
  query?: Record<string, string | number | undefined>
}

/** 速度倍率（仅影响前端动画，不影响真实请求） */
export const SPEED: number = Math.max(1, Number(import.meta.env.VITE_DEMO_SPEED) || 1)

/**
 * 把 query 拼到路径上。
 *
 * @param path 原始路径
 * @param query 查询参数
 */
function withQuery(path: string, query?: Record<string, string | number | undefined>): string {
  if (!query) return path
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return parts.length ? `${path}?${parts.join('&')}` : path
}

/** 统一 Promise 睡眠 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** 会话在 localStorage 里的 key（与 stores/session.ts 保持一致） */
const SESSION_KEY = 'store-app:session'

/**
 * 读取当前会话 token。
 *
 * ⚠ 这里**直接读 localStorage**而不是 import session store：
 *   session store 依赖 @/api（它调 login/restore），若 client 反向 import store
 *   会形成循环依赖。token 本来就是持久化在 localStorage 的，直接读最简单也最稳。
 *
 * @returns token 字符串；未登录返回空串
 */
export function authToken(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { token?: string }
    return String(parsed?.token ?? '')
  } catch {
    // 隐私模式 / JSON 损坏时按未登录处理
    return ''
  }
}

/** 构造带鉴权头的请求头（无 token 时不带 Authorization） */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extra ?? {}) }
  const token = authToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * ★ 统一请求入口 —— 只走真实后端。
 *
 * ⚠ 2026-10-09 起**移除全部 mock 兜底**：演示必须连真后端（真 LLM / 真 CV / 真 DB），
 * 后端不可用时如实抛错并广播 `api:offline`，由界面显示「后端未连接」错误态，
 * 而不是偷偷换成假数据糊过去。
 */
export async function request<T>(options: RequestOptions): Promise<T> {
  const { path, method = 'GET', body, query } = options
  const fullPath = withQuery(path, query)
  return httpRequest<T>(fullPath, method, body)
}

/** 真实 HTTP 实现（唯一数据通路） */
async function httpRequest<T>(fullPath: string, method: HttpMethod, body?: unknown): Promise<T> {
  const base = import.meta.env.VITE_API_BASE || ''
  let res: Response
  try {
    res = await fetch(`${base}${fullPath}`, {
      method,
      // ★ 带上会话 token：后端 T1 整改后所有 /api/v1/*（白名单除外）都要求 Authorization
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // 后端未启动 / 断网：如实报错，不降级
    // eslint-disable-next-line no-console
    console.error('[api] 后端不可用：', fullPath)
    window.dispatchEvent(new CustomEvent('api:offline'))
    throw new ApiError(-1, '后端未连接，请确认服务已启动（npm start）')
  }
  // 后端可达：广播 api:online，界面自动收起「后端未连接」提示条
  window.dispatchEvent(new CustomEvent('api:online'))
  // 后端可达：业务错误照常抛出
  const envelope = (await res.json()) as ApiEnvelope<T>
  if (envelope.code !== 0) throw new ApiError(envelope.code, envelope.message)
  return envelope.data
}

export default request
