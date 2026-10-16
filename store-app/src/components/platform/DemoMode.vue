<script setup lang="ts">
/**
 * DemoMode —— 「一键演示模式」常驻浮层（功能10）。
 *
 * App.vue 顶层挂载，两种设备形态共用。开启后常驻一个轻量「分镜控制器」：
 *  - 显示当前步骤序号 / 标题 / 说明文案 + 上一步 / 下一步 / 退出；
 *  - 按预设步骤 router.push 到真实路由（脚本见 stores/demo-mode.ts）；
 *  - 可折叠；首次进入弹一条说明卡讲清怎么用。
 *
 * 导航职责集中在**这里**：入口开关（<DemoModeToggle>）只翻转 store 状态，
 * 由本组件监听 active/index 变化执行 push；退出时回到开启前的路由。
 *
 * 快捷键：← 上一步 / → 下一步 / Esc 退出（首个弹层为说明卡时 Esc 先关说明卡）。
 * 焦点在输入框等可编辑控件内时不劫持方向键；尊重已 preventDefault 的事件。
 */
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useDemoModeStore } from '@/stores/demo-mode'
import { useDeviceType } from '@/composables/useDeviceType'

const route = useRoute()
const router = useRouter()
const demo = useDemoModeStore()
const { isMobile } = useDeviceType()

/** 进度比例（用于进度条 scaleX） */
const progress = computed<number>(() => {
  const n = demo.total
  if (!n) return 0
  return Math.min(1, Math.max(0, (demo.index + 1) / n))
})

/** 当前是否首步 / 末步（禁用对应按钮） */
const atFirst = computed<boolean>(() => demo.index <= 0)
const atLast = computed<boolean>(() => demo.index >= demo.total - 1)

/* ═══════════════ 导航 ═══════════════ */

/** 跳到当前步骤对应的真实路由（已在目标页则不重复导航） */
function navigateToCurrent(): void {
  const step = demo.current
  if (!step) return
  if (route.path === step.path) return
  void router.push({ path: step.path, query: step.query ?? {} })
}

/** 退出回归：回到开启演示前的路由 */
function goBack(): void {
  const back = demo.returnPath
  if (back && back !== route.fullPath) void router.replace(back)
}

watch(
  () => demo.active,
  (on, was) => {
    if (on) navigateToCurrent()
    else if (was) goBack()
  },
)

watch(
  () => demo.index,
  () => {
    if (demo.active) navigateToCurrent()
  },
)

// 角色 / 形态切换导致步骤集合变化：收拢后重新指向当步
watch(
  () => demo.steps,
  () => {
    if (demo.active) navigateToCurrent()
  },
)

/* ═══════════════ 键盘快捷键 ═══════════════ */

/** 焦点是否在可编辑控件内（此时不劫持方向键） */
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable === true
}

function onKey(e: KeyboardEvent): void {
  if (!demo.active) return
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
  if (isEditable(e.target)) return
  // 聚光灯导览（AppTour，?tour=1）正在运行时不抢方向键，避免两套引导互相打架
  if (document.querySelector('.tour')) return

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    demo.next()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    demo.prev()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    // 说明卡优先：先关说明卡，再按一次才退出演示
    if (demo.introOpen) demo.dismissIntro()
    else demo.stop()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  // 刷新恢复：会话里记录了「开启中」→ 直接回到当步
  if (demo.active) navigateToCurrent()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="demo.active" class="demo" :class="{ 'demo--mobile': isMobile }">
    <!-- ── 分镜控制器（可折叠） ── -->
    <section class="demo__panel" aria-label="演示分镜控制器">
      <button
        type="button"
        class="demo__head mot-tap"
        :aria-expanded="!demo.collapsed"
        aria-controls="demo-panel-body"
        :aria-label="demo.collapsed ? '展开分镜控制器' : '收起分镜控制器'"
        @click="demo.toggleCollapse()"
      >
        <span class="demo__badge" aria-hidden="true">
          <AppIcon name="presentation" :size="15" color="#fff" />
        </span>
        <span class="demo__count">第 {{ demo.index + 1 }}/{{ demo.total }} 步</span>
        <span class="demo__head-title">{{ demo.current?.title }}</span>
        <AppIcon :name="demo.collapsed ? 'chevron-up' : 'chevron-down'" :size="16" color="#fff" />
      </button>

      <div v-show="!demo.collapsed" id="demo-panel-body" class="demo__body">
        <p :key="demo.index" class="demo__desc mot-fade-up" aria-live="polite">
          {{ demo.current?.desc }}
        </p>

        <div class="demo__bar" aria-hidden="true">
          <span class="demo__bar-fill" :style="{ transform: `scaleX(${progress})` }" />
        </div>

        <div class="demo__ops">
          <button
            type="button"
            class="demo__btn demo__btn--ghost mot-tap"
            aria-label="上一步"
            :disabled="atFirst"
            @click="demo.prev()"
          >
            <AppIcon name="chevron-left" :size="15" />
            上一步
          </button>
          <button
            type="button"
            class="demo__btn demo__btn--primary mot-tap"
            :aria-label="atLast ? '已是最后一步' : '下一步'"
            :disabled="atLast"
            @click="demo.next()"
          >
            下一步
            <AppIcon name="chevron-right" :size="15" />
          </button>
          <button
            type="button"
            class="demo__btn demo__btn--exit mot-tap"
            aria-label="退出演示模式"
            @click="demo.stop()"
          >
            退出
          </button>
        </div>
      </div>
    </section>

    <!-- ── 首次进入说明卡 ── -->
    <Transition name="demo-mask">
      <div v-if="demo.introOpen" class="demo__mask" @click.self="demo.dismissIntro()">
        <section class="demo__intro" role="dialog" aria-modal="true" aria-label="演示模式用法">
          <span class="demo__intro-badge">
            <AppIcon name="presentation" :size="20" color="var(--mn-green)" />
          </span>
          <h2 class="demo__intro-title">一键演示 · 分镜巡航</h2>
          <p class="demo__intro-sub">
            按角色为你准备了 {{ demo.total }} 步真实功能分镜，跟着走即可完整演示。
          </p>
          <ul class="demo__intro-list mot-stagger">
            <li>
              <AppIcon name="chevron-right" :size="15" color="var(--mn-green)" />
              <span>点「下一步 / 上一步」切换分镜（键盘 <b>←</b> / <b>→</b>）</span>
            </li>
            <li>
              <AppIcon name="chevron-right" :size="15" color="var(--mn-green)" />
              <span>每步都有一句说明，讲清「这一步在演示什么」</span>
            </li>
            <li>
              <AppIcon name="chevron-right" :size="15" color="var(--mn-green)" />
              <span>点「退出」结束演示并回到进入前的页面（键盘 <b>Esc</b>）</span>
            </li>
          </ul>
          <button type="button" class="demo__intro-ok mot-tap" aria-label="开始演示" @click="demo.dismissIntro()">
            开始演示
          </button>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 根层：全屏透明、不吃事件（页面照常可点）；控制器与说明卡各自接管事件 */
.demo {
  position: fixed;
  inset: 0;
  z-index: 1160;
  pointer-events: none;
}

/* ── 分镜控制器 ── */
.demo__panel {
  position: absolute;
  box-sizing: border-box;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--sh-3);
  overflow: hidden;
  pointer-events: auto;
  animation: demo-slide-in var(--dur-base) var(--ease-decel) both;
}

@keyframes demo-slide-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 桌面形态：右上角（避开左下 AI 球与左侧导航）。
   top 取 104px 以同时让过两种桌面顶栏：MobileLayout 桌面外壳 ~64px、
   经理 / 管理端看板顶栏（含导航行）~100px。 */
.demo:not(.demo--mobile) .demo__panel {
  top: 104px;
  right: 22px;
  width: 320px;
}

/* 移动形态：顶栏下沿整宽，避开底部 Tab 与吸底操作栏 */
.demo--mobile .demo__panel {
  top: calc(env(safe-area-inset-top, 0px) + 54px);
  left: 8px;
  right: 8px;
}

.demo__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: none;
  background: var(--grad-brand);
  color: #fff;
  text-align: left;
}

.demo__head:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -3px;
}

.demo__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.2);
  flex: none;
}

.demo__count {
  flex: none;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.3px;
  opacity: 0.95;
}

.demo__head-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 700;
}

.demo__body {
  padding: 12px 12px 13px;
}

.demo__desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}

.demo__bar {
  height: 4px;
  margin: 12px 0 12px;
  border-radius: 999px;
  background: var(--bg-page);
  overflow: hidden;
}

.demo__bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--grad-brand);
  transform-origin: left center;
  transition: transform var(--dur-base) var(--ease-standard);
}

.demo__ops {
  display: flex;
  align-items: center;
  gap: 8px;
}

.demo__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-2);
  background: var(--bg-page);
}

.demo__btn--primary {
  flex: 1;
  background: var(--grad-brand);
  color: #fff;
}

.demo__btn--exit {
  flex: none;
  background: transparent;
  color: var(--text-3);
  padding: 0 8px;
}

.demo__btn:disabled {
  opacity: 0.45;
}

.demo__btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

/* ── 首次说明卡 ── */
.demo__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-mask);
  pointer-events: auto;
}

.demo__intro {
  width: 100%;
  max-width: 330px;
  padding: 22px 18px 16px;
  border-radius: 20px;
  background: var(--bg-card);
  box-shadow: var(--sh-3);
  text-align: center;
}

.demo__intro-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 15px;
  background: var(--mn-green-light);
}

.demo__intro-title {
  margin: 12px 0 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--text-1);
}

.demo__intro-sub {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}

.demo__intro-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  text-align: left;
}

.demo__intro-list li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}

.demo__intro-list li + li {
  margin-top: 7px;
}

.demo__intro-list b {
  color: var(--mn-green-dark);
}

.demo__intro-ok {
  width: 100%;
  min-height: 42px;
  margin-top: 16px;
  border: none;
  border-radius: 999px;
  background: var(--grad-brand);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.demo__intro-ok:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

/* 说明卡进出场：淡入 + 轻微上浮（只动 opacity / transform） */
.demo-mask-enter-active {
  transition: opacity var(--dur-base) var(--ease-decel);
}

.demo-mask-enter-active .demo__intro {
  transition: transform var(--dur-base) var(--ease-decel);
}

.demo-mask-enter-from {
  opacity: 0;
}

.demo-mask-enter-from .demo__intro {
  transform: translateY(12px);
}

.demo-mask-leave-active {
  transition: opacity var(--dur-fast) var(--ease-standard);
}

.demo-mask-leave-to {
  opacity: 0;
}
</style>
