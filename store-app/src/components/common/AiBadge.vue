<script setup lang="ts">
/**
 * ✦ AI 徽标（PRD 3.4：凡 AI 生成内容必带，建立认知锚点）。
 *
 * tone 与 src/domain/constants.ts 的 AI_SOURCE_BADGE.tone 对齐：
 *   ai      → 紫渐变 + 火花图标（真大模型生成，默认）
 *   standard→ 中性灰底、无火花（本地规则/陈列标准库兜底，不冒充 AI）
 *   muted   → 浅灰、无火花（网络失败等来源不明情形）
 */
import AppIcon from './AppIcon.vue'

interface Props {
  /** 文案，默认「AI」 */
  text?: string
  size?: 'sm' | 'md'
  /** 来源色调，默认 ai（紫渐变） */
  tone?: 'ai' | 'standard' | 'muted'
}
withDefaults(defineProps<Props>(), { text: 'AI', size: 'sm', tone: 'ai' })
</script>

<template>
  <span class="ai-badge" :class="[`ai-badge--${size}`, `ai-badge--${tone}`]">
    <AppIcon v-if="tone === 'ai'" name="sparkles" :size="size === 'sm' ? 11 : 13" />
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
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

/* 真大模型：紫色渐变 + 白字 */
.ai-badge--ai {
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
  color: #fff;
}

/* 本地规则兜底：中性灰（不用品牌绿/AI 紫，避免暗示「大模型生成」） */
.ai-badge--standard {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-2, #4b5563);
}

/* 来源不明 / 未完成：更浅的灰 */
.ai-badge--muted {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-3, #9ca3af);
}

.ai-badge--md {
  padding: 3px 10px;
  font-size: 12px;
}
</style>
