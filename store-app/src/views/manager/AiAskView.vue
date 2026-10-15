<script setup lang="ts">
/**
 * AiAskView（/manager/ask）—— ChatBI 经理 AI 经营问答。
 *
 * 数据流：`POST /ai-insights/ask` 真 SSE，逐字渲染；
 * 结束帧的 source 决定角标文案（llm →「AI 生成 · qwen」，fallback →「规则兜底」），
 * 这是本项目「数字可追溯 / 答辩防穿帮」的硬要求：降级路径也会发 delta，
 * 只看「有没有增量」就标 AI 会穿帮，必须以 done 帧的 source 为准。
 *
 * 支持 `?q=` 预填并自动提问（便于从看板跳转提问）。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { getAskSuggestions, streamAiAsk } from '@/api/insights'

const route = useRoute()
const session = useSessionStore()
const { success, info, error: toastError } = useToast()

interface Msg {
  id: number
  role: 'user' | 'ai'
  text: string
  /** null = 未拿到来源标注 */
  source: 'llm' | 'fallback' | null
  streaming: boolean
}

let seq = 0
const messages = ref<Msg[]>([])
const input = ref<string>('')
const sending = ref<boolean>(false)
const suggestions = ref<string[]>([])
const scrollRef = ref<HTMLElement | null>(null)
let controller: AbortController | null = null

/** 来源角标文案（如实标注，不夸大） */
function sourceLabel(m: Msg): string {
  if (m.source === 'llm') return 'AI 生成 · qwen'
  if (m.source === 'fallback') return '规则兜底（未配置大模型 Key）'
  return '未获取来源标注'
}

/** 滚到最新一条 */
function scrollToBottom(): void {
  void nextTick(() => {
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** 组装附加上下文（取最近几轮问答，后端最多收 300 字） */
function buildContext(): string {
  return messages.value
    .slice(-4)
    .map((m) => `${m.role === 'user' ? '经理问' : '店小C答'}：${m.text}`)
    .join('　|　')
    .slice(0, 300)
}

/** 发送一个问题（chips 点击 / 输入框 / ?q= 预填共用） */
async function ask(raw: string): Promise<void> {
  const question = String(raw || '').trim()
  if (!question || sending.value) return
  messages.value.push({ id: ++seq, role: 'user', text: question, source: null, streaming: false })
  input.value = ''
  const aiMsg: Msg = { id: ++seq, role: 'ai', text: '', source: null, streaming: true }
  messages.value.push(aiMsg)
  sending.value = true
  scrollToBottom()

  controller = new AbortController()
  try {
    const res = await streamAiAsk(
      question,
      (delta) => {
        aiMsg.text += delta
        scrollToBottom()
      },
      { context: buildContext(), signal: controller.signal },
    )
    aiMsg.source = res.source
    aiMsg.streaming = false
    if (!res.ok && !aiMsg.text) {
      aiMsg.text = '暂时拿不到回答：后端未连接或服务异常，请稍后重试。'
      toastError('AI 问答失败，请稍后重试')
    }
  } catch {
    aiMsg.streaming = false
    aiMsg.text = aiMsg.text || '请求被中断或失败，请重试。'
    toastError('AI 问答失败，请稍后重试')
  } finally {
    sending.value = false
    controller = null
    scrollToBottom()
  }
}

/** 清空对话 */
function clearChat(): void {
  if (sending.value) controller?.abort()
  messages.value = []
  info('对话已清空')
}

/** 复制最后一条 AI 回答 */
async function copyLast(): Promise<void> {
  const last = [...messages.value].reverse().find((m) => m.role === 'ai' && m.text)
  if (!last) {
    info('暂无可复制的回答')
    return
  }
  try {
    await navigator.clipboard.writeText(last.text)
    success('已复制回答')
  } catch {
    toastError('复制失败，请手动选择文本')
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void ask(input.value)
  }
}

onMounted(async () => {
  try {
    suggestions.value = await getAskSuggestions()
  } catch {
    suggestions.value = []
  }
  const q = route.query.q
  if (q) void ask(String(q))
})

onBeforeUnmount(() => {
  controller?.abort()
})
</script>

<template>
  <div class="ask">
    <h1 class="u-sr-only">AI 经营问答</h1>

    <DesktopHeader
      :region-ids="[]"
      region-id=""
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @switch-role="() => {}"
      @change-region="() => {}"
    />

    <div class="ask__body">
      <!-- 左栏：高频问题 chips + 使用说明 -->
      <aside class="ask__aside">
        <section class="u-card ask__side-card">
          <header class="ask__side-head">
            <AppIcon name="sparkles" :size="15" color="var(--ai-purple)" />
            <h2>高频问题</h2>
          </header>
          <p class="ask__side-hint">点击即问，问题会结合本区域真实看板数据回答。</p>
          <div class="ask__chips">
            <button
              v-for="s in suggestions"
              :key="s"
              type="button"
              class="ask__chip"
              :disabled="sending"
              @click="ask(s)"
            >
              {{ s }}
            </button>
            <p v-if="!suggestions.length" class="ask__side-hint">问题清单加载失败，可直接在右侧输入。</p>
          </div>
        </section>

        <section class="u-card ask__side-card">
          <header class="ask__side-head">
            <AppIcon name="shield" :size="15" color="var(--mn-green)" />
            <h2>回答口径</h2>
          </header>
          <p class="ask__side-hint">
            所有数字来自区域看板与作业数据的真实底稿；模型只能引用底稿数字，不编造、不估算。
            未配置大模型 Key 时走规则兜底，页面会如实标注来源。
          </p>
        </section>
      </aside>

      <!-- 右栏：对话流 -->
      <section class="u-card ask__chat">
        <header class="ask__chat-head">
          <h2 class="ask__chat-title">
            <AppIcon name="message" :size="16" />
            经营问答
          </h2>
          <div class="ask__chat-actions">
            <button type="button" class="ask__mini-btn" @click="copyLast">
              <AppIcon name="clipboard" :size="13" /> 复制回答
            </button>
            <button type="button" class="ask__mini-btn" :disabled="!messages.length" @click="clearChat">
              <AppIcon name="trash" :size="13" /> 清空对话
            </button>
          </div>
        </header>

        <div ref="scrollRef" class="ask__stream u-scroll-y">
          <EmptyState
            v-if="!messages.length"
            icon="sparkles"
            title="问点什么吧"
            desc="例如「这周健康分为什么下降」「哪三家店今天最该去」；也可以从左侧高频问题一键提问。"
          />

          <div v-for="m in messages" :key="m.id" class="ask__turn" :class="`ask__turn--${m.role}`">
            <div class="ask__bubble" :class="`ask__bubble--${m.role}`">
              <p class="ask__text">{{ m.text }}<span v-if="m.streaming" class="ask__caret" /></p>
            </div>
            <p v-if="m.role === 'ai' && !m.streaming" class="ask__source">
              {{ sourceLabel(m) }}
            </p>
          </div>
        </div>

        <footer class="ask__composer">
          <textarea
            v-model="input"
            class="ask__input"
            rows="2"
            placeholder="输入经营问题，Enter 发送 / Shift+Enter 换行"
            :disabled="sending"
            @keydown="onKeydown"
          />
          <div class="ask__send-wrap">
            <MilkDropLoader v-if="sending" size="button" label="" />
            <button
              v-else
              type="button"
              class="u-btn u-btn--primary ask__send"
              :disabled="!input.trim()"
              @click="ask(input)"
            >
              <AppIcon name="send" :size="15" /> 发送
            </button>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ask {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-page);
}

.ask__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  max-width: 1760px;
  width: 100%;
  margin: 0 auto;
  padding: 16px 24px 24px;
}

/* ── 左栏 ── */
.ask__aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.ask__side-card {
  padding: 14px 16px;
}

.ask__side-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.ask__side-head h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.ask__side-hint {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.65;
}

.ask__chips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.ask__chip {
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-subtle, var(--bg-page));
  color: var(--text-2);
  font-size: 12.5px;
  text-align: left;
  line-height: 1.4;
  transition: border-color var(--dur-fast) ease, color var(--dur-fast) ease, background var(--dur-fast) ease;
}

.ask__chip:hover:not(:disabled) {
  border-color: var(--ai-purple);
  color: var(--ai-purple);
}

.ask__chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 右栏：对话 ── */
.ask__chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px 16px;
}

.ask__chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.ask__chat-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.ask__chat-actions {
  display: flex;
  gap: 8px;
}

.ask__mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 3px 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  transition: border-color var(--dur-fast) ease, color var(--dur-fast) ease;
}

.ask__mini-btn:hover:not(:disabled) {
  border-color: var(--mn-green);
  color: var(--mn-green-dark);
}

.ask__mini-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ask__stream {
  flex: 1;
  min-height: 0;
  padding: 14px 2px;
}

.ask__turn {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

.ask__turn--user {
  align-items: flex-end;
}

.ask__turn--ai {
  align-items: flex-start;
}

.ask__bubble {
  max-width: 78%;
  padding: 10px 13px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.7;
}

.ask__bubble--user {
  background: var(--grad-brand);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ask__bubble--ai {
  background: var(--bg-subtle, var(--bg-page));
  border: 1px solid var(--border-color);
  color: var(--text-1);
  border-bottom-left-radius: 4px;
}

.ask__text {
  white-space: pre-wrap;
  word-break: break-word;
}

/* 流式光标 */
.ask__caret {
  display: inline-block;
  width: 7px;
  height: 14px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--ai-purple);
  animation: ask-blink 1s steps(2) infinite;
}

@keyframes ask-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.ask__source {
  margin-top: 5px;
  font-size: 11px;
  color: var(--text-3);
}

/* ── 输入区 ── */
.ask__composer {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.ask__input {
  flex: 1;
  min-height: 52px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-subtle, var(--bg-page));
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
}

.ask__input:focus {
  outline: none;
  border-color: var(--mn-green);
  box-shadow: 0 0 0 2px var(--mn-green-light);
}

.ask__send-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
}

.ask__send {
  height: 44px;
}

@media (max-width: 1024px) {
  .ask__body {
    grid-template-columns: 1fr;
  }

  .ask__aside {
    flex-direction: row;
  }
}
</style>
