<script setup lang="ts">
/**
 * 6 维度条形小分（PRD 4.4-B：让"分数不是拍脑袋"可视化）。
 * 条色 = 该维度自己的分档色。
 */
import { colorOf } from '@/domain/constants'
import type { DimensionScore, HealthLevelKey } from '@/types'

/**
 * 维度分数文字的深色档（浅底 ≥4.5:1）；条色仍用 colorOf() 亮色（装饰填充，不承载文字）。
 * 良好档无专用文字令牌：用 --level-good 与 --ink 混合得到「日间深橄榄 / 夜间浅黄绿」，
 * 两个主题下对卡片底均 ≥4.5:1。
 */
const LEVEL_FG: Record<HealthLevelKey, string> = {
  excellent: 'var(--brand-deep)',
  good: 'color-mix(in srgb, var(--level-good) 60%, var(--ink))',
  warning: 'var(--warning-fg)',
  risk: 'var(--danger-fg)',
}

interface Props {
  dimensions: DimensionScore[]
}
const props = withDefaults(defineProps<Props>(), { dimensions: () => [] })
</script>

<template>
  <div class="dim-bars mot-stagger">
    <div v-for="(d, i) in props.dimensions" :key="d.key" class="dim-bar">
      <span class="dim-bar__name">{{ d.name }}</span>
      <div class="dim-bar__track">
        <div
          class="dim-bar__fill mot-grow-x"
          :style="{
            width: `${Math.max(0, Math.min(100, d.score))}%`,
            background: colorOf(d.level),
            animationDelay: `${i * 60}ms`,
          }"
        />
      </div>
      <span class="dim-bar__score" :style="{ color: LEVEL_FG[d.level] }">{{ d.score }}</span>
    </div>
  </div>
</template>

<style scoped>
.dim-bars {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.dim-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dim-bar__name {
  flex: none;
  width: 64px;
  font-size: 12px;
  color: var(--text-2);
}

.dim-bar__track {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--border-color);
  overflow: hidden;
}

.dim-bar__fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.7s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.dim-bar__score {
  flex: none;
  width: 26px;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
