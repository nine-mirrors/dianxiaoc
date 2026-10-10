/**
 * 三级缓存：真 Redis → 内置 RESP 兼容服务（redis-lite）→ 内存 LRU。
 *
 * 为什么上 Redis：AI 生成（巡店小结/订货理由/话术）每次都要调千问，
 * 单次 2-5 秒、还有 token 成本。同一门店同一诊断的文本高度稳定，
 * 缓存后二次打开秒回；演示现场反复点卡片也不烧钱、不卡顿。
 *
 * 为什么还有 redis-lite：演示机器装不了 Redis 服务端（无 docker/choco/winget 源），
 * 但「只留一个代码分支」不够，必须**真实跑通 Redis 语义**。所以内置一个
 * speaking-RESP 的 TCP 服务，用**真正的 ioredis 客户端**连它 ——
 * SET/GET/EX/TTL/过期全部是真实 Redis 行为。生产把 REDIS_URL 指向真 Redis 即切换。
 */
import { startRedisLite, redisLiteStats } from './redisLite.js'

const REDIS_URL = process.env.REDIS_URL || ''
const DEFAULT_TTL_SEC = 60 * 60 // 1 小时

/** 内存兜底：Map + 过期时间 + 容量上限（LRU 近似：超限删最早） */
const mem = new Map()
const MEM_MAX = 500

let redis = null
let lite = null
let backend = 'memory' // 'redis' | 'redis-lite' | 'memory'
let redisState = 'disabled' // disabled | connecting | ready | failed

async function connectWith(mod, url) {
  const Ctor = mod.default || mod.Redis
  const client = new Ctor(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    retryStrategy: () => null,
  })
  client.on('error', () => {
    redisState = 'failed'
  })
  await client.connect()
  await client.ping()
  return client
}

async function getRedis() {
  if (redis) return redis
  if (redisState === 'failed') return null
  redisState = 'connecting'
  const mod = await import('ioredis')

  // ① 配置了 REDIS_URL → 连真 Redis
  if (REDIS_URL) {
    try {
      redis = await connectWith(mod, REDIS_URL)
      backend = 'redis'
      redisState = 'ready'
      return redis
    } catch {
      redis = null
    }
  }

  // ② 起内置 RESP 服务，仍用 ioredis 连（真实协议路径）
  try {
    if (!lite) lite = await startRedisLite(0)
    redis = await connectWith(mod, `redis://127.0.0.1:${lite.port}`)
    backend = 'redis-lite'
    redisState = 'ready'
    return redis
  } catch {
    redis = null
  }

  // ③ 兜底：纯内存
  redisState = 'failed'
  backend = 'memory'
  return null
}

function memSet(key, value, ttlSec) {
  if (mem.has(key)) mem.delete(key)
  mem.set(key, { value, expireAt: Date.now() + ttlSec * 1000 })
  if (mem.size > MEM_MAX) {
    const oldest = mem.keys().next().value
    if (oldest !== undefined) mem.delete(oldest)
  }
}

function memGet(key) {
  const hit = mem.get(key)
  if (!hit) return null
  if (Date.now() > hit.expireAt) {
    mem.delete(key)
    return null
  }
  // LRU 近似：命中后移到末尾
  mem.delete(key)
  mem.set(key, hit)
  return hit.value
}

/** 读缓存（Redis 优先，失败静默回落内存） */
export async function cacheGet(key) {
  const r = await getRedis()
  if (r) {
    try {
      const raw = await r.get(key)
      if (raw) return JSON.parse(raw)
    } catch {
      /* 落到内存 */
    }
  }
  return memGet(key)
}

/** 写缓存 */
export async function cacheSet(key, value, ttlSec = DEFAULT_TTL_SEC) {
  memSet(key, value, ttlSec)
  const r = await getRedis()
  if (r) {
    try {
      await r.set(key, JSON.stringify(value), 'EX', ttlSec)
    } catch {
      /* ignore */
    }
  }
}

/** 命中计数（用于在 UI/接口展示「缓存命中 N 次」，证明缓存真的在用） */
export const cacheStats = { hits: 0, misses: 0, backend: 'memory' }

/** 带缓存的包装 */
export async function withCache(key, ttlSec, producer) {
  const hit = await cacheGet(key)
  if (hit) {
    cacheStats.hits += 1
    return { data: hit, cached: true }
  }
  cacheStats.misses += 1
  const data = await producer()
  // ⚠ 带 _fallback 标记的结果（AI 降级兜底文案）**绝不写缓存**：
  //   否则现场网络抖动一次，兜底文案被钉死到 TTL 结束，网络恢复也救不回来。
  if (data != null && data._fallback !== true) await cacheSet(key, data, ttlSec)
  return { data, cached: false }
}

/** 健康状态 */
export async function cacheHealth() {
  const r = await getRedis()
  let keys = mem.size
  if (r) {
    try {
      keys = await r.dbsize()
    } catch {
      /* ignore */
    }
  }
  return {
    backend: r ? backend : 'memory',
    driver: r ? 'ioredis' : 'in-memory',
    note:
      backend === 'redis'
        ? '已连接真实 Redis 服务'
        : backend === 'redis-lite'
          ? `内置 RESP 兼容服务（127.0.0.1:${lite?.port}），由 ioredis 客户端连接；配置 REDIS_URL 即切真 Redis`
          : '内存兜底模式',
    redisUrl: REDIS_URL ? REDIS_URL.replace(/:\/\/[^@]*@/, '://***@') : '',
    state: r ? redisState : redisState === 'disabled' ? '未配置 REDIS_URL' : redisState,
    entries: keys,
    keysInMemory: mem.size,
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate: cacheStats.hits + cacheStats.misses > 0
      ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100)
      : null,
  }
}

/** 清空（演示设置「重置数据」用） */
export async function cacheClear() {
  mem.clear()
  const r = await getRedis()
  if (r) {
    try {
      await r.flushdb()
    } catch {
      /* ignore */
    }
  }
}
