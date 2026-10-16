/**
 * ★ 经理端（W3）专用契约层 —— ai-insights / knowledge / performance / 单店画像 / 导出 / 黑名单。
 *
 * 设计原则（与 @/api/index.ts 一致，但**不修改 index.ts**）：
 *  - 页面只允许从 @/api/* 取数（铁律 1），本文件是经理端页面的唯一后端入口；
 *  - 普通接口走 `request<T>({ path, method, body, query })`，失败抛 ApiError；
 *  - SSE 流式接口在**本文件内**自写 fetch + ReadableStream 解析（复用 index.ts 的帧协议
 *    思路，但不改动 index.ts）：帧格式 `data: {"delta":"..."}` … `data: {"done":true,"source":"llm|fallback"}`；
 *  - 导出接口返回裸 CSV，**不能**用 `request()`（它会 json() 解析），改用 authHeaders() + blob 下载；
 *  - 界面必须如实标注来源：只有 source === 'llm' 才显示「AI 生成」。
 */
import { request, authHeaders, ApiError } from './client'
import type { SseResult } from './index'
import type { Store } from '@/types'

/* ═══════════════ SSE 流式（本地实现，不改 index.ts） ═══════════════ */

/**
 * 通用 SSE 读取：手动解析 text/event-stream 的增量帧与结束帧。
 *
 * @param path    SSE 端点（不含 base）
 * @param body    请求体
 * @param onDelta 每收到一段增量文本回调（增量）
 * @param signal  可中断信号
 * @returns { ok, source }；source 由后端在 done 帧给出（llm=真大模型 / fallback=规则兜底）
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
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    return { ok: false, source: null }
  }
  if (!res.ok || !res.body) return { ok: false, source: null }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let delivered = false
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
          const j = JSON.parse(data) as { delta?: string; done?: boolean; source?: string }
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
    /* 客户端 abort → 已交付部分视为成功 */
  }
  return { ok: delivered, source }
}

/* ═══════════════ ① AI 经营洞察（/ai-insights，manager/admin） ═══════════════ */

/** AI 问答历史消息（仅前端用于组装 context，后端只收 question 文本） */
export interface AskTurn {
  role: 'user' | 'ai'
  text: string
}

/**
 * POST /ai-insights/ask —— ChatBI 经营问答（SSE 真流式）。
 *
 * @param question 用户问题
 * @param opts.region 区域 id 或中文名（可空，后端回退账号区域）
 * @param opts.context 附加上下文（最多 300 字，后端截断）
 */
export async function streamAiAsk(
  question: string,
  onDelta: (text: string) => void,
  opts: { region?: string; context?: string; signal?: AbortSignal } = {},
): Promise<SseResult> {
  return streamSse(
    '/api/v1/ai-insights/ask',
    { question, region: opts.region, context: opts.context },
    onDelta,
    opts.signal,
  )
}

/** GET /ai-insights/suggestions —— 经理高频问题 chips（固定 6 个） */
export async function getAskSuggestions(): Promise<string[]> {
  const res = await request<{ suggestions: string[] }>({
    path: '/api/v1/ai-insights/suggestions',
    method: 'GET',
  })
  return res.suggestions ?? []
}

/**
 * POST /ai-insights/weekly-report —— AI 周报（SSE 真流式）。
 *
 * @param onDelta 增量文本回调
 * @param region  区域 id 或中文名（可空）
 */
export async function streamWeeklyReport(
  onDelta: (text: string) => void,
  opts: { region?: string; signal?: AbortSignal } = {},
): Promise<SseResult> {
  return streamSse('/api/v1/ai-insights/weekly-report', { region: opts.region }, onDelta, opts.signal)
}

/* ═══════════════ ② 知识库（/knowledge，登录即可） ═══════════════ */

/** 知识条目 */
export interface KnowledgeItem {
  id: string
  category: string
  question: string
  answer: string
  tags: string[]
  status: string
  updatedAt: string
}

/**
 * POST /knowledge/ask —— 知识库问答（SSE 真流式，经理端可复用）。
 */
export async function streamKnowledgeAsk(
  question: string,
  onDelta: (text: string) => void,
  opts: { role?: string; signal?: AbortSignal } = {},
): Promise<SseResult> {
  return streamSse('/api/v1/knowledge/ask', { question, role: opts.role }, onDelta, opts.signal)
}

/** GET /knowledge/list —— active 知识条目分页 */
export async function listKnowledge(
  params: { page?: number; pageSize?: number; category?: string; q?: string } = {},
): Promise<{ items: KnowledgeItem[]; total: number; page: number; pageSize: number }> {
  return request<{ items: KnowledgeItem[]; total: number; page: number; pageSize: number }>({
    path: '/api/v1/knowledge/list',
    method: 'GET',
    query: params,
  })
}

/** GET /knowledge/categories —— 分类去重列表 */
export async function getKnowledgeCategories(): Promise<string[]> {
  const res = await request<{ categories: string[] }>({
    path: '/api/v1/knowledge/categories',
    method: 'GET',
  })
  return res.categories ?? []
}

/* ═══════════════ ③ 绩效（/performance，manager/admin） ═══════════════ */

/** 排行榜单行业代（字段与 server/src/routes/performance.js buildLeaderboard() 一一对应） */
export interface LeaderboardRow {
  rank: number
  repId: string
  name: string
  regionId: string | null
  visits: number
  avgScore: number
  rectifications: number
  orders: number
  orderAmount: number
  redLightConversions: number
  convertedStores: string[]
  score: number
  scoreBreakdown: {
    visitLoad: number
    visitQuality: number
    rectification: number
    redConversion: number
  }
}

/** GET /performance/leaderboard —— 业代排行榜 + 算分口径 */
export async function getLeaderboard(): Promise<{ list: LeaderboardRow[]; method: string }> {
  return request<{ list: LeaderboardRow[]; method: string }>({
    path: '/api/v1/performance/leaderboard',
    method: 'GET',
  })
}

/** AI 价值指标（每个都带 method 溯源文案，UI 必须可展开查看） */
export interface ValueMetric {
  /** 数值；aiAdoption 可能为 null（无分母时不伪造） */
  value: number | null
  unit: string
  /** 口径说明（数字可追溯） */
  method: string
}

export interface AiValue {
  recoveredSales: ValueMetric
  avoidedOosBottles: ValueMetric
  avoidedOosAmount: ValueMetric
  avgHealthLift: ValueMetric
  aiCalls: ValueMetric
  aiAdoption: ValueMetric
}

/** GET /performance/ai-value —— AI 价值看板数据 */
export async function getAiValue(): Promise<AiValue> {
  return request<AiValue>({ path: '/api/v1/performance/ai-value', method: 'GET' })
}

/* ═══════════════ ④ 单店深度画像（/api/v1/stores/:id/profile） ═══════════════ */

export interface StoreProfile {
  store: Store
  health: {
    score: number | null
    level: string | null
    delta: number
    /** 分数来源：六维加权（诊断）/ store-fixture（lastScore 兜底） */
    source: string
  }
  healthTrend: { week: string; score: number }[]
  dimensions: { key: string; label: string; score: number; level: string }[]
  visits: {
    id: string
    visitNo: number | null
    visitedAt: string
    score: number | null
    status: string
    repId: string | null
    photoIds: string[]
  }[]
  tasksSummary: { total: number; open: number; done: number }
  openTasks: number
  ticketsSummary: {
    count: number
    totalAmount: number
    acceptedCount: number
    rectificationTicketCount: number
  }
  issueTypes: {
    type: string
    count: number
    severity: string
    severityCount: { severe: number; medium: number; low: number }
  }[]
  hasDiagnosis: boolean
  dataHonest: boolean
}

/** GET /stores/:id/profile —— 单店 AI 体检报告 */
export async function getStoreProfile(storeId: string): Promise<StoreProfile> {
  return request<StoreProfile>({ path: `/api/v1/stores/${storeId}/profile`, method: 'GET' })
}

/** 结构化归因底稿（/stores/:id/profile/attribution，manager/admin） */
export interface StoreAttribution {
  storeId: string
  storeName: string
  generatedAt: string
  diagnosisKey: string | null
  healthTrend: { week: string; score: number }[]
  turningPoints: { fromWeek: string; toWeek: string; delta: number; direction: string }[]
  topIssues: {
    id: string
    title: string
    severity: string
    location: string
    impact: string
    actions: string[]
    impactBottlesPerDay: number | null
    impactWeight: number
    weightSource: string
  }[]
  stockFacts: {
    weeklyBottles: number
    weeklyAmount: number
    monthlyBottles: number
    monthlyAmount: number
    riskItems: unknown[]
    restockPlan: { coverDays: number | null; totalBottles: number; totalAmount: number; items: unknown[] }
    forecastLines: { skuId: string | null; skuName: string; dailyForecast: number; safetyStock: number; suggestBottles: number; fillRate: number }[]
    latestInventory: { createdAt: string; count: number; items: unknown[] } | null
  } | null
  dataHonest: boolean
}

/** GET /stores/:id/profile/attribution —— AI 归因结构化底稿（纯数据，不调模型） */
export async function getStoreAttribution(storeId: string): Promise<StoreAttribution> {
  return request<StoreAttribution>({
    path: `/api/v1/stores/${storeId}/profile/attribution`,
    method: 'GET',
  })
}

/* ═══════════════ ⑤ CSV 导出（manager/admin，裸 CSV，走 blob 下载） ═══════════════ */

/**
 * 通用 CSV 下载：直接用 authHeaders() fetch → blob → <a download>。
 * ⚠ 不能用 request()：后端直接 res.send(csv)，不是 { code, data } 信封。
 *
 * @param path     完整导出路径，如 '/api/v1/export/stores.csv'
 * @param filename 下载文件名
 */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const base = import.meta.env.VITE_API_BASE || ''
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { headers: authHeaders() })
  } catch {
    throw new ApiError(-1, '导出失败：后端未连接，请确认服务已启动')
  }
  if (!res.ok) throw new ApiError(res.status, `导出失败（HTTP ${res.status}）`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 释放 objectURL（下载已触发，延迟释放避免部分浏览器中断）
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 导出门店明细 CSV（含区域/健康分/档位/缺货率/铺货率） */
export async function exportStoresCsv(): Promise<void> {
  return downloadCsv('/api/v1/export/stores.csv', 'stores.csv')
}

/**
 * 导出指定区域的门店健康分明细 CSV（经理端「区域门店健康分明细」）。
 *
 * @param regionId 区域 id（如 R_EAST）；传空则导出全量（等价 exportStoresCsv）
 * @param filename 下载文件名（由调用方带上日期与区域名，如「区域门店健康分明细_城东片区_2026-10-02.csv」）
 */
export async function exportRegionStoresCsv(regionId: string, filename: string): Promise<void> {
  const q = regionId ? `?regionId=${encodeURIComponent(regionId)}` : ''
  return downloadCsv(`/api/v1/export/stores.csv${q}`, filename)
}

/**
 * 导出当前登录业代的巡店记录 / 健康分明细 CSV（业代端自查）。
 *
 * @param filename 下载文件名（由调用方带上日期，如「我的巡店记录_全部_2026-10-02.csv」）
 */
export async function exportVisitsCsv(filename: string): Promise<void> {
  return downloadCsv('/api/v1/export/visits.csv', filename)
}

/** 导出业代排行榜 CSV */
export async function exportLeaderboardCsv(): Promise<void> {
  return downloadCsv('/api/v1/export/leaderboard.csv', 'leaderboard.csv')
}

/* ═══════════════ ⑥ 黑名单管理（挂在 /admin 前缀，经理账号可访问） ═══════════════ */

/** 黑名单条目（ext_blacklist 表，camelCase） */
export interface BlacklistItem {
  id: string
  type: 'store' | 'sku'
  targetId: string
  targetName: string
  reason: string
  level: 'high' | 'mid' | 'low'
  status: 'active' | 'revoked'
  createdAt: string
  createdBy: string
}

/** 新增/编辑黑名单的入参 */
export interface BlacklistPayload {
  type: 'store' | 'sku'
  targetId: string
  targetName: string
  reason: string
  level: 'high' | 'mid' | 'low'
  status?: 'active' | 'revoked'
}

/**
 * GET /admin/blacklist —— 黑名单分页列表。
 * ⚠ 该接口挂在 /admin 前缀下（后端对经理账号 guard 宽松），命名以 admin 前缀区分来源。
 */
export async function adminListBlacklist(
  params: { page?: number; pageSize?: number; type?: string; level?: string; status?: string } = {},
): Promise<{ items: BlacklistItem[]; total: number; page: number; pageSize: number }> {
  return request<{ items: BlacklistItem[]; total: number; page: number; pageSize: number }>({
    path: '/api/v1/admin/blacklist',
    method: 'GET',
    query: params,
  })
}

/** POST /admin/blacklist —— 新增黑名单条目 */
export async function adminCreateBlacklist(payload: BlacklistPayload): Promise<BlacklistItem> {
  const res = await request<{ item: BlacklistItem }>({
    path: '/api/v1/admin/blacklist',
    method: 'POST',
    body: payload,
  })
  return res.item
}

/** PUT /admin/blacklist/:id —— 整条更新（后端要求 type/level/status 均合法枚举） */
export async function adminUpdateBlacklist(id: string, payload: BlacklistPayload): Promise<BlacklistItem> {
  const res = await request<{ item: BlacklistItem }>({
    path: `/api/v1/admin/blacklist/${id}`,
    method: 'PUT',
    body: payload,
  })
  return res.item
}

/** POST /admin/blacklist/:id/toggle —— 启用/停用（body.status 可显式指定，否则 active↔revoked 对切） */
export async function adminToggleBlacklist(
  id: string,
  status?: 'active' | 'revoked',
): Promise<{ id: string; status: 'active' | 'revoked' }> {
  return request<{ id: string; status: 'active' | 'revoked' }>({
    path: `/api/v1/admin/blacklist/${id}/toggle`,
    method: 'POST',
    body: { status },
  })
}
