/**
 * 门店收藏·共享状态（模块级单例）—— 让门店卡星标与「我的 · 重点关注门店」同源。
 *
 * 用法：
 *   const favs = useStoreFavorites()
 *   favs.isFavorite(storeId)            // 是否已收藏
 *   await favs.toggle({ id, name })     // 点击星标：乐观切换 + 失败回滚 + 提示
 *   await favs.load(true)               // 强制刷新（进入「我的」页时拉全量列表）
 *
 * 设计要点：
 *  - 收藏按**登录账号**隔离（后端裁定），本模块只做前端缓存，切账号请调用 reset()；
 *  - 乐观更新：先改本地状态再发请求，失败回滚到操作前快照，并用 toast.error 给出「再试一次」；
 *  - 列表项（含健康分/辖区/备注）仅后端能聚合真实字段，故收藏成功后再用返回体回填。
 */
import { ref } from 'vue'
import {
  listStoreFavorites,
  addStoreFavorite,
  removeStoreFavorite,
  updateStoreFavoriteNote,
} from '@/api/store-favorites'
import type { FavoriteStore } from '@/api/store-favorites'
import { authToken } from '@/api/client'
import { useToast } from '@/composables/useToast'

/** 收藏列表（已收藏门店的聚合对象） */
const items = ref<FavoriteStore[]>([])
/** 已收藏门店 id 集合（用数组保证响应式追踪） */
const ids = ref<string[]>([])
/** 是否正在加载列表 */
const loading = ref(false)
/** 是否已成功加载过一次（用于「首屏骨架 → 空态」判定） */
const loaded = ref(false)

/** 进行中的加载（并发去重，避免多组件重复请求） */
let inflight: Promise<void> | null = null
/** 上次加载时的登录 token：token 变化（切账号）即视为缓存失效，需重拉 */
let cachedToken = ''

/** 取快速判断用的门店 id 集合 */
function idSet(): Set<string> {
  return new Set(ids.value)
}

export function useStoreFavorites() {
  const toast = useToast()

  /** 拉取我的收藏列表（force=true 忽略缓存强制刷新） */
  async function load(force = false): Promise<void> {
    // 切账号检测：token 变了说明换人登录，先清掉上一账号的缓存，避免星标串台
    if (authToken() !== cachedToken) {
      items.value = []
      ids.value = []
      loaded.value = false
      inflight = null
      cachedToken = authToken()
    }
    if (inflight) return inflight
    if (loaded.value && !force) return
    loading.value = true
    inflight = (async () => {
      try {
        const res = await listStoreFavorites()
        items.value = res.items ?? []
        ids.value = items.value.map((i) => i.storeId)
        loaded.value = true
      } catch {
        /* 拉取失败保持现状（不标 loaded，界面显示骨架/重试），不弹错打扰主流程 */
      } finally {
        loading.value = false
        inflight = null
      }
    })()
    return inflight
  }

  /** 是否已收藏 */
  function isFavorite(storeId: string): boolean {
    return !!storeId && idSet().has(storeId)
  }

  /** 写入一条收藏（把后端返回体置顶回填） */
  function upsert(fav: FavoriteStore): void {
    items.value = [fav, ...items.value.filter((i) => i.storeId !== fav.storeId)]
    ids.value = items.value.map((i) => i.storeId)
  }

  /**
   * 点击星标：已收藏则取消，未收藏则收藏。
   * 乐观更新 → 请求失败回滚并给「再试一次」。
   *
   * @param store 目标门店（id + 名称，用于文案）
   */
  async function toggle(store: { id: string; name: string }): Promise<void> {
    const id = store?.id
    if (!id) return
    const name = store.name || '该门店'

    if (isFavorite(id)) {
      const prevItems = items.value
      const prevIds = ids.value
      items.value = items.value.filter((i) => i.storeId !== id)
      ids.value = ids.value.filter((x) => x !== id)
      try {
        await removeStoreFavorite(id)
        toast.info(`已取消关注「${name}」`)
      } catch {
        items.value = prevItems
        ids.value = prevIds
        toast.error('取消关注没成功，请重试', {
          action: { text: '再试一次', onAction: () => void toggle(store) },
        })
      }
      return
    }

    const prevIds = ids.value
    ids.value = [...ids.value, id]
    try {
      const res = await addStoreFavorite(id)
      upsert(res.favorite)
      toast.success(`已关注「${name}」，可在「我的」重点关注里查看`)
    } catch {
      ids.value = prevIds
      toast.error('关注门店没成功，请重试', {
        action: { text: '再试一次', onAction: () => void toggle(store) },
      })
    }
  }

  /** 取消关注（「重点关注门店」列表里的显式取消，带二次确认未做，与星标同逻辑） */
  async function removeFavorite(fav: { storeId: string; storeName: string }): Promise<void> {
    await toggle({ id: fav.storeId, name: fav.storeName })
  }

  /**
   * 更新收藏备注（≤ 60 字）。乐观更新文本，失败回滚。
   */
  async function updateNote(storeId: string, note: string): Promise<void> {
    const trimmed = Array.from(String(note ?? '').trim()).slice(0, 60).join('')
    const prev = items.value
    items.value = items.value.map((i) => (i.storeId === storeId ? { ...i, note: trimmed } : i))
    try {
      const res = await updateStoreFavoriteNote(storeId, trimmed)
      items.value = items.value.map((i) => (i.storeId === storeId ? res.favorite : i))
      toast.success('备注已更新')
    } catch {
      items.value = prev
      toast.error('备注没保存成功，请重试')
    }
  }

  /** 清空缓存（切换账号时调用，避免上一账号的收藏串台） */
  function reset(): void {
    items.value = []
    ids.value = []
    loaded.value = false
  }

  return {
    items,
    ids,
    loading,
    loaded,
    load,
    isFavorite,
    toggle,
    removeFavorite,
    updateNote,
    reset,
  }
}

export default useStoreFavorites
