/**
 * 模块化路由批量挂载器（routes/index.js）。
 *
 * 约定：
 *  - routes/ 下每个业务文件默认导出 `{ base, router }`：
 *      base    挂载前缀（相对 /api/v1），如 '/admin'、'/messages'
 *      router  express.Router（已在文件内定义各 method 路由）
 *  - 下划线开头的文件（_kit.js、_mount.js 等基础设施）不自动挂载。
 *  - index.js 只需 `app.use('/api/v1', registerExtRoutes())` 一处，
 *    之后并行新增功能只要在 routes/ 加文件，无需再改主入口。
 *
 * 鉴权：所有路由都在 /api/v1 闸门之后，自动需要登录；文件内对管理类
 * 路由再用 requireRole('admin') 等做二级限制（_kit.js 已导出）。
 */
import { readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { Router } from 'express'

const here = dirname(fileURLToPath(import.meta.url))

export async function registerExtRoutes() {
  const root = Router()
  const files = readdirSync(here)
    .filter((f) => f.endsWith('.js') && !f.startsWith('_') && f !== 'index.js')
    .sort() // 排序保证挂载顺序稳定，便于排错

  for (const f of files) {
    const mod = await import(pathToFileURL(join(here, f)).href)
    const route = mod.default
    if (!route || typeof route !== 'object') continue
    const { base, router } = route
    // base 允许为空串（表示直接挂在 /api/v1 根，用于 /stores/:id/profile 等平级路由）
    if (base == null || !router) {
      // eslint-disable-next-line no-console
      console.warn(`[routes] 跳过 ${f}：缺少 { base, router } 默认导出`)
      continue
    }
    root.use(base || '/', router)
    // eslint-disable-next-line no-console
    console.log(`[routes] 挂载 ${base || '/(root)'}  ←  ${f}`)
  }
  return root
}
