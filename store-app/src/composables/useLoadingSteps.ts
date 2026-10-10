/**
 * AI 分步加载步骤播放（与 AiLoadingOverlay 配合）。
 *
 * 规则（ARCHITECTURE §3.3 注）：请求返回 与 动画播完 取较晚者，
 * 保证 2.4s（演示设置可调慢）的「智能感表演」完整。
 */
import { ref } from 'vue'
import type { Step } from '@/types'

export interface PlayingState {
  /** 当前进行到的步骤下标 */
  current: number
  /** 已完成步骤数 */
  done: number
  /** 进度百分比 0–100 */
  percent: number
}

/**
 * 创建分步播放器。
 *
 * @param steps 步骤定义（含每步 delayMs）
 */
export function useLoadingSteps(steps: Step[]) {
  const current = ref<number>(-1)
  const done = ref<number>(0)
  const percent = ref<number>(0)
  const finished = ref<boolean>(false)

  /**
   * 播放全部步骤。
   *
   * @param speed 速度倍率（演示设置：1 正常 / 2 慢一倍）
   * @returns Promise，全部播放完成时 resolve
   */
  function play(speed: number = 1): Promise<void> {
    current.value = -1
    done.value = 0
    percent.value = 0
    finished.value = false

    const list = steps?.length ? steps : [{ text: '正在分析…', delayMs: 500 }]
    const total = list.length

    return new Promise<void>((resolve) => {
      let idx = 0
      const tick = (): void => {
        if (idx >= total) {
          percent.value = 100
          finished.value = true
          resolve()
          return
        }
        current.value = idx
        const delay = Math.round(list[idx].delayMs * speed)
        window.setTimeout(() => {
          done.value = idx + 1
          percent.value = Math.round(((idx + 1) / total) * 100)
          idx += 1
          tick()
        }, delay)
      }
      tick()
    })
  }

  /** 重置状态 */
  function reset(): void {
    current.value = -1
    done.value = 0
    percent.value = 0
    finished.value = false
  }

  return { current, done, percent, finished, play, reset }
}

export default useLoadingSteps
