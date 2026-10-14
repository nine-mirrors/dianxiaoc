<script setup lang="ts">
/**
 * ★ AI 识别标注图（PRD 4.4-C / ARCHITECTURE §8.4）。
 *
 * 关键约定：
 *  1. 标注坐标是 0–100 的相对百分比，**与图片像素尺寸完全解耦**；
 *     队友换实拍图后只调 fixture 坐标，不动任何组件代码。
 *  2. 图片用 object-fit:cover + object-position:top 并把容器高度压缩到原图的 95%，
 *     统一裁掉底部约 5% —— AI 生成图右下角的「AI生成」水印不会出现在演示画面里。
 *  3. 框样式由 ANNOTATION_STYLES 决定（绿实线/橙实线/红虚线/蓝虚线/橙色角标/橙虚线）。
 */
import { computed } from 'vue'
import SmartImage from '@/components/common/SmartImage.vue'
import { ANNOTATION_STYLES, IMAGE_BOTTOM_CROP } from '@/domain/constants'
import type { Annotation, AnnotationLayer } from '@/types'

interface Props {
  src: string
  annotations: Annotation[]
  /** 当前图层筛选：all /empty /pricetag /competitor … */
  filter?: 'all' | AnnotationLayer
  /** 需要高亮的标注 id（问题清单 ↔ 标注图双向联动） */
  highlightIds?: string[]
  /** 是否显示图例 */
  showLegend?: boolean
  /** 图片宽高比（w/h），默认 2:3 */
  aspect?: number
  /** 是否显示左上角的 AI 角标 */
  showBrand?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  src: '',
  annotations: () => [],
  filter: 'all',
  highlightIds: () => [],
  showLegend: true,
  aspect: 2 / 3,
  showBrand: true,
})

/**
 * ★ 双向高亮联动：悬停某个标注框/角标时，向上抛出该标注 id，
 *   供 DiagnosisView 反查「关联问题」并让问题清单同步高亮（需求池 ㊲ 反向链路）。
 *   触屏无 hover：点按标注框抛出 select，由父级切换「锁定高亮」（再点取消）。
 */
const emit = defineEmits<{
  (e: 'hover', ids: string[]): void
  (e: 'select', ids: string[]): void
}>()

/** 鼠标进入标注：高亮关联问题 */
function onEnter(id: string): void {
  emit('hover', [id])
}

/** 鼠标离开：取消高亮 */
function onLeave(): void {
  emit('hover', [])
}

/** 点按标注（触屏 / 单击）：通知父级切换锁定高亮 */
function onSelect(id: string): void {
  emit('select', [id])
}

/** 键盘在标注框上回车 / 空格：等同点按 */
function onSelectKey(id: string, e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  onSelect(id)
}

/** 可见标注（按图层筛选） */
const visible = computed<Annotation[]>(() =>
  props.filter === 'all' ? props.annotations : props.annotations.filter((a) => a.layer === props.filter),
)

/** 容器 padding-top：原图高度 × 裁切比例 */
const padTop = computed<string>(() => `${(1 / props.aspect) * IMAGE_BOTTOM_CROP * 100}%`)

/**
 * 换算标注框位置。
 *
 * 裁掉底部 5% 后，可视高度为原图的 95%，因此纵向百分比要除以 IMAGE_BOTTOM_CROP。
 *
 * @param a 标注
 */
function boxStyle(a: Annotation): Record<string, string> {
  return {
    left: `${a.x}%`,
    top: `${a.y / IMAGE_BOTTOM_CROP}%`,
    width: `${a.w}%`,
    height: `${a.h / IMAGE_BOTTOM_CROP}%`,
    '--box-color': ANNOTATION_STYLES[a.layer]?.color ?? 'var(--mn-green)',
  } as Record<string, string>
}

/** 是否高亮 */
function isOn(id: string): boolean {
  return props.highlightIds.includes(id)
}

/** 图例（只展示本图中出现的图层） */
const legend = computed(() => {
  const set = new Set(props.annotations.map((a) => a.layer))
  return Object.keys(ANNOTATION_STYLES)
    .filter((k) => set.has(k as AnnotationLayer))
    .map((k) => ANNOTATION_STYLES[k as AnnotationLayer])
})
</script>

<template>
  <div class="anno">
    <div class="anno__stage" :style="{ paddingTop: padTop }">
      <SmartImage class="anno__img" :src="src" alt="货架识别图" />

      <span v-if="showBrand" class="anno__brand">✦ AI 识别</span>

      <!-- 标注框 -->
      <template v-for="a in visible" :key="a.id">
        <!-- 价签：右上角标形式，不画整框 -->
        <div
          v-if="a.layer === 'pricetag'"
          class="anno__tag"
          :class="{ 'anno__tag--on': isOn(a.id) }"
          :style="boxStyle(a)"
          role="button"
          tabindex="0"
          :aria-label="`定位标注：${a.label}`"
          @mouseenter="onEnter(a.id)"
          @mouseleave="onLeave"
          @click="onSelect(a.id)"
          @keydown="onSelectKey(a.id, $event)"
        >
          {{ a.label }}
        </div>

        <!-- 其余：描边框 + 顶部标签 -->
        <div
          v-else
          class="anno__box"
          :class="[`anno__box--${a.layer}`, { 'anno__box--on': isOn(a.id) }]"
          :style="boxStyle(a)"
          role="button"
          tabindex="0"
          :aria-label="`定位标注：${a.label}`"
          @mouseenter="onEnter(a.id)"
          @mouseleave="onLeave"
          @click="onSelect(a.id)"
          @keydown="onSelectKey(a.id, $event)"
        >
          <span class="anno__label">{{ a.label }}</span>
        </div>
      </template>
    </div>

    <!-- 图例 -->
    <div v-if="showLegend && legend.length" class="anno__legend">
      <span v-for="l in legend" :key="l.label" class="anno__legend-item">
        <i class="anno__legend-swatch" :class="{ 'anno__legend-swatch--dashed': l.dashed }" :style="{ '--c': l.color }" />
        {{ l.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.anno {
  width: 100%;
}

.anno__stage {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: #eef0ef;
}

.anno__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.anno__brand {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 3;
  padding: 2px 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.anno__box {
  position: absolute;
  z-index: 2;
  border: 2px solid var(--box-color);
  border-radius: 3px;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    box-shadow var(--dur-fast) var(--ease-standard),
    background-color var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard);
}

.anno__box:active {
  transform: scale(0.98);
}

.anno__box--empty,
.anno__box--competitor,
.anno__box--stack {
  border-style: dashed;
}

.anno__box--on {
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.12);
  animation: anno-pulse 0.9s ease infinite;
}

@keyframes anno-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.6);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.35);
  }
}

.anno__label {
  position: absolute;
  left: -2px;
  bottom: calc(100% + 2px);
  max-width: 150%;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(26, 31, 28, 0.86);
  color: #fff;
  font-size: 10px;
  line-height: 1.5;
  /* 允许换行：长标注不再被单侧裁切 */
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.anno__tag {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  min-height: 18px;
  padding: 2px 5px;
  /* WCAG AA：角标承载价签文字（9px），白字压 #ff9800 仅约 2:1；
     改浅橙底 + 深棕橙字（≈5.7:1），橙色细边保留价签图层的视觉身份 */
  border: 1px solid var(--box-color);
  border-radius: 3px;
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 9px;
  font-weight: 700;
  line-height: 1.3;
  /* 允许换行避免文字裁切 */
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  text-align: center;
  cursor: pointer;
  touch-action: manipulation;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

/* 角标普遍偏小：透明热区外扩到约 36px（舞台 overflow 裁切到边界为止） */
.anno__tag::before {
  content: '';
  position: absolute;
  inset: -9px;
}

.anno__tag:active {
  transform: scale(0.94);
}

.anno__tag--on {
  animation: anno-pulse 0.9s ease infinite;
}

.anno__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-2);
}

.anno__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.anno__legend-swatch {
  width: 14px;
  height: 0;
  border-top: 2px solid var(--c);
}

.anno__legend-swatch--dashed {
  border-top-style: dashed;
}

/* WCAG：减弱动态效果时关闭标注框/角标的无限脉冲（正常态不动；高亮仍靠白底描边与底色区分） */
@media (prefers-reduced-motion: reduce) {
  .anno__box--on,
  .anno__tag--on {
    animation: none;
  }
}
</style>
