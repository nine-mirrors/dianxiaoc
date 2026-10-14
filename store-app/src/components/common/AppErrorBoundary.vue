<script setup lang="ts">
/**
 * AppErrorBoundary —— React 式错误边界（Vue 版用 onErrorCaptured 实现）。
 *
 * 工作方式：
 *  - 默认插槽正常渲染；子树在渲染 / 生命周期 / 事件处理中抛错时，
 *    onErrorCaptured 返回 false 阻止错误继续上抛（否则 Vue 会卸载子树 → 白屏），
 *    本组件改为渲染企业级兜底 UI，★只替换内容区★：手机壳、桌面顶栏、Toast 均不受影响。
 *  - 错误不吞：仍通过全局错误管线 console.error('[app-error]') 上报并计入单例，
 *    生产环境界面上只出现固定中文安抚文案，绝不暴露英文堆栈。
 *  - 恢复手段：
 *      ①「刷新页面」：location.reload()，解决部署后旧 chunk 残留等环境类问题；
 *      ②「返回上一页」：router.back()；无历史（深链/首屏直接崩溃）时 replace('/')
 *         回首页，由路由重定向与既有守卫决定最终落地页；
 *      ③「重试当前页」：清空兜底态并 emit('retry')，由父级变更子树 key 重新挂载，
 *         不需要整页刷新。
 *  - 路由切换（含同路由名改参数）会自动清空兜底态，避免错误界面"卡"在新页面上。
 *
 * 无障碍：兜底区 role="alert"（隐式 aria-live=assertive，插入即被读屏播报）；
 * 入场仅使用 opacity/translateY，并在 prefers-reduced-motion 下完全关闭。
 */
import { onErrorCaptured, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { reportError } from '@/composables/useAppErrorHandler'

const emit = defineEmits<{ (e: 'retry'): void }>()

const route = useRoute()
const router = useRouter()

/** 是否已捕获错误（false=正常渲染插槽；true=渲染兜底 UI） */
const failed = ref<boolean>(false)

onErrorCaptured((err, _instance, info) => {
  // 返回 false 阻止继续向上传播；在此之前先把错误送入全局管线，保证不被吞掉
  reportError('app', err, `error-boundary: ${info}`)
  failed.value = true
  return false
})

// 同路由名改参数（如拍照页切换门店 /rep/capture/A → /rep/capture/B）时边界实例被复用，
// 路由变化即视为进入新内容，自动收起兜底态等待子树重新渲染
watch(
  () => route.fullPath,
  () => {
    failed.value = false
  },
)

/** 重试：仅重新挂载子树（父级依据 retry 事件修改 key），不整页刷新 */
function retry(): void {
  failed.value = false
  emit('retry')
}

/** 整页刷新（主操作） */
function reloadPage(): void {
  window.location.reload()
}

/**
 * 返回上一页（次操作）。
 * vue-router 的 history.state.position：首个条目为 0，push 后递增；
 * >0 才说明有可回的历史，否则深链首屏崩溃时 back() 无效，改回首页。
 */
function canGoBack(): boolean {
  const state = window.history.state as { position?: number } | null
  return typeof state?.position === 'number' && state.position > 0
}

function goBack(): void {
  if (canGoBack()) {
    router.back()
  } else {
    void router.replace('/')
  }
}
</script>

<template>
  <!-- 正常态：直接渲染默认插槽，不增加任何包裹元素，盒模型 / 转场定位与旧结构完全一致 -->
  <slot v-if="!failed" />

  <!-- 异常态：仅替换内容区 -->
  <section v-else class="aeb" role="alert">
    <div class="aeb__brand">
      <AppIcon name="milk" :size="34" color="var(--mn-green)" title="店小C" />
    </div>
    <h1 class="aeb__title">页面开小差了</h1>
    <p class="aeb__desc">别担心，内容加载时遇到了一点小问题，你的巡店记录不会受影响。刷新一下，或返回上一页继续。</p>

    <div class="aeb__actions">
      <button type="button" class="u-btn u-btn--primary aeb__btn" @click="reloadPage">
        <AppIcon name="refresh" :size="16" color="#ffffff" />
        <span>刷新页面</span>
      </button>
      <button type="button" class="u-btn u-btn--ghost aeb__btn" @click="goBack">
        <AppIcon name="chevron-left" :size="16" color="var(--mn-green)" />
        <span>返回上一页</span>
      </button>
    </div>

    <button type="button" class="aeb__retry" @click="retry">重试当前页</button>
  </section>
</template>

<style scoped>
/* 兜底区填满内容区：手机壳内由 .mot-route-host 定高，桌面端沿 #app 高度链撑起视口 */
.aeb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 320px;
  padding: var(--space-6) var(--space-5);
  overflow-y: auto;
  text-align: center;
  background: var(--bg-page);
  animation: aeb-in var(--dur-base, 220ms) var(--ease-decel, ease-out) both;
}

@keyframes aeb-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.aeb__brand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin-bottom: var(--space-4);
  border-radius: 50%;
  background: var(--mn-green-light);
}

.aeb__title {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text-1);
}

.aeb__desc {
  max-width: 280px;
  margin-top: var(--space-2);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
}

.aeb__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  max-width: 280px;
  margin-top: var(--space-6);
}

.aeb__btn {
  width: 100%;
  height: var(--btn-h-lg);
}

/* 第三选择：文字按钮，弱化但保持 ≥36px 触控热区 */
.aeb__retry {
  min-height: 36px;
  margin-top: var(--space-4);
  padding: 8px var(--space-4);
  border: 0;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: var(--mn-green);
}

/* 尊重系统「减弱动态效果」：兜底内容直接出现，不做位移淡入 */
@media (prefers-reduced-motion: reduce) {
  .aeb {
    animation: none;
  }
}
</style>
