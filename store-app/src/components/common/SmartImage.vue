<script setup lang="ts">
/**
 * 图片组件 + 三级兜底（ARCHITECTURE §8.6）。
 *
 * 兜底链：门店图 → fallback/generic-shelf.jpg → CSS 绘制的货架示意图 + 「示意图」文案。
 * 保证素材缺失/路径变更时也不白屏、不报错。
 */
import { ref, watch } from 'vue'
import { assetUrl, FALLBACK_IMAGE } from '@/utils/asset'
import AppIcon from './AppIcon.vue'

interface Props {
  src: string
  alt?: string
  /** 是否启用通用兜底图 */
  fallback?: boolean
}
const props = withDefaults(defineProps<Props>(), { src: '', alt: '', fallback: true })

/** 当前实际使用的图片（0: 原图, 1: 兜底图, 2: 降级为占位块） */
const stage = ref<0 | 1 | 2>(0)

watch(
  () => props.src,
  () => {
    stage.value = 0
  },
)

/** 图片加载失败：逐级降级 */
function onError(): void {
  if (stage.value === 0 && props.fallback) {
    stage.value = 1
  } else {
    stage.value = 2
  }
}

/** 当前 src */
const currentSrc = (): string => (stage.value === 0 ? assetUrl(props.src) : FALLBACK_IMAGE)
</script>

<template>
  <div class="smart-image">
    <!-- 0 / 1：真实图片 -->
    <img
      v-if="stage !== 2"
      class="smart-image__img"
      :src="currentSrc()"
      :alt="alt"
      loading="lazy"
      decoding="async"
      @error="onError"
    />
    <!-- 2：CSS 绘制的货架示意图占位 -->
    <div v-else class="smart-image__placeholder">
      <div class="shelf" aria-hidden="true">
        <div v-for="r in 4" :key="r" class="shelf__row">
          <span v-for="c in 5" :key="c" class="shelf__bottle" :class="`shelf__bottle--${(r + c) % 3}`" />
        </div>
      </div>
      <div class="smart-image__tip">
        <AppIcon name="package" :size="12" />
        <span>示意图</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smart-image {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f0f2f0;
}

.smart-image__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.smart-image__placeholder {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 120px;
  padding: 12px;
  background: linear-gradient(180deg, #f7f9f7 0%, #eef1ee 100%);
}

.shelf {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 220px;
}

.shelf__row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding-bottom: 2px;
  border-bottom: 2px solid #d8dee0;
}

.shelf__bottle {
  flex: 1;
  height: 18px;
  border-radius: 3px 3px 2px 2px;
}

.shelf__bottle--0 {
  background: #cfe3d4;
}
.shelf__bottle--1 {
  background: #dde5e9;
}
.shelf__bottle--2 {
  background: #cfe0ea;
}

.smart-image__tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-3);
  font-size: 11px;
}
</style>
