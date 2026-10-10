<script setup lang="ts">
/**
 * 健康分环形仪表（PRD 3.4：环色随分档变化，中间 48px/700 大数字）。
 */
import { computed } from 'vue'

interface Props {
  /** 分数 0–100 */
  score: number
  /** 环色（不传则按分档自动取） */
  color?: string
  /** 环形直径 px */
  size?: number
}
const props = withDefaults(defineProps<Props>(), { score: 0, color: '', size: 108 })

/** 圆环几何参数 */
const stroke = 9
const radius = computed<number>(() => (props.size - stroke) / 2)
const circumference = computed<number>(() => 2 * Math.PI * radius.value)
/** 已填充弧长 */
const dash = computed<number>(() => (circumference.value * Math.max(0, Math.min(100, props.score))) / 100)
</script>

<template>
  <div class="score-ring" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <!-- 轨道 -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="#EDEFF0"
        :stroke-width="stroke"
      />
      <!-- 进度弧（-90° 起点在 12 点方向） -->
      <circle
        class="score-ring__arc"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="`${dash} ${circumference}`"
      />
    </svg>
    <div class="score-ring__inner">
      <div class="score-ring__score" :style="{ color, fontSize: `${Math.round(size * 0.42)}px` }">
        {{ score }}
      </div>
      <div class="score-ring__label">
        <slot name="label">AI 健康分</slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.score-ring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.score-ring svg {
  position: absolute;
  inset: 0;
}

.score-ring__arc {
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  transition: stroke-dasharray 0.8s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.score-ring__inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.score-ring__score {
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.score-ring__label {
  font-size: 11px;
  color: var(--text-3);
}
</style>
