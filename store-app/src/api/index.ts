/**
 * ★ API 契约层 —— 页面/组件的唯一数据入口（ARCHITECTURE 铁律 1）。
 *
 * 17 个方法的「签名 = 真实 REST 接口」：路径、请求体、响应体字段名与将来
 * Express 后端一致。Phase 2 接入真后端时，只改 client.ts 的分发开关，本文件与页面不动。
 *
 * ⚠ 页面严禁 import @/fixtures（分层验收硬性条款）。
 */
import { request, authHeaders } from './client'
import type {
  Role,
  User,
  RoleOption,
  Store,
  Visit,
  Task,
  Ticket,
  TaskType,
  TaskStatus,
  Diagnosis,
  ChatMessage,
  ChatReply,
  DashboardOverview,
  TodayRoute,
  CreateVisitPayload,
  CreateDiagnosisPayload,
  ChatPayload,
  CreateTicketPayload,
  CreateTaskPayload,
  CreateRectificationPayload,
  Rectification,
  TicketKind,
  TicketStatus,
  RestockItem,
  PlacementItem,
  ShootType,
} from '@/types'

/* ═══════════════ ①–② 会话与角色 ═══════════════ */

/**
 * ① GET /api/v1/meta/roles —— P1 三角色卡数据。
 */
export async function getRoles(): Promise<{ roles: RoleOption[] }> {
  return request<{ roles: RoleOption[] }>({ path: '/api/v1/meta/roles', method: 'GET' })
}

/* ═══════════════ ② 鉴权（账号密码 · 身份由后端账号决定） ═══════════════ */

/** 登录成功后服务端下发的会话信息 */
export interface AuthSession {
  token: string
  user: User
  /** 服务端裁定的落地页（前端不可自选角色） */
  role: Role
  home: string
  /** 该角色可访问的功能清单（用于登录页展示） */
  scope: string[]
}

/** 演示账号（由后端 `GET /api/v1/auth/demo-accounts` 下发，前端不硬编码凭证） */
export interface DemoAccount {
  username: string
  password: string
  role: Role
  person: string
  roleLabel: string
  scope: string[]
  home: string
}

/** ② GET /api/v1/auth/demo-accounts —— 取演示账号清单（登录页一键填入用） */
export async function fetchDemoAccounts(): Promise<DemoAccount[]> {
  const res = await request<{ accounts: DemoAccount[] }>({ path: '/api/v1/auth/demo-accounts' })
  return res.accounts ?? []
}

/** ② POST /api/v1/auth/login —— 账号密码登录，身份由账号决定 */
export async function loginWithAccount(
  username: string,
  password: string,
): Promise<AuthSession> {
  return request<AuthSession>({
    path: '/api/v1/auth/login',
    method: 'POST',
    body: { username, password },
  })
}

/** ② GET /api/v1/auth/me —— 刷新页面后用 token 恢复身份 */
export async function authMe(token: string): Promise<AuthSession> {
  return request<AuthSession>({ path: '/api/v1/auth/me', query: { token } })
}

/* ═══════════════ ③–④ 门店 ═══════════════ */

/**
 * ③ GET /api/v1/stores —— 门店列表。
 *
 * @param params repId 或 regionId
 */
export async function getStores(params: { repId?: string; regionId?: string } = {}): Promise<{ stores: Store[] }> {
  return request<{ stores: Store[] }>({ path: '/api/v1/stores', method: 'GET', query: params })
}

/**
 * ④ GET /api/v1/stores/:id —— 门店详情（P3 门店卡）。
 *
 * @param id 门店 id
 */
export async function getStore(id: string): Promise<{ store: Store }> {
  return request<{ store: Store }>({ path: `/api/v1/stores/${id}`, method: 'GET' })
}

/* ═══════════════ ⑤–⑧ 巡店 ═══════════════ */

/**
 * ⑤ GET /api/v1/visits/today —— P2 今日巡店首页（含经理下派的待办）。
 *
 * @param repId 业代 id
 */
export async function getTodayRoute(repId: string = 'U_REP'): Promise<TodayRoute> {
  return request<TodayRoute>({ path: '/api/v1/visits/today', method: 'GET', query: { repId } })
}

/**
 * ⑥ GET /api/v1/visits —— 巡店记录列表（Tab 3）。
 *
 * @param params storeId / limit
 */
export async function getVisits(params: { storeId?: string; limit?: number } = {}): Promise<{ visits: Visit[] }> {
  return request<{ visits: Visit[] }>({ path: '/api/v1/visits', method: 'GET', query: params })
}

/**
 * ⑦ GET /api/v1/visits/:id —— 巡店详情 + 诊断（P4 只读历史态）。
 *
 * @param id 巡店记录 id
 */
export async function getVisit(id: string): Promise<{ visit: Visit; diagnosis: Diagnosis }> {
  return request<{ visit: Visit; diagnosis: Diagnosis }>({ path: `/api/v1/visits/${id}`, method: 'GET' })
}

/**
 * ⑧ POST /api/v1/visits —— 完成巡店回写。
 *
 * @param payload 巡店数据
 */
export async function createVisit(payload: CreateVisitPayload): Promise<{ visit: Visit }> {
  return request<{ visit: Visit }>({ path: '/api/v1/visits', method: 'POST', body: payload })
}

/* ═══════════════ ⑨–⑩ 诊断 ═══════════════ */

/**
 * ⑨·前置 POST /api/v1/uploads —— 上传货架照片（base64）→ 后端落盘。
 * 返回 photoId 供 createDiagnosis 的 photoIds 引用，照片真正离开浏览器。
 *
 * @param data base64 数据（含 data:image/...;base64, 前缀）
 * @param filename 原文件名（取扩展名）
 */
export async function uploadPhoto(data: string, filename: string): Promise<{ photoId: string; url: string }> {
  return request<{ photoId: string; url: string }>({
    path: '/api/v1/uploads',
    method: 'POST',
    body: { data, filename },
  })
}

/**
 * ⑨ POST /api/v1/diagnoses —— ★ 拍照 → AI 诊断（含 steps[5] 分步动画数据）。
 *
 * @param payload 门店 + 照片 + 是否陌生照片
 */
export async function createDiagnosis(payload: CreateDiagnosisPayload): Promise<{ diagnosis: Diagnosis }> {
  return request<{ diagnosis: Diagnosis }>({
    path: '/api/v1/diagnoses',
    method: 'POST',
    body: payload,
  })
}

/**
 * ⑩ GET /api/v1/diagnoses/:id —— P4 渲染 / P5 查看。
 *
 * @param id 诊断 id
 */
export async function getDiagnosis(id: string): Promise<{ diagnosis: Diagnosis }> {
  return request<{ diagnosis: Diagnosis }>({ path: `/api/v1/diagnoses/${id}`, method: 'GET' })
}

/* ═══════════════ ⑪–⑫ AI 对话 ═══════════════ */

/**
 * ⑪ POST /api/v1/ai/chat —— ★ 多轮追问。
 *
 * @param payload 诊断 id + 用户消息 + 历史
 */
export async function postChat(payload: ChatPayload): Promise<ChatReply> {
  return request<ChatReply>({ path: '/api/v1/ai/chat', method: 'POST', body: payload })
}

/**
 * ⑫ GET /api/v1/ai/chat/suggestions —— 快捷问题 chips。
 *
 * @param diagnosisId 诊断 id
 */
export async function getChatSuggestions(diagnosisId: string): Promise<{ suggestions: string[] }> {
  return request<{ suggestions: string[] }>({
    path: '/api/v1/ai/chat/suggestions',
    method: 'GET',
    query: { diagnosisId },
  })
}

/* ═══════════════ ⑳ 补货算法推导（可解释，用于数字溯源） ═══════════════ */

/** 单 SKU 的算法推导结果 */
export interface ForecastLine {
  skuId: string | null
  skuName: string
  dailyForecast: number
  colDaily: number
  onHand: number
  sigma: number
  safetyStock: number
  targetStock: number
  suggestBottles: number
  fillRate: number
  forecastMode: string
  steps: string[]
}

export interface Forecast {
  params: Record<string, number>
  lines: ForecastLine[]
  compare: { skuId: string | null; skuName: string; algorithm: number; baseline: number; diff: number; diffPct: number | null }[]
  coverage: { computed: number; withBaseline: number; total: number; note: string }
  total: { algorithm: number; baseline: number; diff: number; diffPct: number | null }
  summary: string
}

/**
 * ⑳ GET /api/v1/forecast/:diagnosisId —— 补货算法推导。
 *
 * 把「补 N 瓶」背后的算式完整返回（Holt 平滑 → 单列日均 → 动态安全库存 z·σ·√L
 * → 目标库存 → 建议补货量），用于在页面上向用户/评委逐步展示推导过程。
 *
 * @param diagnosisId 诊断 id，如 D_S3
 */
export async function fetchForecast(diagnosisId: string): Promise<Forecast> {
  const res = await request<{ forecast: Forecast }>({ path: `/api/v1/forecast/${diagnosisId}` })
  return res.forecast
}

/**
 * ★ POST /api/v1/ai/generate —— AI 生成（Phase 2 赋能）。
 *
 * @param type 'summary' 巡店小结 / 'order' 订货建议理由 / 'owner' 店主口语 / 'pitch' 给店主话术
 * @param diagnosisId 诊断 id
 */
export async function generateAi(
  type: 'summary' | 'order' | 'owner' | 'pitch',
  diagnosisId: string,
): Promise<{ content: string; source?: string }> {
  return request<{ content: string; source?: string }>({
    path: '/api/v1/ai/generate',
    method: 'POST',
    body: { type, diagnosisId },
  })
}

/* ═══════════════ ⑬ 单据 ═══════════════ */

/**
 * ⑬ POST /api/v1/tickets —— 生成整改单 / 订货建议。
 *
 * @param payload 单据参数
 */
export async function createTicket(payload: CreateTicketPayload): Promise<{ ticket: Ticket }> {
  return request<{ ticket: Ticket }>({ path: '/api/v1/tickets', method: 'POST', body: payload })
}

/**
 * ⑬-b GET /api/v1/tickets —— 单据列表（订货三端打通）。
 *
 * 后端复用 createTicket 已写入的数据，默认按创建时间倒序。
 *
 * @param params storeId / kind('rectification'|'order') / limit
 */
export async function getTickets(
  params: { storeId?: string; kind?: TicketKind; status?: TicketStatus; limit?: number } = {},
): Promise<{ tickets: Ticket[] }> {
  return request<{ tickets: Ticket[] }>({ path: '/api/v1/tickets', method: 'GET', query: params })
}

/**
 * ★ PATCH /api/v1/tickets/:id —— 业代确认接单（订货闭环真落库）。
 *
 * 成功后后端会 `broadcast('ticket:status', {id,status})`。
 *
 * @param id 单据 id
 * @param status 目标状态，仅 'pending' | 'accepted'（非法值后端返 400）
 */
export async function updateTicketStatus(id: string, status: TicketStatus): Promise<{ ticket: Ticket }> {
  return request<{ ticket: Ticket }>({ path: `/api/v1/tickets/${id}`, method: 'PATCH', body: { status } })
}

/* ═══════════════ 整改回执（问题已处理 → 留证 → 后端算分） ═══════════════ */

/**
 * ★ POST /api/v1/rectifications —— 提交整改回执。
 *
 * 整改后健康分由**后端**按可解释规则计算并返回（含 derivation 说明），
 * 前端只负责展示，不自行计算。
 *
 * @param payload 诊断 id + 问题 + 严重度 + 整改后照片 + 备注
 */
export async function createRectification(payload: CreateRectificationPayload): Promise<{ rectification: Rectification }> {
  return request<{ rectification: Rectification }>({
    path: '/api/v1/rectifications',
    method: 'POST',
    body: payload,
  })
}

/**
 * GET /api/v1/rectifications —— 整改回执列表（默认最新在前）。
 *
 * @param params storeId / diagnosisId / limit
 */
export async function getRectifications(
  params: { storeId?: string; diagnosisId?: string; limit?: number } = {},
): Promise<{ rectifications: Rectification[] }> {
  return request<{ rectifications: Rectification[] }>({
    path: '/api/v1/rectifications',
    method: 'GET',
    query: params,
  })
}

/* ═══════════════ ⑭–⑯ 任务（跨角色闭环） ═══════════════ */

/**
 * ⑭ GET /api/v1/tasks —— 业代待办列表。
 *
 * @param assigneeId 负责人 id
 */
export async function getTasks(assigneeId: string): Promise<{ tasks: Task[] }> {
  return request<{ tasks: Task[] }>({ path: '/api/v1/tasks', method: 'GET', query: { assigneeId } })
}

/**
 * ⑮ POST /api/v1/tasks —— ★ 经理下派任务。
 *
 * @param payload 下派参数
 */
export async function createTask(payload: CreateTaskPayload): Promise<{ task: Task }> {
  return request<{ task: Task }>({ path: '/api/v1/tasks', method: 'POST', body: payload })
}

/**
 * ⑯ PATCH /api/v1/tasks/:id —— 标记已处理。
 *
 * @param id 任务 id
 * @param status 目标状态
 */
export async function updateTaskStatus(id: string, status: TaskStatus): Promise<{ task: Task }> {
  return request<{ task: Task }>({ path: `/api/v1/tasks/${id}`, method: 'PATCH', body: { status } })
}

/* ═══════════════ ⑰ 看板 ═══════════════ */

/**
 * ⑰ GET /api/v1/dashboard/overview —— P5 区域经理看板一次性取全量。
 *
 * @param regionId 区域 id
 */
export async function getDashboardOverview(regionId: string = 'R_EAST'): Promise<{ overview: DashboardOverview }> {
  return request<{ overview: DashboardOverview }>({
    path: '/api/v1/dashboard/overview',
    method: 'GET',
    query: { regionId },
  })
}

/* ═══════════════ 演示辅助（非 REST 契约） ═══════════════ */

/**
 * 重置演示数据（清除 localStorage 中经理下派任务等增量）。
 * 仅供演示设置齿轮调用，不属于 Phase 2 契约。
 */
export async function resetDemoData(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>({ path: '/api/v1/demo/reset', method: 'POST' })
}

/** 重新导出常用类型，避免页面再从 types 二次 import */
export type { ChatMessage, CreateTaskPayload, TaskType, RestockItem, ShootType }
/** 重新导出 API 模式，供组件判断走 SSE 还是离线打字机 */

/* ═══════════════ AI 流式（SSE） ═══════════════ */

/**
 * SSE 流的执行结果（A1：把「内容从哪来」如实透出）。
 *
 * ⚠ 为什么要带 source：降级路径（无 LLM key / 上游失败）**也会发 delta 帧**，
 *   如果只看「有没有收到增量」就标「AI 生成」，答辩时会被戳穿。
 *   source 由后端在 done 帧给出（llm / fallback），前端据此决定角标文案。
 */
export interface SseResult {
  /** 是否真的收到过增量帧（网络层是否成功） */
  ok: boolean
  /** 内容来源：llm=真大模型 / fallback=本地规则兜底 / null=未拿到（网络失败） */
  source: 'llm' | 'fallback' | null
}

/** 构造失败结果（网络不可达 / 非流式响应） */
function sseFail(): SseResult {
  return { ok: false, source: null }
}

/**
 * 通用 SSE 读取：手动解析 ReadableStream 里的 text/event-stream。
 *
 * 帧格式：`data: {json}\n\n`（多帧），结束帧 `data: {"done":true,"source":...}`。
 * 逐帧取出 `data:` 行 JSON.parse，命中 `delta` 就回调；命中 `done` 即结束并取回 source。
 *
 * @param path    SSE 端点（不含 base）
 * @param body    请求体
 * @param onDelta 每收到一段增量文本回调（增量，不是全量）
 * @param signal  可中断信号
 * @returns 执行结果（ok + source）
 */
async function streamSse(
  path: string,
  body: unknown,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<SseResult> {
  const base = import.meta.env.VITE_API_BASE || ''
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      // ★ SSE 端点同样要鉴权（后端 sseGuard 会校验）
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    // 网络不可达（后端未启动 / 断网）→ 交给调用方降级
    return sseFail()
  }
  if (!res.ok || !res.body) return sseFail()

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let delivered = false
  // ★ source 由后端在 done 帧给出；中途也可能先收到，先记着
  let source: SseResult['source'] = null
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      for (const frame of parts) {
        const line = frame.trim()
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const j = JSON.parse(data)
          if (j.source === 'llm' || j.source === 'fallback') source = j.source
          if (typeof j.delta === 'string' && j.delta) {
            delivered = true
            onDelta(j.delta)
          } else if (j.done) {
            return { ok: delivered, source }
          }
        } catch {
          /* 跳过无法解析的碎片帧 */
        }
      }
    }
  } catch {
    /* 读取中断（客户端 abort）→ 已交付部分即视为成功 */
  }
  return { ok: delivered, source }
}

/**
 * ★ POST /api/v1/ai/chat/stream —— 多轮追问的 SSE 流式版本。
 *
 * @param payload 诊断 id + 用户消息 + 历史（同 postChat）
 * @param onDelta 增量文本回调
 * @param signal  可中断信号
 * @returns 执行结果（ok + source，供调用方决定是否标「AI」）
 */
export async function streamChat(
  payload: ChatPayload,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<SseResult> {
  return streamSse('/api/v1/ai/chat/stream', payload, onDelta, signal)
}

/**
 * ★ POST /api/v1/ai/generate/stream —— AI 生成（巡店小结 / 订货建议理由 / 店主口语 / 话术）的 SSE 流式版本。
 *
 * @param type 'summary' 巡店小结 / 'order' 订货建议理由 / 'owner' 店主口语 / 'pitch' 话术
 * @param diagnosisId 诊断 id
 * @param onDelta 增量文本回调
 * @param signal  可中断信号
 * @returns 执行结果（ok + source；**只有 source==='llm' 才配标「AI」**）
 */
export async function streamGenerate(
  type: 'summary' | 'order' | 'owner' | 'pitch',
  diagnosisId: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<SseResult> {
  return streamSse('/api/v1/ai/generate/stream', { type, diagnosisId }, onDelta, signal)
}
