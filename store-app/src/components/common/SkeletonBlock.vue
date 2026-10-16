<script setup lang="ts">
/**
 * 骨架屏块（P2 数据概览 / 列表卡片加载态）。
 *
 * - shape：rect（默认，外观与旧版完全一致）/ text（文字行，胶囊圆角）/ circle（圆形，以 width 为直径）；
 * - 根节点携带 mot-skeleton-shimmer 类，供全局动效层统一接管（本组件不定义该类、不与其冲突）；
 * - 装饰性占位 aria-hidden，避免屏幕阅读器朗读空块；
 * - prefers-reduced-motion 下动画静止。
 */
import { computed } from 'vue'

interface Props {
  width?: string
  height?: string
  radius?: string
  /** 形状：rect 矩形（默认）/ text 文字行 / circle 圆形（取 width 为直径） */
  shape?: 'rect' | 'text' | 'circle'
}
const props = withDefaults(defineProps<Props>(), {
  width: '100%',
  height: '16px',
  radius: '6px',
  shape: 'rect',
})

const sizeStyle = computed<Record<string, string>>(() => {
  if (props.shape === 'circle') {
    return { width: props.width, height: props.width, borderRadius: '50%' }
  }
  if (props.shape === 'text') {
    return { width: props.width, height: props.height, borderRadius: '999px' }
  }
  return { width: props.width, height: props.height, borderRadius: props.radius }
})
</script>

<template>
  <div
    class="skeleton mot-skeleton-shimmer"
    :class="`skeleton--${shape}`"
    :style="sizeStyle"
    aria-hidden="true"
  />
</template>

<style scoped>
.skeleton {
  /* 表面=页面灰底（卡内呈现为灰占位块），高光=抬升色；
     日间壳内为 #f3f8f4→#fff 微光扫过，夜间为 #0c1510→#1a2b22，双主题均有可见流动 */
  background: linear-gradient(
    90deg,
    var(--bg-page) 25%,
    var(--bg-elevated) 37%,
    var(--bg-page) 63%
  );
  background-size: 400% 100%;
  animation: sk-shimmer 1.2s ease infinite;
}

@keyframes sk-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
