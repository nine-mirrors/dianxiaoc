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
 * 良好档暂无对应深色令牌，按扫尾约定用 #558b2f（白底对比 ≈5.1:1）；
 * 良好档无浅色令牌底，采用白底 + 同色细边保证在白卡片上仍有轮廓。
 */
const LEVEL_TONES: Record<HealthLevelKey, { fg: string; bg: string; border: string }> = {
  excellent: { fg: 'var(--mn-green-dark)', bg: 'var(--success-bg)', border: 'transparent' },
  good: { fg: '#558b2f', bg: '#fff', border: 'rgba(85, 139, 47, 0.4)' },
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
  background: #fff;
  color: var(--tone-fg);
  border: 1px solid var(--tone-fg);
}
</style>
