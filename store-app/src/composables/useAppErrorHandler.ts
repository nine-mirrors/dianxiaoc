/**
 * useAppErrorHandler —— 应用级稳定性安全网（全局错误处理单例）。
 *
 * 由 main.ts 在 createApp 之后、pinia/router 挂载之前调用 installAppErrorHandler(app)，
 * 以「尽早注册」为原则，兜住四类会导致 SPA 白屏的异常：
 *
 * ┌──────────────────┬──────────────────────────────────────────────────────┐
 * │ 捕获层级          │ 来源与处理                                              │
 * ├──────────────────┼──────────────────────────────────────────────────────┤
 * │ 组件内错误        │ app.config.errorHandler：渲染/生命周期/事件处理器等，    │
 * │                  │ console.error('[app-error]') 保留原始堆栈并写入单例状态  │
 * │ 全局脚本错误      │ window 'error'（冒泡阶段）：同样记录，不打断用户         │
 * │ 静态资源错误      │ window 'error'（★捕获阶段，资源错误不冒泡）：            │
 * │                  │ target 为 IMG/SCRIPT/LINK 时只静默累加计数，不弹任何提示 │
 * │ Promise 异常      │ 'unhandledrejection'：记录未捕获的异步 rejection         │
 * │ 路由异常          │ router.onError 调用 reportError('route', ...)（见路由表）│
 * └──────────────────┴──────────────────────────────────────────────────────┘
 *
 * 约定：
 *  - 面向用户的英文堆栈「绝不」出现在 UI 上（兜底界面由 AppErrorBoundary 渲染固定中文文案）；
 *    console 与单例状态仅服务于开发排查 / 未来上报接入，本期不接后端。
 *  - 'ResizeObserver loop' 等已知无害警告直接忽略，既不计数也不打印。
 *  - install 幂等：重复调用 / SSR 环境（无 window）均安全，window 监听只绑定一次。
 *  - 模块顶层不触碰 window/document，import 本文件在任意环境安全。
 *
 * @module composables/useAppErrorHandler
 */
import { reactive, readonly } from 'vue'
import type { App, ComponentPublicInstance } from 'vue'

/** 计入 lastError 的异常来源（资源错误仅计数，不覆盖最近错误） */
export type TrackedErrorSource = 'app' | 'window' | 'promise' | 'route'

/** 全部错误来源（含仅计数的静态资源错误） */
export type ErrorSource = TrackedErrorSource | 'resource'

/** 一条归一化后的错误记录（供调试面板 / 未来上报使用） */
export interface AppErrorRecord {
  /** 自增序号 */
  id: number
  /** 错误来源 */
  source: TrackedErrorSource
  /** 错误消息（已归一化为字符串） */
  message: string
  /** 原始堆栈（存在时保留；仅开发排查用，不渲染给用户） */
  stack?: string
  /** 附加上下文：Vue 钩子位置（info）/ 导航目标等 */
  info?: string
  /** 发生时间戳（Date.now()） */
  at: number
}

/** 只读错误状态：分来源计数 + 总计数 + 最近一条错误 */
export interface AppErrorState {
  /** 最近一条非资源类错误（初始 null） */
  lastError: AppErrorRecord | null
  /** 错误总数（含资源加载错误） */
  total: number
  /** 分来源计数 */
  counts: Record<ErrorSource, number>
}

/** 订阅者回调（调试面板 / 上报预留，本期无内置订阅方） */
export type AppErrorListener = (record: AppErrorRecord) => void

/** 已知无害、无需上报的浏览器噪声（匹配到即整体忽略） */
const HARMLESS_PATTERNS: RegExp[] = [/ResizeObserver loop/]

/** 静态资源标签白名单：只有这三类元素的 error 按「资源加载失败」静默计数 */
const RESOURCE_TAGS: ReadonlySet<string> = new Set(['IMG', 'SCRIPT', 'LINK'])

/** 分来源的 console 前缀（[app-error] 为约定前缀，其余同族命名） */
const CONSOLE_PREFIX: Record<TrackedErrorSource, string> = {
  app: '[app-error]',
  window: '[window-error]',
  promise: '[promise-error]',
  route: '[route-error]',
}

/** 模块级响应式单例（与 useToast 同一风格：跨组件 / 路由守卫共享一份状态） */
const state = reactive<AppErrorState>({
  lastError: null,
  total: 0,
  counts: { app: 0, window: 0, promise: 0, route: 0, resource: 0 },
})

/** 对外暴露的只读状态（调试面板 / 上报预留，禁止外部直接改） */
const errorState = readonly(state)

/** 订阅者集合（Set 天然去重，退订即删） */
const listeners = new Set<AppErrorListener>()

/** 自增序号 */
let seed = 0
/** install 幂等标记 */
let installed = false
/** window 监听幂等标记（与 install 分开，便于同一环境多次 install 也只绑一次） */
let listenersBound = false

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

/** 任意异常值归一化为 { message, stack }，杜绝 String(undefined) 之类的二次异常 */
function normalizeError(raw: unknown): { message: string; stack?: string } {
  if (raw instanceof Error) {
    return {
      message: raw.message || raw.name || 'Unknown error',
      stack: raw.stack || undefined,
    }
  }
  if (typeof raw === 'string' && raw.length > 0) return { message: raw }
  try {
    return { message: JSON.stringify(raw) ?? String(raw) }
  } catch {
    return { message: String(raw) }
  }
}

/** 是否命中已知无害噪声 */
function isHarmless(message: string): boolean {
  return HARMLESS_PATTERNS.some((re) => re.test(message))
}

/**
 * 记录一条非资源类错误：console.error 保留原始堆栈 → 更新单例状态 → 通知订阅者。
 * 即使错误边界 onErrorCaptured 返回 false（不再上抛到 app.config.errorHandler），
 * 也由边界显式调用本函数，保证「不吞错误」且计数恰好一次。
 */
export function reportError(
  source: TrackedErrorSource,
  rawError: unknown,
  info?: string,
): AppErrorRecord {
  const { message, stack } = normalizeError(rawError)
  const record: AppErrorRecord = {
    id: ++seed,
    source,
    message,
    stack,
    info: info || undefined,
    at: Date.now(),
  }
  // 原始 Error 对象一并打出，保留完整堆栈与源码定位（而非只剩字符串）
  const original = rawError instanceof Error ? rawError : message
  if (info) {
    console.error(CONSOLE_PREFIX[source], original, info)
  } else {
    console.error(CONSOLE_PREFIX[source], original)
  }
  state.lastError = record
  state.total += 1
  state.counts[source] += 1
  listeners.forEach((fn) => {
    try {
      fn(record)
    } catch {
      /* 订阅方自身异常不得影响错误管线 */
    }
  })
  return record
}

/** 读取失败资源的 URL（img.src / script.src / link.href，缺失时回空串） */
function resourceUrl(node: HTMLElement): string {
  if (node instanceof HTMLImageElement || node instanceof HTMLScriptElement) {
    return node.src || ''
  }
  if (node instanceof HTMLLinkElement) {
    return node.href || ''
  }
  return node.getAttribute('src') || node.getAttribute('href') || ''
}

/**
 * 记录一次静态资源加载失败：★只静默计数 + 一条 warn 级排查线索，不弹任何提示★。
 * 图片类业务兜底由 SmartImage 自身的 @error 三级降级负责，这里只做全局观测。
 */
function reportResourceError(node: HTMLElement): void {
  state.total += 1
  state.counts.resource += 1
  console.warn('[resource-error]', node.tagName.toLowerCase(), resourceUrl(node))
}

/** 判断 error 事件目标是否为受监控的资源元素 */
function isResourceNode(target: EventTarget | null): target is HTMLElement {
  return (
    !!target &&
    typeof HTMLElement !== 'undefined' &&
    target instanceof HTMLElement &&
    RESOURCE_TAGS.has(target.tagName)
  )
}

/**
 * window 'error' 统一处理（★以捕获阶段监听★：img/script/link 的资源错误不冒泡，
 * 只有捕获阶段能在 window 上收到；普通脚本错误两个阶段均可收到）。
 */
function onWindowError(event: Event): void {
  // 资源加载失败：event.target 指向元素本身（脚本错误时 target 为 window/null）
  if (isResourceNode(event.target)) {
    reportResourceError(event.target)
    return
  }

  const errorEvent = event as ErrorEvent
  const message = errorEvent.message || ''
  if (message && isHarmless(message)) return

  // errorEvent.error 在跨域脚本场景可能为 null，退化为消息字符串记录
  reportError(
    'window',
    errorEvent.error || (message ? message : 'Unknown window error'),
    errorEvent.filename ? `${errorEvent.filename}:${errorEvent.lineno}:${errorEvent.colno}` : undefined,
  )
}

/** window 'unhandledrejection'：未 catch 的 Promise 异常 */
function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason: unknown = event.reason
  const { message } = normalizeError(reason)
  if (isHarmless(message)) return
  reportError('promise', reason instanceof Error ? reason : reason || 'Unhandled promise rejection')
}

/** 绑定 window 级监听（只绑一次；SSR 无 window 时直接跳过） */
function bindWindowListeners(): void {
  if (listenersBound || !hasWindow()) return
  listenersBound = true
  // 资源错误不冒泡 → 必须 capture: true
  window.addEventListener('error', onWindowError, true)
  window.addEventListener('unhandledrejection', onUnhandledRejection, true)
}

/** Vue app.config.errorHandler：组件内错误的最后一道全局兜底 */
function onAppError(
  err: unknown,
  _instance: ComponentPublicInstance | null,
  info: string,
): void {
  reportError('app', err, info)
}

/**
 * 安装应用级错误处理（幂等）。
 * 应在 createApp(App) 之后第一时间调用，早于 pinia / router 注册与 mount。
 */
export function installAppErrorHandler(app: App): void {
  if (installed) return
  installed = true
  app.config.errorHandler = onAppError
  bindWindowListeners()
}

/** 订阅错误事件（返回退订函数；调试面板 / 未来上报使用） */
export function subscribeAppError(listener: AppErrorListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 清空错误计数与最近错误（调试面板「清零」按钮 / 测试场景使用） */
export function resetAppErrors(): void {
  state.lastError = null
  state.total = 0
  state.counts = { app: 0, window: 0, promise: 0, route: 0, resource: 0 }
}

export interface UseAppErrorHandlerReturn {
  /** 只读错误状态（lastError / total / counts） */
  state: DeepReadonlyState
  /** 主动上报一条错误（router.onError / 错误边界复用同一管线） */
  reportError: typeof reportError
  /** 订阅错误事件，返回退订函数 */
  subscribe: typeof subscribeAppError
  /** 清空计数与最近错误 */
  reset: typeof resetAppErrors
  /** 幂等安装到 app 实例 */
  install: typeof installAppErrorHandler
}

/** readonly(reactive) 的对外类型（保持与运行时一致的深只读） */
type DeepReadonlyState = typeof errorState

/**
 * 组合式入口：在任意 setup / 模块中获取只读错误状态与操作方法。
 * 状态为模块级单例，所有调用方共享同一份数据。
 */
export function useAppErrorHandler(): UseAppErrorHandlerReturn {
  return {
    state: errorState,
    reportError,
    subscribe: subscribeAppError,
    reset: resetAppErrors,
    install: installAppErrorHandler,
  }
}

export default useAppErrorHandler
