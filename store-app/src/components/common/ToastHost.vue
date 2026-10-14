<script setup lang="ts">
/**
 * Toast 容器（配合 composables/useToast.ts）。
 *
 * 全站唯一实例，挂在 App.vue 根节点；失败/成功统一走这里，
 * 绝不出现浏览器原生 alert/error 弹窗。
 */
import { watch } from 'vue'
import { useToast } from '@/composables/useToast'
import { useHaptics } from '@/composables/useHaptics'
import AppIcon from './AppIcon.vue'

const { toasts } = useToast()
const haptics = useHaptics()

/**
 * confined=true：渲染在手机壳覆盖层内，absolute 相对手机屏定位（桌面演示反馈不漂出机壳）；
 * 默认 false：桌面看板用，fixed 相对视口。
 *
 * vibrateOnError=true（默认 false，谨慎开启）：error toast 出现时联动一次 warning 震动。
 * 震动仅在 Android 等支持 Vibration API 的设备生效，iOS 静默降级；
 * useHaptics 内部已自动尊重系统「减弱动效」。默认关闭，避免频繁错误打扰用户，
 * 业务页也可直接调用 useHaptics() 自行决定触感时机，不必开启本开关。
 */
const props = withDefaults(defineProps<{ confined?: boolean; vibrateOnError?: boolean }>(), {
  confined: false,
  vibrateOnError: false,
})

/**
 * 已见过的 toast id：只为「新出现」的 error 震动，避免初始化/重挂载时误触发；
 * toast 消失后同步清理 id，集合不无限增长。
 */
const seenToastIds = new Set<number>()

watch(
  toasts,
  (list) => {
    for (const t of list) {
      if (seenToastIds.has(t.id)) continue
      seenToastIds.add(t.id)
      // 仅新出现的 error toast 且显式开启开关时震动；warning 节奏，不用最重的 error
      if (props.vibrateOnError && t.type === 'error') {
        haptics.warning()
      }
    }
    const liveIds = new Set(list.map((t) => t.id))
    for (const id of seenToastIds) {
      if (!liveIds.has(id)) seenToastIds.delete(id)
    }
  },
  { flush: 'post' },
)

/** 图标名映射 */
const ICONS: Record<string, string> = {
  success: 'check-circle',
  error: 'x-circle',
  info: 'info',
}
</script>

<template>
  <!-- 容器保持 polite：新 toast 排队播报，不打断读屏当前内容；
       错误 toast 自身带 role="alert"（隐式 assertive），需立即播报 -->
  <div class="toast-host" :class="{ 'toast-host--confined': confined }" role="status" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="`toast--${t.type}`"
        :role="t.type === 'error' ? 'alert' : null"
      >
        <AppIcon :name="ICONS[t.type] || 'info'" :size="16" aria-hidden="true" />
        <span class="toast__text">{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 96px;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transform: translateX(-50%);
  pointer-events: none;
}

/* 手机壳内：相对手机屏定位（覆盖层已给定位上下文与裁剪） */
.toast-host--confined {
  position: absolute;
}

.toast {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 320px;
  padding: 9px 14px;
  border-radius: 999px;
  background: rgba(26, 31, 28, 0.92);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}

.toast--success {
  background: rgba(0, 150, 57, 0.95);
}

.toast--error {
  background: rgba(224, 32, 32, 0.95);
}

.toast__text {
  line-height: 1.4;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.26s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
