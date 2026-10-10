/**
 * Toast 队列（全局单例）。
 *
 * 用法：const { success, info, error } = useToast(); success('已保存 · 健康分 72')
 */
import { ref } from 'vue'

export type ToastType = 'success' | 'info' | 'error'

export interface ToastItem {
  id: number
  type: ToastType
  text: string
  duration: number
}

/** 全局队列（模块级单例，跨组件共享） */
const queue = ref<ToastItem[]>([])
let seed = 0

/** 弹出一条 Toast */
function push(type: ToastType, text: string, duration: number = 2200): number {
  const id = ++seed
  queue.value = [...queue.value, { id, type, text, duration }]
  window.setTimeout(() => remove(id), duration)
  return id
}

/** 移除指定 Toast */
function remove(id: number): void {
  queue.value = queue.value.filter((t) => t.id !== id)
}

export function useToast() {
  return {
    toasts: queue,
    success: (text: string, duration?: number) => push('success', text, duration),
    info: (text: string, duration?: number) => push('info', text, duration),
    error: (text: string, duration?: number) => push('error', text, duration),
    remove,
  }
}

export default useToast
