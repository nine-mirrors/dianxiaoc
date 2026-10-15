<script setup lang="ts">
/**
 * AI 分步加载遮罩（PRD 4.4 加载态 / T04.5）。
 *
 * 等待心理设计：
 * - 预期：多步骤文案 + 步骤点依次点亮，让用户知道「AI 在干什么、还剩几步」；
 * - 进度：连接线推进 + 进度条（scaleX）+ 百分比，持续给出正向反馈；
 * - 可控：dismissable 时提供键盘可达的关闭方式（Esc / 关闭按钮，自动聚焦），
 *   默认不可关闭，不渲染任何关闭入口。
 *
 * 兼容性：visible / steps / current / done / percent 与旧版完全一致，
 * useLoadingSteps 驱动方式不变，调用方零改动。steps 为空时启用内置兜底步骤
 * （正在识别货架 → 读取进销存 → 生成诊断），并由组件内部自动推进。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import type { Step } from '@/types'

interface Props {
  visible: boolean
  /** 步骤定义（沿用 useLoadingSteps 的 Step[]：text + delayMs） */
  steps: Step[]
  /** 当前步骤下标 */
  current: number
  /** 已完成步骤数 */
  done: number
  /** 进度百分比 */
  percent: number
  /** 主标题（可选，默认沿用旧文案） */
  title?: string
  /** 副标题（可选，默认沿用旧文案；传空串可隐藏） */
  subtitle?: string
  /** 是否可关闭：true 时显示关闭按钮并响应 Esc，触发 close 事件；默认 false */
  dismissable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  steps: () => [],
  current: -1,
  done: 0,
  percent: 0,
  title: 'AI 正在分析这家店',
  subtitle: '识别 → 比对标准 → 结合动销推理',
  dismissable: false,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

/** 兜底步骤文案（无业务门店 / 数字写死）：仅在调用方未传 steps 时启用 */
const FALLBACK_STEPS: Step[] = [
  { text: '正在识别货架…', delayMs: 1000 },
  { text: '正在读取进销存数据…', delayMs: 1000 },
  { text: '正在生成诊断建议…', delayMs: 1100 },
]

/** 兜底模式：没有外部步骤驱动时（当前两个调用方恒为 false，零行为变化） */
const standalone = computed<boolean>(() => !props.steps || props.steps.length === 0)
const viewSteps = computed<Step[]>(() => (standalone.value ? FALLBACK_STEPS : props.steps))

/* ── 兜底模式内置播放器（节奏与 useLoadingSteps 一致） ── */
const innerCurrent = ref(-1)
const innerDone = ref(0)
const innerPercent = ref(0)
let timer: number | undefined

function clearTimer(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }
}

function playFallback(): void {
  clearTimer()
  innerCurrent.value = -1
  innerDone.value = 0
  innerPercent.value = 0
  let idx = 0
  const tick = (): void => {
    if (idx >= FALLBACK_STEPS.length) {
      innerPercent.value = 100
      return
    }
    innerCurrent.value = idx
    timer = window.setTimeout(() => {
      innerDone.value = idx + 1
      innerPercent.value = Math.round(((idx + 1) / FALLBACK_STEPS.length) * 100)
      idx += 1
      tick()
    }, FALLBACK_STEPS[idx].delayMs)
  }
  tick()
}

const activeCurrent = computed<number>(() => (standalone.value ? innerCurrent.value : props.current))
const activeDone = computed<number>(() => (standalone.value ? innerDone.value : props.done))
const activePercent = computed<number>(() => (standalone.value ? innerPercent.value : props.percent))

/** 进度条用 transform: scaleX 驱动（不触发布局 / 重绘，不掉帧） */
const fillScale = computed<number>(() => Math.min(1, Math.max(0, activePercent.value / 100)))

/* ── 可见性联动：兜底自动播放、Esc 监听、关闭按钮聚焦 ── */
const closeBtn = ref<HTMLButtonElement | null>(null)

function onKeydown(e: KeyboardEvent): void {
  if (props.dismissable && e.key === 'Escape') emit('close')
}

watch(
  () => props.visible,
  (v) => {
    if (!v) {
      clearTimer()
      window.removeEventListener('keydown', onKeydown)
      return
    }
    if (standalone.value) playFallback()
    window.addEventListener('keydown', onKeydown)
    if (props.dismissable) void nextTick(() => closeBtn.value?.focus())
  },
)

onBeforeUnmount(() => {
  clearTimer()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Transition name="overlay">
    <div v-if="visible" class="overlay">
      <div
        class="overlay__card"
        :role="dismissable ? 'dialog' : 'status'"
        :aria-modal="dismissable ? 'true' : undefined"
        aria-live="polite"
        aria-busy="true"
        :aria-label="title"
      >
        <button
          v-if="dismissable"
          ref="closeBtn"
          type="button"
          class="overlay__close"
          aria-label="关闭等待提示"
          @click="emit('close')"
        >
          <AppIcon name="close" :size="15" color="var(--text-2)" />
        </button>

        <!-- 招牌等待主符号：牛奶注入奶滴（card 规格，文案由标题承担，故不重复显示） -->
        <div class="overlay__drop" aria-hidden="true">
          <MilkDropLoader size="card" label="" />
        </div>

        <p class="overlay__title">{{ title }}</p>
        <p v-if="subtitle" class="overlay__sub">{{ subtitle }}</p>

        <ol class="overlay__steps" aria-label="AI 分析步骤">
          <li
            v-for="(s, i) in viewSteps"
            :key="i"
            class="overlay__step"
            :class="{
              'is-done': i < activeDone,
              'is-active': i === activeCurrent,
              'is-idle': i > activeCurrent,
            }"
            :aria-current="i === activeCurrent ? 'step' : undefined"
          >
            <span
              v-if="i < viewSteps.length - 1"
              class="overlay__rail"
              aria-hidden="true"
            >
              <span class="overlay__rail-on" :class="{ 'is-on': i < activeDone }" />
            </span>
            <span class="overlay__dot" aria-hidden="true">
              <AppIcon v-if="i < activeDone" name="check" :size="11" color="#fff" />
            </span>
            <span class="overlay__text">{{ s.text }}</span>
            <span class="overlay__sr">
              {{ i < activeDone ? '，已完成' : i === activeCurrent ? '，进行中' : '' }}
            </span>
          </li>
        </ol>

        <div class="overlay__bar" aria-hidden="true">
          <div class="overlay__fill" :style="{ transform: `scaleX(${fillScale})` }" />
        </div>
        <p class="overlay__pct" aria-hidden="true">{{ activePercent }}%</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── 半透明磨砂遮罩：保留上下文，不整屏压死 ── */
.overlay {
  position: absolute;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(155deg, rgba(38, 27, 92, 0.6) 0%, rgba(109, 59, 245, 0.55) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.overlay__card {
  position: relative;
  width: 100%;
  max-width: 320px;
  padding: 22px 20px 16px;
  border-radius: 16px;
  background: var(--bg-card);
  box-shadow: 0 12px 40px rgba(28, 18, 72, 0.22);
  text-align: center;
}

/* ── 招牌主符号：牛奶注入奶滴（card 规格 120px，卡片白底） ── */
.overlay__drop {
  width: fit-content;
  margin: 2px auto 10px;
}

.overlay__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.overlay__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-2);
}

/* ── 步骤列表：连接线 + 依次点亮的步骤点 ── */
.overlay__steps {
  margin: 18px 0 14px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}

.overlay__step {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--text-3);
  opacity: 0.65;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.overlay__step.is-done {
  opacity: 1;
  color: var(--text-1);
}

.overlay__step.is-active {
  opacity: 1;
  color: var(--ai-purple);
  font-weight: 600;
  transform: translateX(2px);
}

.overlay__dot {
  position: relative;
  flex: none;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  z-index: 1;
}

.overlay__step.is-active .overlay__dot {
  border-color: var(--ai-purple);
}

.overlay__step.is-active .overlay__dot::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--ai-purple);
  opacity: 0;
  transform: scale(0);
  animation: dot-pulse 1.4s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.55);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.overlay__step.is-done .overlay__dot {
  border-color: transparent;
  background: var(--mn-green);
}

/* 步骤间连接线：轨道常驻，完成段 scaleY 生长 */
.overlay__rail {
  position: absolute;
  left: 8px;
  top: 9px;
  bottom: -1px;
  width: 2px;
  border-radius: 1px;
  background: var(--border-color);
  overflow: hidden;
  z-index: 0;
}

.overlay__rail-on {
  position: absolute;
  inset: 0;
  background: var(--mn-green);
  transform: scaleY(0);
  transform-origin: top;
  transition: transform 0.35s ease;
}

.overlay__rail-on.is-on {
  transform: scaleY(1);
}

.overlay__text {
  position: relative;
  z-index: 1;
}

/* ── 进度条：scaleX 驱动，绿系品牌填充 ── */
.overlay__bar {
  height: 6px;
  border-radius: 999px;
  background: var(--ai-mist);
  overflow: hidden;
}

.overlay__fill {
  height: 100%;
  width: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--mn-green) 0%, #22b15c 100%);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.4s ease;
}

.overlay__pct {
  margin: 7px 0 0;
  font-size: 11px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

/* ── 可关闭时的按钮（默认不渲染）：键盘焦点清晰可见 ── */
.overlay__close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--bg-page);
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.overlay__close:hover {
  background: var(--border-color);
}

.overlay__close:focus-visible {
  outline: 2px solid var(--ai-purple);
  outline-offset: 2px;
}

/* 仅供屏幕阅读器的状态后缀 */
.overlay__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* ── 进出场：opacity + 轻微 scale ── */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.28s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

.overlay-enter-active .overlay__card {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.overlay-enter-from .overlay__card {
  opacity: 0;
  transform: scale(0.94);
}

/* ── prefers-reduced-motion：一切停在静态态 ── */
@media (prefers-reduced-motion: reduce) {
  .overlay__step.is-active .overlay__dot::after {
    animation: none;
  }

  .overlay__step.is-active .overlay__dot::after {
    opacity: 0;
    transform: scale(0);
  }

  .overlay__step,
  .overlay__rail-on,
  .overlay__fill,
  .overlay__close,
  .overlay-enter-active .overlay__card {
    transition: none;
  }

  .overlay__step.is-active,
  .overlay-enter-from .overlay__card {
    transform: none;
  }

  .overlay-enter-active,
  .overlay-leave-active {
    transition: none;
  }
}
</style>
