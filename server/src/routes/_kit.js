/**
 * W2+ 模块化路由公共助手（routes/_kit.js）。
 *
 * 设计目的：把新增的十几个接口拆到独立路由文件，让多个开发者/Agent
 * 能各写一个文件、互不冲突；index.js 只增加一处「批量挂载」，不再膨胀。
 *
 * 安全约定（与主入口 index.js 完全一致）：
 *  - 所有 router 统一挂在 /api/v1 下，自动经过主入口的「默认拒绝」鉴权闸门；
 *  - 本文件导出 requireRole 供需要角色限制（manager/admin/…）的路由复用；
 *  - 返回统一信封 { code:0, data }（成功）与 { code, message }（业务错误）。
 */
import { Router } from 'express'
import { requireRole, accountOf } from '../auth.js'

/** 统一成功信封 */
export function ok(data) {
  return { code: 0, data }
}

/**
 * 把 async/throw 风格处理器包成 Express handler：
 * 抛 ApiError → 对应业务码；其它异常 → 500（与 index.js wrap 同口径）。
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function wrap(fn) {
  return async (req, res, next) => {
    try {
      const data = await fn(req, res)
      if (res.headersSent || data === undefined) return
      return res.json(ok(data))
    } catch (e) {
      if (e instanceof ApiError) return res.status(e.status).json({ code: e.status, message: e.message })
      // eslint-disable-next-line no-console
      console.error('[api] 未预期异常：', e)
      return res.status(500).json({ code: 500, message: '服务异常，请稍后重试' })
    }
  }
}

export { requireRole, accountOf }

/** 创建一个模块化路由（挂在 /api/v1 下，自动有鉴权） */
export function newRouter() {
  return Router()
}

/** 简单分页参数：?page=1&pageSize=10，统一上限 100 */
export function pagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10))
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize }
}
