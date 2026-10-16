/**
 * W2b 消息中心 API（四端共用）—— 会话 IM + 公告送达 + 未读汇总。
 *
 * 对应后端 server/src/routes/messages.js（前缀 /api/v1/messages）：
 *   GET  /conversations            我可见的会话列表（含最后一条与未读数）
 *   GET  /conversations/:id        会话消息（before 游标上翻历史）
 *   POST /conversations/:id        发消息（成功后后端按成员角色广播 message:new）
 *   POST /conversations/:id/read   标记会话已读
 *   POST /conversations/:id/pin    置顶 / 取消置顶（按账号隔离，返回更新后的会话对象）
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
  /** 是否已置顶（按账号隔离；后端已按 pinned DESC, last_at DESC 排序） */
  pinned: boolean
  /** 是否免打扰（按账号隔离）：免打扰会话的未读不计入底部导航角标 */
  muted: boolean
  /** 「对方」头像 URL；无头像时为空字符串（前端回落图标） */
  peerAvatarUrl: string
}

/** 公告 */
export interface AnnouncementItem {
  id: string
  title: string
  content: string
  audience: string
  /** 是否置顶：1 置顶 / 0 普通（后端按 pinned DESC 排序，DB 存整数） */
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
  /** 逾期未完成任务数（逾期必须提醒；与通知中心的逾期判定同源） */
  tasks: number
  total: number
}

/** 通知中心内的待办任务（后端已按**演示基准时间**算好逾期 / 临期，前端不再做时间比较） */
export interface NotificationTask {
  id: string
  storeId: string
  storeName: string
  assigneeName: string
  creatorName: string
  taskType: string
  taskTypeLabel: string
  /** 可比较的时限串（YYYY-MM-DD HH:mm） */
  dueAt: string
  /** 原始展示文案（「今日 18:00」） */
  dueAtLabel: string
  note: string
  status: string
  /** 距截止的分钟数：负数=已逾期，null=未设时限（按演示基准时间 2026-10-02 23:59 计算） */
  minutesLeft: number | null
  overdue: boolean
  /** 24 小时内到期（未逾期） */
  dueSoon: boolean
}

/** 系统动态（由真实巡店 / 整改回执 / 单据记录派生，不臆造事件） */
export interface SystemEvent {
  id: string
  kind: 'visit' | 'rectification' | 'ticket'
  level: 'ok' | 'warn'
  title: string
  desc: string
  at: string
}

/** 通知中心聚合体（GET /notifications） */
export interface NotificationFeed {
  /** 演示基准时间（天气卡与相对时限文案以此为准） */
  now: string
  tasks: { items: NotificationTask[]; open: number; overdue: number; dueSoon: number }
  announcements: AnnouncementItem[]
  system: SystemEvent[]
  counts: {
    unreadAnnouncements: number
    unreadConversations: number
    openTasks: number
    overdueTasks: number
    dueSoonTasks: number
    total: number
  }
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

/**
 * POST /conversations/:id/pin —— 置顶 / 取消置顶（按账号隔离）。
 *
 * @param id      会话 id
 * @param payload pinned：true 置顶 / false 取消置顶
 * @returns 更新后的会话对象（结构与列表项一致）
 */
export async function pinConversation(
  id: string,
  payload: { pinned: boolean },
): Promise<ConversationItem> {
  return request({ path: `/api/v1/messages/conversations/${id}/pin`, method: 'POST', body: payload })
}

/**
 * POST /conversations/:id/mute —— 免打扰 / 取消免打扰（按账号隔离）。
 *
 * 免打扰的会话仍会出现在列表中（弱化未读样式），但未读不计入底部导航角标。
 *
 * @param id      会话 id
 * @param payload muted：true 开启免打扰 / false 关闭
 * @returns 更新后的会话对象（结构与列表项一致）
 */
export async function muteConversation(
  id: string,
  payload: { muted: boolean },
): Promise<ConversationItem> {
  return request({ path: `/api/v1/messages/conversations/${id}/mute`, method: 'POST', body: payload })
}

/**
 * POST /conversations/:id/hide —— 从「我的」会话列表移除（按账号隔离的软删除）。
 *
 * 只影响当前账号的列表可见性，不删除任何消息；该会话再次收到新消息时会自动重新出现。
 *
 * @param id 会话 id
 * @returns { id, hidden }
 */
export async function hideConversation(id: string): Promise<{ id: string; hidden: boolean }> {
  return request({
    path: `/api/v1/messages/conversations/${id}/hide`,
    method: 'POST',
    body: { hidden: true },
  })
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

/**
 * GET /notifications —— 通知中心统一收口（任务待办 + 公告 + 系统动态 + 演示基准时间）。
 *
 * 一次请求拿全，前端不再分别调用 /tasks 与 /announcements，
 * 保证「未读」与「逾期」两个数字在两屏之间同源。
 */
export async function getNotifications(): Promise<NotificationFeed> {
  return request({ path: '/api/v1/messages/notifications', method: 'GET' })
}

export default {
  listConversations,
  getConversation,
  sendMessage,
  markConversationRead,
  pinConversation,
  muteConversation,
  hideConversation,
  listAnnouncements,
  markAnnouncementRead,
  getUnreadSummary,
  getNotifications,
}
