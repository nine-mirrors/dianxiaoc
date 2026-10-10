/**
 * 通用异步请求 hook：loading / error / data + 重试。
 *
 * ★ 约定（ARCHITECTURE §8.7）：任何失败都吞掉异常并 Toast 友好文案，
 *   绝不允许浏览器原生报错弹窗中断演示。
 */
import { ref, onMounted } from 'vue'
import { useToast } from './useToast'

export interface UseApiOptions<T> {
  /** 是否立即执行，默认 true */
  immediate?: boolean
  /** 初始数据 */
  initial?: T
  /** 失败后的兜底数据（保证不白屏） */
  fallback?: T
  /** 失败提示文案；传 '' 表示不提示 */
  errorMessage?: string
}

/**
 * 包装一个异步请求。
 *
 * @param fn 请求函数
 * @param options 选项
 */
export function useApi<T>(fn: () => Promise<T>, options: UseApiOptions<T> = {}) {
  const { immediate = true, initial = null as unknown as T, fallback = initial, errorMessage = '' } = options

  const data = ref<T>(initial)
  const loading = ref<boolean>(false)
  const error = ref<Error | null>(null)
  const { error: toastError } = useToast()

  /** 执行请求 */
  async function run(): Promise<T | null> {
    loading.value = true
    error.value = null
    try {
      const res = await fn()
      data.value = res
      return res
    } catch (e) {
      error.value = e as Error
      if (fallback !== undefined && fallback !== null) data.value = fallback
      if (errorMessage) toastError(errorMessage)
      return null
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    if (immediate) run()
  })

  return { data, loading, error, run }
}

export default useApi
