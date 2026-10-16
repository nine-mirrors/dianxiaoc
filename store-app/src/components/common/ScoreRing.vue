<script setup lang="ts">
/**
 * 健康分环形仪表（PRD 3.4：环色随分档变化，中间 48px/700 大数字）。
 */
import { computed } from 'vue'
import { colorOf, levelOf, levelLabel } from '@/domain/constants'
import { useCountUp } from '@/composables/useCountUp'
import type { HealthLevelKey } from '@/types'

interface Props {
  /** 分数 0–100 */
  score: number
  /** 环色（不传则按分档自动取） */
  color?: string
  /** 环形直径 px */
  size?: number
}
const props = withDefaults(defineProps<Props>(), { score: 0, color: '', size: 108 })

/**
 * 分档文字深色档（浅底 ≥4.5:1）：中间分数属于信息文字，不随浅色弧着色。
 * 装饰弧仍可用 colorOf() 的亮色（良好 #8bc34a / 预警 #ff9800）。
 * 良好档用 color-mix 将 --level-good 压向主文字色：浅色下≈深橄榄绿，
 * 深色下自动提亮为亮柠绿，两个主题下均保持 AA 对比。
 */
const LEVEL_FG: Record<HealthLevelKey, string> = {
  excellent: 'var(--mn-green-dark)',
  good: 'color-mix(in srgb, var(--level-good) 45%, var(--text-1))',
  warning: 'var(--warning-fg)',
  risk: 'var(--danger-fg)',
}

/** 圆环几何参数 */
const stroke = 9
const radius = computed<number>(() => (props.size - stroke) / 2)
const circumference = computed<number>(() => 2 * Math.PI * radius.value)
/** 已填充弧长 */
const dash = computed<number>(() => (circumference.value * Math.max(0, Math.min(100, props.score))) / 100)

/** 装饰弧颜色：外部传入优先，缺省按分数分档取亮色 */
const arcColor = computed<string>(() => props.color || colorOf(levelOf(props.score)))
/** 中间分数颜色：始终用深色档，保证 AA */
const scoreColor = computed<string>(() => LEVEL_FG[levelOf(props.score)])
/** 读屏替代文案：整体作为一张「分数图」播报 */
const ariaLabel = computed<string>(() => `AI健康分 ${props.score} 分${levelLabel(levelOf(props.score))}`)

/** 中心分数滚动（整数，落地精确回写） */
const scoreCount = useCountUp(() => props.score).text
</script>

<template>
  <div
    class="score-ring"
    role="img"
    :aria-label="ariaLabel"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <svg class="mot-grow-sweep" :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <!-- 轨道：描边跟随边框令牌（日间浅灰、夜间墨绿灰），避免深色卡上出现亮白轨道 -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :style="{ stroke: 'var(--border-color)' }"
        :stroke-width="stroke"
      />
      <!-- 进度弧（-90° 起点在 12 点方向） -->
      <circle
        class="score-ring__arc"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke="arcColor"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="`${dash} ${circumference}`"
      />
    </svg>
    <div class="score-ring__inner">
      <div class="score-ring__score" :style="{ color: scoreColor, fontSize: `${Math.round(size * 0.42)}px` }">
        {{ scoreCount }}
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
  color: var(--text-2);
}
</style>
