<script setup lang="ts">
/**
 * 健康分分档 Badge（PRD：分档标签带对应色底；WCAG AA 改为「浅底 + 深字」，色值优先引用 tokens）。
 */
import { computed } from 'vue'
import { levelLabel } from '@/domain/constants'
import type { HealthLevelKey } from '@/types'

interface Props {
  level: HealthLevelKey
  /** 是否显示分档中文名 */
  showLabel?: boolean
  size?: 'sm' | 'md'
  /** 浅色描边风格（用于白底卡片），默认实色 */
  outline?: boolean
}
const props = withDefaults(defineProps<Props>(), { level: 'good', showLabel: true, size: 'sm', outline: false })

/**
 * 分档「浅底 + 深字」无障碍配色（文字对底色 ≥4.5:1，WCAG AA）。
 * domain/constants 中的亮色（良好 #8bc34a / 预警 #ff9800）配白字仅约 2.1:1，
 * 亮色只用于环弧、条形等装饰，不再承载文字。
 * 良好档文字用 color-mix 把 --level-good 向主文字色压深/提亮：
 * 浅色下≈深橄榄绿（白底 ≥4.5:1），深色下自动变亮柠绿；
 * 良好档底随卡片表面令牌，再叠同色 40% 细边保证轮廓。
 */
const LEVEL_TONES: Record<HealthLevelKey, { fg: string; bg: string; border: string }> = {
  excellent: { fg: 'var(--mn-green-dark)', bg: 'var(--success-bg)', border: 'transparent' },
  good: {
    fg: 'color-mix(in srgb, var(--level-good) 45%, var(--text-1))',
    bg: 'var(--bg-card)',
    border: 'color-mix(in srgb, var(--level-good) 40%, transparent)',
  },
  warning: { fg: 'var(--warning-fg)', bg: 'var(--warning-bg)', border: 'transparent' },
  risk: { fg: 'var(--danger-fg)', bg: 'var(--danger-bg)', border: 'transparent' },
}
const tone = computed(() => LEVEL_TONES[props.level])
</script>

<template>
  <span
    class="health-badge"
    :class="[`health-badge--${size}`, { 'health-badge--outline': outline }]"
    :style="{
      '--tone-fg': tone.fg,
      '--tone-bg': tone.bg,
      '--tone-border': tone.border,
    }"
  >
    <span v-if="showLabel">{{ levelLabel(level) }}</span>
  </span>
</template>

<style scoped>
.health-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--tone-bg);
  color: var(--tone-fg);
  border: 1px solid var(--tone-border);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.45;
  white-space: nowrap;
}

.health-badge--md {
  padding: 3px 10px;
  font-size: 12px;
}

.health-badge--outline {
  background: var(--bg-card);
  color: var(--tone-fg);
  border: 1px solid var(--tone-fg);
}
</style>
