<script setup lang="ts">
/**
 * 骨架屏块（P2 数据概览 / 列表卡片加载态）。
 */
interface Props {
  width?: string
  height?: string
  radius?: string
}
withDefaults(defineProps<Props>(), { width: '100%', height: '16px', radius: '6px' })
</script>

<template>
  <div class="skeleton" :style="{ width, height, borderRadius: radius }" />
</template>

<style scoped>
.skeleton {
  background: linear-gradient(90deg, #eef0ef 25%, #f6f7f7 37%, #eef0ef 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.2s ease infinite;
}

@keyframes sk-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
