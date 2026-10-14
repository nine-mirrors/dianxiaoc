/**
 * useHaptics —— 设备震动反馈（Vibration API）的渐进增强封装。
 *
 * ⚠️ 平台事实（2026 年仍然成立）：
 * - Android Chrome / 多数安卓自研内核浏览器支持 `navigator.vibrate`；
 * - iOS Safari（含 WKWebView、添加到主屏幕的 PWA）至今基本不支持 Vibration API，
 *   调用一律静默降级，绝不报错、绝不影响业务流程；
 * - 桌面浏览器普遍不支持；非安全上下文（HTTP 且非 localhost）下接口也会被禁用。
 *
 * ♿ 无障碍原则：
 * 震动只是视觉/听觉反馈的「锦上添花」，属于动效反馈的延伸。系统开启
 * 「减弱动效」（prefers-reduced-motion: reduce）时默认自动禁用，尊重前庭敏感用户；
 * 该策略可由调用方通过 `force: true` 显式覆盖，但**绝不能用震动承载关键信息**——
 * 不支持的设备（典型如 iPhone）上什么都不会发生，成功/失败/警示必须同时有
 * 可见（Toast、图标颜色）或可闻（后续可扩展音效）的反馈通道。
 *
 * 设计要点：
 * - 全部能力经特性检测，SSR / 非浏览器 / 非 HTTPS / 不支持环境全部 no-op；
 * - 每个触发方法返回 boolean：true 表示设备确实接受了本次震动请求；
 * - matchMedia 单例懒初始化、只挂一个 change 监听，不随 composable 重复调用而累积；
 * - 模块顶层零副作用：import 本文件不会触碰 navigator/window，可安全被任意页面引入。
 *
 * ── 接入示例 ──────────────────────────────────────────────────────────
 * ```ts
 * const haptics = useHaptics()
 * // 拍照快门 / 单选点击
 * haptics.select()
 * // 提交成功（页面同时展示成功 Toast，震动只是附加触感）
 * haptics.success()
 * // 极少数确需忽略「减弱动效」的场景（仍要求设备本身支持）
 * haptics.warning({ force: true })
 * ```
 *
 * @module composables/useHaptics
 */

/** 震动模式：单值表示持续 N 毫秒；数组表示 [震动, 暂停, 震动, ...]（单位毫秒） */
export type HapticsPattern = number | number[]

/** 单次震动调用的选项 */
export interface HapticsOptions {
  /**
   * 显式强制震动：忽略系统「减弱动效」设置。
   * 注意：仅覆盖 reduced-motion 策略，设备不支持 / 非安全上下文时依旧静默 no-op。
   */
  force?: boolean
}

/** 预设触感模式（数值遵循 Android 触觉反馈常用节奏） */
const PATTERNS = {
  /** 轻触：10ms，用于轻微反馈 */
  light: 10,
  /** 中等：30ms，用于常规确认 */
  medium: 30,
  /** 选择：5ms，用于按键、列表选择、拍照快门等极短反馈 */
  select: 5,
  /** 成功：短-停-短 [10,40,10] */
  success: [10, 40, 10],
  /** 警示：中-停-中 [30,50,30] */
  warning: [30, 50, 30],
  /** 错误：长-停-长 [50,80,50] */
  error: [50, 80, 50],
} as const

/**
 * 模块级单例状态（懒初始化）。
 * 所有 useHaptics() 调用共享同一份 matchMedia 查询与监听，避免重复创建 listener。
 */
let motionQuery: MediaQueryList | null = null
let motionQueryBound = false
/** 缓存最近一次「减弱动效」状态；无 matchMedia 的环境恒为 false（即不拦截） */
let reducedMotionCache = false

/** 安全地判定当前是否处于浏览器环境（SSR / 单测下返回 false） */
function hasNavigator(): boolean {
  return typeof navigator !== 'undefined'
}

/**
 * 当前设备是否真实支持 Vibration API（只做特性检测，不含 reduced-motion 判断）。
 * - iOS：navigator.vibrate 不存在 → false；
 * - 非安全上下文（HTTP 非 localhost）：现代浏览器禁用该 API → false；
 * - 厂商把 vibrate 改成非函数的怪异环境同样视为不支持。
 */
function isVibrationSupported(): boolean {
  if (!hasNavigator()) return false
  if (typeof navigator.vibrate !== 'function') return false
  // isSecureContext 在过老浏览器上可能不存在，此时不武断拦截（undefined !== false）
  if (typeof window !== 'undefined' && window.isSecureContext === false) return false
  return true
}

/**
 * 懒创建 prefers-reduced-motion 的单例 MediaQueryList 并绑定唯一一个监听。
 * 仅在浏览器内、首次真正需要时执行；import 阶段不会执行。
 */
function ensureMotionQuery(): void {
  if (motionQueryBound) return
  motionQueryBound = true // 即使环境不支持也标记完成，避免每次调用都反复探测
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

  try {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionCache = motionQuery.matches === true

    const onChange = (event: MediaQueryListEvent): void => {
      reducedMotionCache = event.matches === true
    }
    // 现代浏览器 addEventListener；旧版 Safari（<14）只有 addListener，做兼容兜底
    if (typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', onChange)
    } else if (typeof motionQuery.addListener === 'function') {
      motionQuery.addListener(onChange)
    }
  } catch {
    // matchMedia 在极少数环境可能抛错（如伪造的 window 测试桩）：降级为「不拦截震动」
    motionQuery = null
    reducedMotionCache = false
  }
}

/** 读取系统「减弱动效」当前状态（读取单例 mql 的实时 matches，避免缓存过期） */
function isReducedMotion(): boolean {
  ensureMotionQuery()
  if (motionQuery) {
    try {
      return motionQuery.matches === true
    } catch {
      return reducedMotionCache
    }
  }
  return reducedMotionCache
}

export interface UseHapticsReturn {
  /** 设备是否支持震动（纯特性检测结果，不随 reduced-motion 变化） */
  readonly supported: boolean
  /** 系统当前是否开启「减弱动效」 */
  readonly reducedMotion: boolean
  /** 轻触反馈（10ms） */
  light: (options?: HapticsOptions) => boolean
  /** 中等反馈（30ms） */
  medium: (options?: HapticsOptions) => boolean
  /** 选择/按键/快门的极短反馈（5ms） */
  select: (options?: HapticsOptions) => boolean
  /** 成功节奏 [10,40,10]；必须与可见的成功提示同时出现，不可只靠震动 */
  success: (options?: HapticsOptions) => boolean
  /** 警示节奏 [30,50,30]；必须与可见的警示提示同时出现 */
  warning: (options?: HapticsOptions) => boolean
  /** 错误节奏 [50,80,50]；必须与可见的错误提示同时出现 */
  error: (options?: HapticsOptions) => boolean
  /**
   * 自定义震动：单值毫秒数或 [震,停,震,...] 模式。
   * @returns 是否真正触发（设备不支持 / 减弱动效 / 非安全上下文均返回 false）
   */
  vibrate: (pattern: HapticsPattern, options?: HapticsOptions) => boolean
}

/**
 * 触发一次震动；所有失败路径均静默返回 false，绝不抛错。
 *
 * 震动只在 Android 等支持 Vibration API 的设备生效，iOS 静默降级，
 * 属渐进增强，不得用它承载关键信息（无障碍原则：不能只靠震动）。
 */
function fire(pattern: HapticsPattern, options?: HapticsOptions): boolean {
  if (!isVibrationSupported()) return false
  if (!options?.force && isReducedMotion()) return false

  try {
    // 经过特性检测，此处 vibrate 必为函数；TS DOM lib 亦声明了该签名
    return navigator.vibrate(pattern) === true
  } catch {
    // 个别 ROM / WebView 可能在调用期抛异常（如系统服务异常），按未触发处理
    return false
  }
}

/**
 * 震动反馈组合式函数。
 *
 * 无状态（触感模式为常量），但 reduced-motion 监听为模块级单例，
 * 因此可在任意多个组件内重复调用，无监听累积、无 import 副作用。
 */
export function useHaptics(): UseHapticsReturn {
  return {
    get supported(): boolean {
      return isVibrationSupported()
    },
    get reducedMotion(): boolean {
      return isReducedMotion()
    },
    light: (options?: HapticsOptions) => fire(PATTERNS.light, options),
    medium: (options?: HapticsOptions) => fire(PATTERNS.medium, options),
    select: (options?: HapticsOptions) => fire(PATTERNS.select, options),
    success: (options?: HapticsOptions) => fire(PATTERNS.success, options),
    warning: (options?: HapticsOptions) => fire(PATTERNS.warning, options),
    error: (options?: HapticsOptions) => fire(PATTERNS.error, options),
    vibrate: fire,
  }
}

export default useHaptics
