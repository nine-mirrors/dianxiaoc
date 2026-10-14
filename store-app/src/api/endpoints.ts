/**
 * ⚠️ **本文件已废弃（2026-10-11 核实），保留仅为历史参考，请勿引用。**
 *
 * 原因：实际请求由 `client.ts` 的 `httpRequest` 统一用原生 fetch 发出，
 * 路径直接写在 `index.ts` 各函数内，**本文件的 ENDPOINTS 常量全项目零引用**
 * （已grep 确认无任何 import）。
 *
 * 且存在**路径漂移**：`LOGIN` 登记为 `/api/v1/session/login`，
 * 而后端 `server/src/index.js` 实际是 `POST /api/v1/auth/login`
 * （`endpoints.ts:14` 的 `session/login` 是 Phase 1 的旧规划名）。
 * 原文声称「与 client.ts / index.ts 中书写的路径保持一字不差」，该声明已不成立。
 *
 * 如需查当前真实路径，请直接看 `server/src/index.js` 的路由定义（29 个 /api/v1 契约）
 * 或 `api/index.ts` 各导出函数——**那才是唯一权威**。
 */

/** API 统一前缀 */
export const API_PREFIX = '/api/v1'

/** @deprecated 已废弃，见文件头说明。路径可能与后端实际不符，勿引用。 */
export const ENDPOINTS = {
  ROLES: `${API_PREFIX}/meta/roles`,
  /** ⚠️ 漂移：后端实际为 `/auth/login`（见 server/src/index.js） */
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
