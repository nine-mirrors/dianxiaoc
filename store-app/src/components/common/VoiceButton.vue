<script setup lang="ts">
/**
 * VoiceButton —— 语音输入按钮（Web Speech API 优雅降级）。
 *
 * 设计原则：
 *  - 浏览器不支持 SpeechRecognition（含 webkit 前缀）时**整个按钮不渲染**（v-if=false），
 *    不抛错、不白屏、不阻塞调用方布局；
 *  - 交互采用「点击开始 → 再点结束」（拇指触控更稳，避免长按误触页面滚动）；
 *  - 录音中显示脉冲光晕 + 秒数计时；识别结果通过 emit('result') 抛出，由调用方落地；
 *  - 任何失败（无麦克风权限 / 无网络 / 未识别到语音）走 emit('error')，文案由调用方 Toast，
 *    本组件不自行弹错、不吞错。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

/* ── 最小 SpeechRecognition 类型（DOM lib 未含，避免 any）── */
interface SpeechAltLike {
  transcript: string
}
interface SpeechResultLike {
  isFinal: boolean
  length: number
  [i: number]: SpeechAltLike
}
interface SpeechResultListLike {
  length: number
  [i: number]: SpeechResultLike
}
interface SpeechEventLike {
  results: SpeechResultListLike
}
interface SpeechErrorLike {
  error?: string
  message?: string
}
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechEventLike) => void) | null
  onerror: ((e: SpeechErrorLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface Props {
  /** 识别语言，默认简体中文 */
  lang?: string
  /** 可选：按钮旁文字说明（留空则纯图标） */
  label?: string
}
const props = withDefaults(defineProps<Props>(), {
  lang: 'zh-CN',
  label: '',
})
const emit = defineEmits<{
  (e: 'result', text: string): void
  (e: 'error', message: string): void
}>()

/** 解析浏览器构造函数（不一意孤行：不支持即整钮隐藏） */
function resolveCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

const SpeechCtor = resolveCtor()
const supported = computed<boolean>(() => typeof SpeechCtor === 'function')

/** 识别错误码 → 友好中文（由调用方 Toast） */
const ERROR_TEXT: Record<string, string> = {
  'not-allowed': '未获得麦克风权限，请在浏览器允许后重试',
  'service-not-allowed': '当前环境不允许使用麦克风',
  'no-speech': '没有听到语音，请靠近麦克风再试一次',
  'audio-capture': '未检测到麦克风设备',
  network: '语音服务网络异常，请稍后重试',
  aborted: '语音输入已取消',
}

const listening = ref<boolean>(false)
const seconds = ref<number>(0)
let rec: SpeechRecognitionLike | null = null
let timer: number | undefined
let collected = ''

function clearTimer(): void {
  if (timer !== undefined) {
    window.clearInterval(timer)
    timer = undefined
  }
}

function stop(): void {
  if (rec) {
    try {
      rec.stop()
    } catch {
      /* 未处于识别态时 stop 可能抛错，忽略 */
    }
  }
  listening.value = false
  clearTimer()
}

function start(): void {
  if (!SpeechCtor || listening.value) return
  let instance: SpeechRecognitionLike
  try {
    instance = new SpeechCtor()
  } catch {
    emit('error', '当前环境无法启动语音识别')
    return
  }
  rec = instance
  rec.lang = props.lang
  rec.interimResults = false
  rec.continuous = false
  rec.maxAlternatives = 1
  collected = ''
  rec.onresult = (e) => {
    const res = e.results?.[e.results.length - 1]
    if (!res) return
    let text = ''
    for (let i = 0; i < res.length; i += 1) text += res[i]?.transcript ?? ''
    collected = (collected + text).trim()
  }
  rec.onerror = (e) => {
    listening.value = false
    clearTimer()
    emit('error', ERROR_TEXT[e?.error ?? ''] ?? '语音识别失败，请改用文字输入')
  }
  rec.onend = () => {
    listening.value = false
    clearTimer()
    if (collected) emit('result', collected)
  }
  try {
    rec.start()
  } catch {
    listening.value = false
    emit('error', '麦克风启动失败，请检查浏览器权限')
    return
  }
  listening.value = true
  seconds.value = 0
  clearTimer()
  // 单次输入上限 60s，避免忘记结束导致长时间占用麦克风
  timer = window.setInterval(() => {
    seconds.value += 1
    if (seconds.value >= 60) stop()
  }, 1000)
}

function toggle(): void {
  if (listening.value) stop()
  else start()
}

onBeforeUnmount(() => {
  clearTimer()
  if (rec) {
    rec.onresult = null
    rec.onerror = null
    rec.onend = null
    try {
      rec.abort()
    } catch {
      /* 已结束，忽略 */
    }
  }
})
</script>

<template>
  <span v-if="supported" class="vb">
    <button
      type="button"
      class="vb__btn u-tap"
      :class="{ 'vb__btn--on': listening }"
      :aria-pressed="listening"
      :aria-label="listening ? '结束语音输入' : '开始语音输入'"
      :title="listening ? '结束语音输入' : '语音输入'"
      @click="toggle"
    >
      <span v-if="listening" class="vb__pulse" aria-hidden="true" />
      <svg class="vb__mic" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 15.2a3.2 3.2 0 0 0 3.2-3.2V6a3.2 3.2 0 0 0-6.4 0v6a3.2 3.2 0 0 0 3.2 3.2z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M6.2 11.6a5.8 5.8 0 0 0 11.6 0M12 17.4V21M9 21h6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <span v-if="label && !listening" class="vb__label">{{ label }}</span>
    <span v-else-if="listening" class="vb__time">{{ seconds }}″</span>
  </span>
</template>

<style scoped>
.vb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.vb__btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--mn-green);
  transition:
    background-color var(--dur-fast, 150ms) var(--ease-standard, ease),
    color var(--dur-fast, 150ms) var(--ease-standard, ease);
}

.vb__btn--on {
  border-color: var(--mn-green);
  background: var(--mn-green);
  color: #fff;
}

.vb__mic {
  width: 19px;
  height: 19px;
}

/* 录音脉冲：品牌色扩散光晕（reduced-motion 时由下方媒体查询关闭） */
.vb__pulse {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: var(--mn-green);
  opacity: 0.5;
  animation: vb-pulse 1.2s ease-out infinite;
}

@keyframes vb-pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.55;
  }

  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}

.vb__label {
  font-size: 12px;
  color: var(--text-2);
}

.vb__time {
  font-size: 12px;
  font-weight: 600;
  color: var(--mn-green);
  font-variant-numeric: tabular-nums;
}
</style>
