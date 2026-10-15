/**
 * Toast 队列（全局单例）。
 *
 * 用法：const { success, info, error } = useToast(); success('已保存 · 健康分 72')
 *
 * 人性化：错误提示可以带一个动作（最常见就是「重试」），用户不必自己找回操作入口：
 *   error('提交没成功', { actionText: '再试一次', onAction: () => submit() })
 * 点击动作或 Toast 自动消失后都会清理，回调只触发一次。
 */
import { ref } from 'vue'

export type ToastType = 'success' | 'info' | 'error'

/** Toast 上的可选动作（如「重试」「查看」） */
export interface ToastAction {
  /** 按钮文字 */
  text: string
  /** 点击回调；触发后 Toast 自动关闭 */
  onAction: () => void
}

export interface ToastOptions {
  /** 停留毫秒数，默认按类型取常规时长 */
  duration?: number
  /** 可选动作按钮（建议仅 error / info 使用） */
  action?: ToastAction
}

export interface ToastItem {
  id: number
  type: ToastType
  text: string
  duration: number
  action?: ToastAction
}

/** 全局队列（模块级单例，跨组件共享） */
const queue = ref<ToastItem[]>([])
let seed = 0

/** 自动消失定时器，便于动作点击时提前清理 */
const timers = new Map<number, number>()

/** 弹出一条 Toast */
function push(
  type: ToastType,
  text: string,
  duration: number = 2200,
  action?: ToastAction,
): number {
  const id = ++seed
  queue.value = [...queue.value, { id, type, text, duration, action }]
  const timer = window.setTimeout(() => remove(id), duration)
  timers.set(id, timer)
  return id
}

/** 移除指定 Toast */
function remove(id: number): void {
  queue.value = queue.value.filter((t) => t.id !== id)
  const timer = timers.get(id)
  if (timer != null) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
}

/** 点击 Toast 动作：触发回调（仅一次）并立即关闭该条 */
function runAction(id: number): void {
  const item = queue.value.find((t) => t.id === id)
  const action = item?.action
  remove(id)
  // 先移除再执行：回调内若再次 push 同类提示，不会被本次 remove 误删
  action?.onAction()
}

export function useToast() {
  return {
    toasts: queue,
    success: (text: string, opts?: ToastOptions) =>
      push('success', text, opts?.duration ?? 2200, opts?.action),
    info: (text: string, opts?: ToastOptions) =>
      push('info', text, opts?.duration ?? 2200, opts?.action),
    /** 错误默认停留更久（3.2s），给用户读清并点「重试」的时间 */
    error: (text: string, opts?: ToastOptions) =>
      push('error', text, opts?.duration ?? 3200, opts?.action),
    remove,
    runAction,
  }
}

export default useToast
