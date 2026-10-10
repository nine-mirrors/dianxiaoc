<script setup lang="ts">
/**
 * 空态（插画 + 文案 + 行动按钮）。
 *
 * PRD P2 空态：「今日无巡店任务，好好休息」+「去拍照诊断」按钮。
 */
import AppIcon from './AppIcon.vue'

interface Props {
  icon?: string
  title?: string
  desc?: string
  actionText?: string
}
withDefaults(defineProps<Props>(), {
  icon: 'package',
  title: '暂无数据',
  desc: '',
  actionText: '',
})

const emit = defineEmits<{ (e: 'action'): void }>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__art">
      <AppIcon :name="icon" :size="34" color="#B9C4BC" />
    </div>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="desc" class="empty-state__desc">{{ desc }}</p>
    <button v-if="actionText" class="u-btn u-btn--ghost empty-state__btn" @click="emit('action')">
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 36px 20px;
  text-align: center;
}

.empty-state__art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: var(--mn-green-light);
}

.empty-state__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
}

.empty-state__desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
}

.empty-state__btn {
  margin-top: 10px;
  height: 36px;
}
</style>
