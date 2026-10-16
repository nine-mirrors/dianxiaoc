<script setup lang="ts">
/**
 * OnboardingGuide —— 角色化新手引导（W7 平台层）。
 *
 * 触发：首次进入某角色时显示一次（localStorage 键 `dxc:onboard:<role>`，每个角色各一次）。
 * 形态：★ 仅手机形态展示 —— 这是 3 屏横滑的手机式引导，PC 桌面形态（含 /manager、
 *       /admin 看板）一律不弹，避免整屏遮罩盖住桌面布局。
 * 交互：3 屏横向滑动 + 指示点，可「上一步/下一步」，右上角可随时关闭、也可「跳过」。
 * 非阻塞：遮罩半透明且不吃事件，页面本身始终可点（不锁死）。
 * 内容按 session.role 差异化（业代 / 店主 / 经理各一套，每套 3 屏，全中文具体）。
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useSessionStore } from '@/stores/session'
import { useDemoModeStore } from '@/stores/demo-mode'
import { useDeviceType } from '@/composables/useDeviceType'
import type { Role } from '@/types'

interface Screen {
  title: string
  desc: string
}

const GUIDES: Record<Role, Screen[]> = {
  rep: [
    { title: '今天要跑哪几家？', desc: '今日巡店页按距离排好拜访线路，门店数、完成进度、待办任务一屏看清，跟着走就行。' },
    { title: '拍一张货架照就够', desc: '在门店拍张货架照片，AI 自动识别缺货、排面、价签问题，并给出可执行的整改动作。' },
    { title: '改完留证，闭环回传', desc: '整改后回传照片，健康分自动更新，经理端实时可见——你的每一分努力都有回执。' },
  ],
  owner: [
    { title: '自助给门店做个体检', desc: '自己拍一张货架照，AI 告诉你问题出在哪、先做什么，不用等业务员上门。' },
    { title: '补货补多少有依据', desc: '智能补货模拟器把「该补多少瓶」的算式摊开，补得刚好，不压货也不断货。' },
    { title: '一键下单，送货上门', desc: '确认订货单后直接下单，业代接单 2 小时内送达，全程状态可查。' },
  ],
  manager: [
    { title: '区域经营一屏掌握', desc: '看板聚合全区门店健康分、风险门店与周趋势，管理有抓手、复盘有数据。' },
    { title: 'AI 晨报与经营问答', desc: '每天一份 AI 晨报主动预警风险门店，还能用自然语言直接问经营问题。' },
    { title: '下派 → 回执，真闭环', desc: '风险门店一键拟派草稿，业代整改回传后看板实时更新，任务不止于「已下发」。' },
  ],
  // 管理员为桌面端（/admin 已被 excluded 排除，永不弹手机引导），保留空数组满足完整角色映射
  admin: [],
}

const route = useRoute()
const session = useSessionStore()
const demo = useDemoModeStore()
/** 设备形态：手机式引导只在移动形态出现（PC 走桌面外壳，不弹） */
const { isMobile } = useDeviceType()

const visible = ref<boolean>(false)
const index = ref<number>(0)
let started = false

const excluded = computed<boolean>(
  () =>
    !isMobile.value ||
    // ★ 一键演示模式开启时抑制新手引导，避免两套引导互相打架（演示优先）
    demo.active ||
    route.path === '/' ||
    route.path.startsWith('/login') ||
    route.path.startsWith('/manager') ||
    route.path.startsWith('/admin'),
)

const role = computed<Role>(() => session.role)
const screens = computed<Screen[]>(() => GUIDES[role.value] ?? GUIDES.rep)
const total = computed<number>(() => screens.value.length)

function keyFor(r: Role): string {
  return `dxc:onboard:${r}`
}

function readSeen(r: Role): boolean {
  try {
    return window.localStorage.getItem(keyFor(r)) === '1'
  } catch {
    // 隐私模式无法读写 → 不展示（避免每次进页都弹）
    return true
  }
}

function markSeen(r: Role): void {
  try {
    window.localStorage.setItem(keyFor(r), '1')
  } catch {
    /* 静默降级 */
  }
}

function evaluate(path: string): void {
  if (started || excluded.value) return
  if (readSeen(role.value)) return
  started = true
  index.value = 0
  visible.value = true
}

function close(): void {
  visible.value = false
  markSeen(role.value)
}

function next(): void {
  if (index.value >= total.value - 1) close()
  else index.value += 1
}
function prev(): void {
  if (index.value > 0) index.value -= 1
}

// 只在首次真正落到手机业务页时评估（初始 / 与 /login 重定向不计入）
watch(
  () => route.path,
  (p) => evaluate(p),
  { immediate: true },
)

// 演示模式开启时立即收起已弹出的引导（不占用「已看过」标记，退出演示后本次会话不再重弹）
watch(
  () => demo.active,
  (on) => {
    if (on && visible.value) visible.value = false
  },
)

const trackStyle = computed(() => ({ transform: `translateX(-${index.value * 100}%)` }))
</script>

<template>
  <div v-if="visible" class="ob">
    <section class="ob__card" role="dialog" aria-label="新手引导">
      <button type="button" class="ob__close u-tap" aria-label="关闭引导" @click="close">
        <AppIcon name="close" :size="16" color="var(--text-2)" />
      </button>

      <div class="ob__viewport">
        <div class="ob__track" :style="trackStyle">
          <article v-for="(s, i) in screens" :key="i" class="ob__slide">
            <span class="ob__badge">
              <AppIcon name="sparkles" :size="18" color="var(--mn-green)" />
            </span>
            <h2 class="ob__title">{{ s.title }}</h2>
            <p class="ob__desc">{{ s.desc }}</p>
          </article>
        </div>
      </div>

      <div class="ob__dots">
        <button
          v-for="(_, i) in screens"
          :key="i"
          type="button"
          class="ob__dot"
          :class="{ 'ob__dot--on': i === index }"
          :aria-label="`第 ${i + 1} 屏`"
          @click="index = i"
        />
      </div>

      <div class="ob__ops">
        <button type="button" class="ob__skip" @click="close">跳过</button>
        <div class="ob__right">
          <button v-if="index > 0" type="button" class="ob__prev" @click="prev">上一步</button>
          <button type="button" class="ob__next" @click="next">
            {{ index === total - 1 ? '开始使用' : '下一步' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 遮罩半透明且不吃事件（非阻塞）：页面本身始终可点 */
.ob {
  position: fixed;
  inset: 0;
  z-index: 1240;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-mask);
  pointer-events: none;
}

.ob__card {
  position: relative;
  width: 100%;
  max-width: 312px;
  padding: 22px 18px 16px;
  border-radius: 20px;
  background: var(--bg-card);
  box-shadow: var(--sh-3);
  pointer-events: auto;
  animation: ob-in 260ms var(--ease-decel, ease) both;
}

@keyframes ob-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ob__close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: none;
}

.ob__viewport {
  overflow: hidden;
}

.ob__track {
  display: flex;
  transition: transform 280ms var(--ease-standard, ease);
}

.ob__slide {
  flex: 0 0 100%;
  padding: 6px 2px;
  text-align: center;
}

.ob__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 15px;
  background: var(--mn-green-light);
}

.ob__title {
  margin: 12px 0 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--text-1);
}

.ob__desc {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-2);
}

.ob__dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 14px;
}

.ob__dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--border-strong, var(--border-color));
}

.ob__dot--on {
  width: 18px;
  border-radius: 999px;
  background: var(--mn-green);
}

.ob__ops {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.ob__skip {
  min-height: 36px;
  padding: 0 8px;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 13px;
}

.ob__right {
  display: flex;
  gap: 8px;
}

.ob__prev,
.ob__next {
  height: 37px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.ob__prev {
  background: var(--bg-page);
  color: var(--text-2);
}

.ob__next {
  background: var(--grad-brand);
  color: #fff;
}
</style>
