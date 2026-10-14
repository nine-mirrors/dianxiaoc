/**
 * useDialogFocus —— 弹窗/对话框键盘焦点管理（WAI-ARIA Dialog 模式）。
 *
 * 统一处理四件事，供全站各类弹窗（整改弹窗、派发弹窗、图片大图等）接入：
 * 1. 打开时记录「触发元素」，按优先级把焦点移入面板：
 *      [data-autofocus] 元素 → 最后一个关闭按钮 → 面板内第一个可聚焦元素 → 面板本身；
 * 2. Tab / Shift+Tab 在面板内循环，焦点不会跑到弹层背后的页面；
 * 3. Esc 触发 onClose（由调用方决定如何关闭，本组合式函数不直接改 visible）；
 * 4. 关闭后焦点还原到打开前的触发元素；触发元素已从 DOM 移除时安全跳过。
 *
 * 仅做焦点管理，不负责遮罩、滚动锁定、动画与 aria 属性，那些仍由各弹窗自身实现。
 *
 * ── 接入示例 ──────────────────────────────────────────────────────────
 * ```vue
 * <script setup lang="ts">
 * import { ref } from 'vue'
 * import { useDialogFocus } from '@/composables/useDialogFocus'
 *
 * const visible = ref(false)
 * const { panelRef } = useDialogFocus({
 *   visible,
 *   onClose: () => { visible.value = false },
 * })
 * </script>
 *
 * <template>
 *   <button type="button" @click="visible = true">打开弹窗</button>
 *
 *   <div v-if="visible" class="mask" @click.self="visible = false">
 *     <!-- ref 绑到「弹窗体」这一层；role/aria-modal 仍需弹窗自己声明 -->
 *     <section
 *       ref="panelRef"
 *       class="dialog"
 *       role="dialog"
 *       aria-modal="true"
 *       aria-labelledby="dlg-title"
 *     >
 *       <h2 id="dlg-title">派发整改任务</h2>
 *
 *       <!-- 想让打开后焦点落在某个输入框：加 data-autofocus -->
 *       <input data-autofocus v-model="remark" />
 *
 *       <!-- 关闭钮：加 data-close（或 aria-label 含「关闭」）会被自动识别，
 *            无 data-autofocus 时打开焦点会落在 DOM 中最后一个关闭钮上 -->
 *       <button type="button" data-close aria-label="关闭" @click="visible = false">×</button>
 *     </section>
 *   </div>
 * </template>
 * ```
 * 注意：
 * - v-if / v-show 两种写法都支持（内部用 flush:'post' 的 watch，等 DOM 挂载后再移焦点）；
 * - 面板若没有 tabindex，会自动补 tabindex="-1"，保证无任何可聚焦元素时面板本身可承接焦点；
 * - 必须在 setup 顶层同步调用（依赖 onMounted/onBeforeUnmount/watch 生命周期）。
 *
 * @module composables/useDialogFocus
 */
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/** 面板内可聚焦元素（选择器顺序即 Tab 顺序） */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** 关闭按钮候选：显式 data-close 最可靠；兜底识别 aria-label 含「关闭」的按钮 */
const CLOSE_SELECTOR = ['button[data-close]', 'button[aria-label*="关闭" i]'].join(',')

export interface UseDialogFocusOptions {
  /** 弹窗显隐状态（由调用方持有，组合式函数只读监听） */
  visible: Ref<boolean>
  /** Esc 回调：通常是 () => { visible.value = false } */
  onClose: () => void
}

export interface UseDialogFocusReturn {
  /** 绑到弹窗体元素（role="dialog" 那一层） */
  panelRef: Ref<HTMLElement | null>
}

export function useDialogFocus(options: UseDialogFocusOptions): UseDialogFocusReturn {
  const { visible, onClose } = options
  const panelRef = ref<HTMLElement | null>(null)

  /** 打开弹窗时的触发元素，关闭后焦点还原到它 */
  let trigger: HTMLElement | null = null

  /** 收集面板内当前真正可聚焦的元素（过滤 disabled / hidden / inert / 无渲染盒） */
  function collectFocusables(panel: HTMLElement): HTMLElement[] {
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) =>
        !el.hasAttribute('disabled') &&
        !el.closest('[hidden],[inert]') &&
        el.getClientRects().length > 0,
    )
  }

  /** 安全聚焦；目标因进场动画等原因尚未接住焦点时，下一帧再试一次 */
  function focusTarget(el: HTMLElement): void {
    el.focus({ preventScroll: true })
    if (typeof document !== 'undefined' && document.activeElement !== el) {
      requestAnimationFrame(() => el.focus({ preventScroll: true }))
    }
  }

  /** 打开：记录触发元素 → 按优先级移焦点 */
  function activate(): void {
    if (typeof document === 'undefined') return
    const panel = panelRef.value
    if (!panel) return

    const active = document.activeElement
    trigger = active instanceof HTMLElement ? active : null

    // 面板需要可被程序化聚焦（无可见 Tab 停点），仅在未显式声明时补
    if (!panel.hasAttribute('tabindex')) {
      panel.setAttribute('tabindex', '-1')
    }

    const autofocus = panel.querySelector<HTMLElement>('[data-autofocus]')
    const closeButtons = panel.querySelectorAll<HTMLElement>(CLOSE_SELECTOR)
    const focusables = collectFocusables(panel)

    const target =
      autofocus ??
      closeButtons[closeButtons.length - 1] ??
      focusables[0] ??
      panel

    focusTarget(target)
  }

  /** 关闭：焦点还原触发元素（已卸载则跳过） */
  function deactivate(): void {
    if (typeof document === 'undefined') return
    const el = trigger
    trigger = null
    if (el && el.isConnected) {
      el.focus({ preventScroll: true })
    }
  }

  /** 键盘处理：Esc 关闭，Tab 在面板内循环 */
  function onKeydown(event: KeyboardEvent): void {
    if (!visible.value) return
    const panel = panelRef.value
    if (!panel) return

    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== 'Tab') return

    const focusables = collectFocusables(panel)
    if (focusables.length === 0) {
      event.preventDefault()
      panel.focus({ preventScroll: true })
      return
    }

    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    const inside = active instanceof HTMLElement && panel.contains(active)

    if (event.shiftKey) {
      // Shift+Tab：在首个元素上继续后退 → 跳到末尾
      if (!inside || active === first) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      }
    } else {
      // Tab：在末尾元素上继续前进 → 跳到开头
      if (!inside || active === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
  }

  // post 回调：等 v-if 的 DOM 挂载 / v-show 切换完成后再操作焦点
  watch(
    visible,
    (value) => {
      if (value) activate()
      else deactivate()
    },
    { flush: 'post' },
  )

  onMounted(() => {
    if (typeof document === 'undefined') return // SSR / 非浏览器环境保护
    document.addEventListener('keydown', onKeydown, true)
    if (visible.value) activate() // 初始即为打开态
  })

  onBeforeUnmount(() => {
    if (typeof document === 'undefined') return
    document.removeEventListener('keydown', onKeydown, true)
  })

  return { panelRef }
}

export default useDialogFocus
