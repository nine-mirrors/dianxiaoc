/**
 * W2b 消息中心路由（messages.js）—— 四端实时沟通 + 公告送达。
 *
 * 挂载前缀：/messages（最终路径 /api/v1/messages/…）。
 * 鉴权：所有角色登录即可（/api/v1/* 已过主入口鉴权闸门）。
 *
 * 组成：
 *  ① 会话（IM）：GET /conversations、GET /conversations/:id、
 *                POST /conversations/:id（发消息）、POST /conversations/:id/read
 *  ② 公告（单向）：GET /announcements、POST /announcements/:id/read
 *                   （发布/编辑在管理员端 admin.js，本文件只负责「读侧」）
 *  ③ 未读汇总：GET /unread（供底部 Tab 角标）
 *
 * 会话成员按**角色**登记（ext_conversations.members = JSON 数组，如 ["rep","manager"]），
 * 因此同角色的登录账号共享该会话。发消息后按成员角色调用 realtime.broadcast 实时推送
 * （事件 `message:new`）；公告发布由 admin.js 侧广播 `announcement:new`。
 */
import { newRouter, wrap, ApiError, accountOf, pagination } from './_kit.js'
import { extDb, insert, newId, nowIso, writeAudit, rowToCamel } from '../ext.js'
import { findUserByRole } from '../db.js'
import { broadcast } from '../realtime.js'

const router = newRouter()

/** 单条消息正文上限（字符）——防超长刷屏；图片消息 content 存 dataUrl/photoId */
const MAX_CONTENT = 2000
const KINDS = ['text', 'image']

/** 当前操作者（username / role / name）；姓名由 db 静态 users 按角色补 */
function actorOf(req) {
  const a = req.account || accountOf(req) || {}
  const role = String(a.role || '')
  const seed = findUserByRole(role)
  return {
    username: String(a.username || ''),
    role,
    name: seed?.name || String(a.username || ''),
  }
}

/** 会话成员：JSON 数组 → 字符串数组（容错空/坏数据） */
function parseMembers(raw) {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

/** 是否可访问该会话：管理员全可见，其他角色须在成员名单内 */
function canAccess(conv, role) {
  return role === 'admin' || parseMembers(conv.members).includes(role)
}

/** 取会话（带 404/403 校验） */
function mustConv(req, me) {
  const conv = extDb.prepare('SELECT * FROM ext_conversations WHERE id=?').get(String(req.params.id))
  if (!conv) throw new ApiError(404, '会话不存在')
  if (!canAccess(conv, me.role)) throw new ApiError(403, '无权访问该会话')
  return conv
}

/** 已读位点 upsert（node:sqlite 支持标准 SQLite UPSERT 语法） */
function markRead(table, keyCol, id, userId, at) {
  extDb
    .prepare(`INSERT INTO ${table} (${keyCol}, user_id, read_at) VALUES (?,?,?)
              ON CONFLICT(${keyCol}, user_id) DO UPDATE SET read_at=excluded.read_at`)
    .run(id, userId, at)
}

/** 某会话对某账号的未读数（他人发的、晚于本人上次已读位点的消息） */
function unreadOf(convId, userId) {
  const lastRead =
    extDb.prepare('SELECT read_at FROM ext_conv_reads WHERE conv_id=? AND user_id=?').get(convId, userId)?.read_at || ''
  return extDb
    .prepare('SELECT COUNT(*) c FROM ext_messages WHERE conv_id=? AND sender_id!=? AND created_at>?')
    .get(convId, userId, lastRead).c
}

/* ───────────────────────── ① 会话（IM） ───────────────────────── */

/** GET /api/v1/messages/conversations —— 我可见的会话列表（含最后一条与未读数） */
router.get('/conversations', wrap(async (req) => {
  const me = actorOf(req)
  const rows = extDb.prepare('SELECT * FROM ext_conversations ORDER BY last_at DESC, id').all()
  const items = []
  for (const r of rows) {
    if (!canAccess(r, me.role)) continue
    const last = extDb
      .prepare('SELECT * FROM ext_messages WHERE conv_id=? ORDER BY created_at DESC, id DESC LIMIT 1')
      .get(r.id)
    items.push({
      id: r.id,
      kind: r.kind,
      title: r.title,
      region: r.region,
      storeId: r.store_id,
      members: parseMembers(r.members),
      lastAt: r.last_at,
      lastMessage: last ? rowToCamel(last) : null,
      unread: unreadOf(r.id, me.username),
    })
  }
  return { items, total: items.length, unreadTotal: items.reduce((s, i) => s + i.unread, 0) }
}))

/**
 * GET /api/v1/messages/conversations/:id?limit=&before=
 * 取会话消息（时间正序返回）；before 为游标（某条消息 created_at），用于上翻历史。
 */
router.get('/conversations/:id', wrap(async (req) => {
  const me = actorOf(req)
  const conv = mustConv(req, me)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30))
  const before = req.query.before ? String(req.query.before) : ''
  const rows = before
    ? extDb
        .prepare('SELECT * FROM ext_messages WHERE conv_id=? AND created_at<? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(conv.id, before, limit)
    : extDb
        .prepare('SELECT * FROM ext_messages WHERE conv_id=? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(conv.id, limit)
  return {
    conversation: { id: conv.id, kind: conv.kind, title: conv.title, members: parseMembers(conv.members) },
    items: rows.map(rowToCamel).reverse(),
    hasMore: rows.length === limit,
    unread: unreadOf(conv.id, me.username),
  }
}))

/**
 * POST /api/v1/messages/conversations/:id
 * body: { kind?: 'text'|'image', content }
 * 发消息；成功后按成员角色实时广播 `message:new`。
 */
router.post('/conversations/:id', wrap(async (req) => {
  const me = actorOf(req)
  const conv = mustConv(req, me)
  const kind = String(req.body?.kind || 'text')
  if (!KINDS.includes(kind)) throw new ApiError(400, `kind 只能是：${KINDS.join(' / ')}`)
  const content = String(req.body?.content ?? '').trim()
  if (!content) throw new ApiError(400, '消息内容不能为空')
  if (content.length > MAX_CONTENT) throw new ApiError(400, `消息内容不能超过 ${MAX_CONTENT} 字`)

  const id = newId('MSG')
  const createdAt = nowIso()
  insert('ext_messages', {
    id,
    conv_id: conv.id,
    sender_id: me.username,
    sender_name: me.name,
    sender_role: me.role,
    kind,
    content,
    created_at: createdAt,
  })
  extDb.prepare('UPDATE ext_conversations SET last_at=? WHERE id=?').run(createdAt, conv.id)
  // 发送者本人视为已读到本条
  markRead('ext_conv_reads', 'conv_id', conv.id, me.username, createdAt)

  const message = rowToCamel(extDb.prepare('SELECT * FROM ext_messages WHERE id=?').get(id))
  // 定向推送：按成员的每个角色广播（不含 admin 时管理员仍可在列表看到，不必额外广播）
  for (const role of parseMembers(conv.members)) {
    broadcast('message:new', { toRole: role, convId: conv.id, message })
  }
  writeAudit({ id: me.username, name: me.name }, 'message.send', conv.id, { kind, len: content.length })
  return { message }
}))

/** POST /api/v1/messages/conversations/:id/read —— 标记该会话为已读 */
router.post('/conversations/:id/read', wrap(async (req) => {
  const me = actorOf(req)
  const conv = mustConv(req, me)
  const readAt = nowIso()
  markRead('ext_conv_reads', 'conv_id', conv.id, me.username, readAt)
  return { convId: conv.id, readAt, unread: 0 }
}))

/* ───────────────────────── ② 公告（读侧） ───────────────────────── */

/** GET /api/v1/messages/announcements —— 按 audience 过滤的已发布公告（含本人已读状态） */
router.get('/announcements', wrap(async (req) => {
  const me = actorOf(req)
  const { page, pageSize, offset } = pagination(req)
  const rows = extDb
    .prepare("SELECT * FROM ext_announcements WHERE status='published' ORDER BY pinned DESC, created_at DESC, id DESC")
    .all()
  // audience 过滤在 JS 侧做（量小；audience ∈ all/rep/owner/manager）
  const visible = rows.filter((r) => {
    const aud = String(r.audience || 'all')
    return aud === 'all' || aud === me.role
  })
  const total = visible.length
  const pageItems = visible.slice(offset, offset + pageSize).map((r) => {
    const read = !!extDb
      .prepare('SELECT read_at FROM ext_announce_reads WHERE ann_id=? AND user_id=?')
      .get(r.id, me.username)
    const readCount = extDb.prepare('SELECT COUNT(*) c FROM ext_announce_reads WHERE ann_id=?').get(r.id).c
    return { ...rowToCamel(r), read, readCount }
  })
  return { items: pageItems, total, page, pageSize, unread: visible.filter((r) => !extDb.prepare('SELECT read_at FROM ext_announce_reads WHERE ann_id=? AND user_id=?').get(r.id, me.username)).length }
}))

/** POST /api/v1/messages/announcements/:id/read —— 标记公告已读，返回最新已读人数 */
router.post('/announcements/:id/read', wrap(async (req) => {
  const me = actorOf(req)
  const ann = extDb.prepare('SELECT * FROM ext_announcements WHERE id=?').get(String(req.params.id))
  if (!ann) throw new ApiError(404, '公告不存在')
  markRead('ext_announce_reads', 'ann_id', ann.id, me.username, nowIso())
  const readCount = extDb.prepare('SELECT COUNT(*) c FROM ext_announce_reads WHERE ann_id=?').get(ann.id).c
  return { id: ann.id, readCount, read: true }
}))

/* ───────────────────────── ③ 未读汇总（Tab 角标） ───────────────────────── */

/** GET /api/v1/messages/unread —— 公告未读 + 会话未读合计，供底部导航角标 */
router.get('/unread', wrap(async (req) => {
  const me = actorOf(req)

  const anns = extDb.prepare("SELECT id, audience FROM ext_announcements WHERE status='published'").all()
  const annUnread = anns.filter((a) => {
    const aud = String(a.audience || 'all')
    if (aud !== 'all' && aud !== me.role) return false
    return !extDb.prepare('SELECT read_at FROM ext_announce_reads WHERE ann_id=? AND user_id=?').get(a.id, me.username)
  }).length

  const convs = extDb.prepare('SELECT * FROM ext_conversations').all().filter((c) => canAccess(c, me.role))
  const convUnread = convs.reduce((s, c) => s + unreadOf(c.id, me.username), 0)

  return { announcements: annUnread, conversations: convUnread, total: annUnread + convUnread }
}))

export default { base: '/messages', router }
