<script setup lang="ts">
/**
 * 白卡容器：标题行 + 可选右侧操作 + 可选 AI 徽标（PRD 3.3 卡片 12px 圆角 + 轻阴影）。
 */
import AiBadge from './AiBadge.vue'

interface Props {
  title?: string
  /** 标题下的一行说明 */
  subtitle?: string
  /** 是否显示 ✦ AI 徽标 */
  ai?: boolean
  /** 徽标文案 */
  aiText?: string
  /** 徽标色调：ai=大模型（紫）/ standard=本地兜底（灰）/ muted=来源不明（浅灰） */
  aiTone?: 'ai' | 'standard' | 'muted'
  /** 内边距是否收紧 */
  dense?: boolean
}
withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  ai: false,
  aiText: 'AI',
  aiTone: 'ai',
  dense: false,
})
</script>

<template>
  <section class="section-card" :class="{ 'section-card--dense': dense }">
    <header v-if="title || ai || $slots.action" class="section-card__head">
      <div class="section-card__title-wrap">
        <h3 v-if="title" class="section-card__title">{{ title }}</h3>
        <AiBadge v-if="ai" :text="aiText" />
      </div>
      <div v-if="$slots.action" class="section-card__action">
        <slot name="action" />
      </div>
    </header>
    <p v-if="subtitle" class="section-card__subtitle">{{ subtitle }}</p>
    <div class="section-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.section-card {
  background: var(--bg-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 14px;
}

.section-card--dense {
  padding: 10px 12px;
}

.section-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.section-card__title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.section-card__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.section-card__action {
  flex: none;
  font-size: 12px;
  color: var(--text-3);
}

.section-card__subtitle {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-3);
}
</style>
