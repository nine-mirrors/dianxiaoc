/**
 * 业代端（W5）后端契约层 —— 现场作业 `/field` + 知识库 `/knowledge`。
 *
 * 与 `@/api/index.ts` 同源：只走 `@/api/client` 的 `request<T>`（统一信封 + 鉴权头），
 * 页面严禁 import `@/fixtures`。HTTP 失败由 client 抛 ApiError，调用方必须 try/catch。
 *
 * 字段名与 `server/src/routes/field-ops.js`、`server/src/routes/knowledge.js` 的
 * 出参一字不差（camelCase），Phase 2 接真后端时本文件与页面均不需要改动。
 */
import { request, authHeaders } from './client'

/* ═══════════════ 现场作业 /field（writeGuard = rep | owner | admin） ═══════════════ */

/** 到店签到记录（后端 ext_checkins 行 → camelCase） */
export interface CheckinRecord {
  id: string
  storeId: string
  storeName: string
  repId: string
  lat: number | null
  lng: number | null
  addr: string | null
  photoId: string | null
  createdAt: string
}

/** 签到记录分页结果 */
export interface CheckinList {
  items: CheckinRecord[]
  total: number
  page: number
  pageSize: number
}

/** 提交签到的入参 */
export interface CheckinPayload {
  storeId: string
  lat?: number
  lng?: number
  addr?: string
  photoId?: string
}

/**
 * POST /api/v1/field/checkin —— 到店签到（记录时间 / 位置 / 水印照 photoId）。
 */
export async function createCheckin(payload: CheckinPayload): Promise<{ checkin: CheckinRecord }> {
  return request<{ checkin: CheckinRecord }>({
    path: '/api/v1/field/checkin',
    method: 'POST',
    body: payload,
  })
}

/**
 * GET /api/v1/field/checkins —— 签到记录列表（倒序）。
 *
 * @param params storeId 可选；不传返回全量（经理视角）
 */
export async function getCheckins(
  params: { storeId?: string; page?: number; pageSize?: number } = {},
): Promise<CheckinList> {
  return request<CheckinList>({ path: '/api/v1/field/checkins', method: 'GET', query: params })
}

/** 盘点单条明细（skuCode / skuName / 库存量 qty / 货架量 shelfQty / 到期日 expireAt / 备注 note） */
export interface InventoryItem {
  skuCode: string
  skuName: string
  qty: number
  shelfQty: number
  expireAt: string | null
  note: string | null
}

/** 盘点记录（POST 返回本次结果；GET 返回该店最新一组） */
export interface InventoryRecord {
  storeId: string
  storeName?: string
  createdAt?: string
  count?: number
  items: InventoryItem[]
  /** 该店尚无任何盘点记录时为 true */
  empty?: boolean
}

/**
 * POST /api/v1/field/stores/:id/inventory —— 提交一次盘点（一组）。
 */
export async function submitInventory(
  storeId: string,
  items: InventoryItem[],
): Promise<InventoryRecord> {
  return request<InventoryRecord>({
    path: `/api/v1/field/stores/${storeId}/inventory`,
    method: 'POST',
    body: { items },
  })
}

/**
 * GET /api/v1/field/stores/:id/inventory —— 取该店最新一次盘点结果。
 */
export async function getLatestInventory(storeId: string): Promise<InventoryRecord> {
  return request<InventoryRecord>({
    path: `/api/v1/field/stores/${storeId}/inventory`,
    method: 'GET',
  })
}

/* ═══════════════ 知识库 /knowledge（登录即可） ═══════════════ */

/** 知识条目 */
export interface KnowledgeItem {
  id: string
  category: string
  question: string
  answer: string
  tags: string[]
  updatedAt: string
}

/** 知识条目分页结果 */
export interface KnowledgeList {
  items: KnowledgeItem[]
  total: number
  page: number
  pageSize: number
}

/** 知识条目查询参数 */
export interface KnowledgeQuery {
  page?: number
  pageSize?: number
  category?: string
  q?: string
}

/**
 * GET /api/v1/knowledge/list —— 有效知识条目分页（支持分类 / 关键词）。
 */
export async function getKnowledgeList(params: KnowledgeQuery = {}): Promise<KnowledgeList> {
  return request<KnowledgeList>({
    path: '/api/v1/knowledge/list',
    method: 'GET',
    // 逐字段显式取值：client 的 query 类型为 Record<string, string|number|undefined>，
    // 而 KnowledgeQuery 是 interface（无隐式索引签名），直接透传会 TS2322。
    query: {
      page: params.page,
      pageSize: params.pageSize,
      category: params.category,
      q: params.q,
    },
  })
}

/**
 * GET /api/v1/knowledge/categories —— 知识分类去重列表。
 */
export async function getKnowledgeCategories(): Promise<{ categories: string[] }> {
  return request<{ categories: string[] }>({ path: '/api/v1/knowledge/categories', method: 'GET' })
}

/**
 * 知识问答 SSE 执行结果。
 *
 * ⚠ `source` 由后端 done 帧给出：降级路径也会发 delta 帧（本地标准答复），
 * 只看「有没有收到增量」会误标「AI 生成」。前端据 source 如实标注来源。
 */
export interface KnowledgeAskResult {
  /** 网络层是否成功且至少收到一段增量 */
  ok: boolean
  /** 内容来源：llm=大模型 / fallback=标准答案库 / null=未拿到 */
  source: 'llm' | 'fallback' | null
}

/**
 * POST /api/v1/knowledge/ask —— 知识库问答（SSE 真流式）。
 *
 * 手动解析 text/event-stream：逐帧取 `data:` 行 JSON，命中 `delta` 回调，
 * 命中 `done` 取回 source 并结束。鉴权头与普通请求一致（authHeaders）。
 *
 * @param question 用户问题
 * @param onDelta  每段增量文本回调
 * @param signal   可中断信号
 * @param role     提问角色（可选，用于后端系统提示词）
 */
export async function streamKnowledgeAsk(
  question: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  role?: string,
): Promise<KnowledgeAskResult> {
  const base = import.meta.env.VITE_API_BASE || ''
  let res: Response
  try {
    res = await fetch(`${base}/api/v1/knowledge/ask`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ question, role }),
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
  let source: KnowledgeAskResult['source'] = null
  try {
    for (;;) {
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
    /* 读取中断（客户端 abort）→ 已交付部分即视为成功 */
  }
  return { ok: delivered, source }
}
