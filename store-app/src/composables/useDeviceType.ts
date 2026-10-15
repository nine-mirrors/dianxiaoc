/**
 * useDeviceType —— 设备形态识别（PC / 手机），决定呈现哪套界面。
 *
 * 与 useDevice 的分工：
 * - useDevice 是「能力探测」（摄像头/震动/安全区…），一次性 getter；
 * - 本文件是「形态判定」，输出响应式的 isMobile（手机/移动形态 vs 桌面形态），
 *   供 App.vue 决定套不套手机壳、路由守卫决定是否进移动门户。
 *
 * 判定策略（两条路任一成立即移动形态）：
 *  1. 硬件特征：UA-CH mobile 标志、Android/iPhone/iPod/iPadOS 伪装、粗指针触屏；
 *  2. 视口宽度 ≤ MOBILE_BREAKPOINT：桌面用户把窗口拖窄 / 平板竖屏也给移动界面
 *     （响应式标准做法，避免窄窗桌面布局挤成一团）。
 *
 * 逃生口：URL 带 ?desktop=1（或 sessionStorage 记录 dxc:force-desktop=1）时
 * 强制桌面形态（手机横屏投屏演示、评委手动切完整版）；?mobile=1 反向强制。
 *
 * @module composables/useDeviceType
 */
import { computed, ref, type ComputedRef } from 'vue'

/** 移动形态视口断点（px）：与 PhoneFrame 真机退化线 480 拉开一档，平板竖屏/窄窗都收编 */
export const MOBILE_BREAKPOINT = 640

const FORCE_KEY = 'dxc:force-form'

type ForcedForm = 'desktop' | 'mobile' | null

/** 模块级共享状态：整个应用只有一个视口监听者，多处调用 useDeviceType 共享结果 */
const vw = ref<number>(typeof window === 'undefined' ? 1280 : window.innerWidth)
const vh = ref<number>(typeof window === 'undefined' ? 800 : window.innerHeight)
const hardwareMobile = ref<boolean>(detectHardwareMobile())
let listenerBound = false

/**
 * 读取当前 URL 上的形态参数。
 *
 * 本项目使用 hash 路由（createWebHashHistory）：router.push({ query }) 产生的
 * `?desktop=1` 位于 `#` 之后（如 `/#/manager/dashboard?desktop=1`），并不在
 * window.location.search 里；因此必须同时解析 hash 段中的 query，否则
 * 「切换电脑版」按钮与评委在 hash 后追加参数都会被守卫忽略。
 * 合并优先级：hash 段 query（应用内导航参数）> 真实 search（整页加载参数）。
 */
function urlParams(): URLSearchParams {
  const hash = typeof window === 'undefined' ? '' : window.location.hash || ''
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const merged = new URLSearchParams(
    typeof window === 'undefined' ? '' : window.location.search || '',
  )
  new URLSearchParams(hashQuery).forEach((v, k) => merged.set(k, v))
  return merged
}

/** URL query 优先，其次 sessionStorage（刷新后保持用户选择，关闭标签即失效，不长期固化） */
function readForced(): ForcedForm {
  if (typeof window === 'undefined') return null
  try {
    const q = urlParams()
    if (q.get('desktop') === '1') {
      sessionStorage.setItem(FORCE_KEY, 'desktop')
      return 'desktop'
    }
    if (q.get('desktop') === '0') {
      sessionStorage.removeItem(FORCE_KEY)
    }
    if (q.get('mobile') === '1') {
      sessionStorage.setItem(FORCE_KEY, 'mobile')
      return 'mobile'
    }
    const saved = sessionStorage.getItem(FORCE_KEY)
    return saved === 'desktop' || saved === 'mobile' ? saved : null
  } catch {
    return null
  }
}

const forced = ref<ForcedForm>(readForced())

function onResize(): void {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
}

function ensureListener(): void {
  if (listenerBound || typeof window === 'undefined') return
  listenerBound = true
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  // UA-CH 某些场景异步给出 mobile 提示（极少）；pageshow 时也复核一次强制态
  window.addEventListener('pageshow', () => {
    forced.value = readForced()
  })
}

/**
 * 硬件是否为移动设备（与窗口宽度无关，桌面拖窄窗口不会改变这个值）。
 * 综合：UA-CH mobile → UA 正则（Android/iPhone/iPod）→ iPadOS 桌面 UA 伪装
 * （Macintosh + 粗指针）。
 */
function detectHardwareMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  try {
    const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    if (uaData?.mobile === true) return true
  } catch {
    /* UA-CH 不可用走 UA */
  }
  const ua = navigator.userAgent || ''
  if (/android|iphone|ipod/i.test(ua)) return true
  // iPadOS 13+ 桌面 UA 伪装：Macintosh 但主指针是触屏
  if (/macintosh/i.test(ua)) {
    try {
      return window.matchMedia('(pointer: coarse)').matches
    } catch {
      return false
    }
  }
  return false
}

export interface DeviceTypeReturn {
  /** 是否移动形态（手机/窄窗）：决定套手机壳还是全屏、进桌面端还是移动门户 */
  isMobile: ComputedRef<boolean>
  /** 硬件是否真机移动（不受窗口宽度影响） */
  isHardwareMobile: ComputedRef<boolean>
  /** 当前视口宽（CSS px，响应式） */
  viewportWidth: typeof vw
  /** 当前视口高（CSS px，响应式） */
  viewportHeight: typeof vh
  /** 当前强制形态（手动切换用） */
  forcedForm: typeof forced
  /** 强制桌面形态并记录（手机上看完整版） */
  forceDesktop: () => void
  /** 强制移动形态并记录 */
  forceMobile: () => void
  /** 清除强制，恢复自动识别 */
  clearForce: () => void
}

export function useDeviceType(): DeviceTypeReturn {
  ensureListener()

  const isMobile = computed<boolean>(() => {
    if (forced.value === 'desktop') return false
    if (forced.value === 'mobile') return true
    return hardwareMobile.value || vw.value <= MOBILE_BREAKPOINT
  })

  const isHardwareMobile = computed<boolean>(() => hardwareMobile.value)

  function forceDesktop(): void {
    forced.value = 'desktop'
    try {
      sessionStorage.setItem(FORCE_KEY, 'desktop')
    } catch {
      /* 隐私模式静默 */
    }
  }

  function forceMobile(): void {
    forced.value = 'mobile'
    try {
      sessionStorage.setItem(FORCE_KEY, 'mobile')
    } catch {
      /* 隐私模式静默 */
    }
  }

  function clearForce(): void {
    forced.value = null
    try {
      sessionStorage.removeItem(FORCE_KEY)
    } catch {
      /* 隐私模式静默 */
    }
  }

  return {
    isMobile,
    isHardwareMobile,
    viewportWidth: vw,
    viewportHeight: vh,
    forcedForm: forced,
    forceDesktop,
    forceMobile,
    clearForce,
  }
}

/** 组件外（路由守卫）一次性同步判定：当前是否移动形态 */
export function isMobileNow(): boolean {
  const f = readForced()
  if (f === 'desktop') return false
  if (f === 'mobile') return true
  if (typeof window === 'undefined') return false
  return detectHardwareMobile() || window.innerWidth <= MOBILE_BREAKPOINT
}

/**
 * 路由变化后把 URL/sessionStorage 中的强制形态同步进响应式单例。
 * 守卫里 isMobileNow() 每次实时读取 URL（导航时已能正确判定），但 App.vue
 * 的形态计算依赖响应式 forced —— hash 内 query 变化不会触发任何监听，
 * 故由 router.afterEach 在每次导航后显式同步一次。
 */
export function syncForcedFromUrl(): void {
  forced.value = readForced()
}

/** 路由 query 的最小结构（vue-router 的 LocationQuery 取值即可，避免耦合路由类型） */
interface RouteLikeQuery {
  query?: Record<string, unknown>
}

/**
 * 路由守卫专用：结合「即将进入的目标路由 query」判定是否移动形态。
 *
 * 关键时序：beforeEach 执行时浏览器地址栏还是**旧 hash**，新路径上的
 * `?desktop=1/?mobile=1` 此刻只存在于 to.query，读 window.location 会漏掉；
 * 目标 query 命中时同时写 sessionStorage，保证守卫放行后渲染层（afterEach
 * 同步）与后续导航都沿用同一强制形态。
 */
export function resolveMobileForRoute(to?: RouteLikeQuery): boolean {
  const q = to?.query
  if (q) {
    if (q.desktop === '1') {
      try {
        sessionStorage.setItem(FORCE_KEY, 'desktop')
      } catch {
        /* 隐私模式静默 */
      }
      return false
    }
    if (q.desktop === '0') {
      try {
        sessionStorage.removeItem(FORCE_KEY)
      } catch {
        /* 隐私模式静默 */
      }
    }
    if (q.mobile === '1') {
      try {
        sessionStorage.setItem(FORCE_KEY, 'mobile')
      } catch {
        /* 隐私模式静默 */
      }
      return true
    }
  }
  return isMobileNow()
}

/** 清理全局视口监听（仅测试需要；应用运行期监听全局单例常驻） */
export function stopDeviceTypeListener(): void {
  if (typeof window === 'undefined') return
  window.removeEventListener('resize', onResize)
  window.removeEventListener('orientationchange', onResize)
  listenerBound = false
}
