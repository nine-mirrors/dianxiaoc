<script setup lang="ts">
/**
 * Toast 容器（配合 composables/useToast.ts）。
 *
 * 全站唯一实例，挂在 App.vue 根节点；失败/成功统一走这里，
 * 绝不出现浏览器原生 alert/error 弹窗。
 */
import { useToast } from '@/composables/useToast'
import AppIcon from './AppIcon.vue'

const { toasts } = useToast()

/** 图标名映射 */
const ICONS: Record<string, string> = {
  success: 'check-circle',
  error: 'x-circle',
  info: 'info',
}
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast--${t.type}`">
        <AppIcon :name="ICONS[t.type] || 'info'" :size="16" />
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
