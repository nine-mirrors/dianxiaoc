/**
 * W2b 消息中心路由（messages.js）—— 四端实时沟通 + 公告送达。
 *
 * 挂载前缀：/messages（最终路径 /api/v1/messages/…）。
 * 鉴权：所有角色登录即可（/api/v1/* 已过主入口鉴权闸门）。
 *
 * 组成：
 *  ① 会话（IM）：GET /conversations、GET /conversations/:id、
 *                POST /conversations/:id（发消息）、POST /conversations/:id/read
 *                POST /conversations/:id/pin   （置顶，按账号隔离）
 *                POST /conversations/:id/mute  （免打扰，按账号隔离）
 *                POST /conversations/:id/hide  （从我的列表移除，按账号隔离）
 *  ② 公告（单向）：GET /announcements、POST /announcements/:id/read
 *                   （发布/编辑在管理员端 admin.js，本文件只负责「读侧」）
 *  ③ 通知中心聚合：GET /notifications（任务待办 + 公告 + 系统动态 + 演示基准时间）
 *  ④ 未读汇总：GET /unread（供底部 Tab 角标；免打扰会话与未逾期任务不计入）
 *
 * 会话成员按**角色**登记（ext_conversations.members = JSON 数组，如 ["rep","manager"]），
 * 因此同角色的登录账号共享该会话。发消息后按成员角色调用 realtime.broadcast 实时推送
 * （事件 `message:new`）；公告发布由 admin.js 侧广播 `announcement:new`。
 */
import { newRouter, wrap, ApiError, accountOf, pagination, requireRole } from './_kit.js'
import { extDb, insert, newId, nowIso, writeAudit, rowToCamel } from '../ext.js'
import { findUserByRole, listTasks, listTickets, listRectifications, allVisits } from '../db.js'
import { DEMO_NOW } from '../dashboard.js'
import { avatarUrlForRole } from '../auth.js'
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

/**
 * 会话「对方」头像：取第一个非本人角色成员的账号头像；无则空串。
 * （会话成员按角色登记，同角色可能对应多个账号，此处取第一个命中账号）
 */
function peerAvatarOf(conv, me) {
  for (const role of parseMembers(conv.members)) {
    if (role !== me.role) return avatarUrlForRole(role)
  }
  return ''
}

/** 组装会话列表项（列表与置顶接口共用，保证结构一致） */
function buildConvItem(conv, me) {
  const last = extDb
    .prepare('SELECT * FROM ext_messages WHERE conv_id=? ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(conv.id)
  return {
    id: conv.id,
    kind: conv.kind,
    title: conv.title,
    region: conv.region,
    storeId: conv.store_id,
    members: parseMembers(conv.members),
    lastAt: conv.last_at,
    lastMessage: last ? rowToCamel(last) : null,
    unread: unreadOf(conv.id, me.username),
    pinned: isConvPinned(conv.id, me.username),
    muted: isConvMuted(conv.id, me.username),
    peerAvatarUrl: peerAvatarOf(conv, me),
  }
}

/** 某账号是否置顶了该会话（按账号隔离） */
function isConvPinned(convId, userId) {
  return !!extDb.prepare('SELECT 1 FROM ext_conv_pins WHERE conv_id=? AND user_id=?').get(convId, userId)
}

/** 某账号是否对会话开启了免打扰（按账号隔离，只影响自己） */
function isConvMuted(convId, userId) {
  return !!extDb.prepare('SELECT 1 FROM ext_conv_mutes WHERE conv_id=? AND user_id=?').get(convId, userId)
}

/**
 * 某账号是否已把该会话从列表「删除」（按账号隔离的软删除）。
 * 语义：删除后静默，直到该会话再次产生新消息（last_at 晚于删除时间）才重新出现，
 * 与常见 IM 的「删除会话」一致；不影响其他成员，也不删任何消息数据。
 */
function isConvHidden(conv, userId) {
  const h = extDb.prepare('SELECT hidden_at FROM ext_conv_hides WHERE conv_id=? AND user_id=?').get(conv.id, userId)
  if (!h) return false
  return String(conv.last_at || '') <= String(h.hidden_at || '')
}

/**
 * 'YYYY-MM-DD HH:mm' → 毫秒时间戳（按本地时区**确定性解析**）。
 * 不用 `new Date(str)`：非 ISO 串的解析规则是实现相关的，不同环境可能得到不同结果，
 * 而逾期判定一旦漂移就会出现「同一屏两个数」的低级错误。
 */
function parseLocalTime(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''))
  if (!m) return NaN
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime()
}

/**
 * 某账号可见的公告列表（含本人已读状态与已读人数）。
 * 出参结构与 GET /announcements 的 items 完全一致 —— /notifications（通知中心聚合）
 * 直接复用，避免两处各写一遍导致「未读数对不上」。
 */
function announcementItemsFor(me) {
  const rows = extDb
    .prepare("SELECT * FROM ext_announcements WHERE status='published' ORDER BY pinned DESC, created_at DESC, id DESC")
    .all()
  return rows
    .filter((r) => {
      const aud = String(r.audience || 'all')
      return aud === 'all' || aud === me.role
    })
    .map((r) => {
      const read = !!extDb
        .prepare('SELECT read_at FROM ext_announce_reads WHERE ann_id=? AND user_id=?')
        .get(r.id, me.username)
      const readCount = extDb.prepare('SELECT COUNT(*) c FROM ext_announce_reads WHERE ann_id=?').get(r.id).c
      return { ...rowToCamel(r), pinned: !!r.pinned, read, readCount }
    })
}

/** 未读会话合计（**免打扰会话不计入**，与列表内弱化显示的口径区分开），供 /unread 与 /notifications 共用 */
function conversationUnreadFor(me) {
  const convs = extDb.prepare('SELECT * FROM ext_conversations').all().filter((c) => canAccess(c, me.role))
  return convs.reduce((sum, c) => (isConvMuted(c.id, me.username) ? sum : sum + unreadOf(c.id, me.username)), 0)
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

/** GET /api/v1/messages/conversations —— 我可见的会话列表（含最后一条、未读数、置顶与对方头像） */
router.get('/conversations', wrap(async (req) => {
  const me = actorOf(req)
  const rows = extDb.prepare('SELECT * FROM ext_conversations ORDER BY last_at DESC, id').all()
  const items = []
  for (const r of rows) {
    if (!canAccess(r, me.role)) continue
    if (isConvHidden(r, me.username)) continue // 已被本人「删除」且无新消息 → 不出现
    items.push(buildConvItem(r, me))
  }
  // 置顶（按当前账号隔离）优先，其次按最后消息时间倒序
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return String(b.lastAt || '').localeCompare(String(a.lastAt || ''))
  })
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

/**
 * POST /api/v1/messages/conversations/:id/pin
 * body: { pinned: boolean } —— 置顶 / 取消置顶（**按当前登录账号隔离**，不影响他人）。
 * 返回更新后的会话对象（与列表项同结构，含 pinned / peerAvatarUrl）。
 */
router.post('/conversations/:id/pin', wrap(async (req) => {
  const me = actorOf(req)
  const conv = mustConv(req, me)
  const pinned = !!req.body?.pinned
  if (pinned) {
    extDb
      .prepare(`INSERT INTO ext_conv_pins (conv_id, user_id, pinned_at) VALUES (?,?,?)
                ON CONFLICT(conv_id, user_id) DO UPDATE SET pinned_at=excluded.pinned_at`)
      .run(conv.id, me.username, nowIso())
  } else {
    extDb.prepare('DELETE FROM ext_conv_pins WHERE conv_id=? AND user_id=?').run(conv.id, me.username)
  }
  return buildConvItem(conv, me)
}))

/**
 * POST /api/v1/messages/conversations/:id/mute
 * body: { muted: boolean } —— 免打扰 / 取消免打扰（**按当前登录账号隔离**）。
 * 免打扰语义：该会话的未读不计入底部导航角标；列表内仍显示未读数（弱化样式）。
 * 返回更新后的会话对象。
 */
router.post('/conversations/:id/mute', wrap(async (req) => {
  const me = actorOf(req)
  const conv = mustConv(req, me)
  const muted = !!req.body?.muted
  if (muted) {
    extDb
      .prepare(`INSERT INTO ext_conv_mutes (conv_id, user_id, muted_at) VALUES (?,?,?)
                ON CONFLICT(conv_id, user_id) DO UPDATE SET muted_at=excluded.muted_at`)
      .run(conv.id, me.username, nowIso())
  } else {
    extDb.prepare('DELETE FROM ext_conv_mutes WHERE conv_id=? AND user_id=?').run(conv.id, me.username)
  }
  return buildConvItem(conv, me)
}))

/**
 * POST /api/v1/messages/conversations/:id/hide
 * body: { hidden: boolean } —— 从「我的」会话列表移除（**按账号隔离的软删除**）。
 * 只写本人名下的一条隐藏记录，不动消息数据、不影响其他成员；该会话再次收到新消息时
 * （last_at 晚于隐藏时间）会自动重新出现在列表中。
 * 返回 { id, hidden }。
 */
router.post('/conversations/:id/hide', wrap(async (req) => {
  const me = actorOf(req)
  const conv = mustConv(req, me)
  const hidden = !!req.body?.hidden
  if (hidden) {
    extDb
      .prepare(`INSERT INTO ext_conv_hides (conv_id, user_id, hidden_at) VALUES (?,?,?)
                ON CONFLICT(conv_id, user_id) DO UPDATE SET hidden_at=excluded.hidden_at`)
      .run(conv.id, me.username, nowIso())
  } else {
    extDb.prepare('DELETE FROM ext_conv_hides WHERE conv_id=? AND user_id=?').run(conv.id, me.username)
  }
  return { id: conv.id, hidden }
}))

/* ───────────────────────── ② 公告（读侧） ───────────────────────── */

/** GET /api/v1/messages/announcements —— 按 audience 过滤的已发布公告（含本人已读状态） */
router.get('/announcements', wrap(async (req) => {
  const me = actorOf(req)
  const { page, pageSize, offset } = pagination(req)
  const visible = announcementItemsFor(me)
  return {
    items: visible.slice(offset, offset + pageSize),
    total: visible.length,
    page,
    pageSize,
    unread: visible.filter((a) => !a.read).length,
  }
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

/**
 * POST /api/v1/messages/announcements/:id/pin
 * body: { pinned: boolean } —— 置顶 / 取消置顶公告（**仅管理员**，公告置顶为全局）。
 * 非管理员由 requireRole('admin') 拦下（403，沿用项目既有权限错误信封）。
 * 返回更新后的公告对象。
 */
router.post('/announcements/:id/pin', requireRole('admin'), wrap(async (req) => {
  const id = String(req.params.id)
  const ann = extDb.prepare('SELECT * FROM ext_announcements WHERE id=?').get(id)
  if (!ann) throw new ApiError(404, '公告不存在')
  const pinned = !!req.body?.pinned
  extDb.prepare('UPDATE ext_announcements SET pinned=? WHERE id=?').run(pinned ? 1 : 0, id)
  const updated = extDb.prepare('SELECT * FROM ext_announcements WHERE id=?').get(id)
  return { ...rowToCamel(updated), pinned }
}))

/* ─────────────────── ②·b 通知中心统一收口（任务 + 公告 + 系统动态 + 天气） ─────────────────── */

/**
 * GET /api/v1/messages/notifications —— 通知中心一次性取全量（功能：统一收口）。
 *
 * 聚合四类：
 *  ① 任务待办：rep/owner = 指派给我的未完成任务；manager/admin = 我下派且未完成的
 *     （每条带 overdue / dueSoon / minutesLeft，供前端做逾期与临期预警）；
 *  ② 公告：结构与 /announcements 完全一致（同一处生成）；
 *  ③ 系统动态：由**真实业务记录**派生（巡店 visits / 整改回执 rectifications / 单据 tickets），
 *     不臆造事件；rep 只看与自己相关的那部分；
 *  ④ 天气：本接口只回传演示基准时间 `now`，天气文案由前端按同一基准渲染（无真实气象源）。
 *
 * ⚠ 逾期/临期一律以**演示基准时间 DEMO_NOW**（= 2026-10-02 23:59，与看板 taskSummary 同源）
 *   判定，不用真实时钟 —— 否则演示期一过，「今日 18:00 前完成」的任务全被判成逾期。
 */
router.get('/notifications', wrap(async (req) => {
  const me = actorOf(req)
  // rep→U_REP、owner→U_OWNER；admin 在 users.json 里没有对应条目（此时保持空串，不查任务）
  const myUserId = findUserByRole(me.role)?.id || ''
  const nowMs = parseLocalTime(DEMO_NOW)

  // ① 任务
  let rawTasks = []
  if (myUserId) {
    rawTasks =
      me.role === 'rep' || me.role === 'owner'
        ? listTasks(myUserId) // 指派给我的
        : listTasks().filter((t) => t.creatorId === myUserId) // 我下派的
  }
  const taskItems = rawTasks
    .filter((t) => t.status === 'open')
    .map((t) => {
      const dueMs = parseLocalTime(t.dueAt)
      const minutesLeft = Number.isFinite(dueMs) ? Math.round((dueMs - nowMs) / 60000) : null
      return {
        ...t,
        minutesLeft,
        overdue: minutesLeft !== null && minutesLeft < 0,
        dueSoon: minutesLeft !== null && minutesLeft >= 0 && minutesLeft <= 24 * 60,
      }
    })
    // 逾期排最前（越早到期越靠前），无时限的排最后
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      return String(a.dueAt || '9999-12-31 23:59').localeCompare(String(b.dueAt || '9999-12-31 23:59'))
    })

  // ② 公告
  const announcements = announcementItemsFor(me)

  // ③ 系统动态（真实记录派生；按时间倒序取前 6 条）
  const system = []
  for (const v of allVisits()) {
    if (me.role === 'rep' && myUserId && v.repId !== myUserId) continue
    system.push({
      id: `SYS_V_${v.id}`,
      kind: 'visit',
      level: 'ok',
      title: `巡店完成 · ${v.storeName}`,
      desc: `健康分 ${v.score} 分 · 第 ${v.visitNo} 次巡店`,
      at: v.visitedAt,
    })
    if (system.length >= 6) break
  }
  let sysRects = 0
  for (const r of listRectifications({})) {
    if (me.role === 'rep' && myUserId && r.operatorId !== myUserId) continue
    system.push({
      id: `SYS_R_${r.id}`,
      kind: 'rectification',
      level: 'ok',
      title: `整改回执 · ${r.storeName}`,
      desc: `${r.issueTitle}：${r.beforeScore} → ${r.afterScore} 分（+${r.gain}）`,
      at: r.createdAt,
    })
    if (++sysRects >= 3) break
  }
  for (const t of listTickets({ limit: 3 })) {
    system.push({
      id: `SYS_T_${t.id}`,
      kind: 'ticket',
      level: t.status === 'pending' ? 'warn' : 'ok',
      title: `${t.kind === 'order' ? '订货单' : '整改单'} · ${t.storeName}`,
      desc: t.status === 'pending' ? '已提交，等待门店接单' : '门店已确认接单',
      at: t.createdAt,
    })
  }
  const systemItems = system
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 6)

  // ④ 计数（角标口径：未读公告 + 未读会话[免打扰不计] + 逾期任务）
  const unreadAnnouncements = announcements.filter((a) => !a.read).length
  const unreadConversations = conversationUnreadFor(me)
  const overdueTasks = taskItems.filter((t) => t.overdue).length
  const dueSoonTasks = taskItems.filter((t) => t.dueSoon).length

  return {
    now: DEMO_NOW,
    tasks: { items: taskItems.slice(0, 8), open: taskItems.length, overdue: overdueTasks, dueSoon: dueSoonTasks },
    announcements: announcements.slice(0, 20),
    system: systemItems,
    counts: {
      unreadAnnouncements,
      unreadConversations,
      openTasks: taskItems.length,
      overdueTasks,
      dueSoonTasks,
      total: unreadAnnouncements + unreadConversations + overdueTasks,
    },
  }
}))

/* ───────────────────────── ③ 未读汇总（Tab 角标） ───────────────────────── */

/**
 * GET /api/v1/messages/unread —— 导航角标汇总。
 * 口径：未读公告 + 未读会话（**免打扰不计入**）+ **逾期未完成任务**（逾期必须提醒，
 * 与通知中心的「逾期」同源判定，避免两屏数字打架）。
 */
router.get('/unread', wrap(async (req) => {
  const me = actorOf(req)
  const unreadAnnouncements = announcementItemsFor(me).filter((a) => !a.read).length
  const conversations = conversationUnreadFor(me)

  // 逾期任务：与 /notifications 同一套判定（演示基准时间 + parseLocalTime）
  const myUserId = findUserByRole(me.role)?.id || ''
  const nowMs = parseLocalTime(DEMO_NOW)
  let overdueTasks = 0
  if (myUserId) {
    const mine =
      me.role === 'rep' || me.role === 'owner'
        ? listTasks(myUserId)
        : listTasks().filter((t) => t.creatorId === myUserId)
    overdueTasks = mine.filter((t) => {
      if (t.status !== 'open') return false
      const dueMs = parseLocalTime(t.dueAt)
      return Number.isFinite(dueMs) && dueMs < nowMs
    }).length
  }

  return {
    announcements: unreadAnnouncements,
    conversations,
    tasks: overdueTasks,
    total: unreadAnnouncements + conversations + overdueTasks,
  }
}))

export default { base: '/messages', router }
