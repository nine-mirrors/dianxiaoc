<script setup lang="ts">
/**
 * ErrorView —— 品牌异常页（路由 /error）。
 *
 * 与 AppErrorBoundary 的兜底 UI 共用同一套类名与视觉（.errx 家族），保证
 * 「渲染异常」与「服务异常」两种兜底在观感上完全一致。
 *
 * 内容：品牌绿渐层底 + 奶滴断线插画（内联 SVG）+ 标题/说明 + 「重试 / 返回首页」，
 * 并显示当前错误码（route.query.code，无则 —）与时间戳；底部为演示环境热线占位
 * （不编造真实号码）。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useSessionStore } from '@/stores/session'
import type { Role } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const HOME: Record<Role, string> = {
  rep: '/rep/today',
  manager: '/manager/dashboard',
  owner: '/owner',
  admin: '/admin',
}

/** 错误码：来自 ?code=，缺省显示破折号（不编造） */
const code = computed<string>(() => String(route.query.code ?? '') || '—')

/** 时间戳：本地时区、24 小时制 */
const stamp = computed<string>(() =>
  new Date().toLocaleString('zh-CN', { hour12: false }),
)

function retry(): void {
  window.location.reload()
}

function goHome(): void {
  const target: string = session.logged ? HOME[session.role] ?? '/rep/today' : '/login'
  void router.replace(target)
}
</script>

<template>
  <section class="errx errx--page" role="alert">
    <!-- 奶滴断线插画（品牌绿描边 + 裂口） -->
    <div class="errx__art" aria-hidden="true">
      <svg width="112" height="112" viewBox="0 0 100 120">
        <path
          d="M50 6 C50 6 14 46 14 74 a36 36 0 0 0 72 0 C86 46 50 6 50 6z"
          fill="none"
          stroke="var(--mn-green)"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.9"
        />
        <path
          d="M30 70 L44 78 L56 68 L72 76"
          fill="none"
          stroke="var(--mn-green)"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path d="M46 96 L54 88 L46 80" fill="none" stroke="var(--mn-green)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>

    <h1 class="errx__title">服务暂时不可用</h1>
    <p class="errx__desc">
      页面内容加载时遇到了一点小问题，你的巡店记录与数据都不会受影响。刷新一下，或返回首页继续。
    </p>

    <div class="errx__actions">
      <button type="button" class="u-btn u-btn--primary errx__btn" @click="retry">
        <AppIcon name="refresh" :size="16" color="var(--milk)" />
        <span>重试</span>
      </button>
      <button type="button" class="u-btn u-btn--ghost errx__btn" @click="goHome">
        <AppIcon name="home" :size="16" color="currentColor" />
        <span>返回首页</span>
      </button>
    </div>

    <dl class="errx__meta">
      <div class="errx__meta-row">
        <dt>错误码</dt>
        <dd>{{ code }}</dd>
      </div>
      <div class="errx__meta-row">
        <dt>时间</dt>
        <dd>{{ stamp }}</dd>
      </div>
    </dl>

    <p class="errx__foot">
      <AppIcon name="warning" :size="13" color="var(--text-3)" />
      演示环境 · 请联系现场工作人员
    </p>
  </section>
</template>

<style scoped>
/* 兜底区填满内容区：手机壳内由 .mot-route-host 定高，桌面端沿 #app 高度链撑起视口 */
.errx {
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
  animation: errx-in var(--dur-base, 220ms) var(--ease-decel, ease-out) both;
}

@keyframes errx-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.errx__art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  margin-bottom: var(--space-4);
  border-radius: 50%;
  background: var(--mn-green-light);
}

.errx__title {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.4;
  color: var(--text-1);
}

.errx__desc {
  max-width: 282px;
  margin-top: var(--space-2);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
}

.errx__actions {
  display: flex;
  gap: var(--space-3);
  width: 100%;
  max-width: 300px;
  margin-top: var(--space-6);
}

.errx__btn {
  flex: 1;
  height: var(--btn-h-lg);
}

.errx__meta {
  display: flex;
  gap: var(--space-5);
  margin: var(--space-5) 0 0;
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-color);
}

.errx__meta-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.errx__meta-row dt {
  font-size: 11px;
  color: var(--text-3);
}

.errx__meta-row dd {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.errx__foot {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: var(--space-5) 0 0;
  font-size: 11.5px;
  color: var(--text-3);
}

@media (prefers-reduced-motion: reduce) {
  .errx {
    animation: none;
  }
}
</style>
