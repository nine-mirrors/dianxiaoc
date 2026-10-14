/**
 * 日 / 夜主题单例（Design System 1.2 双主题基建）。
 *
 * - 主题状态为模块级单例，任意组件 import 同一份；
 * - initTheme() 可在应用入口早期调用（SSR 安全）：localStorage 手动选择优先，
 *   否则跟随系统 prefers-color-scheme；手动选择后系统变化不再跟随；
 * - toggleTheme() 支持从点击坐标扩散的 View Transition 圆形涟漪，
 *   不支持的浏览器降级为 .theme-anim 颜色过渡，prefers-reduced-motion 时零动画瞬切。
 */
import { computed, readonly, ref } from 'vue'
import type { ComputedRef, DeepReadonly, Ref } from 'vue'

export type ThemeName = 'light' | 'dark'

/** 涟漪触发坐标（视口像素，通常取 PointerEvent.clientX/Y） */
export interface ToggleOrigin {
  x: number
  y: number
}

const STORAGE_KEY = 'dxc:theme'
const THEME_COLOR_LIGHT = '#00b451'
const THEME_COLOR_DARK = '#0c1510'
const ANIM_FALLBACK_MS = 500
const RIPPLE_DURATION_MS = 460

/** View Transition 未进 TS DOM 基线时的最小结构类型 */
interface ViewTransitionLike {
  finished: Promise<void>
}
type DocumentWithVT = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike
}

/* ── 模块级单例状态 ── */
const current = ref<ThemeName>('light')
/** 用户是否已手动选择过主题（手动后不再跟随系统） */
let userChosen = false
/** initTheme 幂等守卫（含 HMR / 多入口调用） */
let started = false

export const theme: DeepReadonly<Ref<ThemeName>> = readonly(current)
export const isDark: ComputedRef<boolean> = computed(() => current.value === 'dark')

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function readStorage(): ThemeName | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function writeStorage(name: ThemeName): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, name)
  } catch {
    /* 隐私模式 / 配额异常：静默降级为仅本会话主题 */
  }
}

/**
 * 同步 <meta name="theme-color">（移动端浏览器地址栏配色）。
 *
 * index.html 内已有按 prefers-color-scheme 分工的静态双 meta（无 media 的日间通用条 +
 * 带 dark media 的夜间条）。手动选主题后静态媒体查询会与实际主题打架，故首次同步时
 * 把带 media 的静态条降级为永不匹配（media="not all"，仅运行期 DOM 调整、不改文件），
 * 再由不带 media 的通用条单一受控；通用条不存在时动态创建。
 */
let managedMeta: HTMLMetaElement | null = null

function syncMetaColor(name: ThemeName): void {
  if (!managedMeta) {
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')
      .forEach((m) => {
        m.setAttribute('media', 'not all')
      })
    managedMeta =
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
    if (!managedMeta) {
      managedMeta = document.createElement('meta')
      managedMeta.name = 'theme-color'
      document.head.appendChild(managedMeta)
    }
  }
  managedMeta.content = name === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
}

/** 落地一次主题：响应式状态 + <html data-theme> + meta */
function applyTheme(name: ThemeName): void {
  current.value = name
  if (!canUseDom()) return
  document.documentElement.dataset.theme = name
  syncMetaColor(name)
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * 初始化主题。应用入口（main / App 模块作用域）尽早调用一次即可，重复调用安全。
 */
export function initTheme(): void {
  if (!canUseDom() || started) return
  started = true

  const stored = readStorage()
  if (stored) {
    userChosen = true
    applyTheme(stored)
  } else {
    userChosen = false
    applyTheme(systemPrefersDark() ? 'dark' : 'light')
  }

  // 仅当用户从未手动选择时跟随系统；一旦手动选择，以手动为准
  if (typeof window.matchMedia === 'function') {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', (e: MediaQueryListEvent) => {
      if (!userChosen) applyTheme(e.matches ? 'dark' : 'light')
    })
  }
}

/**
 * 直接设定主题（代码驱动，持久化但不播放切换动画）。
 */
export function setTheme(name: ThemeName): void {
  userChosen = true
  writeStorage(name)
  applyTheme(name)
}

/**
 * 切换日 / 夜主题：持久化 → 切换 data-theme → 更新 meta theme-color。
 *
 * 动效分级：
 * 1. prefers-reduced-motion：直接切换，无动画；
 * 2. 支持 document.startViewTransition 且传入 origin：从点击位置圆形涟漪扩散；
 * 3. 其余：<html> 临时挂 .theme-anim，走令牌颜色过渡，500ms 后移除。
 */
export function toggleTheme(origin?: ToggleOrigin): void {
  if (!canUseDom()) return
  const next: ThemeName = current.value === 'dark' ? 'light' : 'dark'
  userChosen = true
  writeStorage(next)

  if (prefersReducedMotion()) {
    applyTheme(next)
    return
  }

  const startViewTransition = (document as DocumentWithVT).startViewTransition
  if (typeof startViewTransition === 'function' && origin) {
    runRipple(startViewTransition, origin, next)
    return
  }

  // 降级：全局颜色过渡（tokens.css 的 .theme-anim 约定）
  const root = document.documentElement
  root.classList.add('theme-anim')
  applyTheme(next)
  window.setTimeout(() => root.classList.remove('theme-anim'), ANIM_FALLBACK_MS)
}

/** 从点击坐标扩散的圆形裁剪涟漪（基于 View Transition API） */
function runRipple(
  startViewTransition: (cb: () => void) => ViewTransitionLike,
  origin: ToggleOrigin,
  next: ThemeName,
): void {
  const root = document.documentElement
  // 到视口最远角的距离：保证涟漪终点盖满整屏
  const maxRadius = Math.ceil(
    Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    ),
  )
  root.style.setProperty('--rx', `${origin.x}px`)
  root.style.setProperty('--ry', `${origin.y}px`)

  const styleEl = document.createElement('style')
  styleEl.dataset.dxcThemeRipple = ''
  styleEl.textContent = `
::view-transition-old(root){animation:none;}
::view-transition-new(root){animation:dxc-theme-ripple ${RIPPLE_DURATION_MS}ms ease-out;}
@keyframes dxc-theme-ripple{
  from{clip-path:circle(0px at var(--rx) var(--ry));}
  to{clip-path:circle(${maxRadius}px at var(--rx) var(--ry));}
}`
  document.head.appendChild(styleEl)

  const transition = startViewTransition(() => applyTheme(next))
  // 动画结束 / 被跳过（reduced-motion 由上层拦截，这里兜底）均移除临时样式
  void transition.finished.finally(() => {
    styleEl.remove()
  })
}

export default {
  theme,
  isDark,
  initTheme,
  setTheme,
  toggleTheme,
}
