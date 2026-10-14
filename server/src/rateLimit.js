/**
 * 极简内存限流（零依赖，固定窗口）。
 *
 * 用途：公网体验环境（云服务器）保护两类接口——
 *  1. /auth/login：防爆破；
 *  2. 烧钱/耗时的 AI 与视觉诊断接口：防评委高频点击或被恶意刷 DashScope 额度。
 *
 * 设计取舍：单进程内存计数。本演示只跑单实例 + PM2，重启计数清零完全可接受；
 * 不引入 redis 依赖是为了保持「npm install 零网络也能起」的演示纪律。
 * 若将来多实例部署，再把 Map 换成已有的 Redis 缓存层即可。
 */

/**
 * 创建限流中间件。
 *
 * @param {object} opts
 * @param {number} opts.windowMs 窗口长度（毫秒）
 * @param {number} opts.max 窗口内单 key 最大请求数
 * @param {string} [opts.message] 超限提示
 * @param {(req: any) => string} [opts.keyGenerator] 限流维度（默认按 IP；登录可按 IP+账号）
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({ windowMs, max, message = '操作过于频繁，请稍后再试', keyGenerator }) {
  /** key → { count, resetAt } */
  const buckets = new Map()

  // 周期性清理过期桶，避免 Map 无限增长（每窗口扫一次，成本极低）
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k)
    }
  }, windowMs)
  // 不阻止进程退出（PM2 重启时不挂住事件循环）
  sweeper.unref?.()

  return function rateLimiter(req, res, next) {
    const now = Date.now()
    const key = keyGenerator ? keyGenerator(req) : (req.ip || req.socket?.remoteAddress || 'unknown')
    let b = buckets.get(key)
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs }
      buckets.set(key, b)
    }
    b.count += 1

    const remaining = Math.max(0, max - b.count)
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))

    if (b.count > max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ code: 429, message, data: null })
      return
    }
    next()
  }
}

/** 登录限流：同一 IP 每分钟最多 10 次（错 10 次才锁，正常评委无感）。 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: '尝试次数过多，请 1 分钟后再试',
})

/**
 * AI / 视觉诊断限流：同一登录用户每分钟最多 12 次。
 * 这些接口会真实调用大模型（有成本、耗时数秒），按用户而非 IP 限更合理。
 */
export const aiRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 12,
  message: 'AI 调用过于频繁，请稍等片刻再试',
  keyGenerator: (req) => req.account?.username || req.ip || 'unknown',
})

export default { createRateLimiter, loginRateLimiter, aiRateLimiter }
