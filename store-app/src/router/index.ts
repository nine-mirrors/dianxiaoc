/**
 * 路由表（ARCHITECTURE §8.1 / T01.4）。
 *
 * ★ 使用 hash 模式：配合 base:'./' 保证「任意目录双击 index.html 即开」，
 *   同时让 fixture 中的相对图片路径在嵌套路由下也能正确解析。
 *
 * 演示期：`/` 重定向到 /role（P1 登录门面，视频/PDF 的入口镜头）。
 *
 * ★ 权限隔离：每个业务路由用 `meta.roles` 声明**允许访问的角色**，
 *   beforeEach 统一拦截 —— 登录哪个账号就只能进对应角色的页面，
 *   跨端访问会被送回自己的落地页（真实系统里这一步由后端权限校验兜底）。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
// ★ 必须显式标注 RouteRecordRaw[]：否则 TS 会把数组推断成「各对象字面量的联合类型」，
//   其中 `{ path, redirect }` 会被推成 component?: undefined，与 RouteRecordRedirect
//   要求的 component: never 冲突（tsc 报 TS2322）。仅类型标注，不改守卫逻辑。
import type { RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { reportError } from '@/composables/useAppErrorHandler'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/login' },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/RoleSelectView.vue'),
    meta: { title: '登录' },
  },
  // 旧入口保留重定向，避免历史链接/PPT 里的 /role 失效
  { path: '/role', redirect: '/login' },
  {
    path: '/rep/today',
    name: 'rep-today',
    component: () => import('@/views/rep/TodayRouteView.vue'),
    meta: { title: '今日巡店', roles: ['rep'] },
  },
  {
    path: '/rep/capture/:storeId?',
    name: 'rep-capture',
    component: () => import('@/views/rep/CaptureView.vue'),
    meta: { title: '巡店拍照', roles: ['rep'] },
  },
  {
    path: '/rep/diagnosis/:id',
    name: 'rep-diagnosis',
    component: () => import('@/views/rep/DiagnosisView.vue'),
    meta: { title: '诊断结果', roles: ['rep', 'manager'] },
  },
  {
    path: '/rep/history',
    name: 'rep-history',
    component: () => import('@/views/rep/HistoryView.vue'),
    meta: { title: '巡店记录', roles: ['rep'] },
  },
  {
    path: '/rep/me',
    name: 'rep-me',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '我的', tab: 'me', roles: ['rep'] },
  },
  {
    path: '/manager/dashboard',
    name: 'manager-dashboard',
    component: () => import('@/views/manager/DashboardView.vue'),
    meta: { title: '区域经营看板', roles: ['manager'] },
  },
  {
    path: '/owner',
    name: 'owner',
    component: () => import('@/views/owner/OwnerFlowView.vue'),
    meta: { title: '店主自助诊断', roles: ['owner', 'rep'] },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '页面未开放' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

/** 统一标题 */
router.afterEach((to) => {
  const title = (to.meta?.title as string) || ''
  document.title = title ? `${title} · 店小C` : '店小C · 蒙牛 AI 巡店助手'
})

/**
 * ★ 权限守卫：登录哪个账号，就只能进该角色被允许的页面。
 *
 * 例：用「王敏（区域经理）」账号登录后，手动改地址栏到 /rep/diagnosis/D_S3
 *     会被送回 /manager/dashboard。
 *
 * ⚠ 安全阀（重要）：**只有「用账号登录过」时才拦截**。
 *   未登录 / 跳过登录 / 角色卡直接进入 的状态下，所有路由一律放行 ——
 *   保证评委直接点链接、PPT 与视频里的直达链接、录屏脚本里的路径都能正常打开。
 *   否则默认身份是业代，会把「区域经理看板」链接错误地弹回业代首页。
 */
/** 角色 → 默认落地页（断网时 session.home 不可用时的兜底） */
const ROLE_HOME: Record<string, string> = {
  rep: '/rep/today',
  manager: '/manager/dashboard',
  owner: '/owner',
}
function roleHome(role: string): string {
  return ROLE_HOME[role] ?? '/rep/today'
}

router.beforeEach(async (to) => {
  const session = useSessionStore()
  // ★ 先等会话恢复完成（刷新/深链进来时 token 恢复是异步的）
  await session.ensureRestored()

  // ① 未登录判断
  //    ⚠ 断网时 restore() 无法验证 token（但**不会清除它**），此时 logged 仍为 false。
  //    若无条件弹登录页，现场断网 = 用户被踢出工作台，演示直接中断。
  //    策略：本地有 token 就放行（页面会显示「后端未连接」提示条），
    //        只有**本地根本没有 token**才送去登录页。
  const hasToken = !!session.token
  if (!session.logged && !hasToken) {
    return to.path === '/login' ? true : { path: '/login', replace: true }
  }

  // ② 已登录：访问登录页直接回工作台
  if (to.path === '/login') {
    // 断网时 session.home 可能为空，退回该角色的默认落地页
    return { path: session.home || roleHome(session.role), replace: true }
  }

  // ③ 角色权限隔离：登录哪个账号就只能进该角色的页面
  //    断网时 role 也是默认的 rep，故有 token 但未恢复身份时跳过校验（放行）
  const allow = to.meta?.roles as string[] | undefined
  if (session.logged && allow && allow.length && !allow.includes(session.role)) {
    return { path: session.home, replace: true }
  }
  return true
})

/**
 * ★ 路由错误兜底（只追加 onError，不改变上面的 routes / 守卫 / scrollBehavior）。
 *
 * 典型白屏场景：发版后 JS chunk 文件名 hash 全变，用户手里的旧标签页 / 浏览器缓存
 * 还在引用旧 hash，路由懒加载 import() 抛 ChunkLoadError → 页面组件挂载不上 → 白屏。
 * 策略：识别为 chunk 动态导入失败时，自动 location.reload() 一次拉取最新入口；
 * 用 sessionStorage 记录「目标路径 + 时间戳」，10 秒内同一目标只自动刷一次
 * （刷新后该 chunk 仍失败就不再刷，杜绝刷新死循环；超过窗口或换了目标则允许再次自愈）。
 */
const CHUNK_RELOAD_KEY = 'dxc:chunk-reload'
/** 同目标自动刷新的抑制窗口（ms）：覆盖一次页面加载即可，足够拦住瞬时失败循环 */
const CHUNK_RELOAD_TTL = 10_000

interface ChunkReloadMark {
  path: string
  at: number
}

/**
 * chunk / 动态模块加载失败的典型报错文案（不同浏览器/构建略有差异）：
 *  - Chrome：Failed to fetch dynamically imported module
 *  - Firefox：error loading dynamically imported module
 *  - Safari：Importing a module script failed
 *  - 历史/打包模板：Loading chunk xxx failed / Loading CSS chunk xxx failed
 */
function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /loading(?:\s+css)?\s+chunk\s+[\w-]+\s+failed|failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
    message,
  )
}

router.onError((error, to) => {
  const target = String(to?.fullPath ?? to?.path ?? '-')
  // 所有路由异常先入全局错误管线（计数 / console / 预留上报），不吞错误
  reportError('route', error, `navigation → ${target}`)

  if (!isChunkLoadError(error)) return

  let lastMark: ChunkReloadMark | null = null
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_KEY)
    if (raw) lastMark = JSON.parse(raw) as ChunkReloadMark
  } catch {
    lastMark = null
  }
  // 抑制窗口内同一目标已经自动刷新过：放弃再次刷新，避免死循环
  if (
    lastMark &&
    lastMark.path === target &&
    Number.isFinite(lastMark.at) &&
    Date.now() - lastMark.at < CHUNK_RELOAD_TTL
  ) {
    return
  }

  // 无法写入标记（隐私模式等）就不刷新：否则无法保证「只刷一次」，可能陷入循环
  try {
    const mark: ChunkReloadMark = { path: target, at: Date.now() }
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, JSON.stringify(mark))
  } catch {
    return
  }
  window.location.reload()
})

export default router
