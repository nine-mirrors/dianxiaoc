<script setup lang="ts">
/**
 * AiFab —— AI 悬浮球 + 底部 AI 助手抽屉（W7 平台层）。
 *
 * 挂载位置：PhoneFrame 的 #overlay 插槽内（悬浮球落在机壳内，桌面演示不漂出画面）。
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

/** 悬浮球可见性：登录页 / 桌面端不出现 */
const visible = computed<boolean>(
  () =>
    !route.path.startsWith('/login') &&
    !route.path.startsWith('/manager') &&
    !route.path.startsWith('/admin'),
)

const open = ref<boolean>(false)
const turns = ref<Turn[]>([])
const question = ref<string>('')
const asking = ref<boolean>(false)
const listRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
let controller: AbortController | null = null

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
})

async function ask(): Promise<void> {
  const text = question.value.trim()
  if (!text || asking.value) return
  question.value = ''
  turns.value.push({ role: 'user', text })
  const ai: Turn = { role: 'ai', text: '', source: null }
  turns.value.push(ai)
  asking.value = true
  scrollToEnd()

  controller = new AbortController()
  const result = await streamKnowledgeAsk(text, (delta) => {
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
  <div v-if="visible" class="aifab">
    <!-- AI 悬浮球：右下角，高于 TabBar -->
    <button
      v-if="!open"
      type="button"
      class="aifab__ball u-tap"
      aria-label="打开店小C AI 助手"
      @click="openDrawer"
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

/* ── 悬浮球 ── */
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
