<script setup lang="ts">
/**
 * PullRefresh —— 下拉刷新容器（手机页专用）。
 *
 * 关键约束（不破坏内部滚动）：
 *  - 本容器只是「包裹层」，不设 overflow，页面滚动仍由祖先滚动容器
 *    （如 MobileLayout 的 .ml-body）负责；
 *  - 只在「最近的可滚动祖先 scrollTop === 0 且向下拉」时接管手势；
 *    一旦离开顶部或向上滑，立即把手势还给浏览器原生滚动；
 *  - disabled / prefers-reduced-motion 时完全不挂事件（原样直通）。
 *
 * 手势来源：触摸（touchstart/move/end）+ 鼠标指针（pointer，桌面演示可拖）
 *  — 指针事件仅在 pointerType === 'mouse' 时响应，避免与触摸重复计数。
 *
 * 用法：
 *   <PullRefresh @refresh="onRefresh"> …页面内容… </PullRefresh>
 *   function onRefresh(done) { await load(); done(); }
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'

interface Props {
  /** 关闭后完全不拦截事件 */
  disabled?: boolean
  /** 触发刷新的下拉阈值（px） */
  threshold?: number
}
const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  threshold: 68,
})
const emit = defineEmits<{ (e: 'refresh', done: (ok?: boolean) => void): void }>()

type Phase = 'idle' | 'pulling' | 'refreshing' | 'done'

const root = ref<HTMLElement | null>(null)
const phase = ref<Phase>('idle')
const distance = ref<number>(0)
/** 松手回弹时给位移加过渡（下拉跟手时关闭过渡，避免拖影） */
const animating = ref<boolean>(false)

/** 位移阻尼：手感更「跟手」，且短下拉不会轻易顶开 */
const RESISTANCE = 0.5

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 找到最近的可滚动祖先（无则退回 window） */
function findScrollParent(start: HTMLElement | null): HTMLElement | Window {
  let p = start?.parentElement ?? null
  while (p) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
    p = p.parentElement
  }
  return window
}

let scrollHost: HTMLElement | Window = window
let startY = 0
let armed = false
let active = false

function scrollTopNow(): number {
  if (scrollHost instanceof HTMLElement) return scrollHost.scrollTop
  return window.scrollY || document.documentElement.scrollTop || 0
}

function begin(y: number): void {
  if (props.disabled || prefersReducedMotion || phase.value === 'refreshing') return
  scrollHost = findScrollParent(root.value)
  startY = y
  armed = true
  active = scrollTopNow() <= 0
}

function move(y: number, e: Event): boolean {
  if (!armed || !active || phase.value === 'refreshing') return false
  // 已离开顶部（向下滚动过）→ 立即释放，交还原生滚动
  if (scrollTopNow() > 0) {
    armed = false
    active = false
    distance.value = 0
    return false
  }
  const delta = y - startY
  if (delta <= 0) {
    // 上滑：不拦截
    distance.value = 0
    return false
  }
  phase.value = 'pulling'
  animating.value = false
  distance.value = Math.min(delta * RESISTANCE, props.threshold * 1.7)
  if (e.cancelable) e.preventDefault()
  return true
}

function finish(): void {
  if (!armed) return
  armed = false
  if (phase.value === 'pulling') {
    if (distance.value >= props.threshold) trigger()
    else reset()
  }
}

function reset(): void {
  animating.value = true
  phase.value = 'idle'
  distance.value = 0
}

function trigger(): void {
  phase.value = 'refreshing'
  animating.value = false
  distance.value = Math.max(distance.value, props.threshold)
  emit('refresh', (ok?: boolean) => {
    // 失败（ok === false）直接回弹；成功则先落位显示对勾再收起
    if (ok === false) {
      reset()
      return
    }
    phase.value = 'done'
    distance.value = props.threshold * 0.7
    window.setTimeout(() => reset(), 620)
  })
}

/* ── 触摸 ── */
function onTouchStart(e: TouchEvent): void {
  const t = e.touches[0]
  if (t) begin(t.clientY)
}
function onTouchMove(e: TouchEvent): void {
  const t = e.touches[0]
  if (t) move(t.clientY, e)
}
function onTouchEnd(): void {
  finish()
}

/* ── 鼠标指针（桌面演示可拖）── */
function onPointerDown(e: PointerEvent): void {
  if (e.pointerType !== 'mouse') return
  begin(e.clientY)
}
function onPointerMove(e: PointerEvent): void {
  if (e.pointerType !== 'mouse') return
  move(e.clientY, e)
}
function onPointerUp(e: PointerEvent): void {
  if (e.pointerType !== 'mouse') return
  finish()
}

function attach(): void {
  const el = root.value
  if (!el) return
  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd)
  el.addEventListener('touchcancel', onTouchEnd)
  el.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function detach(): void {
  const el = root.value
  if (!el) return
  el.removeEventListener('touchstart', onTouchStart)
  el.removeEventListener('touchmove', onTouchMove)
  el.removeEventListener('touchend', onTouchEnd)
  el.removeEventListener('touchcancel', onTouchEnd)
  el.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

/** disabled 或减弱动效：退化为一层完全直通的包裹 div */
const enabled = computed<boolean>(() => !props.disabled && !prefersReducedMotion)

onMounted(() => {
  if (enabled.value) attach()
})
onBeforeUnmount(() => {
  if (enabled.value) detach()
})

const bodyStyle = computed(() => ({
  transform: distance.value ? `translateY(${distance.value}px)` : 'translateY(0)',
  transition: animating.value ? 'transform 260ms var(--ease-standard, ease)' : 'none',
}))

const indicatorStyle = computed(() => {
  const base = phase.value === 'pulling' ? 0.6 + Math.min(distance.value / props.threshold, 1) * 0.4 : 1
  return { opacity: distance.value > 0 || phase.value !== 'idle' ? '1' : '0', transform: `scale(${base})` }
})
</script>

<template>
  <div ref="root" class="pr">
    <div v-if="enabled" class="pr__indicator" :style="indicatorStyle" aria-hidden="true">
      <span class="pr__ring" :class="{ 'pr__ring--spin': phase === 'refreshing' }">
        <AppIcon v-if="phase === 'done'" name="check" :size="16" color="var(--mn-green)" />
        <AppIcon v-else name="milk" :size="16" color="var(--mn-green)" />
      </span>
      <span v-if="phase === 'refreshing'" class="u-sr-only">正在刷新</span>
    </div>
    <div class="pr__body" :style="bodyStyle">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* 包裹层只做定位与内容位移，不设 overflow（子滚动不受影响） */
.pr {
  position: relative;
}

.pr__indicator {
  position: absolute;
  top: 6px;
  left: 50%;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 指示器本身不吃事件，手势仍落在内容层 */
  pointer-events: none;
  transition: opacity 180ms var(--ease-standard, ease);
}

.pr__ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  transform: translateX(-50%);
}

.pr__ring--spin {
  animation: pr-spin 0.8s linear infinite;
}

@keyframes pr-spin {
  to {
    transform: translateX(-50%) rotate(360deg);
  }
}

.pr__body {
  will-change: transform;
}
</style>
