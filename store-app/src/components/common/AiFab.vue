<script setup lang="ts">
/**
 * AiFab —— AI 悬浮球 + 底部 AI 助手抽屉（W7 平台层）。
 *
 * 挂载位置：App.vue 顶层，两种设备形态各挂一处（移动形态在 .dxc-mobile-full 内、
 *          桌面形态在 RouterView 之外），固定于窗口右下角，随形态共存。
 * 显示条件：非 /login、非 /manager、非 /admin（组件内部自判，App.vue 不做业务判断）。
 *
 * 能力：
 *  - 内联知识问答：POST /api/v1/knowledge/ask（SSE 真流式），
 *    生成中只显示奶滴图标（不出现「AI 生成中」文字），完成后**如实标注来源**：
 *      source === 'llm' → 「AI 生成」；否则 → 「标准答案库」；
 *  - 集成 VoiceButton（不支持语音的浏览器整钮隐藏）；
 *  - 按角色给出快捷入口；
 *  - 所有失败走 Toast 友好文案，不抛裸错、不白屏。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import VoiceButton from '@/components/common/VoiceButton.vue'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { streamKnowledgeAsk } from '@/api/insights'
import type { Role } from '@/types'

interface Turn {
  role: 'user' | 'ai'
  text: string
  source?: 'llm' | 'fallback' | null
}

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 悬浮球可见性：登录页 / 桌面端 / 移动门户不出现（门户自带 AI 问答 tab） */
const visible = computed<boolean>(
  () =>
    !route.path.startsWith('/login') &&
    !route.path.startsWith('/manager') &&
    !route.path.startsWith('/admin') &&
    !route.path.startsWith('/m'),
)

const open = ref<boolean>(false)
const turns = ref<Turn[]>([])
const question = ref<string>('')
const asking = ref<boolean>(false)
const listRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
let controller: AbortController | null = null

/* ── 等待首字期间的分阶段拟人话术（知识库口径）：提问后每 900ms 换一句，
   首字到达 / 请求结束 / 关闭抽屉 / 卸载时立即清除定时器与文案 ── */
const WAIT_PHRASES = ['正在标准答案库里查找…', '在比对最相关的操作指引…', '马上就好，整理成大白话…']
const waitPhrase = ref<string>('')
let waitTimer: number | undefined
let waitIndex = 0

function startWaitPhrases(): void {
  stopWaitPhrases()
  waitIndex = 0
  waitPhrase.value = WAIT_PHRASES[0]
  // 尊重系统「减弱动态效果」：只静态显示首条，不做轮换
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  waitTimer = window.setInterval(() => {
    if (waitIndex >= WAIT_PHRASES.length - 1) return
    waitIndex += 1
    waitPhrase.value = WAIT_PHRASES[waitIndex]
  }, 900)
}

function stopWaitPhrases(): void {
  if (waitTimer !== undefined) {
    window.clearInterval(waitTimer)
    waitTimer = undefined
  }
  waitPhrase.value = ''
}

/* ═══════════════ 悬浮球拖拽 ═══════════════
 * pointer 事件统一处理鼠标/触摸；位移超过阈值才算拖拽，否则视为点击打开抽屉；
 * 松手后自动吸到最近的左右边缘；位置存 localStorage，下次进来保持。
 * 坐标基准是 .aifab 容器（absolute inset:0，与手机屏可视区同尺寸）。 */
const POS_KEY = 'dxc:aifab-pos'
const BALL_SIZE = 52
const MARGIN = 12
const BOTTOM_SAFE = 76 // 避开底部 TabBar
const DRAG_THRESHOLD = 6

const rootRef = ref<HTMLElement | null>(null)
const ballRef = ref<HTMLButtonElement | null>(null)
/** 定位状态：null=用 CSS 默认右下；有值=显式 left/top（px） */
const pos = ref<{ x: number; y: number } | null>(loadPos())
const dragging = ref<boolean>(false)
/** 松手后吸附边缘的过渡动画（拖拽中关闭，跟手无延迟） */
const settling = ref<boolean>(false)

let startX = 0
let startY = 0
let originX = 0
let originY = 0
let moved = false
let activePointer: number | null = null
/** 刚结束拖拽时短暂吞掉尾随的 click，避免拖完误开抽屉 */
let suppressClick = false
let suppressTimer: number | undefined

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return { x: p.x, y: p.y }
  } catch {
    /* 脏数据忽略 */
  }
  return null
}

function savePos(): void {
  if (!pos.value) return
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos.value))
  } catch {
    /* 隐私模式等：静默 */
  }
}

/** 当前球的左上角坐标（无显式位置时按默认右下换算） */
function currentXY(container: HTMLElement): { x: number; y: number } {
  if (pos.value) return { x: pos.value.x, y: pos.value.y }
  return { x: container.clientWidth - MARGIN - BALL_SIZE, y: container.clientHeight - BOTTOM_SAFE - BALL_SIZE }
}

function clamp(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, MARGIN), Math.max(MARGIN, w - MARGIN - BALL_SIZE)),
    y: Math.min(Math.max(y, MARGIN), Math.max(MARGIN, h - MARGIN - BALL_SIZE)),
  }
}

function onPointerDown(e: PointerEvent): void {
  const container = rootRef.value
  const ball = ballRef.value
  if (!container || !ball) return
  activePointer = e.pointerId
  const cur = currentXY(container)
  startX = e.clientX
  startY = e.clientY
  originX = cur.x
  originY = cur.y
  moved = false
  settling.value = false
  try {
    ball.setPointerCapture?.(e.pointerId)
  } catch {
    /* 合成事件等场景无活动指针：不影响 window 级 move/up 监听 */
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(e: PointerEvent): void {
  if (activePointer !== e.pointerId) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
  if (!moved) {
    moved = true
    dragging.value = true
  }
  const container = rootRef.value
  if (!container) return
  const next = clamp(originX + dx, originY + dy, container.clientWidth, container.clientHeight)
  pos.value = next
}

function onPointerUp(e: PointerEvent): void {
  if (activePointer !== e.pointerId) return
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  activePointer = null
  try {
    ballRef.value?.releasePointerCapture?.(e.pointerId)
  } catch {
    /* 无活动指针时静默 */
  }

  if (!moved) {
    // 点击：不在这里打开，交给随后的 click 事件（onBallClick）
    dragging.value = false
    return
  }

  // 发生了拖拽：吞掉松手后浏览器/自动化补派发的 click，防止误开抽屉
  suppressClick = true
  if (suppressTimer !== undefined) window.clearTimeout(suppressTimer)
  suppressTimer = window.setTimeout(() => {
    suppressClick = false
    suppressTimer = undefined
  }, 300)

  // 吸附最近的左右边缘
  const container = rootRef.value
  if (container && pos.value) {
    settling.value = true
    const cur = clamp(pos.value.x, pos.value.y, container.clientWidth, container.clientHeight)
    const nearLeft = cur.x + BALL_SIZE / 2 < container.clientWidth / 2
    const targetX = nearLeft ? MARGIN : container.clientWidth - MARGIN - BALL_SIZE
    pos.value = { x: targetX, y: cur.y }
    savePos()
    window.setTimeout(() => (settling.value = false), 220)
  }
  dragging.value = false
}

/** 点击打开抽屉；拖拽后的合成 click 被抑制 */
function onBallClick(): void {
  if (suppressClick) return
  openDrawer()
}

/** 窗口尺寸变化（真机旋转/模拟器缩放）时把球收回可视区 */
function onResize(): void {
  const container = rootRef.value
  if (!container || !pos.value) return
  pos.value = clamp(pos.value.x, pos.value.y, container.clientWidth, container.clientHeight)
}
window.addEventListener('resize', onResize)

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  if (suppressTimer !== undefined) window.clearTimeout(suppressTimer)
})

/** 球的内联定位样式：有显式位置时 left/top，否则交给 CSS 默认右下 */
const ballStyle = computed<Record<string, string>>(() => {
  if (!pos.value) return {}
  return {
    left: `${pos.value.x}px`,
    top: `${pos.value.y}px`,
    right: 'auto',
    bottom: 'auto',
    transition: settling.value ? 'left 200ms ease, top 200ms ease' : 'none',
  }
})

/** 快捷入口（按角色） */
const shortcuts = computed<{ label: string; desc: string; icon: string; path: string }[]>(() => {
  const role: Role = session.role
  if (role === 'rep') {
    return [
      { label: '去拍照诊断', desc: '拍货架找问题', icon: 'camera', path: '/rep/capture/S3' },
      { label: '知识库', desc: '标准答案速查', icon: 'clipboard', path: '/rep/knowledge' },
    ]
  }
  if (role === 'owner') {
    return [
      { label: '自助诊断', desc: '门店快速体检', icon: 'camera', path: '/owner' },
      { label: '补货模拟', desc: '算算该补多少', icon: 'cart', path: '/owner/restock' },
    ]
  }
  return [{ label: '知识库', desc: '标准答案速查', icon: 'clipboard', path: '/rep/knowledge' }]
})

function scrollToEnd(): void {
  void nextTick(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function openDrawer(): void {
  open.value = true
  void nextTick(() => inputRef.value?.focus())
}

function closeDrawer(): void {
  open.value = false
  if (controller) {
    controller.abort()
    controller = null
  }
  asking.value = false
  stopWaitPhrases()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) closeDrawer()
}

watch(open, (v) => {
  if (v) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (controller) controller.abort()
  stopWaitPhrases()
})

async function ask(): Promise<void> {
  const text = question.value.trim()
  if (!text || asking.value) return
  question.value = ''
  turns.value.push({ role: 'user', text })
  const ai: Turn = { role: 'ai', text: '', source: null }
  turns.value.push(ai)
  asking.value = true
  startWaitPhrases()
  scrollToEnd()

  controller = new AbortController()
  try {
    const result = await streamKnowledgeAsk(text, (delta) => {
      // 首字到达：话术与定时器立刻退场
      if (waitPhrase.value) stopWaitPhrases()
      ai.text += delta
      scrollToEnd()
    }, { role: session.role, signal: controller.signal })
    controller = null
    asking.value = false
    ai.source = result.source

    if (!result.ok && !ai.text) {
      ai.text = '暂时没能获取到回答，请稍后再试。'
      toast.error('AI 助手暂时联系不上，请稍后再试')
    }
    scrollToEnd()
  } finally {
    // 请求结束 / 被 abort（关闭抽屉）都保证定时器被清理
    stopWaitPhrases()
  }
}

/** 语音输入结果落回输入框；失败交给 Toast（不抛裸错） */
function onVoiceResult(text: string): void {
  question.value = text
  inputRef.value?.focus()
}
function onVoiceError(message: string): void {
  toast.error(message)
}

function go(path: string): void {
  closeDrawer()
  void router.push(path)
}
</script>

<template>
  <div v-if="visible" ref="rootRef" class="aifab">
    <!-- AI 悬浮球：可拖动，松手吸附左右边缘；短按（位移<6px）为点击打开 -->
    <button
      v-if="!open"
      ref="ballRef"
      type="button"
      class="aifab__ball u-tap"
      :class="{ 'is-dragging': dragging }"
      :style="ballStyle"
      aria-label="打开店小C AI 助手（可拖动）"
      @pointerdown="onPointerDown"
      @click="onBallClick"
    >
      <span class="aifab__glow" aria-hidden="true" />
      <AppIcon name="sparkles" :size="24" color="#ffffff" />
    </button>

    <!-- 底部 AI 助手抽屉 -->
    <template v-if="open">
      <div class="aifab__mask" @click.self="closeDrawer" />
      <section class="aifab__sheet" role="dialog" aria-modal="true" aria-label="店小C AI 助手">
        <header class="aifab__head">
          <span class="aifab__brand">
            <span class="aifab__brand-dot" aria-hidden="true">
              <AppIcon name="milk" :size="14" color="#ffffff" />
            </span>
            店小C AI 助手
          </span>
          <button type="button" class="aifab__close u-tap" aria-label="关闭" @click="closeDrawer">
            <AppIcon name="close" :size="18" color="var(--text-2)" />
          </button>
        </header>

        <!-- 快捷入口 -->
        <div class="aifab__shortcuts">
          <button
            v-for="s in shortcuts"
            :key="s.path"
            type="button"
            class="aifab__sc u-tap"
            @click="go(s.path)"
          >
            <span class="aifab__sc-icon"><AppIcon :name="s.icon" :size="17" color="var(--mn-green)" /></span>
            <span class="aifab__sc-text">
              <b>{{ s.label }}</b>
              <em>{{ s.desc }}</em>
            </span>
          </button>
        </div>

        <!-- 内联问答 -->
        <div ref="listRef" class="aifab__list">
          <p v-if="!turns.length" class="aifab__hint">
            问点终端执行的实操问题，例如「黄金陈列位怎么摆？」「缺货了先做什么？」
          </p>
          <div v-for="(t, i) in turns" :key="i" class="aifab__turn" :class="`aifab__turn--${t.role}`">
            <p v-if="t.text" class="aifab__bubble">{{ t.text }}</p>
            <span v-if="t.role === 'ai' && asking && i === turns.length - 1" class="aifab__loading">
              <MilkDropLoader size="button" label="" />
            </span>
            <span
              v-else-if="t.role === 'ai' && t.source"
              class="aifab__src"
              :class="{ 'aifab__src--ai': t.source === 'llm' }"
            >
              {{ t.source === 'llm' ? 'AI 生成' : '标准答案库' }}
            </span>
          </div>
        </div>

        <!-- 输入区 -->
        <form class="aifab__input" @submit.prevent="ask">
          <input
            ref="inputRef"
            v-model="question"
            class="aifab__field"
            type="text"
            placeholder="输入你的问题…"
            :disabled="asking"
            aria-label="输入问题"
          />
          <VoiceButton @result="onVoiceResult" @error="onVoiceError" />
          <button type="submit" class="aifab__send u-tap" :disabled="asking || !question.trim()" aria-label="发送">
            <AppIcon name="send" :size="18" color="#ffffff" />
          </button>
        </form>
      </section>
    </template>
  </div>
</template>

<style scoped>
.aifab {
  position: absolute;
  inset: 0;
  /* 浮层本身不吃事件，仅子元素按需开启 */
  pointer-events: none;
  z-index: 40;
}

/* ── 悬浮球（默认右下；拖拽后由内联 left/top 接管） ── */
.aifab__ball {
  position: absolute;
  right: 16px;
  bottom: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--grad-brand);
  box-shadow: var(--sh-brand);
  pointer-events: auto;
  /* 触摸拖拽时不触发页面滚动/下拉刷新；鼠标保持默认 */
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}

.aifab__ball.is-dragging {
  cursor: grabbing;
  transform: scale(1.08);
  box-shadow: var(--sh-3);
}

.aifab__ball.is-dragging .aifab__glow {
  animation: none;
  opacity: 0;
}

.aifab__glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--mn-green);
  opacity: 0.4;
  animation: aifab-breath 2.6s ease-in-out infinite;
}

@keyframes aifab-breath {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.34;
  }

  50% {
    transform: scale(1.35);
    opacity: 0;
  }
}

/* ── 抽屉 ── */
.aifab__mask {
  position: absolute;
  inset: 0;
  background: var(--bg-mask);
  pointer-events: auto;
  animation: aifab-fade 180ms var(--ease-standard, ease) both;
}

.aifab__sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  max-height: 72%;
  padding: 14px 14px 16px;
  border-radius: 20px 20px 0 0;
  background: var(--bg-card);
  box-shadow: var(--sh-3);
  pointer-events: auto;
  animation: aifab-up 260ms var(--ease-decel, ease) both;
}

@keyframes aifab-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes aifab-up {
  from {
    transform: translateY(100%);
  }

  to {
    transform: translateY(0);
  }
}

.aifab__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
}

.aifab__brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.aifab__brand-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--grad-brand);
}

.aifab__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: none;
}

/* ── 快捷入口 ── */
.aifab__shortcuts {
  display: flex;
  gap: 10px;
  flex: none;
  margin-top: 12px;
}

.aifab__sc {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-subtle, var(--bg-page));
  text-align: left;
}

.aifab__sc-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--mn-green-light);
}

.aifab__sc-text {
  min-width: 0;
}

.aifab__sc-text b {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-1);
}

.aifab__sc-text em {
  display: block;
  font-style: normal;
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 问答列表 ── */
.aifab__list {
  flex: 1;
  min-height: 88px;
  margin-top: 12px;
  padding: 2px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.aifab__hint {
  padding: 10px 4px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-3);
}

.aifab__turn {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aifab__turn--user {
  align-items: flex-end;
}

.aifab__bubble {
  max-width: 84%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.aifab__turn--user .aifab__bubble {
  background: var(--mn-green);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.aifab__turn--ai .aifab__bubble {
  background: var(--bg-subtle, var(--bg-page));
  color: var(--text-1);
  border-bottom-left-radius: 4px;
}

.aifab__loading {
  display: inline-flex;
  align-self: flex-start;
  transform: scale(0.72);
  transform-origin: left center;
}

.aifab__src {
  align-self: flex-start;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 600;
}

.aifab__src--ai {
  background: var(--ai-mist);
  color: var(--ai);
}

/* ── 输入区 ── */
.aifab__input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-top: 12px;
}

.aifab__field {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13px;
  outline: none;
}

.aifab__field:focus-visible {
  border-color: var(--mn-green);
}

.aifab__send {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--grad-brand);
}

.aifab__send:disabled {
  opacity: 0.45;
}

@media (prefers-reduced-motion: reduce) {
  .aifab__glow {
    animation: none;
    opacity: 0.28;
  }

  .aifab__mask,
  .aifab__sheet {
    animation: none;
  }
}
</style>
