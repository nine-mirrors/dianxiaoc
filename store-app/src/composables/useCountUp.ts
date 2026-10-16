/**
 * useCountUp —— 数字滚动动画（KPI / 健康分 / 计数类数字的入场与更新过渡）。
 *
 * 为什么单开一个 composable：全项目有大量「一个关键数字」的位置（看板 KPI、健康分、
 * 排行榜分值、完成率、待办数…），逐个手写 rAF 既费工又容易出现浮点尾巴（89.99999）
 * 或组件卸载后仍在跑的动画。集中一处实现，各页面只负责绑定。
 *
 * 用法（响应式目标值）：
 * ```ts
 * const score = useCountUp(() => overview.value?.kpis[0]?.value ?? 0, { decimals: 1 })
 * // 模板：<b>{{ score.text }}</b>   或   <b>{{ score.value }}</b>
 * ```
 *
 * 行为约定：
 *  - 目标值变化时，从**当前显示值**平滑滚到新值（不是每次从 0 重来）；
 *  - 缓动 easeOutCubic（先快后慢，收尾稳，符合「数字落定」的心理预期）；
 *  - 结束时回写精确目标值，避免浮点误差；
 *  - 组件卸载自动取消 rAF，杜绝后台空转；
 *  - 非法值（undefined / NaN）按 0 处理，绝不渲染 NaN。
 */
import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'

export interface CountUpOptions {
  /** 动画时长 ms（默认 700） */
  duration?: number
  /** 小数位（默认 0；传 1 保留一位小数） */
  decimals?: number
  /** 文本后缀（如 '%' / ' 分'），拼进 text，模板里只写一个插值 */
  suffix?: string
}

export interface CountUpReturn {
  /** 当前显示中的数值（已按帧更新） */
  value: Ref<number>
  /** 带小数位与后缀的展示文本 */
  text: ComputedRef<string>
}

/** easeOutCubic：1 - (1-t)^3 */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export function useCountUp(target: () => number, options: CountUpOptions = {}): CountUpReturn {
  const { duration = 700, decimals = 0, suffix = '' } = options

  const value = ref<number>(0)
  const text = computed<string>(() => `${value.value.toFixed(decimals)}${suffix}`)

  let raf = 0

  /** 从 from 滚到 to */
  function roll(from: number, to: number): void {
    if (raf) cancelAnimationFrame(raf)
    // 时长非法或首帧就在目标值上：直接落定，不做无意义的动画
    if (!Number.isFinite(duration) || duration <= 0 || from === to) {
      value.value = to
      return
    }
    const startAt = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - startAt) / duration)
      value.value = from + (to - from) * easeOutCubic(t)
      if (t < 1) {
        raf = requestAnimationFrame(step)
      } else {
        raf = 0
        value.value = to // 终值精确回写
      }
    }
    raf = requestAnimationFrame(step)
  }

  /** 归一目标值：非数字一律按 0 处理（宁可显示 0，也不显示 NaN） */
  const readTarget = (): number => {
    const n = Number(target())
    return Number.isFinite(n) ? n : 0
  }

  watch(target, (): void => {
    roll(value.value, readTarget())
  }, { immediate: true })

  onUnmounted(() => {
    if (raf) cancelAnimationFrame(raf)
  })

  return { value, text }
}

export default useCountUp
