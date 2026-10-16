<script setup lang="ts">
/**
 * DemoModeToggle —— 「一键演示」开关（入口按钮）。
 *
 * 两处形态：
 *  - `variant="side"`  ：桌面侧栏底部（图标 + 「演示模式」文字胶囊），与主题开关并列；
 *  - `variant="header"`：移动顶栏 / 桌面顶栏（紧凑胶囊），空间紧张时仍清晰可点。
 *
 * 点击只翻转 store 的开关态；真正跳转由常驻的 <DemoMode> 浮层执行（App.vue 顶层挂载），
 * 故本组件只是「入口」，不承担导航逻辑，避免多处 router 调用。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useDemoModeStore } from '@/stores/demo-mode'

interface Props {
  /** side = 桌面侧栏；header = 顶栏胶囊 */
  variant?: 'side' | 'header'
  /** plain = 浅色卡片面（侧栏底部 / 普通顶栏）；on-dark = 品牌绿面上（渐变顶栏 / 经理顶栏 / 管理端侧栏） */
  tone?: 'plain' | 'on-dark'
}
withDefaults(defineProps<Props>(), { variant: 'side', tone: 'plain' })

const route = useRoute()
const demo = useDemoModeStore()

/** 点击：开启时记录当前路由（退出回归用）；关闭时直接停 */
function onClick(): void {
  demo.toggle(route.fullPath)
}

const label = computed<string>(() => (demo.active ? '退出演示模式' : '开启演示模式'))
</script>

<template>
  <button
    type="button"
    class="demo-toggle mot-tap"
    :class="[`demo-toggle--${variant}`, `demo-toggle--${tone}`, { 'is-on': demo.active }]"
    role="switch"
    :aria-checked="demo.active"
    :aria-label="label"
    :title="label"
    @click="onClick"
  >
    <AppIcon :name="demo.active ? 'pause' : 'play'" :size="variant === 'header' ? 15 : 16" />
    <span class="demo-toggle__text">{{ demo.active ? '演示中' : '演示模式' }}</span>
    <em v-if="demo.active" class="demo-toggle__dot" aria-hidden="true" />
  </button>
</template>

<style scoped>
.demo-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--r-pill);
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1;
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}

.demo-toggle--side {
  min-height: 32px;
  flex: none;
}

.demo-toggle--header {
  min-height: 40px;
  font-size: 12px;
  padding: 0 11px;
}

.demo-toggle:hover {
  border-color: var(--mn-green);
  color: var(--mn-green-dark);
}

.demo-toggle.is-on {
  background: var(--grad-brand);
  border-color: transparent;
  color: #fff;
}

/* 品牌绿面（渐变顶栏 / 经理顶栏 / 管理端侧栏）：半透明白底白字，保证在绿底上的对比度 */
.demo-toggle--on-dark {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.5);
  color: #fff;
}

.demo-toggle--on-dark:hover {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
}

/* 特异性高于 .demo-toggle.is-on（同为两类的后者生效）：绿面上用白底绿字更醒目 */
.demo-toggle--on-dark.is-on {
  background: #fff;
  border-color: transparent;
  color: var(--mn-green-dark);
}

.demo-toggle--on-dark.is-on .demo-toggle__dot {
  background: var(--mn-green);
}

.demo-toggle:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.demo-toggle--on-dark:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.demo-toggle__text {
  white-space: nowrap;
}

/* 演示中：呼吸小圆点，提示「正在演示」，纯装饰 */
.demo-toggle__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: demo-toggle-pulse 1.4s var(--ease-standard) infinite;
}

@keyframes demo-toggle-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.35;
    transform: scale(0.7);
  }
}

/* 真机超窄屏：只留图标，省出顶栏横向空间 */
@media (max-width: 360px) {
  .demo-toggle--header .demo-toggle__text {
    display: none;
  }
}
</style>
