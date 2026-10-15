/**
 * W2b 消息中心 API（四端共用）—— 会话 IM + 公告送达 + 未读汇总。
 *
 * 对应后端 server/src/routes/messages.js（前缀 /api/v1/messages）：
 *   GET  /conversations            我可见的会话列表（含最后一条与未读数）
 *   GET  /conversations/:id        会话消息（before 游标上翻历史）
 *   POST /conversations/:id        发消息（成功后后端按成员角色广播 message:new）
 *   POST /conversations/:id/read   标记会话已读
 *   GET  /announcements            按 audience 过滤的已发布公告（含本人已读状态）
 *   POST /announcements/:id/read   标记公告已读
 *   GET  /unread                   未读汇总（底部导航角标）
 *
 * 实时推送：订阅 `@/realtime/client` 的 `message:new` / `announcement:new`
 * 事件即可增量刷新（本模块只负责 HTTP 契约，不持有连接）。
 */
import { request } from './client'

/** 单条消息 */
export interface MessageItem {
  id: string
  convId: string
  senderId: string
  senderName: string
  senderRole: string
  kind: 'text' | 'image'
  content: string
  createdAt: string
}

/** 会话（成员按角色登记） */
export interface ConversationItem {
  id: string
  kind: string
  title: string
  region: string | null
  storeId: string | null
  members: string[]
  lastAt: string
  lastMessage: MessageItem | null
  unread: number
}

/** 公告 */
export interface AnnouncementItem {
  id: string
  title: string
  content: string
  audience: string
  pinned: number
  status: string
  createdAt: string
  createdBy: string
  /** 当前登录账号是否已读 */
  read: boolean
  /** 已读人数（管理端视角即送达效果） */
  readCount: number
}

/** 未读汇总 */
export interface UnreadSummary {
  announcements: number
  conversations: number
  total: number
}

/** GET /conversations —— 我可见的会话列表 */
export async function listConversations(): Promise<{
  items: ConversationItem[]
  total: number
  unreadTotal: number
}> {
  return request({ path: '/api/v1/messages/conversations', method: 'GET' })
}

/**
 * GET /conversations/:id —— 会话消息（时间正序）。
 *
 * @param id     会话 id
 * @param params limit（默认 30）/ before（游标：某条消息的 createdAt，用于上翻）
 */
export async function getConversation(
  id: string,
  params: { limit?: number; before?: string } = {},
): Promise<{
  conversation: { id: string; kind: string; title: string; members: string[] }
  items: MessageItem[]
  hasMore: boolean
  unread: number
}> {
  return request({ path: `/api/v1/messages/conversations/${id}`, method: 'GET', query: params })
}

/**
 * POST /conversations/:id —— 发消息。
 *
 * @param id      会话 id
 * @param payload kind（text/image）+ content
 */
export async function sendMessage(
  id: string,
  payload: { kind?: 'text' | 'image'; content: string },
): Promise<{ message: MessageItem }> {
  return request({ path: `/api/v1/messages/conversations/${id}`, method: 'POST', body: payload })
}

/** POST /conversations/:id/read —— 标记该会话已读 */
export async function markConversationRead(id: string): Promise<{
  convId: string
  readAt: string
  unread: number
}> {
  return request({ path: `/api/v1/messages/conversations/${id}/read`, method: 'POST' })
}

/** GET /announcements —— 公告列表（含本人已读状态与已读人数） */
export async function listAnnouncements(
  params: { page?: number; pageSize?: number } = {},
): Promise<{ items: AnnouncementItem[]; total: number; page: number; pageSize: number; unread: number }> {
  return request({ path: '/api/v1/messages/announcements', method: 'GET', query: params })
}

/** POST /announcements/:id/read —— 标记公告已读 */
export async function markAnnouncementRead(id: string): Promise<{
  id: string
  readCount: number
  read: boolean
}> {
  return request({ path: `/api/v1/messages/announcements/${id}/read`, method: 'POST' })
}

/** GET /unread —— 未读汇总（导航角标） */
export async function getUnreadSummary(): Promise<UnreadSummary> {
  return request({ path: '/api/v1/messages/unread', method: 'GET' })
}

export default {
  listConversations,
  getConversation,
  sendMessage,
  markConversationRead,
  listAnnouncements,
  markAnnouncementRead,
  getUnreadSummary,
}
