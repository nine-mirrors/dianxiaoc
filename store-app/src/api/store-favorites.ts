/**
 * 门店收藏 / 重点关注 API 契约（四端共用，按登录账号隔离）。
 *
 * 对应后端 server/src/routes/store-favorites.js（前缀 /api/v1/store-favorites）：
 *   GET    /           我的收藏列表（门店名 + 健康分 + 辖区 + 收藏时间 + 备注 + 最近巡店时间）
 *   POST   /:storeId    收藏（幂等 upsert）；门店不存在返回 404
 *   DELETE /:storeId    取消收藏（幂等：未收藏也返回成功）
 *   PATCH  /:storeId    更新备注（≤ 60 字）
 *
 * 分层约定（ARCHITECTURE 铁律 1）：页面/组件只从 @/api/* 取数，不直接 fetch。
 * 门店数据（名称/健康分/辖区/巡店时间）全部由后端从真实数据源带出，前端不臆造。
 */
import { request } from './client'

/** 单条收藏门店（后端聚合了门店档案 + 收藏记录的真实字段） */
export interface FavoriteStore {
  /** 门店 id（如 S3） */
  storeId: string
  /** 门店名称（来自 stores.json） */
  storeName: string
  /** 门店类型文案，如「C类便利店」 */
  typeLabel: string
  /** 所属片区 id，如 R_EAST（无则 null） */
  regionId: string | null
  /** 所属片区中文名（来自 dashboard.json 的 regionIds 映射） */
  regionName: string
  /** 健康分（门店档案真实分 lastScore；无则 null） */
  healthScore: number | null
  /** 健康分档位 key：excellent / good / warning / risk；无分则 null */
  level: string | null
  /** 收藏时间（ISO 串） */
  favoritedAt: string
  /** 我的备注（≤ 60 字） */
  note: string
  /** 最近一次真实巡店时间；从未巡店则 null */
  lastVisitAt: string | null
}

/** GET / —— 我的收藏列表（按收藏时间倒序） */
export async function listStoreFavorites(): Promise<{ items: FavoriteStore[]; total: number }> {
  return request({ path: '/api/v1/store-favorites', method: 'GET' })
}

/**
 * POST /:storeId —— 收藏门店（幂等 upsert）。
 *
 * @param storeId 门店 id
 * @param note    可选初始备注（≤ 60 字）
 */
export async function addStoreFavorite(
  storeId: string,
  note = '',
): Promise<{ favorite: FavoriteStore }> {
  return request({
    path: `/api/v1/store-favorites/${storeId}`,
    method: 'POST',
    body: { note },
  })
}

/**
 * DELETE /:storeId —— 取消收藏（幂等：未收藏也返回成功）。
 *
 * @param storeId 门店 id
 * @returns removed=true 表示确实删除了一条收藏
 */
export async function removeStoreFavorite(
  storeId: string,
): Promise<{ storeId: string; removed: boolean }> {
  return request({ path: `/api/v1/store-favorites/${storeId}`, method: 'DELETE' })
}

/**
 * PATCH /:storeId —— 更新收藏备注（≤ 60 字）。
 *
 * @param storeId 门店 id
 * @param note    新备注（后端按码点裁到 60 字）
 */
export async function updateStoreFavoriteNote(
  storeId: string,
  note: string,
): Promise<{ favorite: FavoriteStore }> {
  return request({
    path: `/api/v1/store-favorites/${storeId}`,
    method: 'PATCH',
    body: { note },
  })
}

export default {
  listStoreFavorites,
  addStoreFavorite,
  removeStoreFavorite,
  updateStoreFavoriteNote,
}
