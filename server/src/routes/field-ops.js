/**
 * W2 业务路由 · 业代现场作业（field-ops.js）：到店签到 + 库存盘点
 *
 * 挂载前缀：/field（最终路径 /api/v1/field/checkin 等）。
 * 守卫：全部接口登录即可；写操作限 rep / owner / admin。
 *
 * 存储：ext_checkins / ext_inventory（ext.js 的 ext.db，node:sqlite 同步、参数化）。
 * 每次盘点共用同一个 created_at 时间戳，天然形成"一组"，GET 取最新组即最新盘点。
 */
import { newRouter, wrap, ApiError, requireRole, accountOf, pagination } from './_kit.js'
import { users, findStore, findUserByRole } from '../db.js'
import { extDb, insert, newId, nowIso, writeAudit, rowToCamel } from '../ext.js'

const router = newRouter()
const writeGuard = requireRole('rep', 'owner', 'admin')

/** 由当前登录账号解析业代身份（与 db.createRectification 同一套解析顺序） */
function resolveActor(account) {
  const key = String(account?.username ?? '').trim()
  const user =
    users.find((u) => u.id === key) ??
    users.find((u) => u.name === key) ??
    (account?.role ? findUserByRole(account.role) : null)
  return {
    actor: { id: user?.id ?? key, username: key, name: user?.name ?? key },
    repId: user?.id ?? key,
    user,
  }
}

/** 有限数值；非法/缺省回退 null（undefined 一律不绑进 SQL） */
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
/** 非负整数，缺省给 0（盘点数量字段） */
function intQty(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 0 ? n : 0
}
function strOrNull(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/* ───────────────────────── 到店签到 ───────────────────────── */

/**
 * POST /api/v1/field/checkin
 * body: { storeId, lat?, lng?, addr?, photoId? }
 */
router.post('/checkin', writeGuard, wrap(async (req) => {
  // 鉴权闸门已把账号注入 req.account；accountOf 仅作无网关注入时的兜底（同源同值）
  const account = req.account ?? accountOf(req)
  const storeId = strOrNull(req.body?.storeId)
  if (!storeId) throw new ApiError(400, '缺少 storeId')
  const store = findStore(storeId)
  if (!store) throw new ApiError(404, '门店不存在，无法签到')

  const { actor, repId } = resolveActor(account)
  const id = newId('CHK')
  const createdAt = nowIso()
  const record = {
    id,
    store_id: storeId,
    store_name: store?.name ?? '',
    rep_id: repId,
    lat: numOrNull(req.body?.lat),
    lng: numOrNull(req.body?.lng),
    addr: strOrNull(req.body?.addr),
    photo_id: strOrNull(req.body?.photoId),
    created_at: createdAt,
  }
  insert('ext_checkins', record)
  writeAudit(actor, 'checkin', storeId, { storeName: store?.name ?? '', lat: record.lat, lng: record.lng })

  return { checkin: rowToCamel(extDb.prepare('SELECT * FROM ext_checkins WHERE id = ?').get(id)) }
}))

/**
 * GET /api/v1/field/checkins?storeId=&page=1&pageSize=10
 * 分页返回签到记录（倒序）；不带 storeId 时返回全量（经理视角）。
 */
router.get('/checkins', wrap(async (req) => {
  const { page, pageSize, offset, limit } = pagination(req)
  const storeId = strOrNull(req.query.storeId)

  const whereSql = storeId ? 'WHERE store_id = ?' : ''
  const params = storeId ? [storeId] : []
  const total = extDb.prepare(`SELECT COUNT(*) AS c FROM ext_checkins ${whereSql}`).get(...params).c
  const rows = extDb
    .prepare(`SELECT * FROM ext_checkins ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)

  return { items: rows.map((r) => rowToCamel(r)), total, page, pageSize }
}))

/* ───────────────────────── 库存盘点 ───────────────────────── */

/**
 * POST /api/v1/field/stores/:id/inventory
 * body: { items: [{ skuCode, skuName, qty, shelfQty, expireAt, note }] }
 * 一次请求 = 一组盘点（共用 created_at）。
 */
router.post('/stores/:id/inventory', writeGuard, wrap(async (req) => {
  const account = req.account ?? accountOf(req)
  const store = findStore(req.params.id)
  if (!store) throw new ApiError(404, '门店不存在，无法盘点')

  const rawItems = Array.isArray(req.body?.items) ? req.body.items : null
  if (!rawItems || rawItems.length === 0) throw new ApiError(400, '盘点明细 items 不能为空')

  const { actor, repId } = resolveActor(account)
  const createdAt = nowIso()
  const items = []
  for (const it of rawItems) {
    const skuCode = strOrNull(it?.skuCode)
    const skuName = strOrNull(it?.skuName)
    if (!skuCode && !skuName) throw new ApiError(400, '盘点条目必须包含 skuCode 或 skuName')
    const id = newId('INV')
    const row = {
      id,
      store_id: store.id,
      sku_code: skuCode,
      sku_name: skuName,
      qty: intQty(it?.qty),
      shelf_qty: intQty(it?.shelfQty),
      expire_at: strOrNull(it?.expireAt),
      note: strOrNull(it?.note),
      created_at: createdAt,
      rep_id: repId,
    }
    insert('ext_inventory', row)
    items.push(rowToCamel(row))
  }

  writeAudit(actor, 'inventory', store.id, { storeName: store.name, count: items.length })

  return { storeId: store.id, storeName: store.name, createdAt, count: items.length, items }
}))

/**
 * GET /api/v1/field/stores/:id/inventory
 * 取该店最新一次盘点（created_at 最大的一组）；无记录返回 { items: [], empty: true }。
 */
router.get('/stores/:id/inventory', wrap(async (req) => {
  const store = findStore(req.params.id)
  if (!store) throw new ApiError(404, '门店不存在')

  const latest = extDb
    .prepare('SELECT MAX(created_at) AS m FROM ext_inventory WHERE store_id = ?')
    .get(store.id)
  if (!latest?.m) {
    return { storeId: store.id, items: [], empty: true }
  }
  const rows = extDb
    .prepare('SELECT * FROM ext_inventory WHERE store_id = ? AND created_at = ? ORDER BY id')
    .all(store.id, latest.m)

  return {
    storeId: store.id,
    storeName: store.name,
    createdAt: latest.m,
    count: rows.length,
    items: rows.map((r) => rowToCamel(r)),
    empty: false,
  }
}))

export default { base: '/field', router }
