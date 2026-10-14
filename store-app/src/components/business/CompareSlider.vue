<script setup lang="ts">
/**
 * ★ 原图 / 标注图 拖拽分割对比滑块（PRD 4.4-C，视觉冲击最强）。
 *
 * 用法：左侧（左半）显示标注图，右侧（右半）显示原图，拖动分割线看差异。
 * 支持鼠标与触摸拖拽；松手后保持在拖动位置。
 */
import { ref, onUnmounted } from 'vue'
import AnnotatedImage from './AnnotatedImage.vue'
import SmartImage from '@/components/common/SmartImage.vue'
import { IMAGE_BOTTOM_CROP } from '@/domain/constants'
import type { Annotation, AnnotationLayer } from '@/types'

interface Props {
  src: string
  annotations: Annotation[]
  filter?: 'all' | AnnotationLayer
  highlightIds?: string[]
  aspect?: number
}
const props = withDefaults(defineProps<Props>(), {
  src: '',
  annotations: () => [],
  filter: 'all',
  highlightIds: () => [],
  aspect: 2 / 3,
})

/** 透传内层标注图 hover / select（标注→问题 双向高亮 + 触屏锁定） */
const emit = defineEmits<{
  (e: 'hover', ids: string[]): void
  (e: 'select', ids: string[]): void
}>()

/** 分割位置百分比（0–100） */
const pos = ref<number>(52)
/** 是否正在拖动 */
const dragging = ref<boolean>(false)
/** 按下时的 X（区分「拖拽」与「点按标注」：位移 ≤6px 视为点按） */
let downX = 0
/** 拖拽后吞掉一次 click，避免松手时误触标注锁定 */
let suppressClick = false
/** 舞台元素引用 */
const stageRef = ref<HTMLElement | null>(null)

/** 容器 padding-top，与 AnnotatedImage 保持一致 */
const padTop = `${(1 / props.aspect) * IMAGE_BOTTOM_CROP * 100}%`

/**
 * 计算分割位置。
 *
 * @param clientX 指针 X 坐标
 */
function moveTo(clientX: number): void {
  const el = stageRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const p = ((clientX - rect.left) / rect.width) * 100
  pos.value = Math.max(2, Math.min(98, p))
}

/** 指针按下 */
function onDown(e: MouseEvent | TouchEvent): void {
  dragging.value = true
  suppressClick = false
  const x = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
  downX = x
  moveTo(x)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('touchmove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('touchend', onUp)
}

/** 指针移动（触屏滚动锁定由舞台上的 @touchmove.prevent 负责） */
function onMove(e: MouseEvent | TouchEvent): void {
  if (!dragging.value) return
  const x = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
  if (Math.abs(x - downX) > 6) suppressClick = true
  moveTo(x)
}

/** 拖拽过程中的 click（含落在标注框上的）一律拦掉，纯点按放行给标注 */
function onStageClick(e: MouseEvent): void {
  if (!suppressClick) return
  e.stopPropagation()
  e.preventDefault()
  suppressClick = false
}

/** 指针抬起 */
function onUp(): void {
  dragging.value = false
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('touchmove', onMove)
  window.removeEventListener('mouseup', onUp)
  window.removeEventListener('touchend', onUp)
  // click 在 mouseup 之后派发：下一帧再复位，未触发 click 时也不会卡住
  window.setTimeout(() => {
    suppressClick = false
  }, 0)
}

/**
 * 键盘拖动（WCAG 2.1.1）：←/↓ 每次 -5%，→/↑ 每次 +5%，Home/End 到两端。
 * 直接写内部 pos（与鼠标 moveTo 同一状态、同一渲染路径），clamp 0–100；
 * 不触碰 dragging/suppressClick，故 6px 阈值与点击标注锁定逻辑不受影响。
 */
function onHandleKeydown(e: KeyboardEvent): void {
  let next: number
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      next = pos.value - 5
      break
    case 'ArrowRight':
    case 'ArrowUp':
      next = pos.value + 5
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = 100
      break
    default:
      return
  }
  e.preventDefault()
  pos.value = Math.max(0, Math.min(100, next))
}

onUnmounted(onUp)
</script>

<template>
  <div class="cmp">
    <div
      ref="stageRef"
      class="cmp__stage"
      :style="{ paddingTop: padTop }"
      @mousedown.prevent="onDown"
      @touchstart="onDown"
      @touchmove.prevent="onMove"
      @click.capture="onStageClick"
    >
      <!-- 右半：原图（底层，铺满） -->
      <div class="cmp__layer cmp__layer--base">
        <SmartImage :src="src" alt="货架原图" />
        <span class="cmp__corner cmp__corner--right">原图</span>
      </div>

      <!-- 左半：标注图（按 clip-path 裁切） -->
      <div class="cmp__layer cmp__layer--clip" :style="{ clipPath: `inset(0 ${100 - pos}% 0 0)` }">
        <AnnotatedImage
          :src="src"
          :annotations="annotations"
          :filter="filter"
          :highlight-ids="highlightIds"
          :show-legend="false"
          :aspect="aspect"
          @hover="emit('hover', $event)"
          @select="emit('select', $event)"
        />
        <span class="cmp__corner cmp__corner--left">✦ AI 标注</span>
      </div>

      <!-- 分割线 + 手柄（role=slider 键盘可达，WCAG 2.1.1；鼠标/触屏拖拽仍走舞台） -->
      <div class="cmp__divider" :style="{ left: `${pos}%` }">
        <span
          class="cmp__handle"
          role="slider"
          tabindex="0"
          aria-label="拖动对比原图与识别图"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(pos)"
          :aria-valuetext="`对比位置 ${Math.round(pos)}%`"
          @keydown="onHandleKeydown"
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <circle cx="13" cy="13" r="12" fill="#fff" fill-opacity="0.94" />
            <path d="M10 9.5 6.5 13 10 16.5M16 9.5 19.5 13 16 16.5" stroke="#009639" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </div>
    </div>

    <p class="cmp__tip">← 左右拖动查看「原图 / AI 标注」对比 →</p>
  </div>
</template>

<style scoped>
.cmp {
  width: 100%;
}

.cmp__stage {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: #eef0ef;
  user-select: none;
  cursor: ew-resize;
}

.cmp__layer {
  position: absolute;
  inset: 0;
}

.cmp__layer :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.cmp__corner {
  position: absolute;
  bottom: 8px;
  z-index: 6;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(26, 31, 28, 0.7);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.cmp__corner--left {
  left: 8px;
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
}

.cmp__corner--right {
  right: 8px;
}

.cmp__divider {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 8;
  width: 2px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
}

.cmp__handle {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  /* 沿用全局 :focus-visible 焦点环（[tabindex] 已命中），仅把轮廓修正为圆形 */
}

.cmp__handle:focus-visible {
  border-radius: 50%;
}

.cmp__tip {
  margin-top: 6px;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
}
</style>
