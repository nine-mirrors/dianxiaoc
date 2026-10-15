<script setup lang="ts">
/**
 * AppTour —— 演示导览（聚光灯分步，W7 平台层）。
 *
 * 触发：仅当 URL 带 `?tour=1`（避免打扰正常演示）；结束后用 router.replace 去掉该 query。
 *
 * 渲染：半透明遮罩 + 高亮挖洞（box-shadow 铺满全屏）+ 气泡卡片（标题/描述/下一步/跳过/进度）。
 *
 * 优雅降级（硬要求）：
 *  - 某一步的 target 选择器在 DOM 里找不到 → 自动跳过该步，不报错；
 *  - 某路由没有任何匹配步骤 → 完全不启动；
 *  - Esc 跳过、←/→ 切换；目标位置随窗口 resize / 滚动重算（监听并清理）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface TourStep {
  target: string
  title: string
  desc: string
}

/** 路由前缀 → 步骤定义（选择器缺失的步骤会被运行时过滤） */
const STEPS: Record<string, TourStep[]> = {
  '/': [
    { target: '.lg-card', title: '账号密码登录', desc: '演示账号由后端下发，一键填入即可进入对应角色工作台。' },
    { target: '.lg-brand', title: '店小C · 蒙牛 AI 巡店助手', desc: '一次登录，按角色进入业代 / 店主 / 经理不同工作台。' },
  ],
  '/rep/today': [
    { target: '.p2-summary', title: '今日战绩一眼看全', desc: '今日门店数、已完成进度、平均健康分，开场即给结论。' },
    { target: 'header.ml-head, .p2-summary', title: '经理待办直接到岗', desc: '经理下派的整改任务会实时推送，业代在当前页即可标记完成。' },
    { target: '.p2-route__list, .p2-route', title: '按距离排好的拜访线路', desc: '下一站、距离、历史健康分都在这条线上，点门店即可去巡店。' },
  ],
  '/rep/steps': [
    { target: 'header.ml-head, .stub-view', title: '标准巡店八步骤', desc: '照着一线标准一步步走，不漏项、不返工。' },
  ],
  '/rep/knowledge': [
    { target: 'header.ml-head, .stub-view', title: '终端执行知识库', desc: '陈列、价签、缺货处理的标准答案，随问随查。' },
  ],
  '/owner': [
    { target: '.p6, header.ml-head', title: '店主自助诊断', desc: '拍一张货架照，AI 告诉你问题出在哪、先做什么。' },
    { target: '.p6-cta-bar, .p6', title: '照着清单改进', desc: '诊断结论给动作，改完可一键下单补货。' },
  ],
  '/owner/restock': [
    { target: 'header.ml-head, .stub-view', title: '智能补货模拟器', desc: '把「该补多少瓶」的算式摊开给你看，补得有理有据。' },
  ],
  '/manager/dashboard': [
    { target: '.p5', title: '区域经营看板', desc: '全区门店健康分、风险与趋势一屏掌握，管理有抓手。' },
  ],
  '/admin': [
    { target: 'main, .p5, .stub-view', title: '运营管理控制台', desc: '账号派发、知识库、公告与审计，平台侧统一管理。' },
  ],
}

const route = useRoute()
const router = useRouter()

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const active = ref<boolean>(false)
const steps = ref<TourStep[]>([])
const idx = ref<number>(0)
const box = ref<Box | null>(null)
let busy = false
let disposed = false

const current = computed<TourStep | undefined>(() => steps.value[idx.value])
const progress = computed<string>(() => `${idx.value + 1}/${steps.value.length}`)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** 匹配当前路由对应的步骤键（按前缀长度优先；'/' 只在精确匹配时命中） */
function matchKey(path: string): string | undefined {
  if (path === '/') return '/'
  const keys = Object.keys(STEPS)
    .filter((k) => k !== '/')
    .sort((a, b) => b.length - a.length)
  return keys.find((k) => path === k || path.startsWith(`${k}/`))
}

/** 找到第一个存在的目标元素 */
function findTarget(selector: string): Element | null {
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}

function measure(): void {
  const step = current.value
  if (!step) return
  const el = findTarget(step.target)
  if (!el) {
    // 当前步目标消失（页面切换 / 未渲染）→ 跳过该步
    advance(1)
    return
  }
  const r = el.getBoundingClientRect()
  box.value = { top: r.top, left: r.left, width: r.width, height: r.height }
}

/** 推进/回退一步；越界则结束导览 */
function advance(dirir: number): void {
  const next = idx.value + dirir
  if (next < 0) return
  if (next >= steps.value.length) {
    finish()
    return
  }
  idx.value = next
  void nextTick(measure)
}

async function startTour(path: string): Promise<void> {
  if (busy || active.value || disposed) return
  if (String(route.query.tour ?? '') !== '1') return
  const key = matchKey(path)
  if (!key) return
  const defs = STEPS[key] ?? []
  if (!defs.length) return
  busy = true
  try {
    // 等路由内容渲染：最多重试 8 次，仍未就绪则判定该路由无可用步骤
    for (let i = 0; i < 8; i += 1) {
      await nextTick()
      await delay(140)
      if (disposed) return
      const found = defs.filter((s) => !!findTarget(s.target))
      if (found.length) {
        steps.value = found
        idx.value = 0
        active.value = true
        await nextTick()
        measure()
        return
      }
    }
  } finally {
    busy = false
  }
}

function finish(): void {
  active.value = false
  box.value = null
  const query = { ...route.query }
  if ('tour' in query) {
    delete query.tour
    void router.replace({ path: route.path, query })
  }
}

function onKey(e: KeyboardEvent): void {
  if (!active.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    finish()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    advance(1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    advance(-1)
  }
}

function onResize(): void {
  if (active.value) measure()
}

watch(
  () => route.path,
  (path) => {
    if (active.value) {
      // 页面已切换：原步骤失效，直接结束本次导览
      finish()
      return
    }
    void startTour(path)
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)
  window.addEventListener('keydown', onKey)
  void startTour(route.path)
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onResize, true)
  window.removeEventListener('keydown', onKey)
})

/** 气泡定位：目标下方空间足够放下 180px 则放下方，否则放上方 */
const bubbleStyle = computed(() => {
  const b = box.value
  if (!b) return { display: 'none' }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = 296
  const left = Math.max(12, Math.min(b.left + b.width / 2 - width / 2, vw - width - 12))
  const below = b.top + b.height + 12
  const placeBelow = below + 170 < vh
  const top = placeBelow ? below : Math.max(12, b.top - 178)
  return { left: `${left}px`, top: `${top}px`, width: `${width}px` }
})

const holeStyle = computed(() => {
  const b = box.value
  if (!b) return { display: 'none' }
  return {
    left: `${b.left - 6}px`,
    top: `${b.top - 6}px`,
    width: `${b.width + 12}px`,
    height: `${b.height + 12}px`,
  }
})
</script>

<template>
  <div v-if="active && current" class="tour" role="dialog" aria-label="演示导览">
    <!-- 挖洞高亮：box-shadow 铺满全屏形成遮罩，中心透出目标 -->
    <div class="tour__hole" :style="holeStyle" aria-hidden="true" />

    <!-- 气泡卡片 -->
    <div class="tour__bubble" :style="bubbleStyle">
      <div class="tour__row">
        <span class="tour__step">第 {{ progress }} 步</span>
        <button type="button" class="tour__skip" @click="finish">跳过</button>
      </div>
      <h3 class="tour__title">{{ current.title }}</h3>
      <p class="tour__desc">{{ current.desc }}</p>
      <div class="tour__ops">
        <button type="button" class="tour__prev" :disabled="idx === 0" @click="advance(-1)">上一步</button>
        <button type="button" class="tour__next" @click="advance(1)">
          {{ idx === steps.length - 1 ? '完成' : '下一步' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour {
  position: fixed;
  inset: 0;
  z-index: 1270;
  /* 根层透明但吃事件，避免误点底层页面 */
  background: transparent;
}

.tour__hole {
  position: absolute;
  border-radius: 12px;
  box-shadow: 0 0 0 9999px rgba(8, 22, 15, 0.58);
  transition:
    left 180ms var(--ease-standard, ease),
    top 180ms var(--ease-standard, ease),
    width 180ms var(--ease-standard, ease),
    height 180ms var(--ease-standard, ease);
  pointer-events: none;
}

.tour__bubble {
  position: absolute;
  box-sizing: border-box;
  padding: 14px;
  border-radius: 14px;
  background: var(--bg-card);
  box-shadow: var(--sh-3);
  color: var(--text-1);
}

.tour__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tour__step {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 11px;
  font-weight: 700;
}

.tour__skip {
  min-height: 32px;
  padding: 0 8px;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 12px;
}

.tour__title {
  margin: 10px 0 0;
  font-size: 15px;
  font-weight: 800;
}

.tour__desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}

.tour__ops {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.tour__prev,
.tour__next {
  flex: 1;
  height: 36px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.tour__prev {
  background: var(--bg-page);
  color: var(--text-2);
}

.tour__prev:disabled {
  opacity: 0.5;
}

.tour__next {
  background: var(--grad-brand);
  color: #fff;
}

@media (prefers-reduced-motion: reduce) {
  .tour__hole {
    transition: none;
  }
}
</style>
