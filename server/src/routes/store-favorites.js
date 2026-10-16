/**
 * W2 业务路由 · 门店收藏 / 重点关注（store-favorites.js）
 *
 * 挂载前缀：/store-favorites（最终路径 /api/v1/store-favorites 等）。
 * 守卫：登录即可；按 **登录账号（req.account.username）** 隔离，各账号互不可见。
 *
 * 存储：ext_store_favorites（ext.js 的 ext.db，node:sqlite 同步、参数化）。
 * 复合主键 (store_id, user_id) —— 收藏天生幂等，重复收藏只更新备注与时间。
 *
 * 数据诚实原则：门店名 / 健康分 / 辖区 / 最近巡店时间全部取自真实数据源
 *   （db.js 的 findStore → stores.json 档案分 lastScore，dashboard.json 的 regionIds
 *    映射中文片区名，allVisits() 取真实巡店记录），绝不写死或臆造业务数字。
 */
import { newRouter, wrap, ApiError, accountOf } from './_kit.js'
import { findStore, allVisits, dashboard } from '../db.js'
import { levelOf } from '../domain.js'
import { extDb, nowIso } from '../ext.js'

const router = newRouter()

/** 片区 id → 中文名（沿用 fixture 的 regionIds，与前端 storeRows 同源） */
const REGION_NAME = Object.fromEntries((dashboard.regionIds || []).map((r) => [r.id, r.name]))

/** 收藏归属账号（登录账号隔离，统一小写避免大小写漂移） */
function ownerKey(req) {
  const account = req.account ?? accountOf(req)
  return String(account?.username ?? '').trim().toLowerCase()
}

/** 该店最近一次巡店时间（真实 visits，没有则 null） */
function latestVisitAt(storeId) {
  const at = allVisits()
    .filter((v) => v.storeId === storeId && v.visitedAt)
    .map((v) => String(v.visitedAt))
  return at.length ? at.sort().pop() : null
}

/** 备注裁剪到 60 字（按码点计，避免中文被截半） */
function clampNote(v) {
  const s = String(v ?? '').trim()
  return Array.from(s).slice(0, 60).join('')
}

/** 收藏行 + 真实门店数据 → 面向前端的统一结构 */
function decorate(storeId, row) {
  const store = findStore(storeId)
  const score = store && Number.isFinite(Number(store.lastScore)) ? Number(store.lastScore) : null
  return {
    storeId,
    storeName: store?.name ?? '',
    typeLabel: store?.typeLabel ?? '',
    regionId: store?.regionId ?? null,
    regionName: REGION_NAME[store?.regionId] ?? store?.regionId ?? '—',
    healthScore: score,
    level: score === null ? null : levelOf(score),
    favoritedAt: row?.created_at ?? '',
    note: row?.note ?? '',
    lastVisitAt: latestVisitAt(storeId),
  }
}

/**
 * GET /api/v1/store-favorites —— 我的收藏列表（按收藏时间倒序）。
 */
router.get('/', wrap(async (req) => {
  const user = ownerKey(req)
  const rows = extDb
    .prepare('SELECT * FROM ext_store_favorites WHERE user_id = ? ORDER BY created_at DESC, store_id')
    .all(user)
  const items = rows.map((r) => decorate(r.store_id, r))
  return { items, total: items.length }
}))

/**
 * POST /api/v1/store-favorites/:storeId —— 收藏（幂等 upsert）。
 * body: { note? }（≤ 60 字）
 */
router.post('/:storeId', wrap(async (req) => {
  const user = ownerKey(req)
  const storeId = String(req.params.storeId)
  const store = findStore(storeId)
  if (!store) throw new ApiError(404, '门店不存在')

  const note = clampNote(req.body?.note)
  const createdAt = nowIso()
  extDb
    .prepare(
      `INSERT INTO ext_store_favorites (store_id, user_id, note, created_at) VALUES (?,?,?,?)
       ON CONFLICT(store_id, user_id) DO UPDATE SET note = excluded.note`,
    )
    .run(storeId, user, note, createdAt)

  const row = extDb
    .prepare('SELECT * FROM ext_store_favorites WHERE store_id = ? AND user_id = ?')
    .get(storeId, user)
  return { favorite: decorate(storeId, row) }
}))

/**
 * DELETE /api/v1/store-favorites/:storeId —— 取消收藏（幂等：未收藏也返回成功）。
 */
router.delete('/:storeId', wrap(async (req) => {
  const user = ownerKey(req)
  const storeId = String(req.params.storeId)
  const info = extDb
    .prepare('DELETE FROM ext_store_favorites WHERE store_id = ? AND user_id = ?')
    .run(storeId, user)
  return { storeId, removed: info.changes > 0 }
}))

/**
 * PATCH /api/v1/store-favorites/:storeId —— 更新收藏备注（≤ 60 字）。
 * body: { note }
 */
router.patch('/:storeId', wrap(async (req) => {
  const user = ownerKey(req)
  const storeId = String(req.params.storeId)
  const store = findStore(storeId)
  if (!store) throw new ApiError(404, '门店不存在')

  const row = extDb
    .prepare('SELECT * FROM ext_store_favorites WHERE store_id = ? AND user_id = ?')
    .get(storeId, user)
  if (!row) throw new ApiError(404, '尚未收藏该门店')

  const note = clampNote(req.body?.note)
  extDb
    .prepare('UPDATE ext_store_favorites SET note = ? WHERE store_id = ? AND user_id = ?')
    .run(note, storeId, user)
  return { favorite: decorate(storeId, { ...row, note }) }
}))

export default { base: '/store-favorites', router }
