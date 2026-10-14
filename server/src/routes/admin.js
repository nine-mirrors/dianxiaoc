/**
 * 管理员端路由（W2）—— 店小C 运营管理后台接口集。
 *
 * 挂载：由 routes/index.js 自动挂到 /api/v1/admin（本文件默认导出 { base, router }）。
 * 鉴权：所有 /api/v1/* 已在主入口经过 requireAuth 闸门；本文件再做二级角色守卫。
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠ 管理员登录身份说明（W4 前端联调必读）
 * auth.js 的登录只认 server/data/accounts.json 的三个演示账号
 * （liqiang=rep / wangmin=manager / zhangdajie=owner），当前不支持动态注册、
 * 也没有 role=admin 的可登录账号；ext_accounts 仅是管理端派发账号的记录表，
 * 写入它【不会】让新账号获得登录能力（登录链路在 auth.js，本期不改）。
 *
 * 因此为保证竞赛演示可跑通，本文件所有路由（含写操作）统一用宽松守卫，
 * 允许 ['admin','manager'] —— 即经理「王敏」(wangmin/123456) 可登录并演示
 * 全部管理员功能。
 *
 * TODO(auth)：待 auth.js 支持动态账号 / admin 角色登录后：
 *   - 读取类（overview/knowledge/announcements/audit 等 GET）保留 ['admin','manager']；
 *   - 写操作（POST/PUT/DELETE/reset-password/toggle）收紧为 requireRole('admin')。
 * ──────────────────────────────────────────────────────────────────────────
 */
import { randomBytes } from 'node:crypto'
import { newRouter, wrap, ApiError, accountOf } from './_kit.js'
import { extDb, insert, newId, nowIso, writeAudit, rowToCamel } from '../ext.js'
import { users, stores, diagnosesRaw } from '../db.js'

const router = newRouter()

/* ───────────────────────────── 守卫 ───────────────────────────── */

const ALLOW_ROLES = ['admin', 'manager']

// TODO(auth)：写操作后续收紧为 requireRole('admin')，详见文件顶部说明。
const guard = (req, res, next) => {
  const a = accountOf(req)
  if (a && ALLOW_ROLES.includes(a.role)) return next()
  return res.status(403).json({ code: 403, message: '需要管理员权限' })
}
router.use(guard)

/* ───────────────────────────── 通用助手 ───────────────────────────── */

/** node:sqlite 绑定值不接受 undefined，统一转 null */
const N = (v) => (v === undefined ? null : v)

/** 取单行（参数自动 undefined→null） */
function one(sql, params = []) {
  return extDb.prepare(sql).get(...params.map(N))
}

/** 取多行 */
function all(sql, params = []) {
  return extDb.prepare(sql).all(...params.map(N))
}

/** COUNT 类标量查询 */
function scalar(sql, params = []) {
  const row = one(sql, params)
  return row ? Object.values(row)[0] : 0
}

/** 取分页参数（?page=1&pageSize=10，上限 100） */
function pager(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/** 必填校验，缺失抛 400 */
function requireFields(body, keys) {
  for (const k of keys) {
    if (body[k] === undefined || body[k] === null || String(body[k]).trim() === '') {
      throw new ApiError(400, `缺少必填字段：${k}`)
    }
  }
}

/** 白名单取值校验 */
function assertEnum(value, allow, label) {
  if (value !== undefined && value !== null && value !== '' && !allow.includes(String(value))) {
    throw new ApiError(400, `${label} 只能是：${allow.join(' / ')}`)
  }
}

/**
 * 动态 UPDATE（table 名均为文件内硬编码常量，不接受用户输入；值全部 ? 占位）。
 * 影响 0 行 → 404；返回更新后的整行。
 */
function updateTable(table, id, patch) {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined)
  if (!keys.length) throw new ApiError(400, '没有需要更新的字段')
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(', ')} WHERE id=?`
  const r = extDb.prepare(sql).run(...keys.map((k) => N(patch[k])), id)
  if (!r.changes) throw new ApiError(404, '记录不存在或已被删除')
  return one(`SELECT * FROM ${table} WHERE id=?`, [id])
}

/**
 * 审计操作者：token 账号只有 username/role，姓名从 db.js 静态 users 按 role 补。
 */
function actorOf(req) {
  const a = req.account || accountOf(req) || {}
  const seed = users.find((u) => u.role === a.role)
  return {
    id: a.username || '',
    username: a.username || '',
    name: seed?.name || a.username || '',
    role: a.role || '',
  }
}
const audit = (req, action, target, detail = '') => writeAudit(actorOf(req), action, target, detail)

/** ext_accounts 出参：camelCase 且不回传密码 */
function publicAccount(row) {
  const o = rowToCamel(row)
  delete o.password
  return o
}

/** tags 入参：数组转逗号串，字符串原样 */
function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.join(',')
  return tags === undefined ? null : String(tags)
}

/* ───────────────────────────── ① 运营总览 ───────────────────────────── */

router.get(
  '/overview',
  wrap(async () => {
    const userCount = users.length
    const storeCount = stores.length
    const knowledgeCount = scalar("SELECT COUNT(*) c FROM ext_knowledge WHERE status='active'")
    const blacklistCount = scalar("SELECT COUNT(*) c FROM ext_blacklist WHERE status='active'")
    const extAccountCount = scalar('SELECT COUNT(*) c FROM ext_accounts')
    const auditCount = scalar('SELECT COUNT(*) c FROM ext_audit')
    const diagnosisCount = Array.isArray(diagnosesRaw) ? diagnosesRaw.length : 0
    // AI 调用数：审计动作名含 ai（如 admin 之外的 ai.chat / ai.generate）；可能为 0，正常
    const aiCallCount = scalar("SELECT COUNT(*) c FROM ext_audit WHERE action LIKE '%ai%'")

    // 近 7 天审计活动：按 created_at（ISO 字符串）日期部分分组，并在 JS 侧补齐空天
    const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
    const rows = all(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM ext_audit WHERE created_at >= ? GROUP BY day ORDER BY day`,
      [since],
    )
    const byDay = new Map(rows.map((r) => [r.day, r.count]))
    const auditTrend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const day = d.toISOString().slice(0, 10)
      auditTrend.push({ day, count: byDay.get(day) || 0 })
    }

    return {
      userCount,
      storeCount,
      knowledgeCount,
      blacklistCount,
      accountCount: extAccountCount + userCount,
      extAccountCount,
      seedAccountCount: userCount,
      auditCount,
      diagnosisCount,
      aiCallCount,
      auditTrend,
    }
  }),
)

/* ───────────────────────────── ② 账号管理 ───────────────────────────── */

// users.json 演示角色 → accounts.json 登录名（auth.js DEFAULT_ACCOUNTS 同口径）
const SEED_LOGIN = { rep: 'liqiang', manager: 'wangmin', owner: 'zhangdajie' }

/** 内置演示账号（来源 users.json + auth.js accounts.json），只读、不可停用 */
function seedAccounts() {
  return users.map((u) => ({
    id: u.id,
    username: u.username ?? SEED_LOGIN[u.role] ?? '',
    name: u.name,
    role: u.role,
    region: u.region ?? u.regionId ?? '',
    storeId: u.storeId ?? u.store_id ?? null,
    source: 'seed',
    status: 'active',
    editable: false,
  }))
}

router.get(
  '/accounts',
  wrap(async () => {
    const ext = all('SELECT * FROM ext_accounts ORDER BY created_at DESC, id DESC').map((r) => ({
      ...publicAccount(r),
      source: 'ext',
      editable: true,
    }))
    return { items: [...seedAccounts(), ...ext], total: seedAccounts().length + ext.length }
  }),
)

router.post(
  '/accounts',
  wrap(async (req) => {
    const b = req.body || {}
    requireFields(b, ['username', 'password', 'name', 'role'])
    assertEnum(b.role, ['rep', 'manager', 'owner', 'admin'], 'role')
    const username = String(b.username).trim()
    if (one('SELECT id FROM ext_accounts WHERE username=?', [username])) {
      throw new ApiError(409, '登录账号已存在')
    }
    const id = newId('ACC')
    insert('ext_accounts', {
      id,
      username,
      password: String(b.password),
      name: String(b.name),
      role: String(b.role),
      region: N(b.region),
      store_id: N(b.store_id ?? b.storeId),
      status: b.status || 'active',
      created_at: nowIso(),
      created_by: actorOf(req).id,
    })
    audit(req, 'admin.account.create', id, { username, role: b.role, name: b.name })
    // 注意：ext_accounts 仅为派发记录，当前 auth.js 登录链路不读此表（见文件顶部说明）
    return { item: publicAccount(one('SELECT * FROM ext_accounts WHERE id=?', [id])) }
  }),
)

router.put(
  '/accounts/:id',
  wrap(async (req) => {
    const { id } = req.params
    const b = req.body || {}
    if (b.role !== undefined) assertEnum(b.role, ['rep', 'manager', 'owner', 'admin'], 'role')
    if (b.status !== undefined) assertEnum(b.status, ['active', 'disabled'], 'status')
    const patch = {
      name: b.name === undefined ? undefined : String(b.name),
      role: b.role === undefined ? undefined : String(b.role),
      region: b.region,
      store_id: b.store_id ?? b.storeId,
      status: b.status,
    }
    if (b.password) patch.password = String(b.password)
    const row = updateTable('ext_accounts', id, patch)
    audit(req, 'admin.account.update', id, { fields: Object.keys(patch) })
    return { item: publicAccount(row) }
  }),
)

router.post(
  '/accounts/:id/reset-password',
  wrap(async (req) => {
    const { id } = req.params
    // body 指定密码优先，否则生成 8 位随机密码
    const password = String(req.body?.password || '').trim() || randomBytes(4).toString('hex')
    updateTable('ext_accounts', id, { password })
    audit(req, 'admin.account.reset_password', id)
    return { id, password }
  }),
)

/* ───────────────────────────── ③ 黑名单 ───────────────────────────── */

router.get(
  '/blacklist',
  wrap(async (req) => {
    const { page, pageSize, offset } = pager(req)
    const where = []
    const params = []
    if (req.query.status) {
      where.push('status=?')
      params.push(String(req.query.status))
    }
    if (req.query.level) {
      where.push('level=?')
      params.push(String(req.query.level))
    }
    if (req.query.type) {
      where.push('type=?')
      params.push(String(req.query.type))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = scalar(`SELECT COUNT(*) c FROM ext_blacklist ${whereSql}`, params)
    const items = all(
      `SELECT * FROM ext_blacklist ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ).map(rowToCamel)
    return { items, total, page, pageSize }
  }),
)

router.post(
  '/blacklist',
  wrap(async (req) => {
    const b = req.body || {}
    requireFields(b, ['type', 'targetId', 'targetName', 'reason'])
    assertEnum(b.type, ['store', 'sku'], 'type')
    assertEnum(b.level, ['high', 'mid', 'low'], 'level')
    const id = newId('BL')
    insert('ext_blacklist', {
      id,
      type: String(b.type),
      target_id: String(b.targetId),
      target_name: String(b.targetName),
      reason: String(b.reason),
      level: b.level || 'mid',
      status: b.status || 'active',
      created_at: nowIso(),
      created_by: actorOf(req).id,
    })
    audit(req, 'admin.blacklist.create', id, { type: b.type, target: b.targetName, level: b.level || 'mid' })
    return { item: rowToCamel(one('SELECT * FROM ext_blacklist WHERE id=?', [id])) }
  }),
)

router.put(
  '/blacklist/:id',
  wrap(async (req) => {
    const { id } = req.params
    const b = req.body || {}
    assertEnum(b.type, ['store', 'sku'], 'type')
    assertEnum(b.level, ['high', 'mid', 'low'], 'level')
    assertEnum(b.status, ['active', 'revoked'], 'status')
    const patch = {
      type: b.type,
      target_id: b.targetId ?? b.target_id,
      target_name: b.targetName ?? b.target_name,
      reason: b.reason,
      level: b.level,
      status: b.status,
    }
    const row = updateTable('ext_blacklist', id, patch)
    audit(req, 'admin.blacklist.update', id, { fields: Object.keys(patch) })
    return { item: rowToCamel(row) }
  }),
)

router.post(
  '/blacklist/:id/toggle',
  wrap(async (req) => {
    const { id } = req.params
    const cur = one('SELECT * FROM ext_blacklist WHERE id=?', [id])
    if (!cur) throw new ApiError(404, '黑名单记录不存在')
    // body.status 可显式指定；否则 active ↔ revoked 对切
    const next = req.body?.status || (cur.status === 'active' ? 'revoked' : 'active')
    assertEnum(next, ['active', 'revoked'], 'status')
    updateTable('ext_blacklist', id, { status: next })
    audit(req, 'admin.blacklist.toggle', id, { status: next })
    return { id, status: next }
  }),
)

/* ───────────────────────────── ④ SKU 规则 ───────────────────────────── */

const SKU_RULE_TYPES = ['ban_sale_below_cost', 'key_shelf', 'expire_first']

router.get(
  '/sku-rules',
  wrap(async (req) => {
    const where = []
    const params = []
    if (req.query.status) {
      where.push('status=?')
      params.push(String(req.query.status))
    }
    if (req.query.ruleType) {
      where.push('rule_type=?')
      params.push(String(req.query.ruleType))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const items = all(
      `SELECT * FROM ext_sku_rules ${whereSql} ORDER BY created_at DESC, id DESC`,
      params,
    ).map(rowToCamel)
    return { items, total: items.length }
  }),
)

router.post(
  '/sku-rules',
  wrap(async (req) => {
    const b = req.body || {}
    requireFields(b, ['skuCode', 'skuName', 'ruleType'])
    assertEnum(b.ruleType, SKU_RULE_TYPES, 'ruleType')
    const id = newId('SKR')
    insert('ext_sku_rules', {
      id,
      sku_code: String(b.skuCode),
      sku_name: String(b.skuName),
      rule_type: String(b.ruleType),
      note: N(b.note),
      status: b.status || 'active',
      created_at: nowIso(),
      created_by: actorOf(req).id,
    })
    audit(req, 'admin.sku_rule.create', id, { sku: b.skuCode, ruleType: b.ruleType })
    return { item: rowToCamel(one('SELECT * FROM ext_sku_rules WHERE id=?', [id])) }
  }),
)

router.put(
  '/sku-rules/:id',
  wrap(async (req) => {
    const { id } = req.params
    const b = req.body || {}
    assertEnum(b.ruleType, SKU_RULE_TYPES, 'ruleType')
    assertEnum(b.status, ['active', 'revoked'], 'status')
    const patch = {
      sku_code: b.skuCode,
      sku_name: b.skuName,
      rule_type: b.ruleType,
      note: b.note,
      status: b.status,
    }
    const row = updateTable('ext_sku_rules', id, patch)
    audit(req, 'admin.sku_rule.update', id, { fields: Object.keys(patch) })
    return { item: rowToCamel(row) }
  }),
)

/* ───────────────────────────── ⑤ 知识库 ───────────────────────────── */

router.get(
  '/knowledge',
  wrap(async (req) => {
    const { page, pageSize, offset } = pager(req)
    const where = []
    const params = []
    // 默认只看有效条目；?status=all 看全部，或传具体 status
    const status = req.query.status ? String(req.query.status) : 'active'
    if (status !== 'all') {
      where.push('status=?')
      params.push(status)
    }
    if (req.query.q) {
      const kw = `%${String(req.query.q)}%`
      where.push('(question LIKE ? OR answer LIKE ? OR tags LIKE ?)')
      params.push(kw, kw, kw)
    }
    if (req.query.category) {
      where.push('category=?')
      params.push(String(req.query.category))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = scalar(`SELECT COUNT(*) c FROM ext_knowledge ${whereSql}`, params)
    const items = all(
      `SELECT * FROM ext_knowledge ${whereSql} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ).map(rowToCamel)
    return { items, total, page, pageSize }
  }),
)

router.post(
  '/knowledge',
  wrap(async (req) => {
    const b = req.body || {}
    requireFields(b, ['category', 'question', 'answer'])
    const id = newId('KB')
    const t = nowIso()
    insert('ext_knowledge', {
      id,
      category: String(b.category),
      question: String(b.question),
      answer: String(b.answer),
      tags: normalizeTags(b.tags),
      status: 'active',
      created_at: t,
      updated_at: t,
      created_by: actorOf(req).id,
    })
    audit(req, 'admin.knowledge.create', id, { category: b.category })
    return { item: rowToCamel(one('SELECT * FROM ext_knowledge WHERE id=?', [id])) }
  }),
)

router.put(
  '/knowledge/:id',
  wrap(async (req) => {
    const { id } = req.params
    const b = req.body || {}
    assertEnum(b.status, ['active', 'revoked'], 'status')
    const patch = {
      category: b.category,
      question: b.question,
      answer: b.answer,
      tags: b.tags === undefined ? undefined : normalizeTags(b.tags),
      status: b.status,
      updated_at: nowIso(),
    }
    const row = updateTable('ext_knowledge', id, patch)
    audit(req, 'admin.knowledge.update', id, { fields: Object.keys(patch) })
    return { item: rowToCamel(row) }
  }),
)

// 软删除：置 revoked，不真删，保留审计链
router.delete(
  '/knowledge/:id',
  wrap(async (req) => {
    const { id } = req.params
    const r = extDb
      .prepare("UPDATE ext_knowledge SET status='revoked', updated_at=? WHERE id=? AND status!='revoked'")
      .run(nowIso(), id)
    if (!r.changes) throw new ApiError(404, '知识条目不存在或已删除')
    audit(req, 'admin.knowledge.delete', id)
    return { id, status: 'revoked' }
  }),
)

/* ───────────────────────────── ⑥ 公告 ───────────────────────────── */

router.get(
  '/announcements',
  wrap(async () => {
    // 管理员视角：附带每条公告已读人数
    const items = all(
      `SELECT a.*,
              (SELECT COUNT(*) FROM ext_announce_reads r WHERE r.ann_id = a.id) AS read_count
       FROM ext_announcements a
       ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC`,
    ).map(rowToCamel)
    return { items, total: items.length }
  }),
)

router.post(
  '/announcements',
  wrap(async (req) => {
    const b = req.body || {}
    requireFields(b, ['title', 'content'])
    assertEnum(b.audience || 'all', ['all', 'rep', 'owner', 'manager'], 'audience')
    const id = newId('ANN')
    insert('ext_announcements', {
      id,
      title: String(b.title),
      content: String(b.content),
      audience: b.audience || 'all',
      pinned: b.pinned ? 1 : 0,
      status: 'published',
      created_at: nowIso(),
      created_by: actorOf(req).id,
    })
    audit(req, 'admin.announcement.create', id, { title: b.title, audience: b.audience || 'all' })
    return {
      item: rowToCamel(
        one(
          `SELECT a.*, (SELECT COUNT(*) FROM ext_announce_reads r WHERE r.ann_id = a.id) AS read_count
           FROM ext_announcements a WHERE a.id=?`,
          [id],
        ),
      ),
    }
  }),
)

/* ───────────────────────────── ⑦ 审计日志 ───────────────────────────── */

router.get(
  '/audit',
  wrap(async (req) => {
    const { page, pageSize, offset } = pager(req)
    const where = []
    const params = []
    if (req.query.actor) {
      const kw = `%${String(req.query.actor)}%`
      where.push('(actor_name LIKE ? OR actor_id LIKE ?)')
      params.push(kw, kw)
    }
    if (req.query.action) {
      where.push('action LIKE ?')
      params.push(`%${String(req.query.action)}%`)
    }
    if (req.query.target) {
      where.push('target LIKE ?')
      params.push(`%${String(req.query.target)}%`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = scalar(`SELECT COUNT(*) c FROM ext_audit ${whereSql}`, params)
    const items = all(
      `SELECT * FROM ext_audit ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ).map(rowToCamel)
    return { items, total, page, pageSize }
  }),
)

export default { base: '/admin', router }
