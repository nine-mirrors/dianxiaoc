/**
 * ★ 管理端 API 契约层（W4 运营控制台）。
 *
 * 与后端 `server/src/routes/admin.js` 一一对应，前缀 `/api/v1`。
 * 页面只允许 import 本文件（铁律 1），绝不 import @/fixtures。
 *
 * 所有请求走统一 `request<T>({ path, method, body, query })`，失败抛 ApiError，
 * 由页面 try/catch + Toast 友好文案兜底，绝不白屏。
 */
import { request } from './client'

/* ═══════════════ 枚举与通用结构 ═══════════════ */

/** 管理端账号角色（比业务端多一个 admin） */
export type AdminRole = 'rep' | 'manager' | 'owner' | 'admin'
/** 账号来源：seed=内置演示账号（只读）/ ext=管理端派发 */
export type AccountSource = 'seed' | 'ext'
/** 账号状态 */
export type AccountStatus = 'active' | 'disabled'

export type BlacklistType = 'store' | 'sku'
export type BlacklistLevel = 'high' | 'mid' | 'low'
export type BlacklistStatus = 'active' | 'revoked'

export type SkuRuleType = 'ban_sale_below_cost' | 'key_shelf' | 'expire_first'

export type KnowledgeStatus = 'active' | 'revoked'

export type AnnouncementAudience = 'all' | 'rep' | 'owner' | 'manager'

/** 分页信封（后端统一形如 { items, total, page, pageSize }） */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/* ═══════════════ ① 运营总览 ═══════════════ */

export interface AuditTrendPoint {
  /** YYYY-MM-DD */
  day: string
  count: number
}

export interface AdminOverview {
  /** 内置用户数（users.json） */
  userCount: number
  storeCount: number
  /** 有效知识条目数 */
  knowledgeCount: number
  /** 生效黑名单数 */
  blacklistCount: number
  /** 账号总量（内置 + 派发） */
  accountCount: number
  /** 派发账号数 */
  extAccountCount: number
  /** 内置账号数 */
  seedAccountCount: number
  auditCount: number
  diagnosisCount: number
  aiCallCount: number
  /** 近 7 天审计活动（后端已补齐空天） */
  auditTrend: AuditTrendPoint[]
}

/** GET /admin/overview —— 运营总览全部指标（一次拿全） */
export async function getAdminOverview(): Promise<AdminOverview> {
  return request<AdminOverview>({ path: '/api/v1/admin/overview', method: 'GET' })
}

/* ═══════════════ ② 账号派发 ═══════════════ */

export interface AdminAccount {
  id: string
  username: string
  name: string
  role: AdminRole
  region: string
  storeId: string | null
  source: AccountSource
  status: AccountStatus
  /** 仅派发账号可改（内置账号为 false，界面须如实禁用操作） */
  editable: boolean
}

export interface CreateAccountPayload {
  username: string
  password: string
  name: string
  role: AdminRole
  region?: string
  storeId?: string
  status?: AccountStatus
}

export interface UpdateAccountPayload {
  name?: string
  role?: AdminRole
  region?: string
  storeId?: string
  status?: AccountStatus
  password?: string
}

/** GET /admin/accounts —— 账号列表（内置 + 派发） */
export async function getAdminAccounts(): Promise<{ items: AdminAccount[]; total: number }> {
  return request<{ items: AdminAccount[]; total: number }>({
    path: '/api/v1/admin/accounts',
    method: 'GET',
  })
}

/** POST /admin/accounts —— 派发新账号（重名后端返 409） */
export async function createAdminAccount(payload: CreateAccountPayload): Promise<{ item: AdminAccount }> {
  return request<{ item: AdminAccount }>({
    path: '/api/v1/admin/accounts',
    method: 'POST',
    body: payload,
  })
}

/** PUT /admin/accounts/:id —— 编辑派发账号（内置账号不可改） */
export async function updateAdminAccount(id: string, patch: UpdateAccountPayload): Promise<{ item: AdminAccount }> {
  return request<{ item: AdminAccount }>({
    path: `/api/v1/admin/accounts/${id}`,
    method: 'PUT',
    body: patch,
  })
}

/** POST /admin/accounts/:id/reset-password —— 重置密码（不传则后端生成 8 位随机密码） */
export async function resetAdminPassword(id: string, password?: string): Promise<{ id: string; password: string }> {
  return request<{ id: string; password: string }>({
    path: `/api/v1/admin/accounts/${id}/reset-password`,
    method: 'POST',
    body: password ? { password } : {},
  })
}

/* ═══════════════ ③ 黑名单 ═══════════════ */

export interface BlacklistItem {
  id: string
  type: BlacklistType
  targetId: string
  targetName: string
  reason: string
  level: BlacklistLevel
  status: BlacklistStatus
  createdAt: string
  createdBy: string
}

export interface BlacklistQuery {
  page?: number
  pageSize?: number
  status?: BlacklistStatus | ''
  level?: BlacklistLevel | ''
  type?: BlacklistType | ''
}

export interface BlacklistPayload {
  type: BlacklistType
  targetId: string
  targetName: string
  reason: string
  level: BlacklistLevel
}

export interface BlacklistUpdatePayload {
  type?: BlacklistType
  targetId?: string
  targetName?: string
  reason?: string
  level?: BlacklistLevel
  status?: BlacklistStatus
}

/** GET /admin/blacklist —— 黑名单分页（type / level / status 服务端过滤） */
export async function getBlacklist(query: BlacklistQuery = {}): Promise<Paged<BlacklistItem>> {
  return request<Paged<BlacklistItem>>({
    path: '/api/v1/admin/blacklist',
    method: 'GET',
    query: {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status || undefined,
      level: query.level || undefined,
      type: query.type || undefined,
    },
  })
}

/** POST /admin/blacklist —— 新增黑名单条目 */
export async function createBlacklist(payload: BlacklistPayload): Promise<{ item: BlacklistItem }> {
  return request<{ item: BlacklistItem }>({
    path: '/api/v1/admin/blacklist',
    method: 'POST',
    body: payload,
  })
}

/** PUT /admin/blacklist/:id —— 编辑黑名单条目 */
export async function updateBlacklist(id: string, patch: BlacklistUpdatePayload): Promise<{ item: BlacklistItem }> {
  return request<{ item: BlacklistItem }>({
    path: `/api/v1/admin/blacklist/${id}`,
    method: 'PUT',
    body: patch,
  })
}

/** POST /admin/blacklist/:id/toggle —— 启用 / 停用对切（可显式指定 status） */
export async function toggleBlacklist(id: string, status?: BlacklistStatus): Promise<{ id: string; status: BlacklistStatus }> {
  return request<{ id: string; status: BlacklistStatus }>({
    path: `/api/v1/admin/blacklist/${id}/toggle`,
    method: 'POST',
    body: status ? { status } : {},
  })
}

/* ═══════════════ ④ SKU 规则 ═══════════════ */

export interface SkuRule {
  id: string
  skuCode: string
  skuName: string
  ruleType: SkuRuleType
  note: string | null
  status: BlacklistStatus
  createdAt: string
}

export interface SkuRulePayload {
  skuCode: string
  skuName: string
  ruleType: SkuRuleType
  note?: string
}

/** GET /admin/sku-rules —— SKU 执行规则列表（status / ruleType 可选过滤） */
export async function getSkuRules(query: { status?: BlacklistStatus | ''; ruleType?: SkuRuleType | '' } = {}): Promise<{ items: SkuRule[]; total: number }> {
  return request<{ items: SkuRule[]; total: number }>({
    path: '/api/v1/admin/sku-rules',
    method: 'GET',
    query: { status: query.status || undefined, ruleType: query.ruleType || undefined },
  })
}

/** POST /admin/sku-rules —— 新增 SKU 规则 */
export async function createSkuRule(payload: SkuRulePayload): Promise<{ item: SkuRule }> {
  return request<{ item: SkuRule }>({
    path: '/api/v1/admin/sku-rules',
    method: 'POST',
    body: payload,
  })
}

/** PUT /admin/sku-rules/:id —— 编辑 / 停用 SKU 规则 */
export async function updateSkuRule(
  id: string,
  patch: { skuCode?: string; skuName?: string; ruleType?: SkuRuleType; note?: string; status?: BlacklistStatus },
): Promise<{ item: SkuRule }> {
  return request<{ item: SkuRule }>({
    path: `/api/v1/admin/sku-rules/${id}`,
    method: 'PUT',
    body: patch,
  })
}

/* ═══════════════ ⑤ FAQ 知识库 ═══════════════ */

export interface KnowledgeItem {
  id: string
  category: string
  question: string
  answer: string
  /** 逗号分隔标签串（后端存储形态） */
  tags: string | null
  status: KnowledgeStatus
  createdAt: string
  updatedAt: string
}

export interface KnowledgeQuery {
  page?: number
  pageSize?: number
  /** 默认 active；传 all 看全部 */
  status?: KnowledgeStatus | 'all'
  q?: string
  category?: string
}

export interface KnowledgePayload {
  category: string
  question: string
  answer: string
  /** 数组或逗号串均可 */
  tags?: string | string[]
}

/** GET /admin/knowledge —— 知识条目分页（默认只看 active） */
export async function getAdminKnowledge(query: KnowledgeQuery = {}): Promise<Paged<KnowledgeItem>> {
  return request<Paged<KnowledgeItem>>({
    path: '/api/v1/admin/knowledge',
    method: 'GET',
    query: {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      q: query.q || undefined,
      category: query.category || undefined,
    },
  })
}

/** POST /admin/knowledge —— 新增知识条目 */
export async function createKnowledge(payload: KnowledgePayload): Promise<{ item: KnowledgeItem }> {
  return request<{ item: KnowledgeItem }>({
    path: '/api/v1/admin/knowledge',
    method: 'POST',
    body: payload,
  })
}

/** PUT /admin/knowledge/:id —— 编辑知识条目（status 仅接受 active | revoked） */
export async function updateKnowledge(
  id: string,
  patch: { category?: string; question?: string; answer?: string; tags?: string | string[]; status?: KnowledgeStatus },
): Promise<{ item: KnowledgeItem }> {
  return request<{ item: KnowledgeItem }>({
    path: `/api/v1/admin/knowledge/${id}`,
    method: 'PUT',
    body: patch,
  })
}

/** DELETE /admin/knowledge/:id —— 软删除（置 revoked，保留审计链） */
export async function deleteKnowledge(id: string): Promise<{ id: string; status: KnowledgeStatus }> {
  return request<{ id: string; status: KnowledgeStatus }>({
    path: `/api/v1/admin/knowledge/${id}`,
    method: 'DELETE',
  })
}

/** GET /knowledge/categories —— 有效条目的分类去重列表（供左栏分类树） */
export async function getKnowledgeCategories(): Promise<string[]> {
  const res = await request<{ categories: string[] }>({
    path: '/api/v1/knowledge/categories',
    method: 'GET',
  })
  return res.categories ?? []
}

/* ═══════════════ ⑥ 公告 ═══════════════ */

export interface AnnouncementItem {
  id: string
  title: string
  content: string
  audience: AnnouncementAudience
  pinned: 0 | 1
  status: string
  createdAt: string
  createdBy: string
  /** 已读人数 */
  readCount: number
}

export interface AnnouncementPayload {
  title: string
  content: string
  audience?: AnnouncementAudience
  pinned?: boolean
}

/** GET /admin/announcements —— 公告列表（含已读人数，置顶優先） */
export async function getAdminAnnouncements(): Promise<{ items: AnnouncementItem[]; total: number }> {
  return request<{ items: AnnouncementItem[]; total: number }>({
    path: '/api/v1/admin/announcements',
    method: 'GET',
  })
}

/**
 * POST /admin/announcements —— 发布公告。
 *
 * ★ 发布成功后后端会自动向对应角色广播 `announcement:new`（三端消息中心实时收到）。
 */
export async function createAnnouncement(payload: AnnouncementPayload): Promise<{ item: AnnouncementItem }> {
  return request<{ item: AnnouncementItem }>({
    path: '/api/v1/admin/announcements',
    method: 'POST',
    body: payload,
  })
}

/* ═══════════════ ⑦ 审计日志 ═══════════════ */

export interface AuditItem {
  id: string
  actorId: string
  actorName: string
  action: string
  target: string
  /** JSON 串或普通文本（后端 writeAudit 归一化后存储） */
  detail: string
  createdAt: string
}

export interface AuditQuery {
  page?: number
  pageSize?: number
  actor?: string
  action?: string
  target?: string
}

/** GET /admin/audit —— 审计日志分页（actor / action / target 模糊过滤） */
export async function getAdminAudit(query: AuditQuery = {}): Promise<Paged<AuditItem>> {
  return request<Paged<AuditItem>>({
    path: '/api/v1/admin/audit',
    method: 'GET',
    query: {
      page: query.page,
      pageSize: query.pageSize,
      actor: query.actor || undefined,
      action: query.action || undefined,
      target: query.target || undefined,
    },
  })
}
