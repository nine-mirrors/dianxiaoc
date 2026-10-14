/**
 * useDevice —— 设备与运行环境能力探测（全部特性检测、零依赖、零 import 副作用）。
 *
 * 面向巡店真机场景（P3 拍照/扫码接入的前置基建），统一收口以下问题：
 * - 是不是触屏机、iOS 还是 Android、是不是「添加到主屏幕」的独立 PWA；
 * - 系统有没有要求「减弱动效」；
 * - 当前环境是否具备调起摄像头的前提（getUserMedia 仅在安全上下文可用）；
 * - 设备是否支持震动；
 * - 刘海/灵动岛/底部 Home 指示条的安全区是多少 px；
 * - 视口尺寸、DPR、是否支持动态视口单位 dvh（iOS 地址栏伸缩问题）。
 *
 * 安全约定：
 * - 所有访问器**永不抛异常**，环境缺失时返回安全默认值（false / 0 / 空对象）；
 * - 模块顶层不调用任何 navigator 媒体 API，import 本文件可在 SSR / 任意页面安全执行；
 * - hasCamera() 只探测 API 可用性与设备清单，**不会弹权限框**（不调用 getUserMedia）；
 * - 每次访问都实时取值（getter / 函数），旋转屏幕、切换显示模式后无需重新创建 composable。
 *
 * 平台差异速查：
 * ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
 * │ 能力             │ iOS Safari/WKWeb │ Android Chrome   │ 桌面浏览器       │
 * ├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
 * │ isTouch          │ true（iPadOS 伪装 │ true             │ 触屏本可能 true  │
 * │                  │ Mac UA 也可识别） │                  │ 多数 false       │
 * │ isIOS/isAndroid  │ iOS：UA 特征+触屏 │ Android：UA-CH   │ 均 false         │
 * │                  │ 兜底；Android:否  │ platform 优先    │                  │
 * │ isStandalone     │ navigator.       │ display-mode:    │ 一般 false       │
 * │                  │ standalone 兜底  │ standalone       │                  │
 * │ hasCamera        │ 需 HTTPS；真机有 │ 需 HTTPS；真机有 │ 有 API 不一定有  │
 * │                  │ 摄像头才可用     │ 摄像头才可用     │ 摄像头（枚举区分）│
 * │ vibrationSupported│ 基本 false      │ true             │ false            │
 * │ safeArea         │ 刘海机配合       │ 挖孔屏配合       │ 全 0             │
 * │                  │ viewport-fit=cover│ viewport-fit 生效│                  │
 * │ dvhSupported     │ iOS 15.4+ true   │ 较新版本 true    │ Chrome 108+ true │
 * └──────────────────┴──────────────────┴──────────────────┴──────────────────┘
 *
 * @module composables/useDevice
 */

/** 安全区 insets（单位 px；0 表示该方向无机型特征，桌面恒为 0） */
export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/** 视口信息：vw/vh 为布局视口 CSS px，dpr 为设备像素比，dvhSupported 表示支持动态视口 */
export interface ViewportInfo {
  /** window.innerWidth（CSS px） */
  vw: number
  /** window.innerHeight（CSS px；iOS 上受地址栏伸缩影响，需要稳定高度请用 dvh） */
  vh: number
  /** window.devicePixelRatio，异常/不支持时为 1 */
  dpr: number
  /** 是否支持 100dvh 动态视口单位（iOS 15.4+ / Chrome 108+） */
  dvhSupported: boolean
}

/**
 * 最小化的 User-Agent Client Hints 类型。
 * 不依赖 TS DOM lib 是否已收录 NavigatorUAData（各 TS 版本不一致），
 * 只读低熵、同步可用的 mobile/platform 两个字段。
 */
interface NavigatorUADataLike {
  readonly mobile?: boolean
  readonly platform?: string
}

/** 各厂商历史遗留的 navigator 扩展字段（iOS standalone）集中声明，避免散落 any */
interface NavigatorVendorExtensions {
  readonly standalone?: boolean
}

// ─────────────────────────── 基础安全守卫 ───────────────────────────

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

function hasNavigator(): boolean {
  return typeof navigator !== 'undefined'
}

function hasDocument(): boolean {
  return typeof document !== 'undefined'
}

/**
 * 安全执行 matchMedia(query).matches。
 * 旧浏览器 / SSR / 查询语法不被识别时一律返回 false，绝不抛错。
 */
function mediaMatches(query: string): boolean {
  if (!hasWindow() || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches === true
  } catch {
    return false
  }
}

/** 读取 navigator.userAgentData（不存在则 null），不触发高熵异步请求 */
function readUAData(): NavigatorUADataLike | null {
  if (!hasNavigator()) return null
  try {
    const uaData = (
      navigator as Navigator & { userAgentData?: NavigatorUADataLike }
    ).userAgentData
    return uaData ?? null
  } catch {
    return null
  }
}

/** 读取 navigator.userAgent（不存在则空串） */
function readUA(): string {
  if (!hasNavigator()) return ''
  try {
    return navigator.userAgent || ''
  } catch {
    return ''
  }
}

// ─────────────────────────── 能力判定实现 ───────────────────────────

/**
 * 触屏设备：优先以现代指针媒体查询 `(pointer: coarse)` 判定
 * （触控笔记本 / 混合本也能正确识别主指针），再以 ontouchstart 兜底旧设备。
 */
function detectTouch(): boolean {
  if (mediaMatches('(pointer: coarse)')) return true
  if (hasWindow()) {
    try {
      return 'ontouchstart' in window
    } catch {
      return false
    }
  }
  return false
}

/**
 * iOS 设备（iPhone / iPad / iPod touch）。
 * 优先读 UA-CH 的 platform；iOS 上 UA-CH 基本不可用，回退 UA 正则。
 * iPadOS 13+ 会把自己伪装成 Macintosh，需再叠加「粗指针触屏」特征识别。
 */
function detectIOS(): boolean {
  const uaData = readUAData()
  if (uaData?.platform && /iPhone|iPad|iPod/i.test(uaData.platform)) return true

  const ua = readUA()
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 桌面 UA 伪装：Macintosh + 触屏（Apple Pencil/手指）
  if (/Macintosh/i.test(ua) && mediaMatches('(pointer: coarse)')) return true
  return false
}

/**
 * Android 设备。
 * 优先读 UA-CH：Android Chrome 上 platform === 'Android'；
 * 回退 UA 字符串 /android/i（含安卓自研浏览器、旧版 WebView）。
 */
function detectAndroid(): boolean {
  const uaData = readUAData()
  // UA-CH 优先（Android Chrome platform === 'Android'）；缺失时回退 UA 正则，
  // 兼容安卓自研内核浏览器与旧版 WebView
  if (uaData?.platform === 'Android') return true
  return /android/i.test(readUA())
}

/**
 * 是否以「独立应用」形态运行（添加到主屏幕的 PWA / WebAPK）。
 * iOS Safari 用历史私有字段 navigator.standalone；
 * 标准实现（Android/桌面）走 display-mode: standalone，fullscreen 一并视为独立态。
 */
function detectStandalone(): boolean {
  if (hasNavigator()) {
    try {
      const standalone = (navigator as Navigator & NavigatorVendorExtensions).standalone
      if (standalone === true) return true
    } catch {
      /* 忽略，继续走媒体查询 */
    }
  }
  return (
    mediaMatches('(display-mode: standalone)') || mediaMatches('(display-mode: fullscreen)')
  )
}

/** 系统是否要求「减弱动效」（iOS：辅助功能-减弱动态效果；Android：移除动画） */
function detectReducedMotion(): boolean {
  return mediaMatches('(prefers-reduced-motion: reduce)')
}

/**
 * 设备是否真实支持 Vibration API（与 useHaptics 内的判定保持一致口径）：
 * iOS 基本不支持（返回 false，调用方应静默降级）；Android Chrome 支持；
 * 非安全上下文（HTTP 且非 localhost）下现代浏览器禁用该 API。
 */
function detectVibrationSupported(): boolean {
  if (!hasNavigator() || typeof navigator.vibrate !== 'function') return false
  if (hasWindow() && window.isSecureContext === false) return false
  return true
}

/**
 * 摄像头能力前置探测（async，但**不弹权限框**）：
 * 1. 硬性前提：navigator.mediaDevices.getUserMedia 存在（仅 HTTPS / localhost / file 下存在，
 *    HTTP 局域网 IP 访问时整个 mediaDevices 为 undefined）；
 * 2. 最佳努力：enumerateDevices() 不会触发权限弹窗——
 *    - 明确枚举到 videoinput 设备 → true；
 *    - 拿到非空清单但没有任何摄像头（如无摄像头台式机）→ false；
 *    - 清单为空 / 接口受限（iOS 未授权时常只给空清单或匿名设备）→ 退回「API 可用」结论 true，
 *      把「实际有没有摄像头、用户是否授权」留给 P3 真正 getUserMedia 时的 catch 处理。
 *
 * 即：true 表示「当前环境具备发起拍照的调用条件」，不代表真机授权一定成功。
 */
async function detectHasCamera(): Promise<boolean> {
  if (!hasNavigator()) return false
  try {
    if (!('mediaDevices' in navigator) || !navigator.mediaDevices) return false
    if (typeof navigator.mediaDevices.getUserMedia !== 'function') return false

    if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (Array.isArray(devices) && devices.length > 0) {
          return devices.some((d) => {
            try {
              return d && d.kind === 'videoinput'
            } catch {
              return false
            }
          })
        }
        // 空清单：隐私模式 / 未授权，无法据此否定，按「API 可用」放行
      } catch {
        // enumerateDevices 被拒或异常：不否定 API 可用性，放行到实际调用时再处理
      }
    }
    return true
  } catch {
    return false
  }
}

/** 把 computed style 取出的长度值（如 "20px"）解析成数字 px；解析失败为 0 */
function parsePx(value: string | null | undefined): number {
  if (!value) return 0
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 读取刘海屏 / Home 指示条安全区（单位 px）。
 *
 * 实现方式：临时插入一个不可见元素，给四个方向的 padding 赋
 * `env(safe-area-inset-*, 0px)`，从 getComputedStyle 读回解析后的 px，读完立即移除。
 * 不支持 env() 的环境得到 0；iOS 还需页面 meta viewport 含 viewport-fit=cover 才有正值；
 * Android 挖孔屏需配合 display-cutout 策略，桌面浏览器恒为 0。
 */
function readSafeArea(): SafeAreaInsets {
  const zero: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!hasDocument() || !hasWindow()) return zero
  if (!document.body || !document.defaultView) return zero

  let el: HTMLDivElement | null = null
  try {
    el = document.createElement('div')
    el.style.position = 'fixed'
    el.style.visibility = 'hidden'
    el.style.pointerEvents = 'none'
    el.style.top = '-9999px'
    el.style.paddingTop = 'env(safe-area-inset-top, 0px)'
    el.style.paddingRight = 'env(safe-area-inset-right, 0px)'
    el.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)'
    el.style.paddingLeft = 'env(safe-area-inset-left, 0px)'
    document.body.appendChild(el)

    const style = document.defaultView.getComputedStyle(el)
    return {
      top: parsePx(style.paddingTop),
      right: parsePx(style.paddingRight),
      bottom: parsePx(style.paddingBottom),
      left: parsePx(style.paddingLeft),
    }
  } catch {
    return zero
  } finally {
    // 无论读取成功与否都必须摘除临时节点，避免污染 DOM
    if (el && el.parentNode) {
      try {
        el.parentNode.removeChild(el)
      } catch {
        /* 忽略移除异常 */
      }
    }
  }
}

/**
 * 当前视口信息。
 * vh 在 iOS 上会随地址栏/工具条伸缩而变化（100vh 偏大的经典问题），
 * dvhSupported=true 时业务 CSS 可优先使用 100dvh；dpr 用于拍照画布等高清场景。
 */
function readViewport(): ViewportInfo {
  if (!hasWindow()) return { vw: 0, vh: 0, dpr: 1, dvhSupported: false }
  try {
    const dvhSupported =
      typeof window.CSS !== 'undefined' &&
      typeof window.CSS.supports === 'function' &&
      window.CSS.supports('height', '100dvh')

    const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1

    return {
      vw: window.innerWidth || 0,
      vh: window.innerHeight || 0,
      dpr,
      dvhSupported,
    }
  } catch {
    return { vw: 0, vh: 0, dpr: 1, dvhSupported: false }
  }
}

export interface UseDeviceReturn {
  /** 是否触屏设备（粗指针 或 支持 ontouchstart） */
  readonly isTouch: boolean
  /** 是否 iOS/iPadOS 设备（含 iPadOS 桌面 UA 伪装识别） */
  readonly isIOS: boolean
  /** 是否 Android 设备 */
  readonly isAndroid: boolean
  /** 是否以独立应用形态运行（PWA 主屏启动 / WebAPK / fullscreen） */
  readonly isStandalone: boolean
  /** 系统是否开启「减弱动效」 */
  readonly prefersReducedMotion: boolean
  /** 设备是否支持 Vibration API（iOS 通常 false） */
  readonly vibrationSupported: boolean
  /**
   * 异步探测摄像头调用条件（不弹权限框）。
   * true = API 可用且未发现明确的无摄像头证据；实际授权仍可能被拒，需 catch getUserMedia。
   */
  hasCamera: () => Promise<boolean>
  /** 读取四向安全区 px（桌面/无机型特征为 0；每次调用实时测量） */
  safeArea: () => SafeAreaInsets
  /** 读取当前视口 {vw, vh, dpr, dvhSupported} */
  viewport: () => ViewportInfo
}

/**
 * 设备/环境能力组合式函数。
 *
 * 纯探测、无响应式状态、无生命周期依赖，可在 setup 内外任意调用
 * （事件回调、路由守卫、工具模块中直接 `useDevice()` 即可）。
 * 同步 getter 每次实时取值，函数项按需调用。
 */
export function useDevice(): UseDeviceReturn {
  return {
    get isTouch(): boolean {
      return detectTouch()
    },
    get isIOS(): boolean {
      return detectIOS()
    },
    get isAndroid(): boolean {
      return detectAndroid()
    },
    get isStandalone(): boolean {
      return detectStandalone()
    },
    get prefersReducedMotion(): boolean {
      return detectReducedMotion()
    },
    get vibrationSupported(): boolean {
      return detectVibrationSupported()
    },
    hasCamera: detectHasCamera,
    safeArea: readSafeArea,
    viewport: readViewport,
  }
}

export default useDevice
