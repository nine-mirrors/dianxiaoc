<script setup lang="ts">
/**
 * BootCover —— 开场封面 / 「今日门店战报」（W7 平台层）。
 *
 * 定位：叠加在启动闪屏**之后**的一层战报卡片，不是替代既有 splash（App.vue 的
 *   启动闪屏仍独立存在，z 更高；本层在闪屏淡出后自然显形）。
 *
 * 显示条件（全部满足）：
 *  - 路由非 /login、非 /manager、非 /admin；
 *  - 且（URL 带 ?boot=1 强制，或 本次浏览器会话尚未播过 —— sessionStorage 打标）。
 *
 * 数据来源（**全部真实，拿不到就不显示数字**）：
 *  1. getMorningBrief('R_EAST')（经理晨报，非经理会 403 → catch 后降级）；
 *  2. getTodayRoute() 的统计（今日门店 / 已完成 / 待办数）；
 *  3. 都拿不到 → 仅品牌欢迎语 + 「开始」，绝不造数。
 *
 * 关闭：点击任意处 / 3.2s 自动 / 右下「开始」按钮；关闭即 v-if 卸载，不留遮罩。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { getMorningBrief, getTodayRoute } from '@/api'

interface Stat {
  label: string
  value: number
}

const route = useRoute()

const playedKey = 'dxc:boot-played'

const visible = ref<boolean>(false)
const welcomeOnly = ref<boolean>(false)
const regionName = ref<string>('')
const stats = ref<Stat[]>([])
const display = ref<number[]>([])
let started = false
let autoTimer: number | undefined
let rafId: number | undefined

function readPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(playedKey) === '1'
  } catch {
    return false
  }
}
function markPlayed(): void {
  try {
    window.sessionStorage.setItem(playedKey, '1')
  } catch {
    /* 隐私模式：静默降级 */
  }
}

const forced = computed<boolean>(() => String(route.query.boot ?? '') === '1')

/** 路口判断：这些形态下不展示 */
function isExcluded(path: string): boolean {
  return (
    path === '/' ||
    path.startsWith('/login') ||
    path.startsWith('/manager') ||
    path.startsWith('/admin')
  )
}

/* ── 数字滚动计数（rAF） ── */
function animateNumbers(): void {
  const targets = stats.value.map((s) => s.value)
  display.value = targets.map(() => 0)
  const t0 = performance.now()
  const dur = 900
  const frame = (now: number): void => {
    const p = Math.min(1, (now - t0) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    display.value = targets.map((v) => Math.round(v * eased))
    if (p < 1) rafId = window.requestAnimationFrame(frame)
  }
  rafId = window.requestAnimationFrame(frame)
}

/** 优先级取数：经理晨报 → 业代今日线路 → 仅欢迎语 */
async function load(): Promise<void> {
  try {
    const brief = await getMorningBrief('R_EAST')
    if (brief?.stats && typeof brief.stats.riskCount === 'number') {
      regionName.value = brief.stats.regionName || ''
      stats.value = [
        { label: '风险门店', value: brief.stats.riskCount },
        { label: '平均健康分', value: Math.round(brief.stats.avgScore ?? 0) },
        { label: '待下派草稿', value: brief.stats.draftCount ?? 0 },
      ]
      animateNumbers()
      return
    }
  } catch {
    /* 非经理 / 后端不通：降级到今日线路 */
  }
  try {
    const today = await getTodayRoute()
    const s = today?.summary
    if (s) {
      stats.value = [
        { label: '今日门店', value: s.total ?? 0 },
        { label: '已完成', value: s.done ?? 0 },
        { label: '待办任务', value: (today.todoTasks ?? []).length },
      ]
      animateNumbers()
      return
    }
  } catch {
    /* 继续降级 */
  }
  welcomeOnly.value = true
}

function dismiss(): void {
  if (!visible.value) return
  visible.value = false
  if (autoTimer !== undefined) {
    window.clearTimeout(autoTimer)
    autoTimer = undefined
  }
  if (rafId !== undefined) {
    window.cancelAnimationFrame(rafId)
    rafId = undefined
  }
  markPlayed()
}

function evaluate(path: string): void {
  if (started || isExcluded(path)) return
  if (!forced.value && readPlayed()) return
  started = true
  visible.value = true
  void load()
  autoTimer = window.setTimeout(dismiss, 3200)
}

// 首次真正落到手机业务页时评估一次（初始 / 与 /login 重定向不计入）
watch(() => route.path, (p) => evaluate(p), { immediate: true })

onMounted(() => {
  if (!started && route.path) evaluate(route.path)
})

onBeforeUnmount(() => {
  if (autoTimer !== undefined) window.clearTimeout(autoTimer)
  if (rafId !== undefined) window.cancelAnimationFrame(rafId)
})

const title = computed<string>(() => '今日门店战报')
const subtitle = computed<string>(() =>
  regionName.value ? `${regionName.value} · 一线作战快照` : '店小C · 蒙牛 AI 巡店助手',
)
</script>

<template>
  <Transition name="boot">
    <div v-if="visible" class="boot" @click="dismiss">
      <section class="boot__card" @click.stop>
        <span class="boot__logo" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path d="M12 3C12 3 6 10.5 6 15.5a6 6 0 0 0 12 0C18 10.5 12 3 12 3z" fill="#fff" />
          </svg>
        </span>
        <h1 class="boot__title">{{ title }}</h1>
        <p class="boot__sub">{{ subtitle }}</p>

        <div v-if="stats.length" class="boot__stats">
          <div v-for="(s, i) in stats" :key="s.label" class="boot__stat">
            <p class="boot__num">{{ display[i] ?? 0 }}</p>
            <p class="boot__cap">{{ s.label }}</p>
          </div>
        </div>
        <p v-else class="boot__welcome">
          欢迎使用店小C · 让 AI 陪你把每一家店跑明白
        </p>

        <button type="button" class="boot__start" @click.stop="dismiss">
          开始
          <AppIcon name="zap" :size="14" color="#ffffff" />
        </button>
      </section>
      <p class="boot__tip">点击任意处开始 · 3 秒后自动进入</p>
    </div>
  </Transition>
</template>

<style scoped>
.boot {
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  background: rgba(10, 26, 18, 0.5);
  cursor: pointer;
}

.boot__card {
  position: relative;
  width: 100%;
  max-width: 320px;
  padding: 26px 22px 20px;
  border-radius: 22px;
  background: linear-gradient(150deg, #06964c, #02803f);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.36);
  color: #fff;
  text-align: center;
}

.boot__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.16);
}

.boot__title {
  margin-top: 12px;
  font-size: 19px;
  font-weight: 900;
  letter-spacing: 1px;
}

.boot__sub {
  margin-top: 4px;
  font-size: 11.5px;
  color: #bff0d4;
}

.boot__stats {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

.boot__stat {
  flex: 1;
  padding: 10px 4px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.14);
}

.boot__num {
  font-size: 22px;
  font-weight: 800;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.boot__cap {
  margin-top: 3px;
  font-size: 10.5px;
  color: #d9f7e6;
}

.boot__welcome {
  margin-top: 20px;
  font-size: 13px;
  line-height: 1.7;
  color: #e6fff0;
}

.boot__start {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 5px;
  margin: 22px 0 0 auto;
  height: 38px;
  padding: 0 20px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.boot__tip {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  letter-spacing: 1px;
}

/* 卡片自下浮入 */
.boot-enter-active {
  transition: opacity 260ms var(--ease-standard, ease);
}

.boot-enter-active .boot__card {
  transition: transform 320ms var(--ease-decel, ease);
}

.boot-enter-from {
  opacity: 0;
}

.boot-enter-from .boot__card {
  transform: translateY(28px);
}

.boot-leave-active {
  transition: opacity 200ms var(--ease-standard, ease);
  pointer-events: none;
}

.boot-leave-to {
  opacity: 0;
}
</style>
