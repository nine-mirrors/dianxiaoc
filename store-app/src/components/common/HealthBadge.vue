<script setup lang="ts">
/**
 * 健康分分档 Badge（PRD：分档标签带对应色底；色值取自 domain/constants，禁止页面硬编码）。
 */
import { computed } from 'vue'
import { colorOf, levelLabel } from '@/domain/constants'
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

/** 分档色（唯一出处：domain/constants） */
const color = computed<string>(() => colorOf(props.level))
</script>

<template>
  <span
    class="health-badge"
    :class="[`health-badge--${size}`, { 'health-badge--outline': outline }]"
    :style="{ '--c': color }"
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
  background: var(--c);
  color: #fff;
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
  color: var(--c);
  border: 1px solid var(--c);
}
</style>
