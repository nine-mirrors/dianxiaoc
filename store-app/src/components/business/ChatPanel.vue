<script setup lang="ts">
/**
 * AI 多轮追问对话面板（PRD 4.4-F / T04.4）。
 *
 * 6 组预设问答全文 + 快捷问题 chips + 输入框 + 打字机效果（400ms/句）。
 * 命中带 highlightSection 的答案时向上抛出，由 P4 滚动到行动方案并高亮。
 */
import { ref, computed, watch, nextTick } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import { useTypewriter } from '@/composables/useTypewriter'
import { postChat, getChatSuggestions, streamChat } from '@/api'
import { aiBadgeOf, type AiSource } from '@/domain/constants'
import type { ChatMessage, Diagnosis } from '@/types'

interface Props {
  diagnosis: Diagnosis
  /** 只读历史态：隐藏输入与快捷问题 */
  readonly?: boolean
}
const props = withDefaults(defineProps<Props>(), { diagnosis: () => ({}) as Diagnosis, readonly: false })

const emit = defineEmits<{ (e: 'highlight', section: 'plan' | 'risk'): void }>()

/** 对话历史 */
const messages = ref<ChatMessage[]>([])
/**
 * ★ A2：最近一条 AI 回复的来源（llm / fallback / null）。
 * 决定气泡角标措辞 —— 降级时不标「AI」，避免答辩被戳穿。
 */
const replySource = ref<AiSource | null>(null)
/** 角标配置（computed 统一取文案，三处页面口径一致） */
const replyBadge = computed(() => aiBadgeOf(replySource.value))
/** 快捷问题 chips */
const chips = ref<string[]>([])
/** 输入框内容 */
const draft = ref<string>('')
/** 是否等待 AI 回复 */
const pending = ref<boolean>(false)
/** 打字机输出的 AI 气泡 id（其余为已完成的静态气泡） */
const typingId = ref<string>('')
/** 正在流式（SSE）输出的 AI 气泡 id（光标据此保留，直到流结束） */
const streamingId = ref<string>('')

const { display, typing, play, finish } = useTypewriter({ charInterval: 26, sentenceInterval: 400 })

/** 当前正在打字输出的完整文本（用于「跳过」时一次性补全） */
const resText = ref<string>('')

/** 消息列表容器引用（用于自动滚动到底） */
const listRef = ref<HTMLElement | null>(null)

/** 预置开场：AI 主动给出本店的一句话结论 */
function seedOpening(): void {
  const d = props.diagnosis
  if (!d?.health) return
  messages.value = [
    {
      id: 'seed-ai',
      role: 'ai',
      content: `这家店 AI 健康分 ${d.health.score} 分，共发现 ${d.issues?.length ?? 0} 个问题，其中最关键的是「${d.issues?.[0]?.title ?? '陈列待优化'}」。`,
      createdAt: Date.now(),
    },
  ]
}

/** 开场引导：把「可以接着问」从死文本变成真按钮（点一下直接发问） */
const openerPrompts = ref<string[]>([])

/** 点击引导问题（复用 send；发完即隐藏，避免重复提问） */
function askSuggested(q: string): void {
  // ⚠ 这里必须用 props.readonly：defineProps 的返回值存在 props 对象上，
  //   模板里能直接写 `readonly` 是编译器帮忙解构的，但**脚本里写裸 readonly 是未定义变量**
  //   （运行到这条分支会抛 ReferenceError: readonly is not defined）。
  if (pending.value || props.readonly) return
  openerPrompts.value = []
  void send(q)
}

watch(() => props.diagnosis?.id, seedOpening, { immediate: true })

/** 拉取快捷问题 chips */
async function loadChips(): Promise<void> {
  try {
    const res = await getChatSuggestions(String(props.diagnosis?.id ?? ''))
    chips.value = res.suggestions?.slice(0, 4) ?? []
    // 开场引导优先给「行动类」问题（补多少 / 怎么说 / 先做哪件），比泛问更能带出价值
    const prefer = ['该补多少？', '跟店主怎么说？', '这家店我最该先做哪一件？']
    const all = res.suggestions ?? []
    openerPrompts.value = prefer.filter((q) => all.includes(q))
  } catch {
    chips.value = []
    openerPrompts.value = []
  }
}
watch(() => props.diagnosis?.id, loadChips, { immediate: true })

/** 滚动到底部 */
async function scrollToBottom(): Promise<void> {
  await nextTick()
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

/**
 * 发送一条消息（或点击快捷问题）。
 *
 * @param text 用户输入
 */
async function send(text: string): Promise<void> {
  const content = (text ?? '').trim()
  if (!content || pending.value) return

  messages.value = [
    ...messages.value,
    { id: `u-${Date.now()}`, role: 'user', content, createdAt: Date.now() },
  ]
  draft.value = ''
  pending.value = true
  await scrollToBottom()

  const id = `a-${Date.now()}`
  messages.value = [...messages.value, { id, role: 'ai', content: '', createdAt: Date.now() }]
  const payload = {
    diagnosisId: String(props.diagnosis?.id ?? ''),
    message: content,
    history: messages.value,
  }

  // 真流式（SSE）：逐段追加 + 保留光标，流结束才移除
  streamingId.value = id
  let fullText = ''
  let count = 0
  try {
    const res = await streamChat(payload, (delta) => {
      fullText += delta
      count += 1
      if (count > 1) {
        messages.value = messages.value.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m))
        scrollToBottom()
      }
    })
    // ★ A2：如实记录本条回复的来源，供气泡角标显示（llm 才标「AI」）
    replySource.value = res.source

    if (count <= 1) {
      // 降级（后端不可达 / 无 key）：单帧整段返回，用打字机逐字播放，保留「可跳过」
      const text = fullText || '这块我会结合你店里近 4 周的动销数据一起看，建议你现场先跟区域经理王敏确认一下。'
      streamingId.value = ''
      typingId.value = id
      resText.value = text
      await play(text)
      messages.value = messages.value.map((m) => (m.id === id ? { ...m, content: text } : m))
      typingId.value = ''
      await scrollToBottom()
    }
  } catch {
    streamingId.value = ''
    // 网络异常：来源未知（角标不宣称 AI）
    replySource.value = null
    const fb = '这块我会结合你店里近 4 周的动销数据一起看，建议你现场先跟区域经理王敏确认一下。'
    messages.value = messages.value.map((m) => (m.id === id ? { ...m, content: fb } : m))
    await scrollToBottom()
  } finally {
    streamingId.value = ''
    pending.value = false
    await scrollToBottom()
  }
}

/**
 * 点击「跳过打字动画」：立即补全全文并结束等待态。
 *
 * ⚠ 必须同时把内容写回 messages 并复位 pending，
 *    因为被跳过的 play() promise 永远不会 resolve，后续语句不会执行。
 */
function skip(): void {
  const id = typingId.value
  if (!id) return
  const target = messages.value.find((m) => m.id === id)
  if (!target) return
  const full = resText.value
  finish(full)
  messages.value = messages.value.map((m) => (m.id === id ? { ...m, content: full } : m))
  typingId.value = ''
  pending.value = false
}

</script>

<template>
  <div class="chat">
    <!-- 气泡列表 -->
    <div ref="listRef" class="chat__list">
      <div
        v-for="m in messages"
        :key="m.id"
        class="chat__row"
        :class="m.role === 'user' ? 'chat__row--user' : 'chat__row--ai'"
      >
        <span v-if="m.role === 'ai'" class="chat__avatar"><AppIcon name="sparkles" :size="13" color="#fff" /></span>
        <div class="chat__bubble">
          <!-- ★ A2：角标按真实来源措辞（fallback 不标「AI」） -->
          <p v-if="m.role === 'ai'" class="chat__bubble-head">
            <AiBadge v-if="replySource === 'llm'" text="AI 巡检助手" />
            <span v-else class="chat__src chat__src--std">{{ replyBadge.text }}</span>
          </p>
          <p class="chat__text">{{ m.id === typingId ? display : m.content }}</p>
          <span v-if="m.id === typingId && typing" class="chat__caret" />
          <span v-else-if="m.id === streamingId" class="chat__caret" />
        </div>
      </div>

      <div v-if="pending && !typing && !streamingId" class="chat__row chat__row--ai">
        <span class="chat__avatar"><AppIcon name="sparkles" :size="13" color="#fff" /></span>
        <div class="chat__bubble chat__bubble--thinking">
          <i /><i /><i />
        </div>
      </div>
    </div>

    <!-- 开场引导：可点击的快捷追问（替代原「你可以在下面接着问」的死文本） -->
    <div v-if="!readonly && openerPrompts.length" class="chat__opener">
      <p class="chat__opener-tip">你可以直接问：</p>
      <div class="chat__opener-row">
        <button
          v-for="q in openerPrompts"
          :key="q"
          class="chat__opener-btn"
          :disabled="pending"
          @click="askSuggested(q)"
        >
          {{ q }}
        </button>
      </div>
    </div>

    <!-- 跳过动画 -->
    <button v-if="typing" class="chat__skip" @click="skip">跳过打字机 →</button>

    <!-- 快捷问题 chips -->
    <div v-if="!readonly && chips.length" class="chat__chips">
      <button
        v-for="c in chips"
        :key="c"
        class="chat__chip"
        :disabled="pending"
        @click="send(c)"
      >
        {{ c }}
      </button>
    </div>

    <!-- 输入区 -->
    <div v-if="!readonly" class="chat__input">
      <input
        v-model="draft"
        class="chat__field"
        placeholder="问点别的…"
        :disabled="pending"
        @keydown.enter="send(draft)"
      />
      <button class="chat__send" :disabled="pending || !draft.trim()" @click="send(draft)">
        发送
        <AppIcon name="sparkles" :size="12" color="#fff" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
}

.chat__list {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}

.chat__row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.chat__row--user {
  justify-content: flex-end;
}

.chat__avatar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
}

.chat__bubble {
  position: relative;
  max-width: 76%;
  padding: 8px 11px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.72;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat__row--ai .chat__bubble {
  background: var(--ai-purple-light);
  border-top-left-radius: 4px;
  color: var(--text-1);
}

.chat__row--user .chat__bubble {
  background: var(--mn-green);
  color: #fff;
  border-top-right-radius: 4px;
}

.chat__bubble-head {
  margin-bottom: 4px;
}

/* A2：非大模型来源的角标（中性灰，不用 AI 紫，避免误导） */
.chat__src {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.chat__src--std {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-3);
}

.chat__caret {
  display: inline-block;
  width: 6px;
  height: 13px;
  margin-left: 2px;
  background: var(--ai-purple);
  animation: caret 0.9s steps(1) infinite;
  vertical-align: -2px;
}

@keyframes caret {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}

.chat__bubble--thinking {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px;
}

.chat__bubble--thinking i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ai-purple);
  animation: blink 1.1s ease infinite;
}

.chat__bubble--thinking i:nth-child(2) {
  animation-delay: 0.18s;
}
.chat__bubble--thinking i:nth-child(3) {
  animation-delay: 0.36s;
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}

.chat__skip {
  align-self: flex-end;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--ai-purple);
  font-size: 11px;
}

.chat__opener {
  margin: 8px 10px 2px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f4f8f6;
  border: 1px solid #e6efe9;
}

.chat__opener-tip {
  margin: 0 0 6px;
  font-size: 11.5px;
  color: var(--text-3, #6b7280);
}

.chat__opener-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat__opener-btn {
  padding: 5px 10px;
  border: 1px solid var(--mn-green, #009639);
  border-radius: 999px;
  background: #fff;
  color: var(--mn-green-dark, #0a7d43);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
}

.chat__opener-btn:hover {
  background: var(--mn-green, #009639);
  color: #fff;
}

.chat__opener-btn:active {
  transform: scale(0.96);
}

.chat__opener-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.chat__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chat__chip {
  padding: 5px 10px;
  border: 1px solid var(--ai-purple);
  border-radius: 999px;
  background: #fff;
  color: var(--ai-purple);
  font-size: 11.5px;
  font-weight: 500;
}

.chat__chip:disabled {
  opacity: 0.5;
}

.chat__input {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.chat__field {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
  outline: none;
}

.chat__field:focus {
  border-color: var(--ai-purple);
}

.chat__send {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.chat__send:disabled {
  opacity: 0.45;
}
</style>
