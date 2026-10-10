/**
 * 演示设置 store（加载速度倍率 / 骨架屏开关 / 重置演示数据）。
 *
 * 影响 mock 层的注入延迟：AI 分析动画正常约 2.4s，可调慢到约 4.8s 便于录制解说。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const DEMO_KEY = 'store-app:demo'

export const useDemoStore = defineStore('demo', () => {
  /** 加载速度倍率：1 正常 / 2 慢一倍 */
  const speed = ref<number>(Number(import.meta.env.VITE_DEMO_SPEED) || 1)
  /** 是否显示骨架屏（关掉后直接出内容，用于静态截图） */
  const skeleton = ref<boolean>(true)
  /** 演示设置面板是否可见（桌面端手机壳外挂齿轮控制） */
  const panelVisible = ref<boolean>(false)

  /** AI 分步动画总时长估算（毫秒），用于 UI 展示「约 x.x 秒」 */
  const aiDurationMs = computed<number>(() => Math.round(2400 * speed.value))

  /**
   * 恢复本地演示设置。
   */
  function restore(): void {
    try {
      const raw = localStorage.getItem(DEMO_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { speed?: number; skeleton?: boolean }
      if (typeof saved?.speed === 'number') speed.value = saved.speed
      if (typeof saved?.skeleton === 'boolean') skeleton.value = saved.skeleton
    } catch {
      /* 忽略 */
    }
  }

  /** 持久化演示设置 */
  function persist(): void {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify({ speed: speed.value, skeleton: skeleton.value }))
    } catch {
      /* 忽略 */
    }
  }

  /** 设置速度倍率 */
  function setSpeed(next: number): void {
    speed.value = next
    persist()
  }

  /** 切换骨架屏 */
  function toggleSkeleton(): void {
    skeleton.value = !skeleton.value
    persist()
  }

  /** 开合设置面板 */
  function togglePanel(): void {
    panelVisible.value = !panelVisible.value
  }

  restore()

  return { speed, skeleton, panelVisible, aiDurationMs, setSpeed, toggleSkeleton, togglePanel }
})
