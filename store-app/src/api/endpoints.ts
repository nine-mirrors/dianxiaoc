/**
 * 真实 HTTP 端点映射（Phase 2 启用，ARCHITECTURE §3.4）。
 *
 * 本文件在 Phase 1 仅作为「将来 Express 后端的路径 + 表」登记处，
 * 实际请求由 client.ts 的 httpRequest 统一用原生 fetch 发出（不引入 axios）。
 */

/** API 统一前缀 */
export const API_PREFIX = '/api/v1'

/** 端点常量表：与 client.ts / index.ts 中书写的路径保持一字不差 */
export const ENDPOINTS = {
  ROLES: `${API_PREFIX}/meta/roles`,
  LOGIN: `${API_PREFIX}/session/login`,
  STORES: `${API_PREFIX}/stores`,
  STORE_DETAIL: (id: string) => `${API_PREFIX}/stores/${id}`,
  VISITS_TODAY: `${API_PREFIX}/visits/today`,
  VISITS: `${API_PREFIX}/visits`,
  VISIT_DETAIL: (id: string) => `${API_PREFIX}/visits/${id}`,
  DIAGNOSES: `${API_PREFIX}/diagnoses`,
  DIAGNOSIS_DETAIL: (id: string) => `${API_PREFIX}/diagnoses/${id}`,
  AI_CHAT: `${API_PREFIX}/ai/chat`,
  AI_CHAT_SUGGESTIONS: `${API_PREFIX}/ai/chat/suggestions`,
  TICKETS: `${API_PREFIX}/tickets`,
  TASKS: `${API_PREFIX}/tasks`,
  TASK_DETAIL: (id: string) => `${API_PREFIX}/tasks/${id}`,
  DASHBOARD_OVERVIEW: `${API_PREFIX}/dashboard/overview`,
} as const

/** Phase 2 的 SQLite 表映射备注 */
export const PHASE2_TABLE_MAP: Record<string, string> = {
  '/api/v1/session/login': 'users',
  '/api/v1/stores': 'stores / store_standards / store_photos',
  '/api/v1/visits': 'visits / visit_photos',
  '/api/v1/diagnoses': 'diagnoses / annotations / dimension_scores / issues / risk_items / action_items',
  '/api/v1/ai/chat': 'chat_messages（+ 真实 LLM 代理）',
  '/api/v1/tickets': 'tickets / ticket_items',
  '/api/v1/tasks': 'tasks',
  '/api/v1/dashboard/overview': '视图聚合（weekly_metrics / stores）',
}

export default ENDPOINTS
