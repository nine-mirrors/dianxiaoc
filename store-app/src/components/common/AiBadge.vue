<script setup lang="ts">
/**
 * ✦ AI 徽标（PRD 3.4：凡 AI 生成内容必带，建立认知锚点）。
 */
import AppIcon from './AppIcon.vue'

interface Props {
  /** 文案，默认「AI」 */
  text?: string
  size?: 'sm' | 'md'
}
withDefaults(defineProps<Props>(), { text: 'AI', size: 'sm' })
</script>

<template>
  <span class="ai-badge" :class="`ai-badge--${size}`">
    <AppIcon name="sparkles" :size="size === 'sm' ? 11 : 13" />
    <slot>{{ text }}</slot>
  </span>
</template>

<style scoped>
.ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.ai-badge--md {
  padding: 3px 10px;
  font-size: 12px;
}
</style>
