/**
 * useSpeech —— 语音播报（浏览器原生 SpeechSynthesis）的渐进增强封装。
 *
 * 与 VoiceButton（语音输入）配对，形成「能听会说」闭环：
 *  - 零依赖、零成本：只用浏览器内置 SpeechSynthesis API，离线环境系统自带语音也可读；
 *  - 优雅降级：window.speechSynthesis 不存在时 supported=false，
 *    所有方法静默 no-op，绝不抛错、绝不影响页面现有功能（调用方可直接 v-if 隐藏按钮）；
 *  - 中文优先：优先选用 zh-CN 语音；Chrome 的语音表是异步加载的
 *    （首次 getVoices() 常为空数组），首次空表时监听一次 voiceschanged，缓存后供后续使用；
 *  - 长文本切分：Chrome 单条 utterance 约 200 字符后会被截断，按
 *    中文句号 / 问号 / 感叹号 / 分号 / 换行切分为队列依次朗读，超长片段再按逗号兜底硬切；
 *  - 绝不自动播放：本文件不发起任何自动朗读，speak() 只允许由用户点击触发
 *    （浏览器自动播放策略 + 演示者要自己掌控节奏）；
 *  - 卸载即停：组件 onBeforeUnmount 自动 cancel，防止切页后还在念。
 *
 * ── 接入示例 ──────────────────────────────────────────────────────────
 * ```ts
 * const { supported, speaking, speak, cancel } = useSpeech()
 * // 点击「朗读」：speak(answerText)；点击「停止」：cancel()
 * ```
 *
 * @module composables/useSpeech
 */
import { onBeforeUnmount, ref } from 'vue'

/** 单条 utterance 最大字符数：Chrome 约 200 字符截断，留余量取 180 */
const CHUNK_MAX = 180

/** 一级切分：句末标点（中/英）、分号（中/英）、换行，标点保留在片段尾部，形成自然停顿 */
const SENTENCE_RE = /[^。！？；!?;\n]*[。！？；!?;\n]+|[^。！？；!?;\n]+$/g
/** 二级切分：句子仍超长时按逗号 / 顿号断句 */
const CLAUSE_RE = /[^，,、]*[，,、]+|[^，,、]+$/g

/** speak() 的可选参数（默认值即「正常语速 / 标准音调 / 简体中文」） */
export interface SpeechOptions {
  /** 语速，0.1–10，默认 1.0 */
  rate?: number
  /** 音调，0–2，默认 1.0 */
  pitch?: number
  /** 语种标签，默认 zh-CN */
  lang?: string
  /** 音量，0–1，默认 1 */
  volume?: number
}

export interface UseSpeechReturn {
  /** 当前浏览器是否支持语音合成（纯特性检测结果） */
  readonly supported: boolean
  /** 是否正在朗读（队列未播完即 true） */
  readonly speaking: ReturnType<typeof ref<boolean>>
  /** 是否已暂停（pause 后、resume 前） */
  readonly paused: ReturnType<typeof ref<boolean>>
  /**
   * 朗读文本：自动取消当前朗读 → 切分长句 → 依次入队播放。
   * 只能由用户手势（点击）调用；不支持 / 空文本时静默 no-op。
   */
  speak: (text: string, options?: SpeechOptions) => void
  /** 停止并清空当前朗读队列 */
  cancel: () => void
  /** 暂停朗读（可由 resume 继续） */
  pause: () => void
  /** 恢复暂停的朗读 */
  resume: () => void
}

/* ── 模块级语音表缓存（voiceschanged 全进程只监听一次，多实例共享） ── */
let cachedVoices: SpeechSynthesisVoice[] = []
let voicesListenerBound = false

/** 安全特性检测：非浏览器 / 老内核 / 厂商阉割环境一律视为不支持 */
function detectSupported(): boolean {
  if (typeof window === 'undefined') return false
  const synth = window.speechSynthesis
  return !!synth && typeof synth.speak === 'function' && typeof synth.cancel === 'function'
}

/** 读取（并缓存）系统语音表；任何异常都按空表处理 */
function refreshVoices(): SpeechSynthesisVoice[] {
  try {
    const list = window.speechSynthesis.getVoices()
    if (list && list.length) cachedVoices = Array.from(list)
  } catch {
    cachedVoices = cachedVoices.length ? cachedVoices : []
  }
  return cachedVoices
}

/**
 * 获取语音表；首次为空时监听一次 voiceschanged（Chrome 异步加载）。
 * 监听到后只更新缓存，不打断 / 不自动触发任何朗读。
 */
function ensureVoices(): SpeechSynthesisVoice[] {
  const list = refreshVoices()
  if (list.length || voicesListenerBound) return list
  voicesListenerBound = true
  try {
    const synth = window.speechSynthesis
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', refreshVoices)
    } else {
      synth.onvoiceschanged = refreshVoices
    }
  } catch {
    /* 极个别环境挂监听会抛错：忽略，播放时退化为只设 lang 不指定 voice */
  }
  return cachedVoices
}

/** 从语音表中挑选中文语音：精确 zh-CN 优先，其次任意中文方言（zh-HK / zh-TW / zh） */
function pickChineseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null
  return (
    voices.find((v) => !!v.lang && v.lang.toLowerCase() === 'zh-cn') ??
    voices.find((v) => !!v.lang && v.lang.toLowerCase().startsWith('zh')) ??
    null
  )
}

/**
 * 长文本切队列：
 * 1) 按句末标点 / 分号 / 换行断句；2) 单句仍超 180 字则按逗号 / 顿号合并断行；
 * 3) 连逗号都没有的超长句硬切，保证每段都在 Chrome 单句上限内。
 */
function toChunks(text: string, maxLen = CHUNK_MAX): string[] {
  const out: string[] = []

  /** 无标点可借的超长片段：按字符数硬切 */
  const pushHard = (s: string): void => {
    let rest = s
    while (rest.length > maxLen) {
      out.push(rest.slice(0, maxLen))
      rest = rest.slice(maxLen)
    }
    if (rest) out.push(rest)
  }

  const sentences = text.match(SENTENCE_RE) ?? []
  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim()
    if (!sentence) continue
    if (sentence.length <= maxLen) {
      out.push(sentence)
      continue
    }
    let buffer = ''
    const clauses = sentence.match(CLAUSE_RE) ?? [sentence]
    for (const clause of clauses) {
      if ((buffer + clause).length <= maxLen) {
        buffer += clause
      } else {
        if (buffer.trim()) pushHard(buffer.trim())
        buffer = clause
      }
    }
    if (buffer.trim()) pushHard(buffer.trim())
  }
  return out
}

/**
 * 语音播报组合式函数（每个组件实例独立的播放队列与 speaking 状态）。
 */
export function useSpeech(): UseSpeechReturn {
  const supported = detectSupported()
  const speaking = ref<boolean>(false)
  const paused = ref<boolean>(false)

  /** 待播片段队列与当前下标 */
  let chunks: string[] = []
  let index = 0
  /**
   * 「代际」令牌：每次 speak/cancel 自增，旧 utterance 的异步 onend/onerror
   * 回调凭令牌识别自己已失效，杜绝 cancel 后旧回调继续驱动队列。
   */
  let generation = 0
  let startTimer: number | null = null
  let current: SpeechSynthesisUtterance | null = null

  function clearStartTimer(): void {
    if (startTimer !== null) {
      window.clearTimeout(startTimer)
      startTimer = null
    }
  }

  /** 自然播完（或出错收尾）：仅当代际匹配时复位状态 */
  function finish(gen: number): void {
    if (gen !== generation) return
    chunks = []
    index = 0
    current = null
    paused.value = false
    speaking.value = false
  }

  function cancel(): void {
    generation += 1
    clearStartTimer()
    if (current) {
      current.onend = null
      current.onerror = null
      current = null
    }
    chunks = []
    index = 0
    paused.value = false
    speaking.value = false
    if (supported) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* 个别 ROM 在非预期状态调 cancel 会抛错，忽略 */
      }
    }
  }

  /** 依次朗读队列中的下一段 */
  function speakChunk(gen: number, options: SpeechOptions): void {
    if (gen !== generation) return
    const piece = chunks[index]
    if (!piece) {
      finish(gen)
      return
    }
    let utterance: SpeechSynthesisUtterance
    try {
      utterance = new SpeechSynthesisUtterance(piece)
      utterance.lang = options.lang ?? 'zh-CN'
      utterance.rate = options.rate ?? 1
      utterance.pitch = options.pitch ?? 1
      if (typeof options.volume === 'number') utterance.volume = options.volume
      const voice = pickChineseVoice(ensureVoices())
      if (voice) utterance.voice = voice
    } catch {
      finish(gen)
      return
    }

    utterance.onend = () => {
      if (gen !== generation) return
      index += 1
      if (index >= chunks.length) finish(gen)
      else speakChunk(gen, options)
    }
    utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (gen !== generation) return
      // interrupted/canceled 多与 cancel 竞争出现，直接收尾；其余错误跳过当前片段继续播
      if (e?.error === 'interrupted' || e?.error === 'canceled') {
        finish(gen)
        return
      }
      index += 1
      if (index >= chunks.length) finish(gen)
      else speakChunk(gen, options)
    }

    current = utterance
    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      finish(gen)
    }
  }

  function speak(text: string, options: SpeechOptions = {}): void {
    if (!supported) return
    const content = String(text ?? '').trim()
    if (!content) return

    // 单例语义：先作废当前朗读（cancel 会自增 generation 并清空旧队列）
    cancel()
    const gen = generation
    const queue = toChunks(content)
    if (!queue.length) return

    chunks = queue
    index = 0
    speaking.value = true

    // Chrome 已知行为：cancel() 后同一调用栈内立刻 speak() 偶发吞掉首句，
    // 延后一个 macrotask 再启动，规避竞态；期间若再被 cancel，令牌拦截即可。
    clearStartTimer()
    startTimer = window.setTimeout(() => {
      startTimer = null
      speakChunk(gen, options)
    }, 80)
  }

  function pause(): void {
    if (!supported || !speaking.value) return
    try {
      window.speechSynthesis.pause()
      paused.value = true
    } catch {
      /* 忽略 */
    }
  }

  function resume(): void {
    if (!supported) return
    try {
      window.speechSynthesis.resume()
      paused.value = false
    } catch {
      /* 忽略 */
    }
  }

  // 切页 / 组件卸载必须停播，防止后台继续念
  onBeforeUnmount(cancel)

  return { supported, speaking, paused, speak, cancel, pause, resume }
}

export default useSpeech
