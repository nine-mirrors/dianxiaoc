/**
 * ★ 店主端（W6）契约层 —— 单店画像 / 知识库 / 补货算法，店主端页面的唯一后端入口。
 *
 * 设计原则（与 @/api/index.ts、@/api/insights.ts 一致，但**不修改任何既有文件**）：
 *  - 页面只允许从 @/api/* 取数（铁律 1），本文件即店主端页面的唯一数据入口；
 *  - 通用接口走 `request<T>({ path, method, body, query })`，失败抛 ApiError；
 *  - 知识库问答为 SSE 流式，在**本文件内**自写 fetch + ReadableStream 解析（不改 index.ts）；
 *  - 界面必须如实标注来源：只有 source === 'llm' 才显示「AI 生成」。
 */
import { request, authHeaders } from './client'
import type { SseResult } from './index'
import type { Store } from '@/types'

/* ═══════════════ 复用既有契约（只 re-export，不改 index.ts） ═══════════════ */

export {
  getStores,
  getStore,
  getVisits,
  getVisit,
  fetchForecast,
  getTickets,
  createTicket,
  streamGenerate,
} from './index'
export type { Forecast, ForecastLine } from './index'
export type { SseResult } from './index'

/* ═══════════════ ① 单店画像（GET /stores/:id/profile，登录即可） ═══════════════ */

/** 单店画像（字段与 server/src/routes/store-insights.js 的返回一一对应） */
export interface StoreProfile {
  store: Store
  health: {
    score: number | null
    level: string | null
    delta: number
    /** 分数来源：诊断六维加权 / 门店档案 lastScore 兜底 */
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

/**
 * GET /stores/:id/profile —— 单店画像（店主端「经营报告」页数据源）。
 */
export async function getStoreProfile(storeId: string): Promise<StoreProfile> {
  return request<StoreProfile>({ path: `/api/v1/stores/${storeId}/profile`, method: 'GET' })
}

/**
 * 解析当前登录店主的门店：按门店档案的 ownerName 与登录账号姓名匹配。
 *
 * 后端账号（U_OWNER）不含 storeId，门店归属由门店档案 ownerName 表达；
 * 匹配不到时返回 null（页面据此显示「未找到你的门店」空态，绝不硬编码门店）。
 */
export async function resolveOwnerStore(userName?: string): Promise<Store | null> {
  const name = (userName ?? '').trim()
  if (!name) return null
  const { stores } = await request<{ stores: Store[] }>({ path: '/api/v1/stores', method: 'GET' })
  return (stores ?? []).find((s) => s.ownerName === name) ?? null
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

/** GET /knowledge/list —— active 知识条目分页（支持分类 / 关键词） */
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

/** 通用 SSE 读取（本地实现，不改 index.ts）：解析 `data:{delta}` … `data:{done,source}` */
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

/**
 * POST /knowledge/ask —— 知识库问答（SSE 真流式）。
 *
 * @param question 用户问题
 * @param onDelta  增量文本回调
 * @param opts.role 'owner' 让后端按店主口吻兜底
 */
export async function streamKnowledgeAsk(
  question: string,
  onDelta: (text: string) => void,
  opts: { role?: string; signal?: AbortSignal } = {},
): Promise<SseResult> {
  return streamSse('/api/v1/knowledge/ask', { question, role: opts.role }, onDelta, opts.signal)
}
