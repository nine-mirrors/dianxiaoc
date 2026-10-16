<script setup lang="ts">
/**
 * 日 / 夜主题切换开关（W1 主题基建）。
 *
 * 无障碍：role="switch" + aria-checked；点击把视口坐标交给 useTheme，
 * 支持时从触点播放圆形涟漪。视觉：52×30 胶囊，天蓝渐变 ↔ 深夜蓝，
 * 白色旋钮内太阳 / 月亮线描图标同点旋转形变。
 */
import { isDark, toggleTheme } from '@/composables/useTheme'

function onToggle(e: MouseEvent): void {
  toggleTheme({ x: e.clientX, y: e.clientY })
}
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :class="{ 'is-dark': isDark }"
    role="switch"
    :aria-checked="isDark"
    aria-label="切换日夜间模式"
    @click="onToggle"
  >
    <span class="theme-toggle__knob" aria-hidden="true">
      <!-- 太阳：日间居中，切换时旋转缩小淡出 -->
      <svg
        class="theme-toggle__ic theme-toggle__ic--sun"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </svg>
      <!-- 月亮：夜间旋转放大淡入 -->
      <svg
        class="theme-toggle__ic theme-toggle__ic--moon"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.theme-toggle {
  position: relative;
  flex: none;
  width: 52px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: var(--r-pill);
  background: var(--grad-sky);
  cursor: pointer;
  transition: background 380ms var(--ease-standard);
}

.theme-toggle.is-dark {
  background: linear-gradient(135deg, #101f2e, #1c3147);
}

.theme-toggle:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

/* 24px 白旋钮：左 3px 起始，行程 22px */
.theme-toggle__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 5px rgba(13, 32, 48, 0.28);
  transform: translateX(0);
  transition: transform 340ms var(--ease-emphasized);
}

.is-dark .theme-toggle__knob {
  transform: translateX(22px);
}

.theme-toggle__ic {
  position: absolute;
  inset: 0;
  margin: auto;
  transition:
    transform 320ms var(--ease-standard),
    opacity 260ms var(--ease-standard);
}

.theme-toggle__ic--sun {
  color: #f6a623;
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

.is-dark .theme-toggle__ic--sun {
  opacity: 0;
  transform: rotate(90deg) scale(0.35);
}

.theme-toggle__ic--moon {
  color: #1c3147;
  opacity: 0;
  transform: rotate(-90deg) scale(0.35);
}

.is-dark .theme-toggle__ic--moon {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}
</style>
