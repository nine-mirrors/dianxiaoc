/**
 * useDocumentBadge —— 切到后台标签 / 窗口时的「新消息浏览器标题角标」。
 *
 * 规则：
 *  - 订阅实时推送 `message:new` / `announcement:new`（与 TabBar 未读角标同源）；
 *  - 仅当 document.hidden === true（用户切到别的标签 / 最小化窗口）时收到事件才计数 +1，
 *    document.title 改为 `(n) 店小C`；计数中重复事件只更新数字，绝不叠加成 `(2) (1) …`；
 *  - 页面重新可见（visibilitychange → visible）时清零并恢复原标题；
 *  - 组件卸载时恢复原标题、注销 realtime 订阅与所有监听。
 *
 * 标题基线策略（保证恢复「稳」）：
 *  - initialTitle：composable 初始化时的 document.title，作为最终兜底与卸载恢复值；
 *  - baseTitle：切走页面那一刻的当前标题——路由 afterEach 会按页面重设标题
 *    （如「今日巡店 · 店小C」），恢复时应回到离开前那一页的标题，而非启动标题。
 *
 * 可选加分：canvas 动态给 favicon 画红点 + 数字并替换 <link rel="icon">，可见时还原原
 * href。favicon 全程 try/catch 静默，任何失败都不影响标题角标主功能。
 *
 * @module composables/useDocumentBadge
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { onRealtime } from '@/realtime/client'

/** 角标标题固定后缀（document.title = `(n) 店小C`） */
const BADGE_APP_NAME = '店小C'

/** 防御性匹配标题上已有的 `(n) ` 前缀，避免任何来源造成重复加括号 */
const BADGE_PREFIX_RE = /^\(\d+\)\s*/

export function useDocumentBadge(): void {
  // 非浏览器环境（SSR / 测试）直接跳过
  if (typeof document === 'undefined') return

  /** composable 初始化时的标题（最终兜底 + 卸载恢复值） */
  const initialTitle = document.title || BADGE_APP_NAME
  /** 本次离开页面前的标题（清零时恢复它） */
  let baseTitle = initialTitle
  /** 后台期间未读数 */
  let unread = 0

  /** 退订函数（onMounted 中赋值） */
  let offMessage: (() => void) | null = null
  let offAnnouncement: (() => void) | null = null

  /** 去掉标题上可能存在的角标前缀 */
  function stripBadgePrefix(title: string): string {
    return title.replace(BADGE_PREFIX_RE, '')
  }

  /** 按当前计数渲染标题：有未读 → `(n) 店小C`；否则恢复基线标题 */
  function renderTitle(): void {
    document.title = unread > 0 ? `(${unread}) ${BADGE_APP_NAME}` : baseTitle
  }

  /* ─────────────── favicon 红点（加分项，失败全程静默） ─────────────── */

  let iconLink: HTMLLinkElement | null = null
  /** 原有 favicon href（恢复用） */
  let originalHref = ''
  /** 原 <link> 不存在时由我们创建，恢复时需移除 */
  let createdLink = false
  /** 当前是否正由角标占用 favicon（避免无谓恢复） */
  let faviconBadged = false
  /** 原 favicon 图像（能加载就在红点下保留原图标） */
  let baseIconImg: HTMLImageElement | null = null

  function ensureIconLink(): HTMLLinkElement | null {
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
      createdLink = true
    }
    if (!originalHref) originalHref = link.href
    return link
  }

  /** 预加载原 favicon（data-URI 时可直接画回 canvas） */
  function preloadBaseIcon(): void {
    try {
      const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
      if (link?.href) {
        const img = new Image()
        img.src = link.href
        baseIconImg = img
      }
    } catch {
      baseIconImg = null
    }
  }

  /** 画红点 + 数字 favicon；任何一步失败都静默跳过（标题角标不受影响） */
  function drawFaviconBadge(): void {
    try {
      const size = 64
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, size, size)

      // 原 favicon 已加载成功则先铺底图（失败 / 未完成则退化为纯红点徽标）
      if (baseIconImg && baseIconImg.complete && baseIconImg.naturalWidth > 0) {
        try {
          ctx.drawImage(baseIconImg, 0, 0, size, size)
        } catch {
          /* 底图绘制失败：仅显示红点 */
        }
      }

      const label = unread > 99 ? '99+' : String(unread)
      const cx = size - 22
      const cy = size - 22
      const r = 20

      // 白色描边 + 品牌警示红点
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = '#e5484d'
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const fontSize = label.length >= 3 ? 15 : label.length === 2 ? 20 : 24
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, "PingFang SC", sans-serif`
      ctx.fillText(label, cx, cy + 1)

      const href = canvas.toDataURL('image/png')
      const link = ensureIconLink()
      if (link) {
        iconLink = link
        link.href = href
        faviconBadged = true
      }
    } catch {
      /* canvas / toDataURL 失败（隐私模式、SVG 污点等）：静默，不影响标题角标 */
    }
  }

  /** 恢复原 favicon；非我们创建的 link 还原 href，自建的移除 */
  function restoreFavicon(): void {
    if (!faviconBadged) return
    faviconBadged = false
    try {
      if (createdLink && iconLink && iconLink.parentNode) {
        iconLink.parentNode.removeChild(iconLink)
        iconLink = null
        return
      }
      const link =
        iconLink && iconLink.isConnected
          ? iconLink
          : document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
      if (link && originalHref) link.href = originalHref
    } catch {
      /* 静默 */
    }
  }

  /* ─────────────── 实时事件：后台期间收到新消息 / 新公告即 +1 ─────────────── */

  function handleBadgeEvent(): void {
    // 页面可见时不打扰（与 TabBar 角标分工：可见时用户正在看页面）
    if (!document.hidden) return
    if (unread === 0) {
      // 首次计数：固化离开前标题，并防御性剥掉任何残留 `(n) ` 前缀（去重）
      baseTitle = stripBadgePrefix(document.title) || initialTitle
    }
    unread += 1
    renderTitle()
    drawFaviconBadge()
  }

  /** 重新可见：清零、恢复原标题与 favicon */
  function handleVisibilityChange(): void {
    if (document.hidden) {
      // 切走瞬间刷新基线标题（路由可能在本页内按页面更新过标题）
      if (unread === 0) {
        baseTitle = stripBadgePrefix(document.title) || initialTitle
      }
      return
    }
    if (unread === 0) return
    unread = 0
    renderTitle()
    restoreFavicon()
  }

  onMounted(() => {
    // 与 TabBar 相同的订阅方式：拿到退订函数，卸载时注销
    offMessage = onRealtime('message:new', handleBadgeEvent)
    offAnnouncement = onRealtime('announcement:new', handleBadgeEvent)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    preloadBaseIcon()
  })

  onBeforeUnmount(() => {
    offMessage?.()
    offAnnouncement?.()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    // 卸载时无条件恢复初始标题与 favicon
    unread = 0
    document.title = initialTitle
    restoreFavicon()
  })
}

export default useDocumentBadge
