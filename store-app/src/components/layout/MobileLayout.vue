<script setup lang="ts">
/**
 * 手机端页面外壳：顶栏 + 内容区 + 底部 TabBar。
 *
 * 顶栏通过 #nav / #header 插槽自定义，内容区可滚动。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import TabBar from './TabBar.vue'

/** 后端是否不可用（由 api 层广播 api:offline） */
const degraded = ref<boolean>(false)
function markDegraded(): void {
  degraded.value = true
}
onMounted(() => window.addEventListener('api:offline', markDegraded))
onBeforeUnmount(() => window.removeEventListener('api:offline', markDegraded))

interface Props {
  title?: string
  /** 是否显示返回键 */
  back?: boolean
  /** 顶栏是否用品牌绿渐变（P2 首页用） */
  gradient?: boolean
  /** 是否显示底部 Tab */
  showTabBar?: boolean
  /** 内容区是否需要底部内边距（避开悬浮按钮） */
  contentPaddingBottom?: number
}
withDefaults(defineProps<Props>(), {
  title: '',
  back: false,
  gradient: false,
  showTabBar: false,
  contentPaddingBottom: 12,
})

const emit = defineEmits<{ (e: 'back'): void }>()
</script>

<template>
  <div class="mobile-layout">
    <!-- 顶栏 -->
    <header class="ml-head" :class="{ 'ml-head--gradient': gradient }">
      <slot name="nav">
        <button v-if="back" class="ml-head__back" aria-label="返回" @click="emit('back')">
          ‹
        </button>
        <h1 v-if="title" class="ml-head__title">{{ title }}</h1>
        <div class="ml-head__right">
          <slot name="right" />
        </div>
      </slot>
    </header>

    <!-- 后端降级提示条 -->
    <div v-if="degraded" class="ml-degraded">⚠ 后端未连接 · 请确认服务已启动</div>

    <!-- 内容 -->
    <main class="ml-body u-scroll-y" :style="{ paddingBottom: `${contentPaddingBottom}px` }">
      <slot />
    </main>

    <!-- 底部 Tab -->
    <TabBar v-if="showTabBar" />
    <slot name="footer" />
  </div>
</template>

<style scoped>
.mobile-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-page);
}

.ml-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 8px 14px;
  padding-top: max(14px, env(safe-area-inset-top));
  background: #fff;
  border-bottom: 1px solid var(--border-color);
  flex: none;
}

.ml-head--gradient {
  background: linear-gradient(135deg, var(--mn-green) 0%, var(--mn-green-dark) 100%);
  border-bottom: none;
  color: #fff;
}

.ml-head__back {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-size: 26px;
  line-height: 1;
}

.ml-head__title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
}

.ml-head__right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ml-degraded {
  flex: none;
  padding: 6px 14px;
  background: #fff7e6;
  color: #d46b08;
  font-size: 12px;
  text-align: center;
  border-bottom: 1px solid #ffe7ba;
}

.ml-body {
  flex: 1;
  min-height: 0;
}
</style>
